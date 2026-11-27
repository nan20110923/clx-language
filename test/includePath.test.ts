/**
 * 路径补全的纯逻辑：指令识别、前缀过滤、插入文本。
 *
 * 规则来自模拟器源码 coloX_cart.c 的 _cart_dealwith_include —— 只有三条指令、
 * 必须带空格、路径与 cart 目录直接拼接。这些测试把那些规则固化成断言，
 * 免得将来"顺手支持一下 " 就悄悄偏离了模拟器的实际行为。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDirective, staysInside, suggest } from '../src/language/includePath';
import type { PathEntry } from '../src/language/includePath';

// ---------------------------------------------------------------------------
// 指令识别
// ---------------------------------------------------------------------------

test('parseDirective 认得三条指令', () => {
	assert.deepEqual(parseDirective('#include lib.lua'), { directive: '#include ', prefix: 'lib.lua' });
	assert.deepEqual(parseDirective('#blob art.png'), { directive: '#blob ', prefix: 'art.png' });
	assert.deepEqual(parseDirective('#png sheet.png'), { directive: '#png ', prefix: 'sheet.png' });
});

test('parseDirective 允许前置空白（缩进后的指令仍然有效）', () => {
	assert.deepEqual(parseDirective('  #include lib.lua'), { directive: '#include ', prefix: 'lib.lua' });
	assert.deepEqual(parseDirective('\t#blob x'), { directive: '#blob ', prefix: 'x' });
});

test('parseDirective 在路径为空时返回空前缀', () => {
	assert.deepEqual(parseDirective('#include '), { directive: '#include ', prefix: '' });
	assert.deepEqual(parseDirective('#include'), null, '没有空格就不是指令');
});

test('parseDirective 要求指令带尾随空格——与模拟器的 memcmp 一致', () => {
	// 模拟器是 memcmp(buf, "#include ", 9)，少了空格就不匹配
	assert.equal(parseDirective('#includelib.lua'), null);
	assert.equal(parseDirective('#include'), null);
	assert.equal(parseDirective('#include\tlib.lua'), null, 'tab 不是空格');
});

test('parseDirective 不把行中间的 #include 当指令', () => {
	// 模拟器在行首做 memcmp，代码里的字符串或注释不该触发
	assert.equal(parseDirective('local x = "#include foo"'), null);
	assert.equal(parseDirective('-- #include foo'), null);
});

test('parseDirective 认不出 Lua 的 require 或字符串路径', () => {
	assert.equal(parseDirective("load('assets/')"), null);
	assert.equal(parseDirective('require("cjson")'), null);
});

// ---------------------------------------------------------------------------
// 前缀过滤与插入文本
// ---------------------------------------------------------------------------

const ENTRIES: PathEntry[] = [
	{ name: 'images', isDirectory: true },
	{ name: 'sounds', isDirectory: true },
	{ name: 'lib.lua', isDirectory: false },
	{ name: 'main.clx', isDirectory: false },
	{ name: 'README.md', isDirectory: false }
];

test('suggest 空前缀列出全部，目录排在文件前', () => {
	const result = suggest('', ENTRIES);
	assert.deepEqual(
		result.map(r => r.label),
		// 目录在前；文件按 code unit 排，大写在小写之前（'R' < 'l' < 'm'）
		['images/', 'sounds/', 'README.md', 'lib.lua', 'main.clx']
	);
});

test('suggest 按前缀过滤（大小写敏感，保持磁盘上的真实名字）', () => {
	assert.deepEqual(suggest('lib', ENTRIES).map(r => r.label), ['lib.lua']);
	assert.deepEqual(suggest('ma', ENTRIES).map(r => r.label), ['main.clx']);
	// README 只能被大写 R 匹配，小写 r 不行 —— 补出磁盘上没有的大小写会让路径失配
	assert.deepEqual(suggest('R', ENTRIES).map(r => r.label), ['README.md']);
	assert.deepEqual(suggest('r', ENTRIES).map(r => r.label), []);
});

test('suggest 给目录加尾随斜杠', () => {
	const dir = suggest('images', ENTRIES)[0];
	assert.equal(dir.insertText, 'images/');
	assert.equal(dir.isDirectory, true);

	const file = suggest('lib', ENTRIES)[0];
	assert.equal(file.insertText, 'lib.lua');
	assert.equal(file.isDirectory, false);
});

test('suggest 保留前缀里的目录部分', () => {
	// 在 'assets/im' 上补全时应该给 'assets/images/'，不是 'images/'
	const result = suggest('assets/im', [{ name: 'images', isDirectory: true }]);
	assert.deepEqual(result.map(r => r.insertText), ['assets/images/']);
});

test('suggest 对子目录路径只过滤最后一段', () => {
	const entries: PathEntry[] = [
		{ name: 'a.lua', isDirectory: false },
		{ name: 'b.lua', isDirectory: false }
	];
	assert.deepEqual(suggest('sub/a', entries).map(r => r.insertText), ['sub/a.lua']);
});

test('suggest 没有匹配时返回空数组', () => {
	assert.deepEqual(suggest('zzz', ENTRIES), []);
});

test('suggest 在空候选列表上返回空数组', () => {
	assert.deepEqual(suggest('', []), []);
});

// ---------------------------------------------------------------------------
// 越界判断
// ---------------------------------------------------------------------------

test('staysInside 接受普通相对路径', () => {
	assert.equal(staysInside(''), true);
	assert.equal(staysInside('lib.lua'), true);
	assert.equal(staysInside('assets/'), true);
	assert.equal(staysInside('assets/images/'), true);
	// 点在目录名里不是 ..，不该被误判
	assert.equal(staysInside('a..b/x'), true);
	assert.equal(staysInside('./x'), true);
});

test('staysInside 拒绝走出 cart 目录的前缀', () => {
	// 模拟器本身不拦这个（直接拼接交给 fopen），但我们不去列上级目录
	assert.equal(staysInside('../'), false);
	assert.equal(staysInside('../lib/'), false);
	assert.equal(staysInside('a/../../'), false);
	// 先下去再上来，净深度仍在里面，允许
	assert.equal(staysInside('a/../b/'), true);
});
