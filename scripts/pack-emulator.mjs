#!/usr/bin/env node
/**
 * 把一份模拟器目录打成可上传的 tar.gz，并输出清单条目。
 *
 * 用法：
 *   node scripts/pack-emulator.mjs \
 *     --product ColoPlay --platform darwin --dir debugger/osx \
 *     --exe MacOS/coloXtool --library Frameworks --date 2026-11-25
 *
 * 输出：
 *   .artifacts/<asset>          待上传的归档
 *   .artifacts/<asset>.json     清单条目（sha256、size 等）
 *
 * 仓库内部没有模拟器的语义化版本，包的身份 = 构建日期 + 内容 sha256。
 * 见 docs/adr/0001-emulator-bundles-outside-vsix.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const PRODUCTS = ['ColoPlay', 'Nature'];

/** 打包时跳过 macOS 的目录元数据 */
const IGNORED_NAMES = new Set(['.DS_Store']);

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		if (!key?.startsWith('--')) {
			throw new Error(`Unexpected argument: ${key}`);
		}
		args[key.slice(2)] = argv[i + 1];
	}
	return args;
}

function slug(product) {
	return product.toLowerCase();
}

function today() {
	const now = new Date();
	const pad = n => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function sha256(file) {
	const hash = crypto.createHash('sha256');
	const descriptor = fs.openSync(file, 'r');
	const buffer = Buffer.allocUnsafe(1024 * 1024);
	try {
		let read;
		while ((read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
			hash.update(buffer.subarray(0, read));
		}
	} finally {
		fs.closeSync(descriptor);
	}
	return hash.digest('hex');
}

/** 逐项列出目录内容，用于打包前确认，也便于发现空目录 */
function listEntries(root) {
	const entries = [];
	const walk = (relative) => {
		const absolute = path.join(root, relative);
		const stat = fs.lstatSync(absolute);
		if (stat.isSymbolicLink()) {
			throw new Error(`Refusing to package a symlink: ${relative}`);
		}
		if (stat.isDirectory()) {
			entries.push({ relative, kind: 'directory' });
			for (const child of fs.readdirSync(absolute).sort()) {
				if (IGNORED_NAMES.has(child)) {
					continue;
				}
				walk(path.join(relative, child));
			}
			return;
		}
		if (!stat.isFile()) {
			throw new Error(`Refusing to package a non-regular file: ${relative}`);
		}
		entries.push({ relative, kind: 'file', mode: stat.mode & 0o777, size: stat.size });
	};
	for (const child of fs.readdirSync(root).sort()) {
		if (IGNORED_NAMES.has(child)) {
			continue;
		}
		walk(child);
	}
	return entries;
}

/** 用系统 tar 打包；--format ustar 让输出可被 src/emulator.ts 里的解压逻辑稳定读取 */
function createArchive(sourceDir, destination, entries) {
	const fileList = entries.filter(e => e.kind === 'file').map(e => e.relative);
	const result = spawnSync(
		'tar',
		['-czf', destination, '--format=ustar', ...fileList],
		{ cwd: sourceDir, stdio: 'inherit' }
	);
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`tar exited with status ${result.status}`);
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const product = args.product;
	const platform = args.platform || 'darwin';
	const sourceDir = args.dir;
	const executable = args.exe;
	const libraryPath = args.library;
	const date = args.date || today();

	if (!PRODUCTS.includes(product)) {
		throw new Error(`--product must be one of ${PRODUCTS.join(', ')}`);
	}
	if (!sourceDir || !fs.existsSync(sourceDir)) {
		throw new Error(`--dir does not exist: ${sourceDir}`);
	}
	if (!executable) {
		throw new Error('--exe is required (path to the executable inside --dir)');
	}

	const executableAbsolute = path.join(sourceDir, executable);
	if (!fs.existsSync(executableAbsolute)) {
		throw new Error(`The declared executable does not exist: ${executableAbsolute}`);
	}
	if (!fs.statSync(executableAbsolute).isFile()) {
		throw new Error(`The declared executable is not a file: ${executableAbsolute}`);
	}

	const entries = listEntries(sourceDir);
	const missingExecutable = !entries.some(e => e.kind === 'file' && e.relative === executable);
	if (missingExecutable) {
		throw new Error(`The declared executable is not part of the archive: ${executable}`);
	}

	const artifactDir = path.resolve('.artifacts');
	fs.mkdirSync(artifactDir, { recursive: true });

	const asset = `${slug(product)}-${platform}-${date}.tar.gz`;
	const destination = path.join(artifactDir, asset);
	fs.rmSync(destination, { force: true });

	createArchive(sourceDir, destination, entries);

	const bundle = {
		product,
		platform,
		date,
		asset,
		size: fs.statSync(destination).size,
		sha256: sha256(destination),
		executable,
		...(libraryPath ? { libraryPath } : {})
	};

	const manifestEntry = path.join(artifactDir, `${asset}.json`);
	fs.writeFileSync(manifestEntry, JSON.stringify(bundle, null, 2) + '\n');

	console.log('');
	console.log(`Archive:  ${destination}`);
	console.log(`Entry:    ${manifestEntry}`);
	console.log(`Size:     ${(bundle.size / (1024 * 1024)).toFixed(2)} MB`);
	console.log(`SHA-256:  ${bundle.sha256}`);
	console.log(`Files:    ${entries.filter(e => e.kind === 'file').length}`);
}

main();
