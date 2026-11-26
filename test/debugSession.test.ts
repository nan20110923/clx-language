/**
 * DebugSession 的 DAP 层测试。
 *
 * 这是本仓库唯一一块曾经出过三个真 bug、却完全没有测试的地方：
 *   1. terminateRequest 声明了 supportsTerminateRequest 但没实现，
 *      基类只回 success，模拟器进程一直留着
 *   2. stackTrace 在 bt 返回空时保留上一次的帧，继续运行后编辑器
 *      还会显示过期行号
 *   3. 映射建立前收到的断点被丢弃，VS Code 不会重试
 *
 * 能测的前提是把 channel 改成注入的 —— 见 DebugSession 的构造参数。
 * 有了假 channel，这些请求就能在普通 Node 里驱动，不必启动 VS Code
 * 或模拟器。
 *
 * `vscode` 用一个极小的替身替换（test/support/vscode-stub.ts）。替身在**静态**
 * import 里注册进 require 缓存，这样 esbuild 打出来的 CJS 里 `require('vscode')`
 * 会命中它。刻意不用 import.meta：它会让这个文件按 ESM 解析，node16 下
 * 相对 import 就必须写 .js 后缀，而其余测试都是无后缀的。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as vscodeStub from './support/vscode-stub';
// esbuild 通过 --alias:vscode=test/support/vscode-stub.ts 把 debugSession 里的
// `import * as vscode from 'vscode'` 指向同一个替身（见 scripts/run-tests.mjs）。
import { DebugSession } from '../src/debug/debugSession';

// ---------------------------------------------------------------------------
// 假 channel
// ---------------------------------------------------------------------------

/**
 * 记录 DAP 层发出的每条命令，并按脚本回应答。
 *
 * 复用真实的 DebugChannel 类形状（不继承它），所以 DebugSession 里
 * 用到的每个动词都必须在这里出现 —— 少一个，测试就编译不过。
 */
class FakeChannel {
	readonly commands: string[] = [];
	readonly boundary = {
		next: 'stop',
		stepIn: 'stop',
		stepOut: 'stop',
		continue: 'stop',
		pause: 'stop'
	} as const;

	/** 按命令 token 返回预设应答体 */
	replies = new Map<string, string[]>();

	async source(name: string): Promise<string[]> {
		this.commands.push(`src ${name}`);
		return this.reply('src');
	}
	async stackTrace(): Promise<string[]> {
		this.commands.push('bt');
		return this.reply('bt');
	}
	async selectFrame(level: number): Promise<string[]> {
		this.commands.push(`f ${level}`);
		return this.reply('f');
	}
	async locals(): Promise<string[]> {
		this.commands.push('i local');
		return this.reply('locals');
	}
	async breakpointList(): Promise<string[]> {
		this.commands.push('i b');
		return this.reply('i b');
	}
	async addBreakpoint(file: string, line: number, condition?: string): Promise<string[]> {
		const cmd = condition ? `b ${file}:${line} if ${condition}` : `b ${file}:${line}`;
		this.commands.push(cmd);
		return this.reply(`b:${line}`);
	}
	async deleteBreakpoint(no?: number): Promise<string[]> {
		this.commands.push(no === undefined ? 'd' : `d ${no}`);
		return [];
	}
	async setBreakpointEnabled(): Promise<string[]> {
		return [];
	}
	async print(expression: string): Promise<string[]> {
		this.commands.push(`p ${expression}`);
		return this.reply(`p ${expression}`);
	}
	async setVariable(assignment: string): Promise<string[]> {
		this.commands.push(`set ${assignment}`);
		return ['set ok'];
	}
	async next(): Promise<void> { this.commands.push('n'); }
	async stepIn(): Promise<void> { this.commands.push('s'); }
	async stepOut(): Promise<void> { this.commands.push('fin'); }
	async continue(): Promise<void> { this.commands.push('c'); }
	async pause(): Promise<void> { this.commands.push('pause'); }
	async refreshGraphics(): Promise<void> { this.commands.push('u'); }
	async vmList(): Promise<string[]> {
		this.commands.push('vmlist');
		return this.reply('vmlist');
	}
	async selectVm(index: number): Promise<string[]> {
		this.commands.push(`vm ${index}`);
		return [];
	}
	async injectButtons(args: string): Promise<string[]> { this.commands.push(`btn ${args}`); return []; }
	async injectMouse(args: string): Promise<string[]> { this.commands.push(`mouse ${args}`); return []; }
	async injectKey(args: string): Promise<string[]> { this.commands.push(`key ${args}`); return []; }
	async injectPad(args: string): Promise<string[]> { this.commands.push(`padset ${args}`); return []; }
	async screenshot(p?: string): Promise<string[]> { this.commands.push(p ? `shot ${p}` : 'shot'); return []; }
	async inputState(): Promise<string[]> { this.commands.push('input?'); return []; }
	async raw(command: string): Promise<string[]> {
		this.commands.push(command);
		return this.reply(command.split(/\s+/)[0]);
	}
	close(): void { this.commands.push('<close>'); }
	get isOpen(): boolean { return true; }

	/** 由 onStop 触发，模拟模拟器异步吐停帧 */
	emitStop: ((event: { func: string; source: string; line: number }) => void) | undefined;

	private reply(key: string): string[] {
		return this.replies.get(key) ?? [];
	}
}

/** 造一个 DebugSession，channel 是假的，startEmulator 立即成功。 */
function makeSession(opts: { files?: Record<string, string> } = {}) {
	const channel = new FakeChannel();
	for (const [p, content] of Object.entries(opts.files ?? {})) {
		vscodeStub.__files.set(p, new TextEncoder().encode(content));
	}
	const session = new DebugSession(
		async () => 'started',
		(_host, _port, options) => {
			channel.emitStop = options.onStop;
			return channel as any;
		},
		// 端口探测：立即报告就绪，否则要空等 waitForDebugChannel 的超时
		async () => true
	);
	return { session, channel };
}

/**
 * 走一小段 DAP：initialize → launch，并抓下发出的所有事件。
 * launch 会等模拟器、连通道、vmlist、src、建映射。
 */
async function launch(
	session: any,
	channel: FakeChannel,
	clxPath: string,
	opts: { source?: string[]; vms?: string[] } = {}
) {
	const events: unknown[] = [];
	// LoggingDebugSession 通过 sendEvent 发事件，这里截下来
	(session as unknown as { sendEvent: (e: unknown) => void }).sendEvent = e => {
		events.push(e);
	};
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	channel.replies.set('vmlist', opts.vms ?? ['idx\tcart\tframe\ttarget', '0\t?\t1\t*']);
	channel.replies.set('src', opts.source ?? ['__lua__:2', 'local a = 1', 'local b = 2']);

	await (session as unknown as {
		launchRequest: (r: unknown, a: unknown) => Promise<void>;
	}).launchRequest({ success: true }, { sourcePath: clxPath });
	return events;
}

const CLX = '/ws/game.clx';

/**
 * 造一个能收集 body 的 DAP 应答对象。
 *
 * 直接写 `{ set body(v) { captured = v } }` 在对象字面量里不合法
 * （会报"property and accessor with the same name"），所以要显式建对象
 * 再 defineProperty。
 */
function makeResponse() {
	// 两个不同的对象：response 是交给 DAP 的应答，captured 收集写入的 body。
	// 必须分开 —— 指向同一个对象会变成自赋值，getter 无限递归。
	const captured: { body?: unknown } = {};
	const response: Record<string, unknown> = { success: true };
	Object.defineProperty(response, 'body', {
		set(value: unknown) {
			captured.body = value;
		},
		get() {
			return captured.body;
		},
		configurable: true
	});
	return { response, captured };
}

// ---------------------------------------------------------------------------
// bug 1：terminateRequest
// ---------------------------------------------------------------------------

test('terminateRequest 真的关通道、清断点，而不是只回 success', async () => {
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);

	const respond = (session as unknown as {
		terminateRequest: (r: unknown) => Promise<void>;
	});
	await respond.terminateRequest({ success: true });

	// 关键：断点被清、通道被关
	assert.ok(channel.commands.includes('d'), `expected 'd', got: ${channel.commands.join(', ')}`);
	assert.ok(channel.commands.includes('c'), 'should resume the emulator');
	assert.ok(channel.commands.includes('<close>'), 'should close the channel');
});

test('initialize 声明 supportsTerminateRequest 时必须有对应实现', async () => {
	// 这个断言把"声明了就要实现"变成可检查的约定：
	// 基类的 terminateRequest 只回 success，不关任何东西。
	const { session } = makeSession();
	let capabilities: Record<string, unknown> = {};
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;
	(session as unknown as {
		initializeRequest: (r: { body?: Record<string, unknown> }) => void;
	}).initializeRequest({ body: undefined });
	// 重新取一次，因为上面传进去的对象会被写入
	({
		initializeRequest: (r: { body?: Record<string, unknown> }) => {
			(session as unknown as { initializeRequest: (x: unknown) => void }).initializeRequest(r);
			capabilities = r.body ?? {};
		}
	}).initializeRequest({ body: undefined });

	assert.equal(capabilities['supportsTerminateRequest'], true);
	assert.equal(
		typeof (session as unknown as { terminateRequest?: unknown }).terminateRequest,
		'function',
		'supportsTerminateRequest is declared, so terminateRequest must exist'
	);
});

// ---------------------------------------------------------------------------
// bug 2：stackTrace 不能保留过期帧
// ---------------------------------------------------------------------------

test('stackTrace 在 bt 返回空时不复用上一次的帧', async () => {
	// 这条守的是原始 bug：frames 曾经是字段，bt 返回空时不覆盖，于是继续运行后
	// 编辑器还显示旧行号。
	//
	// 注意这个 module 还有一层兜底：lastStopLine 存在时会在无帧时补一帧。
	// 所以这条测试必须先清掉 lastStopLine 才能观察到"空就是空"。
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	// 第一次：停在 __lua__:2（对应文件第 4 行）
	channel.replies.set('bt', ['0 in _update at __lua__:2']);
	let r = makeResponse();
	await (session as unknown as {
		stackTraceRequest: (res: unknown) => Promise<void>;
	}).stackTraceRequest(r.response);
	let body = r.captured.body as { stackFrames: { line: number }[] };
	assert.equal(body.stackFrames.length, 1);
	assert.equal(body.stackFrames[0].line, 4);

	// 继续运行：模拟器不再有帧，且上一轮的停点也应该失效
	(session as unknown as { lastStopLine: number | undefined }).lastStopLine = undefined;
	channel.replies.set('bt', []);
	r = makeResponse();
	await (session as unknown as {
		stackTraceRequest: (res: unknown) => Promise<void>;
	}).stackTraceRequest(r.response);
	body = r.captured.body as { stackFrames: { line: number }[] };

	assert.equal(
		body.stackFrames.length,
		0,
		'the frame from the previous stop must not survive; got ' +
		JSON.stringify(body.stackFrames)
	);
});

test('lastStopLine 在无帧时补出最后停点，而不是显示空栈', async () => {
	// 这一层是防竞态的：停帧到达时模拟器已停在某行，但编辑器来问 stackTrace
	// 之前它可能又动了。有 lastStopLine 就还能报出准确位置。
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	// 模拟收到停帧：__lua__:1 -> 文件第 3 行
	channel.emitStop?.({ func: '_update', source: '__lua__', line: 1 });
	assert.equal((session as unknown as { lastStopLine?: number }).lastStopLine, 3);

	// 之后 bt 是空的（模拟器又动了），但仍应报出停点
	channel.replies.set('bt', []);
	const r = makeResponse();
	await (session as unknown as {
		stackTraceRequest: (res: unknown) => Promise<void>;
	}).stackTraceRequest(r.response);
	const body = r.captured.body as { stackFrames: { line: number }[] };

	assert.equal(body.stackFrames.length, 1, 'lastStopLine should synthesize a frame');
	assert.equal(body.stackFrames[0].line, 3);
});

test('stackTrace 把 __lua__ 行号换算成 .clx 行号', async () => {
	// 文件第 3 行是 'local a = 1'，对应 emu 第 1 行
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	channel.replies.set('bt', ['0 in _update at __lua__:1']);
	const r = makeResponse();
	await (session as unknown as {
		stackTraceRequest: (res: unknown) => Promise<void>;
	}).stackTraceRequest(r.response);
	const body = r.captured.body as { stackFrames: { line: number; source?: { path: string } }[] };

	assert.equal(body.stackFrames[0].line, 3, 'emu line 1 is file line 3');
	assert.equal(body.stackFrames[0].source?.path, CLX, 'must point at the original file');
});

// ---------------------------------------------------------------------------
// bug 3：映射就绪前的断点不能被丢弃
// ---------------------------------------------------------------------------

test('映射就绪前收到的断点会被暂存，就绪后补发', async () => {
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });

	// 还没 launch（channel 和 mapping 都不存在）时设断点
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;
	await (session as unknown as {
		setBreakPointsRequest: (r: unknown, a: unknown) => Promise<void>;
	}).setBreakPointsRequest(
		{ body: undefined, success: true },
		{ source: { path: CLX }, breakpoints: [{ line: 3 }] }
	);

	// 此时不该发出任何 b 命令
	assert.equal(
		channel.commands.filter(c => c.startsWith('b ')).length,
		0,
		'nothing can be sent before the mapping exists'
	);

	// launch 之后，暂存的断点应该被补发
	channel.replies.set('b:1', ['Breakpoint 0 at file __lua__, line 1, if ', 'code: local a = 1']);
	await launch(session, channel, CLX);

	const sent = channel.commands.filter(c => c.startsWith('b '));
	assert.equal(sent.length, 1, `breakpoint should be replayed, got: ${channel.commands.join(', ')}`);
	assert.equal(sent[0], 'b __lua__:1', 'file line 3 -> emu line 1');
});

test('空行断点是 verified:false，且不会问模拟器', async () => {
	// 校准只覆盖非空行，所以空行根本不在映射里 —— 它走的是
	// "outside the Lua section" 分支，而不是发给模拟器后被拒绝。
	// 两种情况对用户都是 verified:false，区别在于有没有一次多余的往返。
	const file = ['coloX-16', '__lua__', 'local a = 1', '', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	// 文件第 4 行是空行
	const r = makeResponse();
	await (session as unknown as {
		setBreakPointsRequest: (res: unknown, a: unknown) => Promise<void>;
	}).setBreakPointsRequest(
		r.response,
		{ source: { path: CLX }, breakpoints: [{ line: 4 }] }
	);
	const body = r.captured.body as { breakpoints: { verified: boolean; message?: string }[] };

	assert.equal(body.breakpoints.length, 1);
	assert.equal(body.breakpoints[0].verified, false, 'a blank line cannot hold a breakpoint');
	assert.equal(
		channel.commands.filter(c => c.startsWith('b ')).length,
		0,
		'no round-trip is needed for a line the mapping already excludes'
	);
});

test('模拟器拒绝断点时把原文透传成 message', async () => {
	// 空白行在映射之外，但模拟器也会拒绝别的情况（比如行号越界）。
	// 那条路径要把模拟器的原文带给用户，而不是吞掉。
	const file = ['coloX-16', '__lua__', 'local a = 1', 'local b = 2', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	channel.replies.set('b:1', ['there is no code at __lua__:1']);
	const r = makeResponse();
	await (session as unknown as {
		setBreakPointsRequest: (res: unknown, a: unknown) => Promise<void>;
	}).setBreakPointsRequest(
		r.response,
		{ source: { path: CLX }, breakpoints: [{ line: 3 }] }
	);
	const body = r.captured.body as { breakpoints: { verified: boolean; message?: string }[] };

	assert.equal(body.breakpoints[0].verified, false);
	assert.match(body.breakpoints[0].message ?? '', /there is no code/);
});

test('不在 Lua 区段内的行不发给模拟器，直接 unverified', async () => {
	const file = ['coloX-16', '__lua__', 'local a = 1', ''].join('\n');
	const { session, channel } = makeSession({ files: { [CLX]: file } });
	await launch(session, channel, CLX);
	(session as unknown as { sendResponse: (r: unknown) => void }).sendResponse = () => undefined;

	const r = makeResponse();
	await (session as unknown as {
		setBreakPointsRequest: (res: unknown, a: unknown) => Promise<void>;
	}).setBreakPointsRequest(
		r.response,
		// 第 1 行是设备规格，不在 Lua 段里
		{ source: { path: CLX }, breakpoints: [{ line: 1 }] }
	);
	const body = r.captured.body as { breakpoints: { verified: boolean; message?: string }[] };

	assert.equal(body.breakpoints[0].verified, false);
	assert.match(body.breakpoints[0].message ?? '', /outside the Lua section/);
	assert.equal(
		channel.commands.filter(c => c.startsWith('b ')).length,
		0,
		'must not ask the emulator about a line that cannot hold code'
	);
});
