#!/usr/bin/env node
/**
 * 跑 test/ 下的 node:test 用例。
 *
 * 为什么需要这个脚本而不是直接 `node --test`：
 * 用例是 TypeScript，而 Node 22 的 --experimental-strip-types 不支持参数属性
 * （构造函数签名里的 `public readonly x`）这类语法。esbuild 已经是构建依赖，
 * 用它把每个用例 bundle 成 CJS 再交给 node --test，比引入 ts-node 或
 * 给测试单独配一套 tsconfig 都简单。
 *
 * 产物写到系统临时目录，不落在仓库里 —— 与 .artifacts / dist 的既有约定一致。
 */

import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(repoRoot, 'test');
const esbuild = join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');

const suites = readdirSync(testDir).filter(f => f.endsWith('.test.ts')).sort();
if (suites.length === 0) {
	console.error('No test suites found in test/.');
	process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'clx-tests-'));
let failed = false;

try {
	const bundled = [];
	for (const suite of suites) {
		const outfile = join(outDir, `${basename(suite, '.test.ts')}.test.cjs`);
		const result = spawnSync(
			esbuild,
			[
				join(testDir, suite),
				'--bundle',
				'--platform=node',
				'--format=cjs',
				'--target=node22',
				// 解析 .ts 相对导入时按 TS 语义走
				'--loader:.ts=ts',
				// 把 `vscode` 指向测试替身。这样 import 了 vscode 的 module
				// （debugSession）也能在普通 Node 里驱动，不必启动编辑器。
				// 用打包期别名而不是运行时塞 require.cache：bundle 落在临时目录，
				// 任何基于源码路径的 require.resolve 都会落空。
				`--alias:vscode=${join(testDir, 'support', 'vscode-stub.ts')}`,
				`--outfile=${outfile}`
			],
			{ cwd: repoRoot, stdio: 'inherit' }
		);
		if (result.status !== 0) {
			console.error(`Failed to bundle ${suite}.`);
			process.exit(1);
		}
		bundled.push(outfile);
	}

	const run = spawnSync(process.execPath, ['--test', ...bundled], {
		cwd: repoRoot,
		stdio: 'inherit',
		// 护栏测试要检查仓库里的源文件，但测试本身跑在临时目录里，
		// 拿不到仓库位置，所以显式传进去。
		env: { ...process.env, CLX_REPO_ROOT: repoRoot }
	});
	failed = run.status !== 0;
} finally {
	rmSync(outDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
