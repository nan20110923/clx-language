/**
 * 调试通道 module：一个 socket，一个 framing 状态机，一批动词。
 *
 * 这是 DAP 层与模拟器之间的 seam。之前这段代码和 DAP handler 混在同一个
 * 491 行的类里，导致协议知识（命令字、应答体形状、什么命令要等应答）没有
 * 可测的地方 —— 两次线上 bug 都是在这里产生的。
 *
 * 协议要点（权威来源是模拟器实现 `coloX_dbg.cpp`）：
 * - 一行一条命令，`\n` 结尾，**大小写敏感**
 * - 应答按 token 分帧：`>-><token>` … `<-<<token>`，token 是请求行的第一个词
 * - **没有状态码**。成功/失败只能读应答体文本
 * - 未知命令返回**格式正确的空应答体**，所以 framing 不会坏，但也没法从结构上
 *   区分"命令不存在"和"成功但无输出"
 * - 停止事件是另一帧 `>->@` … `<-<@`，可能在任何时刻到来，不属于任何请求
 * - 未文档化的 `test` 命令**缺结尾帧**，任何按 token 分帧的客户端都会永久挂住，
 *   所以这里直接拒绝它
 *
 * 这个文件不 import vscode，socket 由外部传入（或由 connect 建），
 * 因此可以在 node:test 里用假 socket 驱动。
 */

import * as net from 'net';
import { StopEvent, parseStopFrame } from './luaProtocol';

/** 停止事件的 token，模拟器用 `@` 表示异步停帧。 */
const STOP_TOKEN = '@';

/**
 * 明确拒绝的命令：`test` 在模拟器里少了 `<-<test` 收尾（`coloX_dbg.cpp` 提前
 * return），只要发出去，等应答的请求就永远不会 settle。
 */
const UNFRAMED_COMMANDS = new Set(['test']);

/** 单个请求等应答的上限。超时后 reject，而不是永久挂住 DAP 请求。 */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ChannelOptions {
	/** 每收到一条原始行时回调，用于把非请求输出转发成 DAP OutputEvent。 */
	onOutputLine?: (line: string) => void;
	/** 收到 `@` 停帧时回调。 */
	onStop?: (event: StopEvent) => void;
	/** 连接断开时回调。 */
	onClose?: () => void;
	/** 单个请求的应答超时，默认 10 秒。 */
	timeoutMs?: number;
}

interface Pending {
	token: string;
	/** 已收到的应答体行 */
	body: string[];
	/** 正在收集中（已见到 `>->token`） */
	inBody: boolean;
	resolve: (body: string[]) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

/**
 * 一个到调试通道的连接。
 *
 * interface 是主动语态的一小撮动词；framing、超时、请求排队都在里面。
 * `raw` 是唯一的逃生口，给调试控制台里用户自己敲的模拟器命令用 ——
 * 那一层不该由插件理解。
 */
export class DebugChannel {
	private buffer = '';
	private pending: Pending | undefined;
	private closed = false;

	constructor(
		private readonly socket: net.Socket,
		private readonly options: ChannelOptions = {}
	) {
		this.socket.setEncoding('utf8');
		this.socket.on('data', (chunk: string) => this.onData(chunk));
		this.socket.on('close', () => this.onClose());
		this.socket.on('error', () => this.onClose());
	}

	/** 建立一个到调试通道的连接。host/port 默认取 emulatorProcess 的定义。 */
	static connect(host: string, port: number, options?: ChannelOptions): DebugChannel {
		return new DebugChannel(net.connect({ host, port }), options);
	}

	get isOpen(): boolean {
		return !this.closed;
	}

	// ───────────────────────── Lua 调试 ─────────────────────────

	/** `src <name>`：取回模拟器持有的源码。名字对卡带来讲固定是 `__lua__`。 */
	async source(name: string): Promise<string[]> {
		return this.request(`src ${name}`);
	}

	/** `bt`：完整调用栈，深度 0 在最前。 */
	async stackTrace(): Promise<string[]> {
		return this.request('bt');
	}

	/** `f <level>`：选中栈帧，之后 `i local` / `p` 都作用于它。 */
	async selectFrame(level: number): Promise<string[]> {
		return this.request(`f ${level}`);
	}

	/** `i local`：当前选中帧的局部变量与 upvalue。 */
	async locals(): Promise<string[]> {
		return this.request('i local');
	}

	/** `i b`：断点列表。 */
	async breakpointList(): Promise<string[]> {
		return this.request('i b');
	}

	/**
	 * `b <file>:<line> [if <cond>]`：设置断点。
	 *
	 * 行是空白时模拟器会拒绝并回 `there is no code at …`，调用方应把它映射成
	 * DAP 的 `verified: false`，而不是当作错误 —— 那个拒绝就是权威答案。
	 */
	async addBreakpoint(file: string, line: number, condition?: string): Promise<string[]> {
		const suffix = condition && condition.trim().length > 0 ? ` if ${condition.trim()}` : '';
		return this.request(`b ${file}:${line}${suffix}`);
	}

	/** `d [no]`：删除一个断点，不给编号则删除全部。 */
	async deleteBreakpoint(no?: number): Promise<string[]> {
		return this.request(no === undefined ? 'd' : `d ${no}`);
	}

	/** `dis [no]` / `en [no]`：停用 / 启用断点。 */
	async setBreakpointEnabled(enabled: boolean, no?: number): Promise<string[]> {
		const verb = enabled ? 'en' : 'dis';
		return this.request(no === undefined ? verb : `${verb} ${no}`);
	}

	/** `p <expr>`：打印表达式。**要求程序已停下**，否则模拟器回 `need in step mode`。 */
	async print(expression: string): Promise<string[]> {
		return this.request(`p ${expression}`);
	}

	/** `set <var>=<value>`：改写变量。同样要求已停下。 */
	async setVariable(assignment: string): Promise<string[]> {
		return this.request(`set ${assignment}`);
	}

	/** `n` / `s` / `fin` / `c` / `pause`。只发不等语义，应答体是空的。 */
	async next(): Promise<void> {
		await this.request('n');
	}

	async stepIn(): Promise<void> {
		await this.request('s');
	}

	async stepOut(): Promise<void> {
		await this.request('fin');
	}

	async continue(): Promise<void> {
		await this.request('c');
	}

	async pause(): Promise<void> {
		await this.request('pause');
	}

	/** `u`：停止状态下刷新画面。 */
	async refreshGraphics(): Promise<void> {
		await this.request('u');
	}

	// ───────────────────────── 多 VM ─────────────────────────

	/** `vmlist`：列出共享 3563 的 VM。BIOS 菜单和卡带各是一个。 */
	async vmList(): Promise<string[]> {
		return this.request('vmlist');
	}

	/** `vm <idx>`：把之后所有命令钉在这个 VM 上。 */
	async selectVm(index: number): Promise<string[]> {
		return this.request(`vm ${index}`);
	}

	// ────────────────────── 测试自动化 ──────────────────────

	/** `btn …`：注入键位。 */
	async injectButtons(args: string): Promise<string[]> {
		return this.request(`btn${args.length > 0 ? ' ' + args : ''}`);
	}

	/** `mouse …`：注入鼠标/触摸。 */
	async injectMouse(args: string): Promise<string[]> {
		return this.request(`mouse${args.length > 0 ? ' ' + args : ''}`);
	}

	/** `key …`：注入键盘按住电平。 */
	async injectKey(args: string): Promise<string[]> {
		return this.request(`key${args.length > 0 ? ' ' + args : ''}`);
	}

	/** `padset …`：注入手柄。只在支持手柄的构建里存在。 */
	async injectPad(args: string): Promise<string[]> {
		return this.request(`padset${args.length > 0 ? ' ' + args : ''}`);
	}

	/** `shot [path]`：截图。路径必须绝对，且允许带空格。 */
	async screenshot(path?: string): Promise<string[]> {
		return this.request(path === undefined ? 'shot' : `shot ${path}`);
	}

	/** `input?`：一屏看全输入状态。 */
	async inputState(): Promise<string[]> {
		return this.request('input?');
	}

	// ───────────────────────── 逃生口 ─────────────────────────

	/**
	 * 发一条原始命令并等应答。给调试控制台用：用户在 REPL 里敲的就是模拟器命令，
	 * 插件只负责转发和分帧，不解释内容。
	 */
	async raw(command: string): Promise<string[]> {
		return this.request(command);
	}

	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.failPending(new Error('The debug channel was closed.'));
		this.socket.destroy();
	}

	// ───────────────────────── 内部 ─────────────────────────

	/**
	 * 发一条命令并等它的应答帧。
	 *
	 * 同一时刻只允许一个请求在飞：协议没有请求 id，只能靠顺序对应。
	 * 并发调用按**调用顺序**排队 —— 后来的请求必须等前一个 settle 才发出，
	 * 否则两个应答会互相污染。
	 *
	 * 注意：空闲时必须**同步**写出去。如果无条件 `then()` 链在队尾，第一次调用
	 * 也会被推到微任务里，于是命令的发出晚于调用方手上的下一个动作 —— 在真实
	 * 使用中这会让"刚发的命令还没出门就收到了应答"这类时序判断全部错位。
	 */
	private queueTail: Promise<unknown> | undefined;

	private request(command: string): Promise<string[]> {
		if (this.queueTail === undefined) {
			// 空闲：立刻发
			const result = this.dispatch(command);
			this.trackQueue(result);
			return result;
		}
		// 有请求在飞：排到队尾，等它 settle 再发
		const result = this.queueTail.then(
			() => this.dispatch(command),
			() => this.dispatch(command)
		);
		this.trackQueue(result);
		return result;
	}

	private trackQueue(result: Promise<string[]>): void {
		const settled = result.then(
			() => undefined,
			() => undefined
		);
		this.queueTail = settled;
		void settled.then(() => {
			// 队尾清空后回到空闲态，让下一次请求重新走同步路径
			if (this.queueTail === settled) {
				this.queueTail = undefined;
			}
		});
	}

	private dispatch(command: string): Promise<string[]> {
		const trimmed = command.trim();
		if (trimmed.length === 0) {
			return Promise.reject(new Error('Empty command.'));
		}
		if (this.closed) {
			return Promise.reject(new Error('The debug channel is not connected.'));
		}

		const token = trimmed.split(/\s+/)[0];
		if (UNFRAMED_COMMANDS.has(token)) {
			// 发出去就会永久挂住，宁可在本地失败
			return Promise.reject(new Error(`The "${token}" command is not usable: the emulator never closes its reply frame.`));
		}
		// 能走到这里说明队列是空的：并发已经在 request() 里串行化了，
		// 所以此刻不该有在飞的请求。真有的话是内部状态错乱，不能静默覆盖。
		if (this.pending) {
			return Promise.reject(new Error(
				`Internal error: "${this.pending.token}" is still in flight.`
			));
		}

		const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		return new Promise<string[]>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pending && this.pending.token === token) {
					this.pending = undefined;
					reject(new Error(`The emulator did not answer "${token}" within ${timeoutMs}ms.`));
				}
			}, timeoutMs);

			this.pending = { token, body: [], inBody: false, resolve, reject, timer };
			this.socket.write(`${trimmed}\n`);
		});
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		// 按 \n 切行；末尾可能是不完整的半行，留在 buffer 里
		let index = this.buffer.indexOf('\n');
		while (index !== -1) {
			const line = this.buffer.slice(0, index).replace(/\r$/, '');
			this.buffer = this.buffer.slice(index + 1);
			this.onLine(line);
			index = this.buffer.indexOf('\n');
		}
	}

	private onLine(line: string): void {
		// 帧起始：`>->token`
		if (line.startsWith('>->')) {
			const token = line.slice(3);
			if (token === STOP_TOKEN) {
				this.startStopFrame();
				return;
			}
			const pending = this.pending;
			if (pending && pending.token === token) {
				pending.inBody = true;
				pending.body = [];
				return;
			}
			// 不是我们在等的帧（可能上一个请求超时了）：忽略，别污染当前请求
			return;
		}

		// 帧结束：`<-<token`
		if (line.startsWith('<-<')) {
			const token = line.slice(3);
			if (token === STOP_TOKEN) {
				this.finishStopFrame();
				return;
			}
			const pending = this.pending;
			if (pending && pending.token === token) {
				this.pending = undefined;
				clearTimeout(pending.timer);
				pending.resolve(pending.body);
			}
			return;
		}

		// 帧内正文
		if (this.stopFrame !== undefined) {
			this.stopFrame.push(line);
			return;
		}
		const pending = this.pending;
		if (pending && pending.inBody) {
			pending.body.push(line);
			return;
		}
		// 谁都不认领的输出：转发出去，绝不静默丢弃
		this.options.onOutputLine?.(line);
	}

	private stopFrame: string[] | undefined;

	private startStopFrame(): void {
		this.stopFrame = [];
	}

	private finishStopFrame(): void {
		const body = this.stopFrame ?? [];
		this.stopFrame = undefined;
		const event = parseStopFrame(body);
		if (event) {
			this.options.onStop?.(event);
		} else {
			// 解析不了也要让用户看见，否则"停在这里却没停"很难查
			for (const line of body) {
				this.options.onOutputLine?.(line);
			}
		}
	}

	private onClose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.failPending(new Error('The emulator closed the debug channel.'));
		this.options.onClose?.();
	}

	private failPending(error: Error): void {
		const pending = this.pending;
		this.pending = undefined;
		if (pending) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
	}
}
