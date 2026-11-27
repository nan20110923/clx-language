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
import { parseArgs, today, sha256, listEntries, createArchive } from './pack-common.mjs';

const PRODUCTS = ['ColoPlay', 'Nature'];

function slug(product) {
	return product.toLowerCase();
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
