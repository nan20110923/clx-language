/**
 * 护栏：CLX 存根必须覆盖官方 API，并且中英两侧一致。
 *
 * 为什么需要这条：`res/clx-std` 是用户唯一能看到「pset 的参数是什么」「stat(90..96)
 * 是本地时间」的地方，它和官方文档脱节时不会有任何东西失败 —— 补全只是静静地少一个
 * 函数，用户以为 CLX 没有它。1.3.0 之前那批 2018 年的 Lua 5.1 存根就是这样烂掉的。
 *
 * 这里不解析官方文档（它在 ~/.cache/clx-dev 里，CI 上没有），而是把**已核对过的
 * 函数名**固化成一个清单。新增 API 时把名字加进 OFFICIAL_API，再在存根里声明它；
 * 忘记任一步都会在这里失败。
 *
 * 中英两侧的集合必须相等：它们是同一套 API 的两份注释，缺一边等于某部分用户看不到。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = process.env.CLX_REPO_ROOT;
if (!repoRoot) {
	throw new Error('CLX_REPO_ROOT must be set; run tests via `yarn test`.');
}

const STD_DIR = path.join(repoRoot, 'res', 'clx-std');
const LUA_DIR = path.join(repoRoot, 'res', 'clx-lua');

/**
 * 官方文档里出现过、用户会直接调用的 API。
 *
 * 来源：cololight 的 colox-docs 文档包（platform version 14，2026-10-20 打包），
 * 取其 getting_started / graphics / text / map / input / pad / audio / math / tables /
 * memory / system / img / anim / cjson / rlottie 各篇的 API 索引。
 *
 * 只收录「卡带代码里会写的名字」：可选模块（vg / net / b2d）的大量成员、
 * 预处理指令与段落标记都不在这里 —— 那些是 memset 式的东西，加进来只会
 * 变成堆砌。
 */
const OFFICIAL_API = [
	// graphics
	'cls', 'camera', 'clip', 'flip', 'color', 'palrgb', 'getcolor', 'pal', 'palt', 'fillp',
	'pset', 'pget', 'sget', 'sset',
	'line', 'lines', 'wline', 'bezier', 'rect', 'rectfill', 'rectcls',
	'circ', 'circfill', 'oval', 'ovalfill', 'arc', 'polygonfill', 'trifill',
	'spr', 'sspr', 'rotspr', 'tspr', 'fget', 'fset', 'blit', 'qrcode',
	// text
	'print', 'drawTxt_h', 'cursor', 'font_add', 'font_close', 'font_shrink', 'gb2312_to_utf8',
	// map
	'mget', 'mset', 'map', 'tline',
	// input
	'btn', 'btnp', 'btnpcfg', 'inputcfg', 'touch', 'touchdef',
	// pad (usemod)
	'pad_state', 'pad_btn', 'pad_stick', 'pad_conn', 'pad_assys',
	'pad_scan', 'pad_scanstop', 'pad_scanstate', 'pad_found', 'pad_connect',
	'pad_disconnect', 'pad_bonds', 'pad_info', 'pad_unpair', 'pad_forget',
	'pad_status', 'pad_lasterr', 'pad_auto',
	// audio
	'sfx', 'music', 'wave', 'micpoll',
	// math
	'max', 'min', 'mid', 'ceil', 'flr', 'sqrt', 'abs', 'sgn',
	'sin', 'cos', 'atan2',
	'band', 'bor', 'bxor', 'bnot', 'shl', 'shr', 'lshr', 'rotl', 'rotr',
	'rnd', 'srand',
	// tables
	'add', 'del', 'deli', 'count', 'all', 'foreach',
	// memory
	'peek', 'peek2', 'peek4', 'poke', 'poke2', 'poke4', 'memcpy', 'memset', 'reload',
	// system
	'stat', 'statctl', 'time', 't', 'utcsec', 'utcdate',
	'load', 'run', 'reset',
	'cartdata', 'dget', 'dset', 'dflush',
	'svcget', 'svcadd', 'svcset', 'svcreq', 'svcmon',
	'toidle', 'tofg',
	'compress', 'decompress', 'md5sum', 'md5sumhexa', 'sha1sum', 'sha1sumhexa',
	'printh', 'usemod',
	// img
	'img_load', 'img_loadscr', 'img_loadwebp', 'img_gif_load', 'img_gif_file', 'img_gif_next',
	'img_webpani_load', 'img_webpani_next', 'img_webpani_reset', 'img_gif_palrefresh',
	'img_airinfo', 'img_loadair', 'img_scrair',
	'img_set_flag', 'img_info', 'img_close',
	'img_draw', 'img_drawex', 'img_drawrot', 'img_drawzoom', 'img_drawgif',
	// anim
	'anim_effect', 'anim_calc',
	// rlottie (usemod)
	'rlottie_load', 'rlottie_close', 'rlottie_info', 'rlottie_draw', 'rlottie_prop', 'rlottie_mark',
	// lifecycle
	'_init', '_update', '_draw', '_idle_update', '_idle_draw',
	'_cfg_update', '_cfg_draw', '_initsvc', '_updatesvc', '_svcind', '_setstat',
	// clx-lua layer
	'tostr', 'tonum', 'chr', 'ord', 'split', 'loads',
	'b64encode', 'b64decode'
];

/** 收集目录下所有 Lua 文件里的顶层函数/常量声明。 */
function declared(dir: string): Set<string> {
	const names = new Set<string>();
	for (const entry of fs.readdirSync(dir)) {
		if (!entry.endsWith('.lua')) {
			continue;
		}
		const source = fs.readFileSync(path.join(dir, entry), 'utf8');
		for (const match of source.matchAll(/^\s*function\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gm)) {
			names.add(match[1]);
		}
		// 常量与表：AnimLinear = 1 / PAD = {} / cjson.null
		for (const match of source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
			names.add(match[1]);
		}
	}
	return names;
}

const stdEn = declared(path.join(STD_DIR, 'en'));
const stdZh = declared(path.join(STD_DIR, 'zh'));
const luaEn = declared(path.join(LUA_DIR, 'en'));
const luaZh = declared(path.join(LUA_DIR, 'zh'));

test('官方 API 全部在英文存根里有声明', () => {
	const missing = OFFICIAL_API.filter(name => !stdEn.has(name) && !luaEn.has(name));
	assert.deepEqual(missing, [], `res/clx-std/en 或 res/clx-lua/en 缺少: ${missing.join(', ')}`);
});

test('官方 API 全部在中文存根里有声明', () => {
	const missing = OFFICIAL_API.filter(name => !stdZh.has(name) && !luaZh.has(name));
	assert.deepEqual(missing, [], `res/clx-std/zh 或 res/clx-lua/zh 缺少: ${missing.join(', ')}`);
});

test('中英两侧的函数集合完全一致', () => {
	const onlyEn = [...stdEn].filter(name => !stdZh.has(name)).sort();
	const onlyZh = [...stdZh].filter(name => !stdEn.has(name)).sort();
	assert.deepEqual(onlyEn, [], `只在英文侧存在: ${onlyEn.join(', ')}`);
	assert.deepEqual(onlyZh, [], `只在中文侧存在: ${onlyZh.join(', ')}`);
});

test('clx-lua 两侧的函数集合完全一致', () => {
	const onlyEn = [...luaEn].filter(name => !luaZh.has(name)).sort();
	const onlyZh = [...luaZh].filter(name => !luaEn.has(name)).sort();
	assert.deepEqual(onlyEn, [], `只在英文侧存在: ${onlyEn.join(', ')}`);
	assert.deepEqual(onlyZh, [], `只在中文侧存在: ${onlyZh.join(', ')}`);
});

test('每个存根文件都以 ---@meta 开头', () => {
	// LuaLS 只有在看到 ---@meta 时才把文件当库定义，否则按普通源码处理，
	// 补全和悬停都不会出现。
	for (const dir of [STD_DIR, LUA_DIR]) {
		for (const lang of ['en', 'zh']) {
			const full = path.join(dir, lang);
			for (const entry of fs.readdirSync(full)) {
				if (!entry.endsWith('.lua')) {
					continue;
				}
				const first = fs.readFileSync(path.join(full, entry), 'utf8').trimStart().split('\n')[0];
				assert.equal(first.trim(), '---@meta', `${dir}/${lang}/${entry} 缺少 ---@meta`);
			}
		}
	}
});
