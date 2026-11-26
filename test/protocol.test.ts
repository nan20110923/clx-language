/**
 * 用 node:test（Node 22 内置，零依赖）覆盖三个纯逻辑 module：
 *   - luaProtocol：应答体解析
 *   - lineMapping：行号校准
 *   - debugChannel：framing 状态机与请求关联
 *
 * 这些用例能在普通 Node 里跑，正是把协议从 DAP 适配器里取出来的理由 ——
 * 以前这些格式知识只能在 VS Code 里靠按 F5 观察。
 *
 * 运行：yarn test（= node --test）
 * 注意：不是 tsc --noEmit，类型检查是单独的一步。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	parseBreakpointReply,
	parseBreakpointList,
	parseLocals,
	parseShotReply,
	parseSourceListing,
	parseSourceList,
	parseStackFrames,
	parseStopFrame,
	parseVariableTree,
	parseVmList
} from '../src/debug/luaProtocol';

import {
	buildLineMapping,
	findIncludes,
	luaBodyLineCount,
	LineMappingError
} from '../src/debug/lineMapping';

// ---------------------------------------------------------------------------
// luaProtocol：停止事件
// ---------------------------------------------------------------------------

test('parseStopFrame 解析 func/source/line 与停点源码', () => {
	const stop = parseStopFrame(['_update at __lua__:12', '0012>    counter = counter + 1']);
	assert.ok(stop);
	assert.equal(stop.func, '_update');
	assert.equal(stop.source, '__lua__');
	assert.equal(stop.line, 12);
	assert.equal(stop.code, '    counter = counter + 1');
});

test('parseStopFrame 兼容函数名里含 " at " 的情况', () => {
	// 从右边找 `:` + 数字，再取最后一个 " at "，不会被函数名里的 at 骗到
	const stop = parseStopFrame(['sat at bat at __lua__:7']);
	assert.ok(stop);
	assert.equal(stop.func, 'sat at bat');
	assert.equal(stop.line, 7);
});

test('parseStopFrame 没有源码行时仍然解析', () => {
	const stop = parseStopFrame(['main at __lua__:3']);
	assert.ok(stop);
	assert.equal(stop.code, undefined);
});

test('parseStopFrame 对无法识别的输入返回 null', () => {
	assert.equal(parseStopFrame(['garbage']), null);
	assert.equal(parseStopFrame([]), null);
});

// ---------------------------------------------------------------------------
// luaProtocol：调用栈
// ---------------------------------------------------------------------------

test('parseStackFrames 解析多帧并保留深度顺序', () => {
	const frames = parseStackFrames([
		'0 in _update at __lua__:5',
		'1 in main at __lua__:20',
		'2 in ? at GLF:1'
	]);
	assert.equal(frames.length, 3);
	assert.deepEqual(frames[0], { level: 0, func: '_update', source: '__lua__', line: 5 });
	assert.deepEqual(frames[2], { level: 2, func: '?', source: 'GLF', line: 1 });
});

test('parseStackFrames 忽略不成形的行', () => {
	assert.deepEqual(parseStackFrames(['not a frame', '']), []);
});

// ---------------------------------------------------------------------------
// luaProtocol：断点
// ---------------------------------------------------------------------------

test('parseBreakpointReply 解析成功应答', () => {
	const reply = parseBreakpointReply([
		'Breakpoint 3 at file __lua__ , line 9, if ',
		'code:  local x = 1'
	]);
	assert.equal(reply.verified, true);
	assert.equal(reply.no, 3);
	// 'code: ' 前缀（6 字符）被剥掉，其余原样保留
	assert.equal(reply.code, ' local x = 1');
});

test('parseBreakpointReply 把空白行拒绝映射成 unverified 并保留原文', () => {
	const reply = parseBreakpointReply(['there is no code at __lua__:4']);
	assert.equal(reply.verified, false);
	assert.match(reply.message ?? '', /there is no code/);
});

test('parseBreakpointReply 对空应答体给出兜底说明', () => {
	const reply = parseBreakpointReply([]);
	assert.equal(reply.verified, false);
	assert.ok((reply.message ?? '').length > 0);
});

test('parseBreakpointReply 解析带条件的成功应答', () => {
	const reply = parseBreakpointReply(['Breakpoint 1 at file __lua__ , line 6, if [a] a > 3']);
	assert.equal(reply.verified, true);
	assert.equal(reply.no, 1);
});

test('parseBreakpointList 跳过表头并按最后一个冒号切 file:line', () => {
	const list = parseBreakpointList([
		'Num\tEnb\tWhat\tHit\tIf',
		'1\ty\t__lua__:9\t2\t',
		'2\tn\t__lua__:12\t0\ta > 1'
	]);
	assert.equal(list.length, 2);
	assert.deepEqual(list[0], { no: 1, enabled: true, file: '__lua__', line: 9, hits: 2, condition: '' });
	assert.equal(list[1].enabled, false);
	assert.equal(list[1].condition, 'a > 1');
});

// ---------------------------------------------------------------------------
// luaProtocol：局部变量（i local 的 pprint 文本）
// ---------------------------------------------------------------------------

test('parseLocals 按名字取 loc 与 up（pairs 顺序不稳定）', () => {
	const { locals, upvalues } = parseLocals([
		'"up": ',
		'  "x": 1',
		'"loc": ',
		'  "counter": 42'
	]);
	assert.equal(locals.length, 1);
	assert.equal(locals[0].name, 'counter');
	assert.equal(locals[0].value, '42');
	assert.equal(locals[0].type, 'number');
	assert.equal(upvalues.length, 1);
	assert.equal(upvalues[0].name, 'x');
});

test('parseLocals 还原嵌套表', () => {
	const { locals } = parseLocals([
		'"loc": ',
		'  "player": ',
		'    "hp": 100',
		'    "name": \'"bob"\''
	]);
	assert.equal(locals.length, 1);
	const player = locals[0];
	assert.equal(player.type, 'table');
	assert.equal(player.children.length, 2);
	const hp = player.children.find(c => c.name === 'hp');
	const name = player.children.find(c => c.name === 'name');
	assert.equal(hp?.value, '100');
	assert.equal(hp?.type, 'number');
	// 字符串值被包了两层引号，必须剥掉两层
	assert.equal(name?.value, 'bob');
	assert.equal(name?.type, 'string');
});

test('parseLocals 保留递归标记而不是静默丢弃', () => {
	const tree = parseVariableTree([
		'"loc": ',
		'  "self": ',
		'    *Recursion at /self*'
	]);
	const self = tree[0].children[0];
	assert.equal(self.children.length, 1);
	assert.equal(self.children[0].name, '*recursion*');
});

test('parseLocals 对畸形输入返回空而不抛', () => {
	const { locals, upvalues } = parseLocals(['totally not pprint']);
	assert.deepEqual(locals, []);
	assert.deepEqual(upvalues, []);
});

test('parseLocals 识别布尔与负数', () => {
	const { locals } = parseLocals([
		'"loc": ',
		'  "flag": true',
		'  "delta": -2.5'
	]);
	assert.equal(locals[0].type, 'boolean');
	assert.equal(locals[1].type, 'number');
	assert.equal(locals[1].value, '-2.5');
});

// ---------------------------------------------------------------------------
// luaProtocol：源码清单与多 VM
// ---------------------------------------------------------------------------

test('parseSourceListing 把首行的数字读成行数而不是起始行号', () => {
	const listing = parseSourceListing(['__lua__:3', 'local a = 1', 'local b = 2', 'return a + b']);
	assert.ok(listing);
	assert.equal(listing.name, '__lua__');
	assert.equal(listing.lineCount, 3);
	assert.equal(listing.source.length, 3);
});

test('parseSourceListing 以正文行数为准（头部数字比正文少 1）', () => {
	// 实测：模拟器报 __lua__:17，正文却是 18 行 —— 文件末尾的空行不计入 count。
	// 用真实形状钉住这个事实，避免以后有人"修正"成校验 declared === source.length。
	const body = [
		'',
		'local counter = 0',
		'local message = "hello"',
		'',
		'function _init()',
		'end',
		'',
		'function _update()',
		'end',
		'',
		'function _draw()',
		'end',
		''
	];
	const listing = parseSourceListing(['__lua__:12', ...body]);
	assert.ok(listing);
	// 正文 13 行，头部说 12
	assert.equal(listing.source.length, 13);
	assert.equal(listing.lineCount, 13, '正文是权威，头部数字不作行数');
	// 首行是一个空行（__lua__ 标记后的那一行被包含进正文）
	assert.equal(listing.source[0], '');
	assert.equal(listing.source[1], 'local counter = 0');
});

test('parseSourceListing 对未知文件（行数 0）返回空正文', () => {
	const listing = parseSourceListing(['nope:0']);
	assert.ok(listing);
	assert.equal(listing.lineCount, 0);
	assert.deepEqual(listing.source, []);
});

test('parseSourceList 跳过表头', () => {
	const list = parseSourceList(['File\tLines', '__lua__\t10', 'GLF\t5']);
	assert.deepEqual(list, [
		{ name: '__lua__', lineCount: 10 },
		{ name: 'GLF', lineCount: 5 }
	]);
});

test('parseVmList 标出目标 VM 并忽略说明文字', () => {
	const vms = parseVmList([
		'idx\tcart\tframe\ttarget',
		'0\tplay_menu.clx\t1234\t',
		'1\tmygame.clx\t567\t*',
		'(no target yet: first running vm claims)'
	]);
	assert.equal(vms.length, 2);
	assert.equal(vms[1].target, true);
	assert.equal(vms[0].target, false);
});

// ---------------------------------------------------------------------------
// luaProtocol：截图
// ---------------------------------------------------------------------------

test('parseShotReply 解析尺寸、bpp、md5 与帧号', () => {
	const shot = parseShotReply(['shot: /tmp/a.bmp 480x480 bpp=4 md5=5f2aAB01c90100112233445566778899 frame=1234']);
	assert.ok(shot);
	assert.equal(shot.path, '/tmp/a.bmp');
	assert.equal(shot.width, 480);
	assert.equal(shot.height, 480);
	assert.equal(shot.bpp, 4);
	assert.equal(shot.md5, shot.md5.toLowerCase());
	assert.equal(shot.frame, 1234);
});

test('parseShotReply 允许路径里带空格', () => {
	const shot = parseShotReply(['shot: /tmp/a b/c.bmp 16x16 bpp=4 md5=00112233445566778899aabbccddeeff frame=1']);
	assert.ok(shot);
	assert.equal(shot.path, '/tmp/a b/c.bmp');
});

test('parseShotReply 对错误应答返回 null', () => {
	assert.equal(parseShotReply(['shot: no vm display']), null);
});

// ---------------------------------------------------------------------------
// lineMapping
// ---------------------------------------------------------------------------

const SPEC = 'coloX-16';
const LUA_HEADER = '__lua__';

test('没有 include 时映射是单一区段，行号带正确偏移', () => {
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1', 'local b = 2'];
	// 模拟器只拿到 __lua__ 段的内容，行号从 1 开始
	const emulator = ['local a = 1', 'local b = 2'];
	const map = buildLineMapping(fileLines, emulator);

	assert.equal(map.segments.length, 1);
	assert.equal(map.segments[0].fileStart, 3);
	assert.equal(map.segments[0].emulatorStart, 1);
	// .clx 第 3 行 ↔ 模拟器第 1 行
	assert.equal(map.toEmulator(3), 1);
	assert.equal(map.toEmulator(4), 2);
	assert.equal(map.toFile(1), 3);
	assert.equal(map.toFile(2), 4);
});

test('设备规格行与区段标记不可设断点', () => {
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1'];
	const map = buildLineMapping(fileLines, ['local a = 1']);
	assert.equal(map.isExecutable(1), false, '规格行');
	assert.equal(map.isExecutable(2), false, '区段标记');
	assert.equal(map.isExecutable(3), true, 'Lua 正文');
});

test('真实结构的卡带：头部行、元数据、__lua__ 标记、空行，映射正确', () => {
	// 全部数据取自 2026-11-26 对官方 2026-11-19 构建的实测结果：
	//   文件 24 行，__lua__ 在第 6 行，标记后有一个空行
	//   模拟器报 __lua__:17，正文 18 行，首行是那个空行
	//   文件第 16 行 'counter = counter + 1' ↔ 模拟器正文第 10 行
	const fileLines = [
		'coloX-16',          // 1
		'version 1',         // 2
		'style:game',        // 3
		'name:main',         // 4
		'',                  // 5
		'__lua__',           // 6
		'',                  // 7
		'local counter = 0', // 8
		'local message = "hello"', // 9
		'',                  // 10
		'function _init()',  // 11
		"    statctl('dfps', 1)", // 12
		'end',               // 13
		'',                  // 14
		'function _update()',// 15
		'    counter = counter + 1', // 16
		'    message = "frame " .. counter', // 17
		'end',               // 18
		'',                  // 19
		'function _draw()',  // 20
		'    cls()',         // 21
		'    print(message, 10, 10)', // 22
		'end',               // 23
		''                   // 24
	];
	const emulator = [
		'',                              // 1  ← __lua__ 标记后的空行
		'local counter = 0',             // 2
		'local message = "hello"',       // 3
		'',                              // 4
		'function _init()',              // 5
		"    statctl('dfps', 1)",        // 6
		'end',                           // 7
		'',                              // 8
		'function _update()',            // 9
		'    counter = counter + 1',     // 10
		'    message = "frame " .. counter', // 11
		'end',                           // 12
		'',                              // 13
		'function _draw()',              // 14
		'    cls()',                     // 15
		'    print(message, 10, 10)',    // 16
		'end',                           // 17
		''                               // 18
	];
	const map = buildLineMapping(fileLines, emulator);

	assert.equal(map.toEmulator(8), 2, 'local counter 在文件第 8 行');
	assert.equal(map.toEmulator(16), 10, '断点要落的行');
	assert.equal(map.toFile(10), 16);
	// 内容逐字相同是这条映射成立的根据
	assert.equal(fileLines[15], emulator[9]);
	// 元数据行与区段标记不可设断点
	assert.equal(map.isExecutable(1), false);
	assert.equal(map.isExecutable(6), false, '__lua__ 标记本身');
});

test('不在 Lua 区段内的行在 toEmulator 时抛错', () => {
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1'];
	const map = buildLineMapping(fileLines, ['local a = 1']);
	assert.throws(() => map.toEmulator(1), LineMappingError);
});

test('include 前后都能映射（多段重新锚定）', () => {
	// .clx: 规格 / __lua__ / local a / #include lib.lua / local c
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1', '#include lib.lua', 'local c = 3'];
	// 模拟器里 lib.lua 展开成了两行
	const emulator = ['local a = 1', 'lib_one()', 'lib_two()', 'local c = 3'];
	const map = buildLineMapping(fileLines, emulator);

	// include 之前
	assert.equal(map.toEmulator(3), 1);
	// include 之后：.clx 第 5 行对应模拟器第 4 行
	assert.equal(map.toEmulator(5), 4);
	assert.equal(map.toFile(4), 5);
});

test('#include 行数交叉校验不一致时失败而不是静默错位', () => {
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1', '#include lib.lua', 'local c = 3'];
	const emulator = ['local a = 1', 'only_one_line()', 'local c = 3'];
	// 声称 lib.lua 有 5 行，但模拟器只多出 1 行 → 拼接口径变了
	assert.throws(() => buildLineMapping(fileLines, emulator, [5]), LineMappingError);
});

test('#include 行数交叉校验通过时正常建立映射', () => {
	const fileLines = [SPEC, LUA_HEADER, 'local a = 1', '#include lib.lua', 'local c = 3'];
	const emulator = ['local a = 1', 'lib_one()', 'lib_two()', 'local c = 3'];
	// lib.lua 两行 + 正文两行 = 4
	assert.doesNotThrow(() => buildLineMapping(fileLines, emulator, [2]));
});

test('源码完全对不上时抛 LineMappingError', () => {
	assert.throws(
		() => buildLineMapping([SPEC, LUA_HEADER, 'local a = 1'], ['completely different']),
		LineMappingError
	);
});

test('模拟器没返回源码时抛 LineMappingError', () => {
	assert.throws(() => buildLineMapping([SPEC, LUA_HEADER], []), LineMappingError);
});

test('findIncludes 按出现顺序取出路径', () => {
	assert.deepEqual(
		findIncludes(['#include a.lua', 'x = 1', '#include  b.lua ', '#include c.lua']),
		['a.lua', 'b.lua', 'c.lua']
	);
});

test('luaBodyLineCount 只数 __lua__ 段内的正文，排除指令', () => {
	const lines = [
		SPEC,
		LUA_HEADER,
		'local a = 1',
		'#include lib.lua',
		'#blob art.png',
		'local c = 3',
		'__gfx__',
		'00112233'
	];
	assert.equal(luaBodyLineCount(lines), 2);
});
