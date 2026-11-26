'use strict';

/**
 * 调试适配器：把 DAP 请求翻译成调试通道的动词。
 *
 * 这一层**只做协议翻译**。讲模拟器行协议的东西（命令字、应答体形状、
 * 什么命令要等应答）全在 debugChannel.ts 与 luaProtocol.ts，这里不再出现。
 *
 * 关键决定：**断点打在用户的原始 .clx 文件上，不生成源码副本。**
 * 模拟器从不读 `debug_temp.clx` —— 它只认内部名为 `__lua__` 的缓冲，
 * 那个副本历史上纯粹是为了让 VS Code 有个文件可以显示。去掉它之后，
 * 就不存在"两份行号语义"的问题了，行号映射由 lineMapping.ts 负责。
 *
 * 事件流：
 *   launch → 等模拟器就绪 → 连通道 → `vmlist` 钉住卡带 VM → `src __lua__`
 *          → 校准行号映射 → 发 InitializedEvent
 *   `@` 帧 → StoppedEvent
 *   configurationDone → `c`（模拟器以 -x 启动时会停在 XLUADBG wait，必须发）
 */

import * as vscode from 'vscode';
import { basename } from 'path';
import {
	Breakpoint,
	InitializedEvent,
	LoggingDebugSession,
	OutputEvent,
	Scope,
	Source,
	StackFrame,
	StoppedEvent,
	TerminatedEvent,
	Thread,
	Variable
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugChannel } from './debugChannel';
import { LineMapping, LineMappingError, buildLineMapping, findIncludes } from './lineMapping';
import { joinLuaPath, toLuaLiteral } from './luaValue';
import { parseButtonState, parseShot } from './testAutomation';
import {
	VariableNode,
	parseBreakpointReply,
	parseLocals,
	parseSourceListing,
	parseStackFrames,
	parseVariableTree,
	parseVmList,
	StackFrame as LuaStackFrame,
	StopEvent
} from './luaProtocol';
import {
	DEBUG_HOST,
	DEBUG_PORT,
	isEmulatorRunning,
	terminateEmulator,
	waitForDebugChannel
} from '../emulator/emulatorProcess';
import type { LaunchOutcome } from '../emulator/emulatorProcess';

/** 启动模拟器的回调。由扩展入口注入，避免 debug/ 反向 import extension。 */
export type StartEmulator = (debug: boolean) => Promise<LaunchOutcome>;

/**
 * 建立调试通道的方式。
 *
 * 生产用真实的 TCP 连接（默认实现），测试传一个假实现 —— 这样 DAP 层的
 * 请求处理可以在普通 Node 里驱动，不必启动 VS Code 或模拟器。
 */
/**
 * 检查调试端口是否已经可用。
 *
 * 和 ChannelFactory 一样是外部依赖：测试里不能真的去轮询本机 3563，
 * 所以由调用方注入。返回 true 表示"模拟器已就绪，可以直接连"。
 */
export type ChannelProbe = (host: string, port: number) => Promise<boolean>;

export type ChannelFactory = (
	host: string,
	port: number,
	options: {
		onStop: (event: StopEvent) => void;
		onOutputLine: (line: string) => void;
		onClose: () => void;
	}
) => DebugChannel;

/** 模拟器把卡带的 Lua 注册在这个固定名字下。不是文件名。 */
const LUA_SOURCE_NAME = '__lua__';

/**
 * variablesReference 的分配：1 和 3 留给两个作用域，再往后的正数给
 * 内联展开的嵌套表。2 空着是因为 Upvalues 作用域暂不提供 ——
 * `i local` 的帧偏移 bug 让这条路径拿不到东西，见 resolveVariables。
 */
const SCOPE_LOCALS = 1;
const SCOPE_GLOBALS = 3;

/**
 * 一个待求解的变量容器。
 *
 * `path` 是变量在 Lua 里的完整访问路径（如 `global_table.nested.a`），
 * `setVariable` 需要它 —— DAP 只给一个变量名，但嵌套表里的变量要拼出全路径
 * 才能交给模拟器的 `set`。
 */
interface VarContainer {
	children: VariableNode[];
	/** 这一层的父路径；顶层容器为空串 */
	path: string;
}

export interface LaunchArguments extends DebugProtocol.LaunchRequestArguments {
	host?: string;
	port?: number;
	/** 要调试的 .clx 绝对路径；省略时用活动编辑器。 */
	sourcePath?: string;
}

export class DebugSession extends LoggingDebugSession {
	private channel: DebugChannel | undefined;
	private mapping: LineMapping | undefined;
	private sourcePath: string | undefined;
	/** `<file>:<line>` → 模拟器分配的断点号 */
	private readonly breakpointIds = new Map<string, number>();
	/**
	 * 最近一次 `@` 停帧换算出的 `.clx` 行号。
	 *
	 * 用来消除一个竞态：停帧到达时模拟器已经停在某行，但编辑器来问
	 * `stackTrace` 之前，模拟器可能因为自动步进等原因又动了。
	 * 有它就能在无帧可取时仍然报出准确的停点。
	 */
	private lastStopLine: number | undefined;
	/**
	 * 映射就绪前收到的断点请求。
	 *
	 * VS Code 在 initialize 应答后立刻发 setBreakpoints，而那时 launch 还没跑完、
	 * 行号映射还没建立。直接标记"未验证"会让用户在启动瞬间设的断点永久失效
	 * （VS Code 不会自动重试），所以先存下来，mapping 建好后补发。
	 */
	private pendingBreakpointSet: DebugProtocol.SetBreakpointsArguments | undefined;
	/**
	 * 扩展自己的存储根目录，截图落在这里而不是用户工作区。
	 * 由 activateDebug 注入 —— 调试适配器不持有 ExtensionContext。
	 */
	private storageRoot: vscode.Uri | undefined;
	private readonly containers = new Map<number, VarContainer>();
	private nextContainer = SCOPE_GLOBALS + 1;

	constructor(
		private readonly startEmulator: StartEmulator,
		/**
		 * 建立到调试通道的连接。
		 *
		 * 参数注入而不是在 launchRequest 里直接 `DebugChannel.connect(...)`：
		 * 这个类是本仓库最容易出 bug 的地方（历史上 terminateRequest 没实现、
		 * stackTrace 返回过期帧、断点被丢弃，三处都在这里），而"自己 new 依赖"
		 * 让它在普通 Node 里无法驱动 —— DAP 请求只能靠按 F5 手工验证。
		 *
		 * 传一个假 channel 就能直接调 setBreakPointsRequest / terminateRequest，
		 * 不需要 socket，也不需要 VS Code 的调试宿主。
		 */
		private readonly connect: ChannelFactory = (host, port, options) =>
			DebugChannel.connect(host, port, options),
		/**
		 * 探测调试端口是否可用。默认用真实轮询；测试注入一个立即返回 true 的版本，
		 * 否则每个用例都要空等 waitForDebugChannel 的超时。
		 */
		private readonly probe: ChannelProbe = (host, port) => waitForDebugChannel(1_000, host, port),
		storageRoot?: vscode.Uri
	) {
		super('clx.debug.txt');
		this.storageRoot = storageRoot;
	}

	protected initializeRequest(response: DebugProtocol.InitializeResponse): void {
		response.body = {
			supportsConfigurationDoneRequest: true,
			supportsConditionalBreakpoints: true,
			supportsEvaluateForHovers: true,
			supportsTerminateRequest: true,
			// `set <var>=<value>` 可用（实测返回 `set ok`，改局部和全局都生效）
			supportsSetVariable: true,
			// 用 `setExpression` 表达"改任意表达式"更贴协议，但 VS Code 的
			// Variables 面板编辑走的是 setVariable，所以两个都开
			supportsSetExpression: true,
			supportsFunctionBreakpoints: false,
			supportsHitConditionalBreakpoints: false,
			supportsRestartRequest: false
		};
		this.sendResponse(response);
	}

	protected async launchRequest(
		response: DebugProtocol.LaunchResponse,
		args: LaunchArguments
	): Promise<void> {
		const host = args.host ?? DEBUG_HOST;
		const port = args.port ?? DEBUG_PORT;
		this.sourcePath = args.sourcePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;

		const failure = await this.prepareEmulator(host, port);
		if (failure !== undefined) {
			this.failLaunch(response, failure);
			return;
		}

		try {
			this.channel = this.connect(host, port, {
				onStop: event => this.onStop(event),
				onOutputLine: line => this.sendEvent(new OutputEvent(`${line}\n`)),
				onClose: () => this.sendEvent(new TerminatedEvent())
			});
		} catch (e) {
			this.failLaunch(response, `Cannot connect to the CLX debug channel: ${e}`);
			return;
		}

		await this.pinCartridgeVm();

		// 映射建立不起来就拒绝启动 —— 错位的断点比没有断点更难查
		const mappingFailure = await this.buildMapping();
		if (mappingFailure !== undefined) {
			this.failLaunch(response, mappingFailure);
			return;
		}

		response.body = {};
		this.sendResponse(response);
		this.sendEvent(new InitializedEvent());

		// 补发在映射就绪前收到的断点请求。这次不经过 DAP ——
		// 编辑器已经收到过上一次的应答，这里只需要把断点真的发给模拟器。
		const pending = this.pendingBreakpointSet;
		this.pendingBreakpointSet = undefined;
		if (pending !== undefined) {
			await this.applyBreakpoints(pending.breakpoints ?? []);
		}
	}

	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse): void {
		this.sendResponse(response);
		// 模拟器以 -x 启动会打印 "use XLUADBG wait" 并停在那一行等指令，
		// 不收到 c 就一帧都不画。基类只回 success，不会通知目标。
		void this.channel?.continue().catch(() => undefined);
	}

	protected async setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments
	): Promise<void> {
		if (!this.channel || !this.mapping || !this.sourcePath) {
			// 还没就绪：存下来等 launch 建好映射后补发。
			// 回 verified:false 只是"现在还不知道"，VS Code 不会再问一次，
			// 所以不能只是回个空结果了事。
			this.pendingBreakpointSet = args;
			response.body = { breakpoints: this.unverified(args) };
			this.sendResponse(response);
			return;
		}

		response.body = { breakpoints: await this.applyBreakpoints(args.breakpoints ?? []) };
		this.sendResponse(response);
	}

	/**
	 * 把断点请求真正发给模拟器，返回 DAP 的断点结果。
	 *
	 * 单独抽出来是因为有两个入口：编辑器的 setBreakpoints 请求，
	 * 以及 launch 期间暂存、映射就绪后补发的那一次。
	 */
	private async applyBreakpoints(
		requested: DebugProtocol.SourceBreakpoint[]
	): Promise<DebugProtocol.Breakpoint[]> {
		if (!this.channel || !this.mapping || !this.sourcePath) {
			return requested.map(b => {
				const bp = new Breakpoint(false, b.line) as DebugProtocol.Breakpoint;
				bp.message = 'The debug session is not ready yet.';
				return bp;
			});
		}

		// 清掉这个文件之前的断点再重建
		for (const no of this.breakpointIds.values()) {
			await this.channel.deleteBreakpoint(no).catch(() => undefined);
		}
		this.breakpointIds.clear();

		const breakpoints: DebugProtocol.Breakpoint[] = [];
		for (const bpReq of requested) {
			const fileLine = bpReq.line;
			let emulatorLine: number;
			try {
				emulatorLine = this.mapping.toEmulator(fileLine);
			} catch {
				// 不在 Lua 区段内（设备规格行、__gfx__ 段等）—— 明确不验证
				const bp = new Breakpoint(false, fileLine) as DebugProtocol.Breakpoint;
				bp.message = 'This line is outside the Lua section of the file.';
				breakpoints.push(bp);
				continue;
			}

			const body = await this.channel
				.addBreakpoint(LUA_SOURCE_NAME, emulatorLine, bpReq.condition)
				.catch((e: Error) => [e.message]);
			const reply = parseBreakpointReply(body);

			if (reply.verified) {
				const bp = new Breakpoint(true, fileLine) as DebugProtocol.Breakpoint;
				bp.id = reply.no;
				if (reply.no !== undefined) {
					this.breakpointIds.set(`${this.sourcePath}:${fileLine}`, reply.no);
				}
				breakpoints.push(bp);
			} else {
				// 空白行等：模拟器明确拒绝，正好是 verified:false 的语义
				const bp = new Breakpoint(false, fileLine) as DebugProtocol.Breakpoint;
				bp.message = reply.message;
				breakpoints.push(bp);
			}
		}

		return breakpoints;
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		response.body = { threads: [new Thread(1, 'Lua')] };
		this.sendResponse(response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse): Promise<void> {
		// 每次都重新取，取不到时**清空** —— 否则程序继续跑之后 VS Code 还会
		// 看到上一次停下时的过期帧，点进去会跳到错误的行。
		let frames: LuaStackFrame[] = [];
		if (this.channel) {
			const body = await this.channel.stackTrace().catch(() => [] as string[]);
			// 只保留卡带自己的帧；BIOS/宿主帧没有对应的 .clx 行
			frames = parseStackFrames(body).filter(f => f.source === LUA_SOURCE_NAME);
		}
		const source = this.sourcePath ? new Source(basename(this.sourcePath), this.sourcePath) : undefined;
		const stackFrames = frames.map((f, i) => {
			const line = this.mapping?.toFile(f.line) ?? f.line;
			return new StackFrame(i, f.func, source ?? new Source(f.source), line);
		});

		// 取不到帧但刚收到过停帧：报那一行，而不是返回空让编辑器显示"无栈"
		if (stackFrames.length === 0 && this.lastStopLine !== undefined && source) {
			stackFrames.push(new StackFrame(0, '?', source, this.lastStopLine));
		}

		response.body = { stackFrames, totalFrames: stackFrames.length };
		this.sendResponse(response);
	}

	protected async scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments
	): Promise<void> {
		// 选帧必须在取变量之前：`f <level>` 决定了后续 p / i local 作用于哪一帧
		if (this.channel) {
			await this.channel.selectFrame(args.frameId).catch(() => undefined);
		}
		response.body = {
			scopes: [
				// Locals 依赖 `i local`。模拟器的这个命令有个帧偏移 bug
				// （嵌在 coloX_dbg.cpp 的 Lua helper 里硬编码了 +2），报的是卡带
				// 顶层 chunk 而不是停下那一帧，所以拿不到真正的局部变量。
				// 保留这个 scope 但里面会明确说明，而不是假装空。
				new Scope('Locals', SCOPE_LOCALS, false),
				// Globals 走 `p _G`，这条路径能拿到东西
				new Scope('Globals', SCOPE_GLOBALS, false)
			]
		};
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments
	): Promise<void> {
		response.body = { variables: await this.resolveVariables(args.variablesReference) };
		this.sendResponse(response);
	}

	/**
	 * 在 Variables 面板里改变量。
	 *
	 * DAP 只给「容器引用 + 变量名」，而模拟器的 `set` 要完整路径，
	 * 所以从容器的 `path` 拼出 `a.b.c`。`set` 的应答是 `set ok` 或错误文本，
	 * 没有状态码 —— 只能读文本判成败。
	 */
	protected async setVariableRequest(
		response: DebugProtocol.SetVariableResponse,
		args: DebugProtocol.SetVariableArguments
	): Promise<void> {
		const path = this.variablePath(args.variablesReference, args.name);
		await this.applyAssignment(response, `${path}=${toLuaLiteral(args.value)}`, args.value);
	}

	/** 调试控制台里执行 `set x=1` 这类表达式时走这条。 */
	protected async setExpressionRequest(
		response: DebugProtocol.SetExpressionResponse,
		args: DebugProtocol.SetExpressionArguments
	): Promise<void> {
		await this.applyAssignment(response, `${args.expression}=${toLuaLiteral(args.value)}`, args.value);
	}

	private async applyAssignment(
		response: DebugProtocol.Response & { body?: { value?: string } },
		assignment: string,
		displayValue: string
	): Promise<void> {
		if (!this.channel) {
			response.success = false;
			response.message = 'The debug channel is not connected.';
			this.sendResponse(response);
			return;
		}
		const body = await this.channel.setVariable(assignment).catch((e: Error) => [e.message]);
		const text = body.join('\n').trim();
		if (text.startsWith('set ok')) {
			response.body = { value: displayValue };
		} else {
			response.success = false;
			response.message = text.length > 0 ? text : 'The emulator rejected the assignment without saying why.';
		}
		this.sendResponse(response);
	}

	/** 拼出变量在 Lua 里的访问路径。作用域容器没有父路径。 */
	private variablePath(reference: number, name: string): string {
		if (reference === SCOPE_GLOBALS || reference === SCOPE_LOCALS) {
			return name;
		}
		const container = this.containers.get(reference);
		return container ? joinLuaPath(container.path, name) : name;
	}

	/**
	 * 命中调试器的 customRequest。
	 *
	 * 命令面板需要一个不经过 DAP 标准请求的入口来操作测试自动化
	 * （注入按键、截图、查输入状态）。走这里而不是让命令面板自己连 3563：
	 * 那种通道只允许一个客户端，第二个连接会把扩展自己的连接挤掉。
	 */
	protected async customRequest(
		command: string,
		response: DebugProtocol.Response,
		args: unknown
	): Promise<void> {
		if (command !== 'clx.testAutomation') {
			super.customRequest(command, response, args);
			return;
		}
		const request = args as { command?: string; path?: string } | undefined;
		const raw = (request?.command ?? '').trim();
		if (raw.length === 0) {
			response.success = false;
			response.message = 'No emulator command was given.';
			this.sendResponse(response);
			return;
		}
		try {
			const output = await this.runAutomation(raw, request?.path);
			response.body = { output };
		} catch (e) {
			response.success = false;
			response.message = `${e}`;
		}
		this.sendResponse(response);
	}

	/**
	 * 执行一条测试自动化命令，返回要显示给用户的文本。
	 *
	 * `shot` 的落盘路径在这里被定向到扩展自己的存储目录 —— 模拟器的 `-d`
	 * 是用户的源码目录，不指定路径就会把 BMP 写到源码旁边，污染工作区。
	 */
	private async runAutomation(command: string, explicitPath?: string): Promise<string> {
		if (!this.channel) {
			return 'The debug channel is not connected.';
		}

		const token = command.split(/\s+/)[0].toLowerCase();
		const wantsShot = token === 'shot';

		let toSend = command;
		if (wantsShot && !explicitPath) {
			const dir = await this.screenShotDirectory();
			if (dir !== undefined) {
				toSend = `shot ${dir}/colox-${Date.now()}.bmp`;
			}
		}

		const body = await this.channel.raw(toSend).catch((e: Error) => [e.message]);

		if (wantsShot) {
			const shot = parseShot(body);
			if (shot) {
				// 只暴露路径与像素 md5，不做金图比对
				return [
					`Screenshot: ${shot.path}`,
					`${shot.width}x${shot.height} bpp=${shot.bpp} frame=${shot.frame}`,
					`pixel md5: ${shot.md5}`
				].join('\n');
			}
		}

		const state = token === 'btn' ? parseButtonState(body) : null;
		if (state !== null) {
			return `KDown=0x${state.down.toString(16).padStart(2, '0')} ` +
				`KHeld=0x${state.held.toString(16).padStart(2, '0')} ` +
				`inj=0x${state.injected.toString(16).padStart(2, '0')} left=${state.left}`;
		}

		return body.join('\n');
	}

	/** 截图目录：扩展自己的存储区，不在用户工作区里留文件。 */
	private async screenShotDirectory(): Promise<string | undefined> {
		if (this.storageRoot === undefined) {
			return undefined;
		}
		const dir = vscode.Uri.joinPath(this.storageRoot, 'screenshots');
		try {
			await vscode.workspace.fs.createDirectory(dir);
		} catch {
			// 建不出来就让调用方退回默认路径
			return undefined;
		}
		return dir.fsPath;
	}

	protected async evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	): Promise<void> {
		if (!this.channel) {
			response.body = { result: '', variablesReference: 0 };
			this.sendResponse(response);
			return;
		}

		if (args.context === 'repl') {
			// `!cmd` 前缀走测试自动化（`!btn LEFT 30`、`!shot`）。
			// 其余原样转发 —— REPL 里用户敲的就是模拟器命令，插件不解释内容。
			const input = args.expression.trim();
			if (input.startsWith('!')) {
				const output = await this.runAutomation(input.slice(1).trim());
				if (output.length > 0) {
					this.sendEvent(new OutputEvent(`${output}\n`));
				}
				response.body = { result: '', variablesReference: 0 };
				this.sendResponse(response);
				return;
			}
			const body = await this.channel.raw(input).catch((e: Error) => [e.message]);
			if (body.length > 0) {
				this.sendEvent(new OutputEvent(`${body.join('\n')}\n`));
			}
			response.body = { result: '', variablesReference: 0 };
			this.sendResponse(response);
			return;
		}

		// 局部变量 / 悬停 / 监视：用 p 取值，必须等应答
		const body = await this.channel.print(args.expression).catch((e: Error) => [e.message]);
		response.body = { result: body.join('\n').trim(), variablesReference: 0 };
		this.sendResponse(response);
	}

	protected async nextRequest(response: DebugProtocol.NextResponse): Promise<void> {
		// 先把上一次的停点清掉再发命令：中间若来了 stackTrace，
		// 报空栈比报上一轮的旧行号安全。
		this.lastStopLine = undefined;
		await this.proceed(response, () => this.channel?.next());
	}

	protected async continueRequest(response: DebugProtocol.ContinueResponse): Promise<void> {
		// 先把上一次的停点清掉再发命令：中间若来了 stackTrace，
		// 报空栈比报上一轮的旧行号安全。
		this.lastStopLine = undefined;
		await this.proceed(response, () => this.channel?.continue());
	}

	protected async stepInRequest(response: DebugProtocol.StepInResponse): Promise<void> {
		// 先把上一次的停点清掉再发命令：中间若来了 stackTrace，
		// 报空栈比报上一轮的旧行号安全。
		this.lastStopLine = undefined;
		await this.proceed(response, () => this.channel?.stepIn());
	}

	protected async stepOutRequest(response: DebugProtocol.StepOutResponse): Promise<void> {
		// 先把上一次的停点清掉再发命令：中间若来了 stackTrace，
		// 报空栈比报上一轮的旧行号安全。
		this.lastStopLine = undefined;
		await this.proceed(response, () => this.channel?.stepOut());
	}

	protected async pauseRequest(response: DebugProtocol.PauseResponse): Promise<void> {
		await this.proceed(response, () => this.channel?.pause());
	}

	/**
	 * 停止调试（红色的方块）。
	 *
	 * 必须覆盖：基类只回一个 success，什么都不清理。而我们在 initialize 里
	 * 声明了 supportsTerminateRequest，VS Code 会把"停止"发成 terminate，
	 * 而不是 disconnect —— 不实现就会留下一个还在跑的模拟器进程和一条
	 * 没关的 socket。这和历史上 configurationDone 不覆盖就发不出 `c` 是同一类坑。
	 */
	protected async terminateRequest(response: DebugProtocol.TerminateResponse): Promise<void> {
		await this.teardown();
		this.sendResponse(response);
		this.sendEvent(new TerminatedEvent());
	}

	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse): Promise<void> {
		await this.teardown();
		this.sendResponse(response);
	}

	/**
	 * 统一的收尾：清断点、放行、关通道、终止进程。
	 * terminate 和 disconnect 都走这里，避免两条路径行为不一致。
	 */
	private async teardown(): Promise<void> {
		const channel = this.channel;
		this.channel = undefined;
		if (channel) {
			await channel.deleteBreakpoint().catch(() => undefined);
			await channel.continue().catch(() => undefined);
			channel.close();
		}
		terminateEmulator();
	}

	// ───────────────────────── 内部 ─────────────────────────

	private failLaunch(response: DebugProtocol.LaunchResponse, message: string): void {
		response.success = false;
		response.message = message;
		this.sendResponse(response);
	}

	private async proceed(
		response: DebugProtocol.Response,
		action: () => Promise<void> | undefined
	): Promise<void> {
		try {
			await action();
		} catch (e) {
			response.success = false;
			response.message = `${e}`;
		}
		this.sendResponse(response);
	}

	/**
	 * 确保模拟器在跑且调试端口可用。
	 * 返回 undefined 表示可以继续；返回字符串是失败原因。
	 */
	private async prepareEmulator(host: string, port: number): Promise<string | undefined> {
		if (isEmulatorRunning() || (await this.probe(host, port))) {
			return undefined;
		}
		const outcome = await this.startEmulator(true);
		if (outcome === 'cancelled') {
			return 'Launch cancelled.';
		}
		if (outcome === 'failed') {
			return 'The CLX emulator could not be started.';
		}
		// 端口能连上不代表文件加载成功 —— 那要看 .rom
		if (!(await waitForDebugChannel(30_000, host, port))) {
			return 'Timed out waiting for the CLX emulator debug channel.';
		}
		return undefined;
	}

	/**
	 * 从 `vmlist` 里挑出目标 VM 并钉住。
	 *
	 * BIOS 菜单 VM 和游戏卡带 VM 共用这一条 3563，谁的 hook 先到谁认领。
	 * 不钉住就可能对着菜单 VM 调试，`src __lua__` 会返回空。
	 */
	private async pinCartridgeVm(): Promise<void> {
		if (!this.channel) {
			return;
		}
		const body = await this.channel.vmList().catch(() => [] as string[]);
		const vms = parseVmList(body);
		if (vms.length <= 1) {
			// 只有一个（或拿不到列表）：交给默认认领
			return;
		}
		// 已经有目标的沿用；否则挑最后一个（卡带通常在菜单之后启动）
		const target = vms.find(v => v.target) ?? vms[vms.length - 1];
		await this.channel.selectVm(target.index).catch(() => undefined);
	}

	/** 取回模拟器源码并建立映射。返回 undefined 表示成功。 */
	private async buildMapping(): Promise<string | undefined> {
		if (!this.channel || !this.sourcePath) {
			return 'No .clx file is open to debug.';
		}

		const sourceBody = await this.channel
			.source(LUA_SOURCE_NAME)
			.catch((e: Error) => [e.message]);
		const listing = parseSourceListing(sourceBody);
		if (!listing || listing.lineCount === 0) {
			return 'The emulator returned no source for the running cartridge. ' +
				'The debug channel is probably attached to the BIOS menu instead of the cartridge.';
		}

		const fileUri = vscode.Uri.file(this.sourcePath);
		let fileText: string;
		try {
			fileText = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
		} catch (e) {
			return `Cannot read ${this.sourcePath}: ${e}`;
		}
		const fileLines = fileText.split(/\r?\n/);

		const includedLines = await this.readIncludedLineCounts(fileUri, fileLines);
		try {
			this.mapping = buildLineMapping(fileLines, listing.source, includedLines);
		} catch (e) {
			if (e instanceof LineMappingError) {
				return `${e.message} ${e.detail ?? ''}`.trim();
			}
			return `${e}`;
		}
		return undefined;
	}

	/**
	 * 读每个 `#include` 目标的行数，用于交叉校验。
	 * 任何一个读不到就返回空数组，让校验降级成"只做内容校准" ——
	 * 缺失的校验比错误的校验好。
	 */
	private async readIncludedLineCounts(fileUri: vscode.Uri, fileLines: string[]): Promise<number[]> {
		const includes = findIncludes(fileLines);
		if (includes.length === 0) {
			return [];
		}
		const dir = vscode.Uri.joinPath(fileUri, '..');
		const counts: number[] = [];
		for (const rel of includes) {
			try {
				const text = new TextDecoder().decode(
					await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, rel))
				);
				counts.push(text.split(/\r?\n/).length);
			} catch {
				return [];
			}
		}
		return counts;
	}

	/**
	 * 收到 `@` 停帧。
	 *
	 * 停帧里已经带了精确位置（`func at source:line`），换算成 `.clx` 行号后
	 * 直接放进 StoppedEvent。不要只发一个裸的 StoppedEvent 让编辑器再去问 ——
	 * 那样在"刚停下"和"编辑器来问"之间，模拟器可能已经被下一条命令推着走了，
	 * 拿到的行号会属于另一个位置。
	 */
	private onStop(event: StopEvent): void {
		const line = this.mapping?.toFile(event.line);
		const stopped = new StoppedEvent('breakpoint', 1);
		if (line !== undefined) {
			// DAP 的 StoppedEvent 支持通过 allThreadsStopped 之外的 way 携带位置，
			// 但最可靠的是让编辑器立刻来问栈 —— 把行号记在案，stackTraceRequest
			// 优先用它，避免竞态。
			this.lastStopLine = line;
		}
		this.sendEvent(stopped);
	}

	private async resolveVariables(reference: number): Promise<Variable[]> {
		if (!this.channel) {
			return [];
		}

		if (reference === SCOPE_GLOBALS) {
			// 协议没有"列出全局"的命令，用 p _G 取；输出是同一套 pprint 文本。
			// 这条路径实测可用（_ENV 会被展开成完整的全局表）。
			const body = await this.channel.print('_G').catch(() => [] as string[]);
			return this.toVariables(parseVariableTree(body), '');
		}

		if (reference === SCOPE_LOCALS) {
			// `i local` 在模拟器侧有帧偏移 bug，拿不到真正的局部变量
			// （详见 GLOSSARY 与提交说明）。这里不假装它是空的 ——
			// 给用户一条可执行的替代路径。
			const local = tryLocals(await this.channel.locals().catch(() => [] as string[]));
			if (local.length > 0) {
				return this.toVariables(local, '');
			}
			return [
				note('(locals unavailable)', 'This emulator build cannot report local variables.'),
				note('Use the Debug Console', 'p <name> resolves locals and upvalues correctly at the stopped frame.')
			];
		}

		const container = this.containers.get(reference);
		return container ? this.toVariables(container.children, container.path) : [];
	}

	/**
	 * 把解析出的变量树转成 DAP 变量，并记住每个可展开表的完整访问路径 ——
	 * `setVariable` 只拿到变量名，嵌套表里的变量要靠这个路径拼出 `a.b.c`。
	 */
	private toVariables(nodes: VariableNode[], parentPath: string): Variable[] {
		return nodes.map(node => {
			const value = node.value === '' ? '{…}' : node.value;
			const variable = new Variable(node.name, value);
			const path = joinLuaPath(parentPath, node.name);
			if (node.children.length > 0) {
				const ref = this.nextContainer++;
				this.containers.set(ref, { children: node.children, path });
				variable.variablesReference = ref;
			} else {
				variable.variablesReference = 0;
			}
			return variable;
		});
	}

	private unverified(args: DebugProtocol.SetBreakpointsArguments): DebugProtocol.Breakpoint[] {
		return (args.breakpoints ?? []).map(b => {
			const bp = new Breakpoint(false, b.line) as DebugProtocol.Breakpoint;
			bp.message = 'The debug session is not ready yet.';
			return bp;
		});
	}
}

/**
 * 从 `i local` 的应答里取局部变量。
 *
 * 注意：在当前模拟器构建上这条路径**拿不到真正的局部变量** ——
 * 协议侧的帧偏移 bug 让 `i local` 总是报卡带顶层 chunk 而不是停下那一帧。
 * 这里仍然尝试解析，因为上游一旦修好就会自动生效；解析不到时返回空数组，
 * 由调用方给出"改用 p <name>"的提示，而不是显示一个骗人的空列表。
 */
function tryLocals(body: string[]): VariableNode[] {
	const { locals } = parseLocals(body);
	// `i local` 在坏帧上只会返回内部变量 `frame`，把它过滤掉免得误导
	return locals.filter(node => node.name !== 'frame');
}

/** 构造一条只读的说明性变量，用来在 Variables 面板里讲清楚限制。 */
function note(name: string, value: string): Variable {
	const variable = new Variable(name, value);
	variable.variablesReference = 0;
	return variable;
}

