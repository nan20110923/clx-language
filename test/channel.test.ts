/**
 * debugChannel 的 framing 状态机测试。
 *
 * 用假的 socket（EventEmitter 冒充 net.Socket）驱动，不发真 TCP ——
 * 这正是把通道从 DAP 适配器里取出来的收益：协议行为可以在普通 Node 里验证，
 * 不需要按 F5、不需要模拟器。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import type { Socket } from 'node:net';
import { DebugChannel, type ChannelOptions } from '../src/debug/debugChannel';
import type { StopEvent } from '../src/debug/luaProtocol';

/** 最小可用的 net.Socket 替身：记录写出的内容，可注入收到的内容。 */
class FakeSocket extends EventEmitter {
	written: string[] = [];
	destroyed = false;
	encoding: string | undefined;

	setEncoding(encoding: string): this {
		this.encoding = encoding;
		return this;
	}

	write(data: string): boolean {
		this.written.push(data);
		return true;
	}

	destroy(): void {
		this.destroyed = true;
	}

	/** 模拟模拟器吐字节 */
	receive(text: string): void {
		this.emit('data', text);
	}
}

function makeChannel(options: ChannelOptions = {}) {
	const socket = new FakeSocket();
	const channel = new DebugChannel(socket as unknown as Socket, options);
	return { socket, channel };
}

// ---------------------------------------------------------------------------
// 分帧
// ---------------------------------------------------------------------------

test('一个完整应答解出正文', async () => {
	const { socket, channel } = makeChannel();
	const pending = channel.raw('bt');
	assert.equal(socket.written[0], 'bt\n');

	socket.receive('>->bt\n');
	socket.receive('0 in m at __lua__:2\n');
	socket.receive('<-<bt\n');

	assert.deepEqual(await pending, ['0 in m at __lua__:2']);
});

test('多行正文按顺序收集', async () => {
	const { socket, channel } = makeChannel();
	const pending = channel.stackTrace();
	socket.receive('>->bt\na\nb\nc\n<-<bt\n');
	assert.deepEqual(await pending, ['a', 'b', 'c']);
});

test('空应答体（未知命令）正常完成而不是挂住', async () => {
	const { socket, channel } = makeChannel();
	const pending = channel.raw('nosuchcommand');
	socket.receive('>->nosuchcommand\n<-<nosuchcommand\n');
	assert.deepEqual(await pending, []);
});

test('跨 chunk 的不完整行被缓冲拼接', async () => {
	const { socket, channel } = makeChannel();
	const pending = channel.raw('bt');
	socket.receive('>->bt\nlo');
	socket.receive('cal a = 1\n<-<b');
	socket.receive('t\n');
	assert.deepEqual(await pending, ['local a = 1']);
});

test('\\r\\n 行尾被正确处理', async () => {
	const { socket, channel } = makeChannel();
	const pending = channel.raw('bt');
	socket.receive('>->bt\r\nhello\r\n<-<bt\r\n');
	assert.deepEqual(await pending, ['hello']);
});

test('同一 token 的应答不会错配给另一个请求', async () => {
	const { socket, channel } = makeChannel();
	const first = channel.raw('p a');
	// 请求二的 token 不同，帧不能被一认领
	socket.receive('>->p\n1\n<-<p\n');
	assert.deepEqual(await first, ['1']);
});

// ---------------------------------------------------------------------------
// 停止帧（异步，不属于任何请求）
// ---------------------------------------------------------------------------

test('@ 帧不打断在飞的请求，并触发 onStop', async () => {
	const stops: StopEvent[] = [];
	const { socket, channel } = makeChannel({ onStop: e => stops.push(e) });

	const pending = channel.raw('n');
	// 停止帧插在 n 的应答之前到达
	socket.receive('>->@\n_update at __lua__:5\n0005>  counter = counter + 1\n<-<@\n');
	socket.receive('>->n\n<-<n\n');

	assert.deepEqual(await pending, []);
	assert.equal(stops.length, 1);
	assert.equal(stops[0].func, '_update');
	assert.equal(stops[0].line, 5);
});

test('@ 帧之后在飞的请求仍然拿到自己的应答', async () => {
	const { socket, channel } = makeChannel({ onStop: () => undefined });
	const pending = channel.raw('bt');
	socket.receive('>->@\nmain at __lua__:1\n<-<@\n>->bt\n0 in main at __lua__:1\n<-<bt\n');
	assert.deepEqual(await pending, ['0 in main at __lua__:1']);
});

test('@ 帧嵌套在一个请求的应答体内时被正确分离', async () => {
	// 实测形状（2026-11-26，程序还在跑时发 p）：停帧会在 p 的帧内部吐出来。
	// 请求体里不能混进停帧的行，停帧也不能吞掉请求体。
	const stops: StopEvent[] = [];
	const { socket, channel } = makeChannel({ onStop: e => stops.push(e) });
	const pending = channel.raw('p counter');

	socket.receive('>->p\n');
	socket.receive('Breakpoint 0, ? at __lua__:9\n');
	socket.receive('>->@\n');
	socket.receive('? at __lua__:9\n');
	socket.receive('0009>end\n');
	socket.receive('<-<@\n');
	socket.receive('1000\n');
	socket.receive('<-<p\n');

	assert.deepEqual(await pending, ['Breakpoint 0, ? at __lua__:9', '1000']);
	assert.equal(stops.length, 1);
	assert.equal(stops[0].line, 9);
});

test('@ 帧结束后请求体继续累积', async () => {
	const stops: StopEvent[] = [];
	const { socket, channel } = makeChannel({ onStop: e => stops.push(e) });
	const pending = channel.raw('p x');
	socket.receive('>->p\nbefore\n>->@\nf at __lua__:2\n<-<@\nafter\n<-<p\n');
	assert.deepEqual(await pending, ['before', 'after']);
	assert.equal(stops.length, 1);
});

test('解析不了的 @ 帧内容转发到输出而不是丢弃', async () => {
	const lines: string[] = [];
	const { socket } = makeChannel({ onOutputLine: l => lines.push(l) });
	socket.receive('>->@\n乱七八糟\n<-<@\n');
	assert.deepEqual(lines, ['乱七八糟']);
});

// ---------------------------------------------------------------------------
// 协议缺陷：永远不闭合的应答
// ---------------------------------------------------------------------------

test('明确拒绝 test 命令，避免永久挂住', async () => {
	const { socket, channel } = makeChannel();
	await assert.rejects(channel.raw('test'), /never closes/);
	// 根本没发出去
	assert.equal(socket.written.length, 0);
});

// ---------------------------------------------------------------------------
// 超时与关闭
// ---------------------------------------------------------------------------

test('超时后 reject 而不是永远挂着', async () => {
	const { socket, channel } = makeChannel({ timeoutMs: 20 });
	const pending = channel.raw('bt');
	// 不回任何东西
	await assert.rejects(pending, /did not answer/);
	assert.equal(socket.written.length, 1);
});

test('超时后迟到的应答不会污染下一个请求', async () => {
	const { socket, channel } = makeChannel({ timeoutMs: 20 });
	await assert.rejects(channel.raw('bt'), /did not answer/);

	// 上一个请求的应答这时才到
	socket.receive('>->bt\nSTALE\n<-<bt\n');

	const second = channel.raw('bt');
	socket.receive('>->bt\nFRESH\n<-<bt\n');
	assert.deepEqual(await second, ['FRESH']);
});

test('连接关闭时在飞的请求被 reject，并触发 onClose', async () => {
	let closed = 0;
	const { socket, channel } = makeChannel({ onClose: () => closed++ });
	const pending = channel.raw('bt');
	socket.emit('close');
	await assert.rejects(pending, /closed/);
	assert.equal(closed, 1);
});

test('关闭后新的请求直接失败', async () => {
	const { channel } = makeChannel();
	channel.close();
	assert.equal(channel.isOpen, false);
	await assert.rejects(channel.raw('bt'), /not connected/);
});

test('空命令被拒绝', async () => {
	const { channel } = makeChannel();
	await assert.rejects(channel.raw('   '), /Empty command/);
});

// ---------------------------------------------------------------------------
// 动词生成的命令行
// ---------------------------------------------------------------------------

test('addBreakpoint 生成 b <file>:<line>，条件用 if 前缀', async () => {
	const { socket, channel } = makeChannel();
	const a = channel.addBreakpoint('__lua__', 9);
	assert.equal(socket.written[0], 'b __lua__:9\n');
	socket.receive('>->b\nok\n<-<b\n');
	await a;

	const b = channel.addBreakpoint('__lua__', 12, 'x > 3');
	assert.equal(socket.written[1], 'b __lua__:12 if x > 3\n');
	socket.receive('>->b\nok\n<-<b\n');
	await b;
});

test('deleteBreakpoint 不带编号时删除全部', async () => {
	const { socket, channel } = makeChannel();
	const p = channel.deleteBreakpoint();
	assert.equal(socket.written[0], 'd\n');
	socket.receive('>->d\nok\n<-<d\n');
	await p;
});

test('screenshot 允许路径带空格', async () => {
	const { socket, channel } = makeChannel();
	const p = channel.screenshot('/tmp/a b.bmp');
	assert.equal(socket.written[0], 'shot /tmp/a b.bmp\n');
	socket.receive('>->shot\nok\n<-<shot\n');
	await p;
});

test('selectFrame 生成 f <level>', async () => {
	const { socket, channel } = makeChannel();
	const p = channel.selectFrame(2);
	assert.equal(socket.written[0], 'f 2\n');
	socket.receive('>->f\nok\n<-<f\n');
	await p;
});

test('print 保留表达式里的空格', async () => {
	const { socket, channel } = makeChannel();
	const p = channel.print('a + b');
	assert.equal(socket.written[0], 'p a + b\n');
	socket.receive('>->p\n3\n<-<p\n');
	assert.deepEqual(await p, ['3']);
});

// ---------------------------------------------------------------------------
// 串行化：协议没有请求 id，只能靠顺序对应
// ---------------------------------------------------------------------------

test('并发调用被串行化，命令行顺序与应答顺序一致', async () => {
	const { socket, channel } = makeChannel();

	const first = channel.raw('bt');
	const second = channel.raw('i b');

	// 此刻只有第一条被写出
	assert.deepEqual(socket.written, ['bt\n']);

	socket.receive('>->bt\nframe\n<-<bt\n');
	assert.deepEqual(await first, ['frame']);

	// 第二条现在才发出
	assert.deepEqual(socket.written, ['bt\n', 'i b\n']);
	// token 只是第一个词：`i b` 的帧是 >->i / <-<i，不是 >->i b
	socket.receive('>->i\nlist\n<-<i\n');
	assert.deepEqual(await second, ['list']);
});

test('i b 与 i local 共用 token i，靠串行化区分', async () => {
	// 协议没有请求 id，token 又是请求首词，所以两个都是 `i`。
	// 只能一次一个，否则无法判断回来的 `i` 属于谁。
	const { socket, channel } = makeChannel();

	const list = channel.breakpointList();
	assert.equal(socket.written[0], 'i b\n');
	socket.receive('>->i\nNum\tEnb\tWhat\tHit\tIf\n<-<i\n');
	assert.deepEqual(await list, ['Num\tEnb\tWhat\tHit\tIf']);

	const locals = channel.locals();
	assert.equal(socket.written[1], 'i local\n');
	socket.receive('>->i\n"loc": \n<-<i\n');
	assert.deepEqual(await locals, ['"loc": ']);
});

test('前一个请求失败后，队列继续处理下一个', async () => {
	const { socket, channel } = makeChannel({ timeoutMs: 20 });
	const failing = channel.raw('bt');
	const next = channel.raw('p x');

	await assert.rejects(failing, /did not answer/);

	// 队列没有卡死，第二条照常发出
	socket.receive('>->p\n1\n<-<p\n');
	assert.deepEqual(await next, ['1']);
});
