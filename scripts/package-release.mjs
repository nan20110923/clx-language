#!/usr/bin/env node
/**
 * 打一个可发布的 vsix，并把"这个包属于哪个通道"写进包里。
 *
 * 为什么单独一个脚本，而不是让 publish.yml 里写几行 shell：
 *
 * 预发布通道的打包方式只在那条 CI 分支里存在过，本地没有任何命令能预演它。
 * 结果是两个错误只能在**打 tag 之后**才暴露 —— 而打 tag 会真的发布到
 * Marketplace，是不可撤销的外向操作：
 *
 *   1. `vsce package --out .artifacts/` 在目录不存在时报 ENOTDIR，而 CI 是
 *      干净 checkout，目录本来就不存在。`yarn package` 自带 mkdir，所以
 *      stable 通道从来没暴露过这个问题。
 *   2. `--pre-release` 必须**打包时**给：vsce 把
 *      `Microsoft.VisualStudio.Code.PreRelease` 写进 vsix 的 manifest，而
 *      `vsce publish --packagePath --pre-release` 会拒绝不带该属性的包。
 *      `yarn package` 没法传这个 flag。
 *
 * 抽成脚本后，本地可以跑 `node scripts/package-release.mjs --channel pre-release`
 * 复现 CI 的打包步骤，把失败前移到 push 阶段。
 *
 * 用法：
 *   node scripts/package-release.mjs                        # stable，输出到 .artifacts/
 *   node scripts/package-release.mjs --channel pre-release
 *   node scripts/package-release.mjs --out /tmp/x           # 换输出目录
 *
 * 输出：打印唯一产出的 vsix 路径（一行），供调用方直接取用。
 * 退出码：0 成功，1 失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANNELS = new Set(['stable', 'pre-release']);

/** vsix manifest 里标记预发布的属性名，由 vsce 写入。 */
const PRE_RELEASE_PROPERTY = 'Microsoft.VisualStudio.Code.PreRelease';

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		if (!key?.startsWith('--')) {
			throw new Error(`Unexpected argument: ${key}`);
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith('--')) {
			throw new Error(`${key} needs a value`);
		}
		args[key.slice(2)] = value;
	}
	return args;
}

/** 列出目录下的 vsix，按名字排序保证结果稳定。 */
function vsixFiles(directory) {
	if (!fs.existsSync(directory)) {
		return [];
	}
	return fs
		.readdirSync(directory)
		.filter(name => name.endsWith('.vsix'))
		.sort()
		.map(name => path.join(directory, name));
}

/**
 * 读 vsix 里的 manifest，判断它是否被标记为预发布。
 *
 * 这是对 vsce 行为的探针：如果 vsce 改了属性名或不再写入它，这里会失败，
 * 而不是等到 `vsce publish` 在 CI 里报错。
 */
function isPreReleasePackage(vsixPath) {
	let manifest;
	try {
		manifest = execFileSync('unzip', ['-p', vsixPath, 'extension.vsixmanifest'], { encoding: 'utf8' });
	} catch (e) {
		throw new Error(`Cannot read extension.vsixmanifest from ${vsixPath}: ${e}`);
	}
	return manifest.includes(PRE_RELEASE_PROPERTY);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const channel = args.channel ?? 'stable';
	const outDir = path.resolve(REPO_ROOT, args.out ?? '.artifacts');

	if (!CHANNELS.has(channel)) {
		throw new Error(`--channel must be one of ${[...CHANNELS].join(', ')}, got "${channel}"`);
	}

	// 干净 checkout 里这个目录不存在，而 `--out` 不会替你创建。
	fs.mkdirSync(outDir, { recursive: true });

	// 残留的旧 vsix 会让"唯一产物"这条断言失效，也让 vsce 可能挑错文件。
	for (const stale of vsixFiles(outDir)) {
		fs.rmSync(stale, { force: true });
	}

	const vsceArgs = ['package', '--no-dependencies', '--out', outDir];
	if (channel === 'pre-release') {
		vsceArgs.push('--pre-release');
	}

	// 用仓库自己的 vsce，避免 npx 在离线或版本漂移时抓到别的。
	const vsce = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');
	execFileSync(vsce, vsceArgs, { cwd: REPO_ROOT, stdio: 'inherit' });

	const built = vsixFiles(outDir);
	if (built.length !== 1) {
		throw new Error(`Expected exactly one vsix in ${outDir}, found ${built.length}: ${built.join(', ')}`);
	}

	// 包里的标记必须和请求的通道一致。pre-release 少这个属性会让
	// `vsce publish --packagePath --pre-release` 在 CI 里拒绝；stable 多这个
	// 属性则会让正式版被当成预发布发出去。
	const marked = isPreReleasePackage(built[0]);
	const wantMarked = channel === 'pre-release';
	if (marked !== wantMarked) {
		throw new Error(
			`The vsix ${wantMarked ? 'is missing' : 'unexpectedly carries'} the ${PRE_RELEASE_PROPERTY} property ` +
				`for channel "${channel}". vsce may have changed how it records the pre-release flag.`
		);
	}

	console.log(built[0]);
}

try {
	main();
} catch (e) {
	console.error(`package-release: ${e.message ?? e}`);
	process.exit(1);
}
