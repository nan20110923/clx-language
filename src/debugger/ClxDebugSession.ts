import * as net from "net";
import { Breakpoint, InitializedEvent, LoggingDebugSession, OutputEvent, Source, StackFrame, StoppedEvent, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { FileUtil } from './FileUtil';
import { Uri, window, workspace } from "vscode";
import { basename } from "path";

type MsgHook = (line: string) => { line: string | null, isEnd: boolean };
type MsgInfoHandler = (stat: number, info: string[]) => void;

export class ClxDebugSession extends LoggingDebugSession {
    constructor() {
        super("clx.debug.txt");
    }

    private client?: net.Socket;
    protected ext: string[] = ['.clx'];
    private msgHooks: MsgHook[] = [];
    private sourceUri?: Uri;
    private breakPointId = 0;
    private breakLineNumber?: number;

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        console.log('initializeRequest')
        response.body = {
            
        };
        this.sendResponse(response);
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): void {
        super.customRequest(command, response, args)
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('launchRequest!!!')
        const client = net.connect(3563, '127.0.0.1')
                .on('connect', () => {
                    this.sendResponse(response);
                    this.onConnect(client);
                })
                .on('error', err => {
                    response.success = false;
                    response.message = `${err}`;
                    this.sendResponse(response);
                    this.onSocketClose();
                })
                .on('close', hadErr => this.onSocketClose())
                .on('data', data => this.onReceiveData(data));
    }

    protected onConnect(client: net.Socket) {
        console.log('onConnect!!!')
        this.sendEvent(new OutputEvent(`Connected.\n`));
        this.client = client;

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
                        session.breakLineNumber = Number.parseInt(match?.groups?.line);
                        console.log(`breakLineNumber: ${session.breakLineNumber}`)
                        session.sendEvent(new StoppedEvent("breakpoint", 1));
                    }
                }
            }
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
                            // 源码文件创建成功，发送初始化事件
                            session.sendEvent(new InitializedEvent());
                        } else {
                            window.showErrorMessage("Create source code file failed")
                        }
                    }
                }
            }, false, false))
            this.sendMessage('src __lua__')
        }
    }

    protected sendMessage(msg: String) {
        if (this.client) {
            this.client.write(`${msg}\n`);
        }
    }

    private onReceiveData(data: Buffer | string) {
        const chunk = data.toString()
        console.log(`onReceiveData: ${chunk}`)
        const lines = chunk.split('\n')
        if (lines.length > 0) {
            this.hookData(lines)
        }
    }

    private hookData(lines: string[]) {
        if (this.msgHooks.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                let data = lines[i]
                let idx = 0
                let hf = this.msgHooks[idx]
                while (hf) {
                    let ret = hf(data)
                    let line = ret.line
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
            }
        }
    } 

    private onSocketClose() {
        if (this.client) {
            this.client.removeAllListeners();
        }
        this.sendEvent(new OutputEvent('Disconnected.\n'));
    }

    private hookMsg(hook: MsgHook) {
        this.msgHooks.push(hook)
    }

    private getFilterMsgHook(token: string, cb: MsgInfoHandler, noDel: boolean, noEnd: boolean): MsgHook {
        let stat = 0
        let info: string[] = []
        let cmp = `>->${token}`
        let cmpend = `<-<${token}`
        function f(line: string): {line: string | null, isEnd: boolean} {
            if (stat == 0) {
                if (line == cmp) {
                    stat = 1
                    if (noDel) {
                        return {line: line, isEnd: false}
                    } else {
                        return {line: null, isEnd: false}
                    }
                }
                return {line: line, isEnd: false}
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
            if (noEnd) {
                if (stat == 2) {
                    info = []
                    stat = 0
                }
            }
            if (noDel) {
                return {line: line, isEnd: stat == 2}
            } else {
                return {line: null, isEnd: stat == 2}
            }
        }
        return f
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {        
        const path = args.source.path as string;
        if (path == this.sourceUri?.path) {
            // delete all breakpoint
            this.sendMessage('d');

            const clientLines = args.lines || [];
            console.log(`setBreakPointsRequest: ${clientLines.length}`)
            const actualBreakpoints0 = clientLines.map(async line => {
                this.sendMessage(`b __lua__:${line}`)
                const bp = new Breakpoint(true, line) as DebugProtocol.Breakpoint;
                bp.id = this.breakPointId++;
                return bp;
            });
            const actualBreakpoints = await Promise.all<DebugProtocol.Breakpoint>(actualBreakpoints0);

            // send back the actual breakpoint positions
            response.body = {
                breakpoints: actualBreakpoints
            };
            this.sendResponse(response);
        }
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
        console.log('nextRequest')
        this.sendDebugAction(response, 'n')
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        console.log('continueRequest')
        this.sendDebugAction(response, 'c');
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('stepInRequest')
        this.sendDebugAction(response, 's');
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        console.log('stepOutRequest')
        this.sendDebugAction(response, 'fin');
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('stackTraceRequest')
        if (this.breakLineNumber && this.sourceUri) {
            const stackFrames: StackFrame[] = [];
            let path = this.sourceUri.path
            let source = new Source(basename(path), path);
            stackFrames.push(new StackFrame(0, 'step', source, this.breakLineNumber));
            response.body = {
                stackFrames: stackFrames,
                totalFrames: stackFrames.length
            };
        }
        this.sendResponse(response)
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('scopesRequest')
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('variablesRequest')
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request | undefined): void {
        console.log('disconnectRequest')
        if (this.sourceUri) {
            workspace.fs.delete(this.sourceUri)
        }
        super.disconnectRequest(response, args, request)
    }

    private sendDebugAction(response: DebugProtocol.Response, action: String) {
        this.sendMessage(action)
        this.sendResponse(response);
    }

}