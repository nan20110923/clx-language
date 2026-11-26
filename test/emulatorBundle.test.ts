/**
 * emulatorBundle：处理不可信输入的代码。
 *
 * AGENTS.md 明确规定这个 module "承载全部处理不可信输入的代码（tar 解析、
 * 路径穿越防护、sha256），必须能在普通 Node 进程里加载和测试"，但在此之前
 * 它一行测试都没有。
 *
 * 这里的重点是**恶意归档**：一个被篡改的模拟器包不该能往工作区外面写文件。
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import {
	EmulatorError,
	extract,
	findBundle,
	formatBytes,
	locateBundle,
	parseManifest
} from '../src/emulator/emulatorBundle';

let workDir: string;

before(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clx-bundle-test-'));
});

after(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

/** 造一个只含单个条目的 tar 头（512 字节）。 */
function tarHeader(name: string, opts: { size?: number; mode?: number; type?: string } = {}): Buffer {
	const header = Buffer.alloc(512, 0);
	header.write(name, 0, 100, 'utf8');
	// mode 是八进制，7 字节 + NUL
	header.write((opts.mode ?? 0o644).toString(8).padStart(7, '0'), 100, 8, 'utf8');
	header.write('0000000', 108, 8, 'utf8'); // uid
	header.write('0000000', 116, 8, 'utf8'); // gid
	const size = opts.size ?? 0;
	header.write(size.toString(8).padStart(11, '0'), 124, 12, 'utf8');
	header.write('00000000000', 136, 12, 'utf8'); // mtime
	header.write('        ', 148, 8, 'utf8'); // checksum 占位（本实现不校验）
	header.write(opts.type ?? '0', 156, 1, 'utf8');
	header.write('ustar\0', 257, 6, 'utf8');
	header.write('00', 263, 2, 'utf8');
	return header;
}

/** 把若干 (头, 内容) 打成一个 .tar.gz，写到临时目录。 */
function makeArchive(entries: { name: string; content: string; mode?: number; type?: string }[]): string {
	const chunks: Buffer[] = [];
	for (const entry of entries) {
		const content = Buffer.from(entry.content, 'utf8');
		chunks.push(tarHeader(entry.name, { size: content.length, mode: entry.mode, type: entry.type }));
		chunks.push(content);
		// 补齐到 512 边界
		const pad = (512 - (content.length % 512)) % 512;
		if (pad > 0) {
			chunks.push(Buffer.alloc(pad, 0));
		}
	}
	chunks.push(Buffer.alloc(1024, 0)); // 两个全零块结尾

	const archivePath = path.join(workDir, `archive-${Math.random().toString(36).slice(2)}.tar.gz`);
	fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.concat(chunks)));
	return archivePath;
}

function freshDir(name: string): string {
	const dir = path.join(workDir, `${name}-${Math.random().toString(36).slice(2)}`);
	return dir;
}

// ---------------------------------------------------------------------------
// 路径穿越：最危险的一类
// ---------------------------------------------------------------------------

test('extract 拒绝 ../ 路径穿越', () => {
	const archive = makeArchive([{ name: '../../escaped.txt', content: 'pwned' }]);
	const dest = freshDir('traversal');
	assert.throws(() => extract(archive, dest), /escapes the target directory/);
	// 确认没有写到 dest 外面
	assert.equal(fs.existsSync(path.join(workDir, 'escaped.txt')), false);
});

test('extract 把绝对路径降级成相对路径（不逃逸，但也不报错）', () => {
	// safeJoin 会先剥掉前导 /，于是 /etc/passwd 变成 <dest>/etc/passwd。
	// 这是有意的：归档里的绝对路径不该写到系统目录，但也不值得为它整个失败。
	// 关键不变量是"不会写到 dest 外面"，而不是"抛错"。
	const archive = makeArchive([{ name: '/etc/passwd', content: 'not really' }]);
	const dest = freshDir('absolute');
	extract(archive, dest);

	const inside = path.join(dest, 'etc', 'passwd');
	assert.ok(fs.existsSync(inside), 'should land inside the destination');
	assert.equal(fs.readFileSync(inside, 'utf8'), 'not really');
});

test('extract 拒绝反斜杠形式的穿越（Windows 风格的归档）', () => {
	// safeJoin 先把 \ 换成 /，所以 ..\..\x 也要被拦住
	const archive = makeArchive([{ name: '..\\..\\escaped.txt', content: 'pwned' }]);
	const dest = freshDir('backslash');
	assert.throws(() => extract(archive, dest), /escapes the target directory/);
});

test('extract 接受安全的子目录路径', () => {
	const archive = makeArchive([{ name: 'Contents/MacOS/coloXtool', content: 'binary', mode: 0o755 }]);
	const dest = freshDir('safe');
	extract(archive, dest);

	const target = path.join(dest, 'Contents', 'MacOS', 'coloXtool');
	assert.ok(fs.existsSync(target), 'nested file should exist');
	assert.equal(fs.readFileSync(target, 'utf8'), 'binary');
});

// ---------------------------------------------------------------------------
// 可执行位
// ---------------------------------------------------------------------------

test('extract 还原可执行位（macOS 上模拟器起不来的原因）', () => {
	const archive = makeArchive([{ name: 'run.sh', content: '#!/bin/sh', mode: 0o755 }]);
	const dest = freshDir('mode');
	extract(archive, dest);

	const mode = fs.statSync(path.join(dest, 'run.sh')).mode & 0o777;
	assert.equal(mode & 0o111, 0o111, `expected executable bits, got ${mode.toString(8)}`);
});

// ---------------------------------------------------------------------------
// 归档类型
// ---------------------------------------------------------------------------

test('extract 拒绝符号链接条目', () => {
	// 符号链接可以指向归档外部，是另一条穿越路径
	const archive = makeArchive([{ name: 'link', content: '/etc/passwd', type: '2' }]);
	const dest = freshDir('symlink');
	assert.throws(() => extract(archive, dest), /Unsupported archive entry type/);
});

test('extract 拒绝截断的归档', () => {
	// 头声称 100 字节，实际只有几个
	const header = tarHeader('truncated.txt', { size: 100 });
	const archivePath = path.join(workDir, 'truncated.tar.gz');
	fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.concat([header, Buffer.from('short')])));
	const dest = freshDir('truncated');
	assert.throws(() => extract(archivePath, dest), /Truncated archive/);
});

test('extract 支持目录条目', () => {
	const archive = makeArchive([{ name: 'Contents/', content: '', type: '5' }]);
	const dest = freshDir('dir');
	extract(archive, dest);
	assert.ok(fs.statSync(path.join(dest, 'Contents')).isDirectory());
});

// ---------------------------------------------------------------------------
// 清单校验
// ---------------------------------------------------------------------------

test('parseManifest 拒绝非法 JSON', () => {
	assert.throws(() => parseManifest('{not json'), (e: unknown) => {
		assert.ok(e instanceof EmulatorError);
		assert.match((e as EmulatorError).message, /not valid JSON/);
		return true;
	});
});

test('parseManifest 拒绝缺少必需字段的清单', () => {
	assert.throws(() => parseManifest('{"bundles":[]}'), EmulatorError);
	assert.throws(() => parseManifest('{"baseUrl":"x","release":"y"}'), EmulatorError);
	assert.throws(() => parseManifest('null'), EmulatorError);
});

test('parseManifest 接受合法清单', () => {
	const manifest = parseManifest(JSON.stringify({
		release: 'emu-test',
		baseUrl: 'https://example.test/releases',
		bundles: []
	}));
	assert.equal(manifest.release, 'emu-test');
	assert.deepEqual(manifest.bundles, []);
});

test('findBundle 对不支持的平台抛错', () => {
	const manifest = parseManifest(JSON.stringify({
		release: 'r', baseUrl: 'https://x', bundles: []
	}));
	assert.throws(() => findBundle(manifest, 'linux'), EmulatorError);
	assert.throws(() => findBundle(manifest, 'linux'), /No emulator bundle is available/);
});

// ---------------------------------------------------------------------------
// 缓存定位
// ---------------------------------------------------------------------------

test('locateBundle 在缺 .complete 标记时报告未就绪', () => {
	const bundle = {
		product: 'ColoPlay',
		platform: 'darwin',
		date: '2026-11-19',
		asset: 'a.tar.gz',
		size: 1,
		sha256: 'abcdef0123456789',
		executable: 'Contents/MacOS/coloXtool'
	};
	const install = locateBundle(path.join(workDir, 'cache'), bundle);
	assert.equal(install.launch, null, 'no marker means not ready');
	assert.ok(install.directory.includes('ColoPlay-darwin-2026-11-19-abcdef01'));
});

test('locateBundle 在有标记和可执行文件时报告就绪', () => {
	const bundle = {
		product: 'ColoPlay',
		platform: 'darwin',
		date: '2026-11-19',
		asset: 'a.tar.gz',
		size: 1,
		sha256: 'abcdef0123456789',
		executable: 'Contents/MacOS/coloXtool'
	};
	const cacheRoot = path.join(workDir, 'cache-ready');
	const first = locateBundle(cacheRoot, bundle);
	fs.mkdirSync(path.join(first.directory, 'Contents', 'MacOS'), { recursive: true });
	fs.writeFileSync(path.join(first.directory, '.complete'), '{}');
	fs.writeFileSync(path.join(first.directory, bundle.executable), 'bin');

	const second = locateBundle(cacheRoot, bundle);
	assert.ok(second.launch, 'should be ready');
	assert.equal(second.launch.executable, path.join(first.directory, bundle.executable));
});

// ---------------------------------------------------------------------------
// formatBytes（小工具，但被用户文案直接引用）
// ---------------------------------------------------------------------------

test('formatBytes 覆盖三个量级', () => {
	assert.equal(formatBytes(512), '512 B');
	assert.equal(formatBytes(2048), '2 KB');
	assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});
