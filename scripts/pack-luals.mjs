#!/usr/bin/env node
/**
 * 把一份解压好的 LuaLS 发行目录裁成一个语言服务器包，打成 tar.gz 并输出清单条目。
 *
 * 用法：
 *   node scripts/pack-luals.mjs \
 *     --dir /tmp/luals-3.19.2-darwin-arm64 \
 *     --platform darwin --arch arm64 --version 3.19.2
 *
 * 输出：
 *   .artifacts/<asset>          待上传的归档
 *   .artifacts/<asset>.json     清单条目（sha256、size 等）
 *
 * 为什么要裁：上游发行包 21MB，其中 meta/ 占 17MB。裁剪后约 4.3MB。
 *
 * 关于 meta/ 的关键事实（别照直觉理解）：
 *   - `meta/template/*.lua` 是**源码模板**，必须保留（112KB）。LuaLS 启动时
 *     会用它按 `Lua.runtime.version` / 界面语言 / 编码生成标准库定义。
 *   - `meta/Lua 5.4 en-us utf8/` 之类的目录**不是发行包内容**，是启动时生成到
 *     `LLS_META_PATH` 下的缓存。我原先以为它是包自带的，验证后发现重新解压
 *     同一份 tarball 并没有它 —— 只有跑过一次的目录才会有。
 *   - `meta/default utf8/` 与 `meta/3rd/` 确实是发行包自带的，但它们是
 *     Unity/.NET 绑定与 love2d/Cocos 等第三方框架，与 CLX 无关，删。
 *   - `meta/spell/` 是英文拼写检查词典，删。
 *
 * 净效果：省 17MB，且顺带消除 print() 的重复签名（.NET 的 print 与 CLX 的撞车）。
 *
 * 保留 locale/：缺失会导致启动即错（已实测）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, sha256, listEntries, createArchive } from './pack-common.mjs';

/** 必须保留的顶层条目 */
const REQUIRED = ['bin', 'script', 'locale', 'main.lua'];

/** meta/ 下唯一要保留的目录：标准库定义的源码模板 */
const KEPT_META = 'template';

/** 裁包后每个平台的可执行文件相对路径 */
function executableFor(platform) {
	if (platform === 'darwin') {
		return 'bin/lua-language-server';
	}
	if (platform === 'win32') {
		return 'bin/lua-language-server.exe';
	}
	throw new Error(`--platform must be darwin or win32, got ${platform}`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const sourceDir = args.dir;
	const platform = args.platform;
	const arch = args.arch;
	const version = args.version;

	if (!sourceDir || !fs.existsSync(sourceDir)) {
		throw new Error(`--dir does not exist: ${sourceDir}`);
	}
	if (!platform) {
		throw new Error('--platform is required (darwin or win32)');
	}
	if (!arch) {
		throw new Error('--arch is required (arm64 or x64); LuaLS ships per-arch archives');
	}
	if (!version) {
		throw new Error('--version is required (the upstream release tag, e.g. 3.19.2)');
	}

	const executable = executableFor(platform);
	for (const name of REQUIRED) {
		const target = path.join(sourceDir, name);
		if (!fs.existsSync(target)) {
			throw new Error(`--dir is missing "${name}"; point it at an extracted LuaLS release`);
		}
	}
	const executableAbsolute = path.join(sourceDir, executable);
	if (!fs.existsSync(executableAbsolute)) {
		throw new Error(`The expected executable is missing: ${executableAbsolute}`);
	}
	if (!fs.statSync(executableAbsolute).isFile()) {
		throw new Error(`The expected executable is not a file: ${executableAbsolute}`);
	}

	// 裁 meta/：只留 template。skip 收到的是相对 --dir 的路径，
	// 分隔符统一成 '/' —— 归档内的路径本来就是 posix 形式。
	const toPosix = relative => relative.split(path.sep).join('/');
	const metaPrefix = 'meta/';
	const skip = relative => {
		const normalized = toPosix(relative);
		if (!normalized.startsWith(metaPrefix)) {
			return false;
		}
		return normalized !== `${metaPrefix}${KEPT_META}` && !normalized.startsWith(`${metaPrefix}${KEPT_META}/`);
	};

	const entries = listEntries(sourceDir, skip);
	if (!entries.some(e => e.kind === 'file' && e.relative === executable)) {
		throw new Error(`The executable is not part of the archive: ${executable}`);
	}
	// template 是标准库定义的唯一来源，少了它 LuaLS 生成不出 meta，标准库补全全空
	const keptMetaFiles = entries.filter(e => e.kind === 'file' && toPosix(e.relative).startsWith(`${metaPrefix}${KEPT_META}/`));
	if (keptMetaFiles.length === 0) {
		throw new Error(
			`meta/${KEPT_META}/ is empty or missing. It holds the source templates LuaLS compiles ` +
				'the standard library definitions from; without it there is no Lua completion.'
		);
	}

	const artifactDir = path.resolve('.artifacts');
	fs.mkdirSync(artifactDir, { recursive: true });

	const asset = `luals-${platform}-${arch}-${version}.tar.gz`;
	const destination = path.join(artifactDir, asset);
	fs.rmSync(destination, { force: true });

	createArchive(sourceDir, destination, entries);

	const bundle = {
		product: 'LuaLS',
		platform,
		arch,
		version,
		asset,
		size: fs.statSync(destination).size,
		sha256: sha256(destination),
		executable
	};

	const manifestEntry = path.join(artifactDir, `${asset}.json`);
	fs.writeFileSync(manifestEntry, JSON.stringify(bundle, null, 2) + '\n');

	console.log('');
	console.log(`Archive:  ${destination}`);
	console.log(`Entry:    ${manifestEntry}`);
	console.log(`Size:     ${(bundle.size / (1024 * 1024)).toFixed(2)} MB`);
	console.log(`SHA-256:  ${bundle.sha256}`);
	console.log(`Files:    ${entries.filter(e => e.kind === 'file').length}`);
	console.log(`meta kept: ${keptMetaFiles.length} files from meta/${KEPT_META}`);
}

main();
