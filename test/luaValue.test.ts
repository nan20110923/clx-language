/**
 * luaValue：把用户输入转成 Lua 字面量。
 *
 * 这个判断有真实的取舍 —— 判错一次就会静默把变量变成 nil，界面上看不出错，
 * 只有用户发现值"莫名其妙没了"。值得单独覆盖。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { joinLuaPath, toLuaLiteral } from '../src/debug/luaValue';

test('数字原样保留', () => {
	assert.equal(toLuaLiteral('42'), '42');
	assert.equal(toLuaLiteral('-2.5'), '-2.5');
	assert.equal(toLuaLiteral('1e10'), '1e10');
	assert.equal(toLuaLiteral('.5'), '.5');
});

test('布尔与 nil 原样保留', () => {
	assert.equal(toLuaLiteral('true'), 'true');
	assert.equal(toLuaLiteral('false'), 'false');
	assert.equal(toLuaLiteral('nil'), 'nil');
});

test('已带引号的字符串原样保留（尊重用户自己写的引号）', () => {
	assert.equal(toLuaLiteral('"hello"'), '"hello"');
	assert.equal(toLuaLiteral("'hello'"), "'hello'");
});

test('裸文本被当成字符串加引号', () => {
	// 这一条是关键：不这样做，set x=hello 会让 x 变成 nil
	assert.equal(toLuaLiteral('hello'), '"hello"');
	assert.equal(toLuaLiteral('frame 12'), '"frame 12"');
	assert.equal(toLuaLiteral('with space'), '"with space"');
});

test('裸文本里的特殊字符被转义', () => {
	assert.equal(toLuaLiteral('say "hi"'), '"say \\"hi\\""');
	assert.equal(toLuaLiteral('line1\nline2'), '"line1\\nline2"');
});

test('表构造透传给 Lua 求值', () => {
	assert.equal(toLuaLiteral('{a=1}'), '{a=1}');
	assert.equal(toLuaLiteral('{ hp = 100, name = "bob" }'), '{ hp = 100, name = "bob" }');
});

test('函数调用透传给 Lua 求值', () => {
	assert.equal(toLuaLiteral('math.floor(1.5)'), 'math.floor(1.5)');
});

test('空白被裁掉后再判断', () => {
	assert.equal(toLuaLiteral('  42  '), '42');
	assert.equal(toLuaLiteral('  hello  '), '"hello"');
});

test('空值变成空字符串而不是 nil', () => {
	assert.equal(toLuaLiteral(''), '""');
	assert.equal(toLuaLiteral('   '), '""');
});

test('joinLuaPath 拼出表访问路径', () => {
	assert.equal(joinLuaPath('', 'hp'), 'hp');
	assert.equal(joinLuaPath('player', 'hp'), 'player.hp');
	assert.equal(joinLuaPath('player.stats', 'hp'), 'player.stats.hp');
});
