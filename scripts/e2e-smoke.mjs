#!/usr/bin/env node
/**
 * 端到端冒烟测试：在隔离的 VS Code Extension Development Host 里跑一次真实调试。
 *
 * 为什么需要它：`test/` 只覆盖不 import vscode 的纯逻辑。DAP 适配器和真实模拟器的
 * 交互只能手工验证 —— 而这套手工验证在本次开发中被重写了四遍，每次都重新踩同样的坑：
 *
 *   1. settings.json 必须放在 <user-data-dir>/User/ 下，放到 <user-data-dir>/ 根
 *      不报错、也没人读，表现是"配置没生效"
 *   2. 模拟器必须已缓存，或把 debuggerCustomPath 指向本地副本，否则首次下载的
 *      确认框是模态的，headless 直接卡死
 *   3. .rom 的实际文件名是 <文件名>.clx.rom，不是 <文件名>.rom
 *   4. 卡带必须有 __lua__ 区段，否则模拟器静默回落到 BIOS 菜单，
 *      src __lua__ 返回的是菜单源码 —— 看起来像断点全错，其实是文件没加载
 *
 * 目的是把这四条固化下来，而不是每次重新发现。
 *
 * 不进 CI：需要图形界面和模拟器二进制（没有 Linux 版）。
 *
 * 用法：
 *   node scripts/e2e-smoke.mjs                 # 用默认测试卡带
 *   node scripts/e2e-smoke.mjs path/to/x.clx   # 用指定卡带（必须首行有设备规格）
 *
 * 环境变量：
 *   CLX_E2E_KEEP=1   跑完不删临时目录，便于看日志
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// 找 VS Code 与模拟器
// ---------------------------------------------------------------------------

function findVsCode() {
	const candidates = [
		process.env.CLX_E2E_CODE,
		'/Applications/Visual Studio Code.app/Contents/MacOS/Code',
		'/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code'
	].filter(Boolean);
	for (const c of candidates) {
		if (existsSync(c)) {
			return c;
		}
	}
	return undefined;
}

/** 模拟器：优先环境变量，其次扩展 globalStorage 里的缓存。 */
function findEmulator() {
	if (process.env.CLX_E2E_EMULATOR) {
		return process.env.CLX_E2E_EMULATOR;
	}
	const home = process.env.HOME ?? '';
	const roots = [
		join(home, 'Library/Application Support/Code/User/globalStorage/lifesmart.clx-language/emulators'),
		join(home, '.config/Code/User/globalStorage/lifesmart.clx-language/emulators')
	];
	for (const root of roots) {
		if (!existsSync(root)) {
			continue;
		}
		for (const dir of readdirSync(root)) {
			const exe = join(root, dir, 'Contents/MacOS/coloXtool');
			if (existsSync(exe)) {
				return exe;
			}
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// 默认测试卡带
// ---------------------------------------------------------------------------

const DEFAULT_CART = `coloX-16
version 1
style:game
name:e2e

__lua__

local frames = 0

function _init()
end

function _update()
    local nextFrames = frames + 1
    frames = nextFrames
end

function _draw()
    cls()
    print(tostring(frames), 10, 10)
end
`;

/** 断点目标：_update 里 `frames = nextFrames` 那一行（1-based）。 */
const DEFAULT_BREAKPOINT_LINE = 15;

// ---------------------------------------------------------------------------
// 测试宿主的脚本
// ---------------------------------------------------------------------------

const SUITE = (breakpointLine) => `
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { existsSync } = fs;

const OUT = process.env.CLX_E2E_RESULT;
const results = [];
const log = (name, ok, detail) => results.push({ name, ok, detail: String(detail ?? '') });
const sleep = ms => new Promise(r => setTimeout(r, ms));

exports.run = async function run() {
  const ws = vscode.workspace.workspaceFolders[0];
  const clxPath = path.join(ws.uri.fsPath, 'game.clx');
  try {
    const doc = await vscode.workspace.openTextDocument(clxPath);
    await vscode.window.showTextDocument(doc);

    let session;
    const sub = vscode.debug.onDidStartDebugSession(s => { session = s; });

    vscode.debug.addBreakpoints([
      new vscode.SourceBreakpoint(new vscode.Location(doc.uri, new vscode.Position(${breakpointLine} - 1, 4)))
    ]);

    const started = await vscode.debug.startDebugging(ws, {
      type: 'clx_debug', request: 'launch', name: 'CLX e2e', sourcePath: clxPath
    });
    log('startDebugging', started === true, started);
    for (let i = 0; i < 80 && !session; i++) await sleep(250);

    // 等真正的停帧。注意：程序在卡带顶层就已经在跑，那时 bt 也可能返回帧，
    // 所以必须等 activeStackItem 出现（= 收到了 StoppedEvent）再采信 stackTrace。
    let sawStop = false;
    for (let i = 0; i < 60 && !sawStop; i++) {
      if (vscode.debug.activeStackItem) { sawStop = true; break; }
      await sleep(250);
    }
    log('停帧到达', sawStop, sawStop ? 'activeStackItem set' : 'never stopped');

    let frames = [];
    for (let i = 0; i < 20; i++) {
      try {
        const th = await session.customRequest('threads');
        const st = await session.customRequest('stackTrace', { threadId: th.threads[0].id });
        if (st.stackFrames.length) { frames = st.stackFrames; break; }
      } catch {}
      await sleep(250);
    }
    log('调用栈可用', frames.length > 0, frames.map(f => f.name + '@' + (f.source && path.basename(f.source.path)) + ':' + f.line).join(' | '));
    log('断点落在原文件的正确行', frames.length > 0 && frames[0].line === ${breakpointLine},
        frames.length ? 'line ' + frames[0].line + ' (expected ${breakpointLine})' : 'no frames');

    // Watch：走 p，不依赖 i local
    const watch = async expr => {
      try {
        const r = await session.customRequest('evaluate', { expression: expr, context: 'watch', frameId: 0 });
        return r && r.result;
      } catch (e) { return 'ERR ' + e; }
    };
    const framesValue = await watch('frames');
    log('Watch 能取到变量', /^\\d+$/.test(String(framesValue).trim()), 'frames => ' + JSON.stringify(framesValue));

    // Globals：走 p _G
    let globalsOk = false;
    try {
      const sc = await session.customRequest('scopes', { frameId: 0 });
      const g = sc.scopes.find(s => s.name === 'Globals');
      const v = await session.customRequest('variables', { variablesReference: g.variablesReference });
      globalsOk = v.variables.length > 0;
      log('Globals 有内容', globalsOk, v.variables.length + ' vars');
    } catch (e) { log('Globals 有内容', false, String(e)); }

    // 测试自动化：! 前缀 + 截图
    const automate = async cmd => {
      try {
        const r = await session.customRequest('clx.testAutomation', { command: cmd });
        return r && r.output;
      } catch (e) { return 'ERR ' + e; }
    };
    const inputState = await automate('input?');
    log('input? 有应答', typeof inputState === 'string' && inputState.includes('frame='),
        String(inputState).split('\\n')[0]);

    const shot = await automate('shot');
    log('截图成功并给出像素 md5', typeof shot === 'string' && /pixel md5: [0-9a-f]{32}/.test(shot),
        (String(shot).match(/pixel md5: [0-9a-f]{32}/) || ['none'])[0]);

    const bmps = fs.readdirSync(ws.uri.fsPath).filter(f => f.endsWith('.bmp'));
    log('工作区里没有 BMP', bmps.length === 0, bmps.length ? bmps.join(', ') : 'clean');

    log('没有生成 debug_temp.clx', !fs.existsSync(path.join(ws.uri.fsPath, 'debug_temp.clx')), 'checked');

    // 卡带真的加载了（.rom 的名字是 <文件名>.clx.rom）
    const rom = path.join(ws.uri.fsPath, 'game.clx.rom');
    log('模拟器加载了卡带', existsSync(rom), existsSync(rom) ? fs.statSync(rom).size + ' bytes' : 'missing ' + rom);

    if (session) await vscode.debug.stopDebugging(session);
    sub.dispose();

    // ---- 运行路径（非调试）：这是 reportRom 唯一生效的地方 ----
    // 先删掉上一次的 ROM，否则"已存在"会让检查变成空操作。
    await sleep(1500);
    fs.rmSync(rom, { force: true });
    try {
      const runCommand = 'extension.clx-language.run';
      const doc2 = await vscode.workspace.openTextDocument(clxPath);
      await vscode.window.showTextDocument(doc2);
      // 运行命令读的是编辑器里的活动文档，所以必须先把它打开
      await vscode.commands.executeCommand(runCommand, doc2.uri);
      let regenerated = false;
      for (let i = 0; i < 60; i++) {
        if (existsSync(rom)) { regenerated = true; break; }
        await sleep(500);
      }
      log('运行路径重新生成了 ROM', regenerated, existsSync(rom) ? fs.statSync(rom).size + ' bytes' : 'missing');
    } catch (e) {
      log('运行路径重新生成了 ROM', false, String(e));
    }
  } catch (e) {
    log('harness 自身出错', false, String(e) + '\\n' + (e && e.stack));
  } finally {
    fs.writeFileSync(OUT, JSON.stringify({ results }, null, 2));
    process.exit(0);
  }
};
`;

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
	const code = findVsCode();
	if (!code) {
		console.error('找不到 VS Code。用 CLX_E2E_CODE 指到可执行文件。');
		process.exit(2);
	}

	const emulator = findEmulator();
	if (!emulator) {
		console.error(
			'找不到模拟器。先让扩展下载一次，或用 CLX_E2E_EMULATOR 指到 coloXtool。\n' +
			'（headless 下首次下载的确认框会卡死，所以必须有本地副本。）'
		);
		process.exit(2);
	}

	const cartArg = process.argv[2];
	let cartPath;
	let breakpointLine = DEFAULT_BREAKPOINT_LINE;

	const base = mkdtempSync(join(tmpdir(), 'clx-e2e-'));
	const userDir = join(base, 'user');
	const wsDir = join(base, 'ws');
	const testsDir = join(base, 'tests');
	mkdirSync(join(userDir, 'User'), { recursive: true });  // 坑 1：settings 在 User/ 下
	mkdirSync(wsDir, { recursive: true });
	mkdirSync(testsDir, { recursive: true });

	if (cartArg) {
		cartPath = resolve(cartArg);
		breakpointLine = Number(process.env.CLX_E2E_BREAKPOINT ?? DEFAULT_BREAKPOINT_LINE);
	} else {
		cartPath = join(wsDir, 'game.clx');
		writeFileSync(cartPath, DEFAULT_CART, 'utf8');
	}
	if (!existsSync(cartPath)) {
		console.error(`卡带不存在: ${cartPath}`);
		process.exit(2);
	}
	if (resolve(cartPath) !== resolve(join(wsDir, 'game.clx'))) {
		writeFileSync(join(wsDir, 'game.clx'), readFileSync(cartPath, 'utf8'), 'utf8');
	}

	// 坑 4：卡带没有 __lua__ 会被静默当成菜单
	if (!/^__lua__\s*$/m.test(readFileSync(join(wsDir, 'game.clx'), 'utf8'))) {
		console.warn('警告：卡带里没有 __lua__ 区段。模拟器会回落到 BIOS 菜单，断点必然对不上。');
	}

	writeFileSync(
		join(userDir, 'User', 'settings.json'),
		JSON.stringify({
			'clx-language.debugger': 'Custom',
			'clx-language.debuggerCustomPath': emulator,
			'telemetry.telemetryLevel': 'off',
			'update.mode': 'none',
			'extensions.autoUpdate': false
		}, null, 2),
		'utf8'
	);

	writeFileSync(join(testsDir, 'index.js'), "module.exports = require('./suite');\n", 'utf8');
	writeFileSync(join(testsDir, 'suite.js'), SUITE(breakpointLine), 'utf8');

	const resultPath = join(base, 'result.json');
	console.log(`VS Code:   ${code}`);
	console.log(`模拟器:    ${emulator}`);
	console.log(`卡带:      ${join(wsDir, 'game.clx')}`);
	console.log(`断点:      第 ${breakpointLine} 行`);
	console.log(`临时目录:  ${base}\n`);

	const child = spawn(code, [
		`--user-data-dir=${userDir}`,
		`--extensions-dir=${join(base, 'ext')}`,
		'--disable-extensions',
		'--disable-workspace-trust',
		`--extensionDevelopmentPath=${repoRoot}`,
		`--extensionTestsPath=${testsDir}`,
		'--new-window',
		wsDir
	], {
		stdio: 'ignore',
		env: { ...process.env, CLX_E2E_RESULT: resultPath }
	});

	const deadline = Date.now() + 180_000;
	const poll = setInterval(() => {
		if (existsSync(resultPath) || Date.now() > deadline) {
			clearInterval(poll);
			child.kill();
			setTimeout(() => report(resultPath, base), 1_500);
		}
	}, 500);
}

function report(resultPath, base) {
	if (!existsSync(resultPath)) {
		console.error('\n超时：测试宿主没有写出结果。日志在', base);
		process.exit(1);
	}
	const { results } = JSON.parse(readFileSync(resultPath, 'utf8'));
	let pass = 0;
	let fail = 0;
	for (const r of results) {
		if (r.ok) {
			pass++;
			console.log(` OK  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
		} else {
			fail++;
			console.log(`FAIL ${r.name} — ${r.detail}`);
		}
	}
	console.log(`\n${pass}/${pass + fail} 项通过`);

	if (!process.env.CLX_E2E_KEEP) {
		rmSync(base, { recursive: true, force: true });
	} else {
		console.log(`\n临时目录保留在 ${base}`);
	}
	process.exit(fail === 0 ? 0 : 1);
}

main();
