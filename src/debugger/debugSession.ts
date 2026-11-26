import * as net from "net";
import { Breakpoint, InitializedEvent, LoggingDebugSession, OutputEvent, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { Uri, ViewColumn, commands, window, workspace } from "vscode";
import { basename } from "path";
import * as readline from "readline";
import {
	connectDebugChannel,
	isEmulatorRunning,
	probeDebugChannel,
	terminateEmulator,
	waitForDebugChannel,
	type LaunchOutcome
} from "../emulatorProcess";

type MsgHook = (line: string) => { line: string | null, isEnd: boolean, state: number };
type MsgInfoHandler = (stat: number, info: string[]) => void;

/**
 * 启动模拟器的回调。由扩展入口注入，调试会话本身不 import ../extension，
 * 否则会和入口形成循环依赖，也让这个类没法脱离整个扩展单独测试。
 */
export type StartEmulator = (debug: boolean) => Promise<LaunchOutcome>;

export class DebugSession extends LoggingDebugSession {
    constructor(private readonly startEmulator: StartEmulator) {
        super("clx.debug.txt");
    }

    private client?: net.Socket;
    protected ext: string[] = ['.clx'];
    private msgHooks: MsgHook[] = [];
    private sourceUri?: Uri;
    private bpId = 0;
    private curBpLineNumber?: number;
    private bpLines: number[] = [];

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // console.log('initializeRequest')
        response.body = {
            
        };
        this.sendResponse(response);
    }

    /**
     * 所有断点设好之后 VS Code 会发这个，表示"可以开始跑了"。
     *
     * 模拟器以 -x 启动时会打印 "use XLUADBG wait" 然后停在那儿等指令，
     * 不收到 c 就一帧都不画。所以这里必须真的发 c —— 基类只回一个 success，
     * 那会让程序永远停在等调试器的状态，表现就是调试时窗口里没有画面。
     */
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request): void {
        this.sendResponse(response);
        this.client?.write('c\n');
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): void {
        super.customRequest(command, response, args)
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        var coloXToolExists = await probeDebugChannel()

        if (!coloXToolExists && !isEmulatorRunning()) {
            // 先等模拟器就绪（可能要下载），再开始轮询调试端口
            const outcome = await this.startEmulator(true);
            if (outcome === 'cancelled') {
                // 用户在下载确认框里选了取消：静默结束，不要报错
                response.success = false;
                response.message = 'Launch cancelled.';
                this.sendResponse(response);
                return;
            }
            if (outcome === 'failed') {
                response.success = false;
                response.message = 'The CLX emulator could not be started.';
                this.sendResponse(response);
                return;
            }
            // 最多等 10 秒。注意端口能连上不代表文件加载成功 —— 那要看 .rom
            if (!(await waitForDebugChannel(10_000))) {
                // 必须回 response，否则 VS Code 的 launch 请求永远挂起
                response.success = false;
                response.message = 'Timed out waiting for the CLX emulator debug channel.';
                this.sendResponse(response);
                return;
            }
        }

        const client = connectDebugChannel().on('connect', () => {
            this.sendResponse(response);
            this.onConnect(client);
        }).on('error', err => {
            response.success = false;
            response.message = `${err}`;
            this.sendResponse(response);
            this.onSocketClose();
        }).on('close', hadErr => this.onSocketClose());
    }

    handleMessage(msg: DebugProtocol.ProtocolMessage): void {
        // console.log('handleMessage:', msg);
        super.handleMessage(msg)
    }

    protected onConnect(client: net.Socket) {
        // console.log('onConnect!!!')
        this.sendEvent(new OutputEvent(`Connected.\n`));
        this.client = client;

        const rl = readline.createInterface({
            input: client,
            crlfDelay: Infinity
        })
        rl.on('line', line => this.onReceiveLine(line))

        // setup step hook
        this.setupStepHook();

        // get __lua__ source code
        this.doCmd('source');
    }

    private setupStepHook() {
        let session = this
        this.hookMsg(this.getFilterMsgHook('@', function(stat, info) {
            // console.log(`step!!! stat: ${stat}  info: ${info}`)
            if (stat == 2) {
                if (info.length > 0) {
                    let pattern = /(.+) at (.+):(?<line>\d+)/
                    let match = pattern.exec(info[0])
                    if (match?.groups?.line) {
                        // 协议行号和 debug_temp.clx 的行号同基准，直接可用
                        session.curBpLineNumber = Number.parseInt(match.groups.line);
                        // console.log(`breakLineNumber: ${session.curBpLineNumber}`)
                        session.sendEvent(new StoppedEvent("breakpoint", 1));
                    }
                }
            }
        }, true, true))
        this.hookMsg(this.getFilterMsgHook('b', function(stat, info) {
            // just hook
        }, true, true))
        this.hookMsg(this.getFilterMsgHook('d', function(stat, info) {
            // just hook
        }, true, true))
        this.hookMsg(this.getFilterMsgHook('c', function(stat, info) {
            // just hook
        }, true, true))
        this.hookMsg(this.getFilterMsgHook('n', function(stat, info) {
            // just hook
        }, true, true))
        this.hookMsg(this.getFilterMsgHook('pause', function(stat, info) {
            // just hook
        }, true, true))
    }

    protected doCmd(cmd: string) {
        let session = this
        if (cmd == 'source') {
            this.hookMsg(this.getFilterMsgHook('src', async function(stat, info) {
                if (stat == 2) {
                    if (info.length > 0) {
                        // 应答体的形状是：[空行, "__lua__:<行号>", 空行, 源码...]
                        // 那行 __lua__:N 是头部标记，不是源码，必须去掉，否则
                        // debug_temp.clx 里会多一行伪代码，行号也会整体错位。
                        // 它在应答里不一定位于 info[0]（前面可能有空行），所以要找。
                        //
                        // 注意 N 是 __lua__ 段在 .clx 文件里的起始行号，但协议里
                        // `b __lua__:<行号>` 用的是相对这个基准的行号，正好等于
                        // debug_temp.clx 的行号 —— 所以这里只需要剥掉头部，不需要记 N。
                        const headerIndex = info.findIndex(line => /^__lua__:\d+$/.test(line.trim()))
                        if (headerIndex !== -1) {
                            info.splice(0, headerIndex + 1)
                        }

                        // 展示获取到的源码
                        session.sourceUri = await createDebugFile('debug_temp.clx', info.join('\n'))

                        if (session.sourceUri) {
                            // 源码文件创建成功，active文件后发送初始化事件
                            workspace.onWillSaveTextDocument((event) => {
                                const documentUri = event.document.uri;
                                if (documentUri.fsPath === session.sourceUri?.path) {
                                    event.waitUntil(Promise.reject(new Error('Editing this file is not allowed.')));
                                }
                            })

                            const doc = await workspace.openTextDocument(session.sourceUri.path);
                            await window.showTextDocument(doc, {viewColumn: ViewColumn.Active, preserveFocus: false, preview: false})

                            session.sendEvent(new InitializedEvent());
                        } else {
                            window.showErrorMessage("Create source code file failed")
                        }
                    }
                }
            }, false, false))
            this.sendMessage('src __lua__')
        } else {
            this.sendMessage(cmd)
        }
    }

    protected sendMessage(msg: String) {
        // console.log(`sendMessage: ${msg}`)
        if (this.client) {
            this.client.write(`${msg}\n`);
        }
    }

    private onReceiveLine(line: string) {
        // console.log(`onReceiveLine: ${line}`)
        this.hookData([line])
    }

    private hookData(lines: string[]) {
        if (this.msgHooks.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                let line: string | null = lines[i]
                let handled = false
                let idx = 0
                let hf = this.msgHooks[idx]
                while (hf) {
                    let ret = hf(line)
                    line = ret.line
                    let state = ret.state
                    if (state != 0) {
                        handled = true
                    }
                    if (ret.isEnd) {
                        this.msgHooks.splice(idx, 1)
                        idx -= 1
                    }
                    if (line == null) {
                        break;
                    }
                    idx += 1
                    hf = this.msgHooks[idx]
                }
                console.log(`${line}`)
                if (line && !handled && !line.startsWith('Breakpoint ')) {
                    this.sendEvent(new OutputEvent(`${line}\n`))
                }
            }
        }
    }

    private onSocketClose() {
        if (this.client) {
            this.client.removeAllListeners();
        }
        this.sendEvent(new OutputEvent('Disconnected.\n'));
        this.sendEvent(new TerminatedEvent());
    }

    private hookMsg(hook: MsgHook) {
        this.msgHooks.push(hook)
    }

    private getFilterMsgHook(token: string, cb: MsgInfoHandler, noDel: boolean, noEnd: boolean): MsgHook {
        let stat = 0
        let info: string[] = []
        let cmp = `>->${token}`
        let cmpend = `<-<${token}`
        function f(line: string): {line: string | null, isEnd: boolean, state: number} {
            if (stat == 0) {
                if (line == cmp) {
                    stat = 1
                    if (noDel) {
                        return {line: line, isEnd: false, state: stat}
                    } else {
                        return {line: null, isEnd: false, state: stat}
                    }
                }
                return {line: line, isEnd: false, state: stat}
            }
            if (stat == 1) {
                if (line == cmpend) {
                    stat = 2
                } else {
                    info.push(line)
                }
            }
            if (cb) {
                cb(stat, info)
            }
            // tricks, keep origin stat
            let state = stat
            if (noEnd) {
                if (stat == 2) {
                    info = []
                    stat = 0
                }
            }
            if (noDel) {
                return {line: line, isEnd: stat == 2, state: state}
            } else {
                return {line: null, isEnd: stat == 2, state: state}
            }
        }
        return f
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
        const path = args.source.path as string;
        // console.log(`setBreakPointsRequest path: ${path} sourceUri: ${this.sourceUri?.fsPath}`)
        if (this.sourceUri?.fsPath.endsWith(path)) {
            // delete all breakpoint
            this.sendMessage('d');

            this.bpLines = args.lines || [];
            const actualBreakpoints = this.bpLines.map(line => {
                // debug_temp.clx 是模拟器返回的纯 Lua 源码，它的行号和协议里的
                // `__lua__:<行号>` 是同一个基准（都相对 __lua__ 段），所以直接透传。
                // 不要加 __lua__ 标记在 .clx 文件里的绝对行号 —— 那样会全部落空。
                this.sendMessage(`b __lua__:${line}`);

                const bp = new Breakpoint(true, line) as DebugProtocol.Breakpoint;
                bp.id = this.bpId++;
                return bp;
            });

            // send back the actual breakpoint positions
            response.body = {
                breakpoints: actualBreakpoints
            };

            if (this.bpLines.length > 0) {
                // pause running program
                this.sendMessage('pause');
            }

            this.sendResponse(response);
        } else {
            // 用户可能在我们还没取回源码（debug_temp.clx 尚未生成）时就设了断点。
            // 必须回 response，否则 VS Code 的 setBreakpoints 请求会一直挂起。
            response.body = {
                breakpoints: (args.lines || []).map(line => {
                    const bp = new Breakpoint(false, line) as DebugProtocol.Breakpoint;
                    bp.id = this.bpId++;
                    return bp;
                })
            };
            this.sendResponse(response);
        }
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request | undefined): void {
        if (args.context == 'repl') {
            this.sendMessage(args.expression)
        }
        super.evaluateRequest(response, args, request)
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(1, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request | undefined): void {
        // console.log('nextRequest')
        this.sendDebugAction(response, 'n')
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        // console.log('continueRequest')
        this.sendDebugAction(response, 'c');
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request | undefined): void {
        // console.log('stepInRequest')
        this.sendDebugAction(response, 's');
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        // console.log('stepOutRequest')
        this.sendDebugAction(response, 'fin');
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request | undefined): void {
        // console.log('stackTraceRequest')
        if (this.curBpLineNumber && this.sourceUri) {
            const stackFrames: StackFrame[] = [];
            let path = this.sourceUri.path
            let source = new Source(basename(path), path);
            stackFrames.push(new StackFrame(0, 'step', source, this.curBpLineNumber));
            response.body = {
                stackFrames: stackFrames,
                totalFrames: stackFrames.length
            };
        }
        this.sendResponse(response)
    }

    // protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request | undefined): void {
    //     console.log('scopesRequest')
    // }

    // protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request | undefined): void {
    //     console.log('variablesRequest')
    // }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        // console.log('disconnectRequest')
        if (this.sourceUri) {
            await workspace.fs.delete(this.sourceUri)
            if (window.activeTextEditor?.document.uri.fsPath == this.sourceUri.path) {
                commands.executeCommand('workbench.action.closeActiveEditor');
            }
            this.sourceUri = undefined
        }

        // Clear all breakpoints then continue to let window running
        this.sendMessage('d')
        this.sendMessage('c')
        terminateEmulator()
        super.disconnectRequest(response, args, request)
    }

    private sendDebugAction(response: DebugProtocol.Response, action: String) {
        this.sendMessage(action)
        this.sendResponse(response)
    }

}

/**
 * 把模拟器返回的源码写成工作区里的 debug_temp.clx，让 VS Code 有文件可以显示
 * 断点和当前执行位置。只写到第一个工作区根目录。
 */
async function createDebugFile(fileName: string, content: string): Promise<Uri | undefined> {
    const folderUri = workspace.workspaceFolders?.[0]?.uri
    if (!folderUri) {
        window.showErrorMessage(`Cannot create ${fileName}: no workspace folder is open.`)
        return undefined
    }
    const fileUri = Uri.joinPath(folderUri, fileName)
    try {
        await workspace.fs.writeFile(fileUri, new TextEncoder().encode(content))
        return fileUri
    } catch (error) {
        window.showErrorMessage(`Failed to create the file ${fileName}. Error message: ${error}`)
        return undefined
    }
}