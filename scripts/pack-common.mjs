/**
 * 打包脚本共用的小工具。
 *
 * 模拟器（pack-emulator.mjs）和语言服务器（pack-luals.mjs）都要做同样三件事：
 * 递归列出目录、用系统 tar 打成 ustar、算 sha256。放在这里避免两份拷贝，
 * 也保证两个归档的格式一致 —— 解压端只有一套（src/artifact/bundle.ts）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** 打包时跳过 macOS 的目录元数据 */
export const IGNORED_NAMES = new Set(['.DS_Store']);

export function parseArgs(argv) {
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

export function today() {
	const now = new Date();
	const pad = n => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function sha256(file) {
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

/**
 * 逐项列出目录内容。
 *
 * 拒绝 symlink 和非普通文件：归档里只有普通文件和目录，解压端才能保持简单
 * （见 src/artifact/bundle.ts 的 extract）。两个上游包都已确认不含 symlink。
 *
 * @param {string} root
 * @param {(relative: string) => boolean} [skip] 返回 true 表示跳过该条目（及其子树）
 */
export function listEntries(root, skip) {
	const entries = [];
	const walk = relative => {
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
				const childRelative = path.join(relative, child);
				if (skip?.(childRelative)) {
					continue;
				}
				walk(childRelative);
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
		if (skip?.(child)) {
			continue;
		}
		walk(child);
	}
	return entries;
}

/**
 * 用系统 tar 打包。
 * --format ustar 让输出能被 src/artifact/bundle.ts 的解压逻辑稳定读取；
 * 不加这个标记时 BSD tar 会写出解压端不认识的扩展条目。
 */
export function createArchive(sourceDir, destination, entries) {
	const fileList = entries.filter(e => e.kind === 'file').map(e => e.relative);
	const result = spawnSync('tar', ['-czf', destination, '--format=ustar', ...fileList], {
		cwd: sourceDir,
		stdio: 'inherit'
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`tar exited with status ${result.status}`);
	}
}
