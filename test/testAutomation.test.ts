/**
 * testAutomation：注入类命令的应答解析与命令构造。
 *
 * 所有应答形状都取自 2026-11-26 对官方 2026-11-19 构建的实测输出，
 * 不是从文档猜的 —— 文档列了命令，但没写应答体长什么样。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buttonCommand,
	durationArgument,
	injectionDuration,
	keyList,
	parseButtonState,
	parseButtonInjection,
	parseInputSnapshot,
	parseKeyInjection,
	parseMouseInjection,
	parseShot,
	parseVmTargets
} from '../src/debug/testAutomation';

// ---------------------------------------------------------------------------
// btn
// ---------------------------------------------------------------------------

test('parseButtonInjection 解析注入确认', () => {
	// 实测：btn LEFT 30
	const reply = parseButtonInjection(['btn inj=0x20 [LEFT ] left=30']);
	assert.ok(reply);
	assert.equal(reply.left, 30);
});

test('parseButtonInjection 解析停止注入', () => {
	// 实测：btn 0
	const reply = parseButtonInjection(['btn inject off']);
	assert.ok(reply);
	assert.equal(reply.left, 0);
});

test('parseButtonInjection 对无法识别的应答返回 null', () => {
	assert.equal(parseButtonInjection(['btn need keys']), null);
	assert.equal(parseButtonInjection(['btn: unknown key name']), null);
});

test('parseButtonState 解析查询应答', () => {
	// 实测：btn（无参数）
	const state = parseButtonState(['KDown=0x00 KHeld=0x00 [-] inj=0x20 left=30']);
	assert.ok(state);
	assert.equal(state.down, 0x00);
	assert.equal(state.held, 0x00);
	assert.equal(state.injected, 0x20);
	assert.equal(state.left, 30);
});

test('parseButtonState 处理多个键位与持续注入', () => {
	const state = parseButtonState(['KDown=0x21 KHeld=0x21 [LEFT  A] inj=0x03 left=-1']);
	assert.ok(state);
	assert.equal(state.down, 0x21);
	assert.equal(state.injected, 0x03);
	assert.equal(state.left, -1, '持续注入用 -1');
});

// ---------------------------------------------------------------------------
// mouse / key
// ---------------------------------------------------------------------------

test('parseMouseInjection 解析位置与按键位', () => {
	// 实测：mouse 240 120 1 15
	const reply = parseMouseInjection(['mouse inj=240,120 btn=0x01 left=15']);
	assert.ok(reply);
	assert.equal(reply.x, 240);
	assert.equal(reply.y, 120);
	assert.equal(reply.buttons, 0x01);
	assert.equal(reply.left, 15);
});

test('parseMouseInjection 解析停止', () => {
	const reply = parseMouseInjection(['mouse inject off']);
	assert.ok(reply);
	assert.equal(reply.left, 0);
});

test('parseKeyInjection 解析按键名与剩余帧', () => {
	// 实测：key a 500ms -> left=15（500ms 按 30fps 换算）
	const reply = parseKeyInjection(["key inj='a' left=15"]);
	assert.ok(reply);
	assert.equal(reply.key, 'a');
	assert.equal(reply.left, 15);
});

test('parseKeyInjection 解析停止', () => {
	const reply = parseKeyInjection(['key inject off']);
	assert.ok(reply);
	assert.equal(reply.key, '');
});

// ---------------------------------------------------------------------------
// shot
// ---------------------------------------------------------------------------

test('parseShot 解析尺寸、bpp、md5 与帧号', () => {
	// 实测：shot /tmp/clx-shot-test.bmp
	const shot = parseShot(['shot: /tmp/clx-shot-test.bmp 240x240 bpp=16 md5=c04af8d842672cd39a8171efa9f6b3d1 frame=11']);
	assert.ok(shot);
	assert.equal(shot.path, '/tmp/clx-shot-test.bmp');
	assert.equal(shot.width, 240);
	assert.equal(shot.height, 240);
	assert.equal(shot.bpp, 16);
	assert.equal(shot.md5, 'c04af8d842672cd39a8171efa9f6b3d1');
	assert.equal(shot.frame, 11);
});

test('parseShot 允许路径里带空格', () => {
	const shot = parseShot(['shot: /tmp/a b/c.bmp 16x16 bpp=4 md5=00112233445566778899aabbccddeeff frame=1']);
	assert.ok(shot);
	assert.equal(shot.path, '/tmp/a b/c.bmp');
});

test('parseShot 把 md5 统一成小写', () => {
	const shot = parseShot(['shot: /x.bmp 8x8 bpp=4 md5=00112233445566778899AABBCCDDEEFF frame=2']);
	assert.ok(shot);
	assert.equal(shot.md5, '00112233445566778899aabbccddeeff');
});

test('parseShot 对错误应答返回 null', () => {
	assert.equal(parseShot(['shot: no vm display']), null);
	assert.equal(parseShot(['shot: write fail(bad bpp or path)']), null);
});

// ---------------------------------------------------------------------------
// vmlist / input?
// ---------------------------------------------------------------------------

test('parseVmTargets 标出目标 VM', () => {
	// 实测：vmlist
	const vms = parseVmTargets([
		'idx\tcart\tframe\ttarget',
		'0\t?\t10\t*',
		'(no target yet: first running vm claims)'
	]);
	assert.equal(vms.length, 1);
	assert.equal(vms[0].index, 0);
	assert.equal(vms[0].frame, 10);
	assert.equal(vms[0].isTarget, true);
});

test('parseInputSnapshot 解析整体快照', () => {
	// 实测：input? 的六行应答
	const snap = parseInputSnapshot([
		'frame=0 fps=30 cart=?',
		'KDown=0x00 KHeld=0x00 [-] inj=0x00 left=0',
		'mouse=0,0 btn=0x00 hotid=0',
		"kb=0 key='' inj(mouse)=0,0,0x00 left=0 inj(key)='' left=0",
		'pad0: conn=0 down=0x0 lx=0 ly=0 rx=0 ry=0 inj=0x0',
		'pad1: conn=1 down=0x10 lx=0 ly=0 rx=0 ry=0 inj=0x20'
	]);
	assert.equal(snap.frame, 0);
	assert.equal(snap.fps, 30);
	assert.equal(snap.cart, '?');
	assert.ok(snap.buttons);
	assert.equal(snap.buttons.injected, 0);
	assert.ok(snap.mouse);
	assert.equal(snap.mouse.x, 0);
	assert.equal(snap.key, '');
	assert.equal(snap.pads.length, 2);
	assert.equal(snap.pads[1].connected, true);
	assert.equal(snap.pads[1].injected, 0x20);
});

test('parseInputSnapshot 对空输入不抛错', () => {
	const snap = parseInputSnapshot([]);
	assert.equal(snap.frame, 0);
	assert.equal(snap.pads.length, 0);
	assert.equal(snap.buttons, null);
});

// ---------------------------------------------------------------------------
// 命令构造
// ---------------------------------------------------------------------------

test('durationArgument 覆盖三种时长', () => {
	assert.equal(durationArgument({ kind: 'frames', frames: 30 }), '30');
	assert.equal(durationArgument({ kind: 'ms', ms: 500 }), '500ms');
	assert.equal(durationArgument({ kind: 'hold' }), '');
});

test('durationArgument 把 0 或负数夹到 1，不让命令变成无效', () => {
	assert.equal(durationArgument({ kind: 'frames', frames: 0 }), '1');
	assert.equal(durationArgument({ kind: 'frames', frames: -5 }), '1');
	assert.equal(durationArgument({ kind: 'ms', ms: 0 }), '1ms');
});

test('keyList 规整大小写并去重', () => {
	assert.equal(keyList(['left', 'a']), 'LEFT A');
	assert.equal(keyList(['LEFT', 'left', 'Left']), 'LEFT');
	assert.equal(keyList(['  b  ', '']), 'B');
});

test('keyList 不做白名单校验（官方会加新键位）', () => {
	// 不认识的键名交给模拟器拒绝，插件不预判
	assert.equal(keyList(['SOMENEWKEY']), 'SOMENEWKEY');
});

test('buttonCommand 组装三种形式', () => {
	assert.equal(buttonCommand([]), 'btn', '无参数是查询');
	assert.equal(buttonCommand(['LEFT']), 'btn LEFT', '不带时长 = 持续');
	assert.equal(buttonCommand(['LEFT', 'A'], { kind: 'frames', frames: 30 }), 'btn LEFT A 30');
	assert.equal(buttonCommand(['LEFT'], { kind: 'ms', ms: 500 }), 'btn LEFT 500ms');
});

test('injectionDuration 支持 btn 之外的前缀', () => {
	assert.equal(injectionDuration('padset 1', ['START'], { kind: 'frames', frames: 1 }), 'padset 1 START 1');
	assert.equal(injectionDuration('btn', ['LEFT'], { kind: 'hold' }), 'btn LEFT');
});
