import * as net from "net";
import { Breakpoint, InitializedEvent, LoggingDebugSession, OutputEvent, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { FileUtil } from './FileUtil';
import { Uri, ViewColumn, commands, window, workspace } from "vscode";
import { basename } from "path";
import * as readline from "readline";
import { runColoXTool, coloxProcess, isColoXToolRunning, terminateColoXTool } from "../extension";
import { delay } from "../util";

type MsgHook = (line: string) => { line: string | null, isEnd: boolean, state: number };
type MsgInfoHandler = (stat: number, info: string[]) => void;

export class ClxDebugSession extends LoggingDebugSession {
    constructor() {
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

    protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): void {
        super.customRequest(command, response, args)
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        if (!isColoXToolRunning()) {
            runColoXTool(null, true)
            await delay(1000)
        }

        coloxProcess?.stdout?.on('data', (data) => this.sendEvent(new OutputEvent(`${data}\n`)))

        const client = net.connect({
            port: 3563,
            host: '127.0.0.1'
        }).on('connect', () => {
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
                        session.curBpLineNumber = Number.parseInt(match?.groups?.line);
                        // console.log(`breakLineNumber: ${session.breakLineNumber}`)
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
                        let pattern = /(__lua__):(\d+)/
                        let match = pattern.exec(info[0])
                        if (match) {
                            info.shift()
                        }
                        // 展示获取到的源码
                        session.sourceUri = await FileUtil.createDebugFile('debug_temp.clx', info.join('\n'))

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
        if (path == this.sourceUri?.path) {
            // delete all breakpoint
            this.sendMessage('d');

            this.bpLines = args.lines || [];
            const actualBreakpoints0 = this.bpLines.map(async line => {
                this.sendMessage(`b __lua__:${line}`)
                const bp = new Breakpoint(true, line) as DebugProtocol.Breakpoint;
                bp.id = this.bpId++;
                return bp;
            });
            const actualBreakpoints = await Promise.all<DebugProtocol.Breakpoint>(actualBreakpoints0);

            // send back the actual breakpoint positions
            response.body = {
                breakpoints: actualBreakpoints
            };

            if (this.bpLines.length > 0) {
                // pause running program
                this.sendMessage('pause');
            }

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
        terminateColoXTool()
        super.disconnectRequest(response, args, request)
    }

    private sendDebugAction(response: DebugProtocol.Response, action: String) {
        this.sendMessage(action)
        this.sendResponse(response);
    }

}