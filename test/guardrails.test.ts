/**
 * 护栏：声明为"纯逻辑"的 module 必须至少被一个测试引用。
 *
 * 为什么需要这条：AGENTS.md 规定 `debugChannel` / `luaProtocol` / `lineMapping` /
 * `luaValue` / `testAutomation` / `emulatorBundle` 都不许 import `vscode`，
 * 目的正是"能在普通 Node 里测"。但这条约定此前完全靠自觉 —— `emulatorBundle.ts`
 * 承载全部不可信输入的解析，却长期一行测试都没有，文档说得再清楚也没用。
 *
 * 这个测试把那条文档句子变成一个会失败的检查。新增纯 module 时把它加进
 * PURE_MODULES，否则这里的覆盖检查不会管到它。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 测试被 esbuild 打包到临时目录后再跑，所以 __dirname / import.meta.url 都
// 不在仓库里。真实路径由 scripts/run-tests.mjs 通过环境变量传进来。
const repoRoot = process.env.CLX_REPO_ROOT;
if (!repoRoot) {
	throw new Error('CLX_REPO_ROOT must be set; run tests via `yarn test`.');
}
const here = path.join(repoRoot, 'test');

/**
 * 声明为纯逻辑（不 import vscode）的 module。
 *
 * 加进来的代价：必须有一个测试文件 import 它。
 * 这正是重点 —— 纯 module 不测，就等于放弃了它们存在的理由。
 */
const PURE_MODULES = [
	'src/artifact/bundle.ts',
	'src/debug/debugChannel.ts',
	'src/debug/luaProtocol.ts',
	'src/debug/lineMapping.ts',
	'src/debug/luaValue.ts',
	'src/debug/testAutomation.ts',
	'src/emulator/emulatorBundle.ts',
	'src/language/includePath.ts',
	'src/language/lualsBundle.ts',
	'src/language/lualsConfig.ts'
];

/** 收集 test/ 下所有测试文件的源码（不含本文件，避免自我满足）。 */
function testSources(): { file: string; source: string }[] {
	const dir = here;
	const out: { file: string; source: string }[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (full === path.join(here, 'guardrails.test.ts')) {
			continue;
		}
		out.push({ file: entry.name, source: fs.readFileSync(full, 'utf8') });
	}
	return out;
}

test('每个纯逻辑 module 都至少被一个测试引用', () => {
	const sources = testSources();
	const missing: string[] = [];

	for (const modulePath of PURE_MODULES) {
		// module 在测试里的引用形式是相对路径的一部分，比如 '../src/debug/luaProtocol'
		const stem = modulePath.replace(/\.ts$/, '');
		const referenced = sources.some(s =>
			s.source.includes(`from '${relativeFromTest(stem)}'`) ||
			s.source.includes(`from "${relativeFromTest(stem)}"`) ||
			s.source.includes(`require('${relativeFromTest(stem)}')`)
		);
		if (!referenced) {
			missing.push(modulePath);
		}
	}

	assert.deepEqual(
		missing,
		[],
		`these pure modules have no test importing them:\n  ${missing.join('\n  ')}\n` +
		'Either add a test, or remove them from PURE_MODULES if they are not meant to be pure.'
	);
});

test('声明的纯 module 确实没有 import vscode', () => {
	// 如果某个 module 开始 import vscode，它就和测试用的 vscode 替身绑在一起，
	// 不再是"能在普通 Node 里跑"的纯逻辑。这时应该把它移出 PURE_MODULES。
	const offenders: string[] = [];
	for (const modulePath of PURE_MODULES) {
		const source = fs.readFileSync(path.join(repoRoot, modulePath), 'utf8');
		if (/from ['"]vscode['"]/.test(source) || /require\(['"]vscode['"]\)/.test(source)) {
			offenders.push(modulePath);
		}
	}
	assert.deepEqual(offenders, [], `these modules import vscode: ${offenders.join(', ')}`);
});

test('PURE_MODULES 里列出的文件都存在', () => {
	const missing = PURE_MODULES.filter(m => !fs.existsSync(path.join(repoRoot, m)));
	assert.deepEqual(missing, [], `listed but missing: ${missing.join(', ')}`);
});

/** 'src/debug/luaProtocol' -> '../src/debug/luaProtocol'（从 test/ 出发的相对路径）。 */
function relativeFromTest(stem: string): string {
	return `../${stem}`;
}
