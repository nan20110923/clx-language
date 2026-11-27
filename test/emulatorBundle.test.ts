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
	missingWindowsDebugCrt,
	parseManifest,
	buildRomArgs,
	romPathFor,
	WINDOWS_DEBUG_CRT
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

// ---------------------------------------------------------------------------
// missingWindowsDebugCrt
//
// 官方便携版 coloXtool.exe 链接 MSVC **Debug** CRT（MSVCP140D 等四个），
// 官方 zip 不带，而微软不允许分发。缺了的话 Windows 在加载镜像阶段就失败：
// 进程不起、不生成 .rom、error 事件只有 ENOENT/UNKNOWN。这几条测试钉住
// "能诊断"这一步 —— 没有它们，用户只会看到"点了运行没反应"。
// ---------------------------------------------------------------------------

/** 用一组"存在的文件"造 exists 谓词，路径按 Windows 风格拼接。 */
function existsIn(files: string[]): (file: string) => boolean {
	const set = new Set(files.map(f => f.toLowerCase()));
	return file => set.has(file.toLowerCase());
}

test('missingWindowsDebugCrt 在非 Windows 上不检查', () => {
	const missing = missingWindowsDebugCrt('/app', () => false, 'darwin');
	assert.deepEqual(missing, []);
});

test('missingWindowsDebugCrt 在 win32 上列出全部缺失项', () => {
	const missing = missingWindowsDebugCrt('C:\\app', () => false, 'win32', {} as NodeJS.ProcessEnv);
	assert.deepEqual([...missing].sort(), [...WINDOWS_DEBUG_CRT].sort());
});

test('missingWindowsDebugCrt 四个 DLL 都在应用目录时不报缺失', () => {
	const appDir = 'C:\\app';
	const files = WINDOWS_DEBUG_CRT.map(dll => path.win32.join(appDir, dll));
	const missing = missingWindowsDebugCrt(appDir, existsIn(files), 'win32', {} as NodeJS.ProcessEnv);
	assert.deepEqual(missing, []);
});

test('missingWindowsDebugCrt 在 System32 里也算找到', () => {
	const appDir = 'C:\\app';
	const sys32 = 'C:\\Windows\\System32';
	const files = WINDOWS_DEBUG_CRT.map(dll => path.win32.join(sys32, dll));
	const missing = missingWindowsDebugCrt(appDir, existsIn(files), 'win32', { SystemRoot: 'C:\\Windows' } as NodeJS.ProcessEnv);
	assert.deepEqual(missing, []);
});

test('missingWindowsDebugCrt 也会搜 PATH', () => {
	const appDir = 'C:\\app';
	const extra = 'D:\\tools\\vc';
	const files = WINDOWS_DEBUG_CRT.map(dll => path.win32.join(extra, dll));
	const missing = missingWindowsDebugCrt(
		appDir,
		existsIn(files),
		'win32',
		{ PATH: `C:\\Windows;${extra}` } as NodeJS.ProcessEnv
	);
	assert.deepEqual(missing, []);
});

test('missingWindowsDebugCrt 只报真正缺的那个', () => {
	const appDir = 'C:\\app';
	// 只放三个，缺 ucrtbased.dll
	const files = WINDOWS_DEBUG_CRT.filter(d => d !== 'ucrtbased.dll').map(dll => path.win32.join(appDir, dll));
	const missing = missingWindowsDebugCrt(appDir, existsIn(files), 'win32', {} as NodeJS.ProcessEnv);
	assert.deepEqual(missing, ['ucrtbased.dll']);
});

test('missingWindowsDebugCrt 的查询顺序是应用目录优先于 PATH', () => {
	const appDir = 'C:\\app';
	const elsewhere = 'D:\\other';
	const seen: string[] = [];
	const exists = (file: string) => {
		seen.push(file);
		return file.toLowerCase() === path.win32.join(appDir, 'MSVCP140D.dll').toLowerCase();
	};
	missingWindowsDebugCrt(appDir, exists, 'win32', { PATH: elsewhere } as NodeJS.ProcessEnv);

	// 第一个被查的必须是应用目录，这是 Windows 的加载顺序
	assert.equal(seen[0], path.win32.join(appDir, 'MSVCP140D.dll'));
	assert.ok(!missingWindowsDebugCrt(appDir, exists, 'win32', { PATH: elsewhere }).includes('MSVCP140D.dll'));
});

// ---------------------------------------------------------------------------
// ROM 生成判定
//
// 这些字符串是从官方二进制里读出来的（macOS 与 Windows 版完全一致）：
//
//   !!!ROM GEN FAIL, can't open %s!!!
//   !!!ROM GEN FAIL!!!
//   !!!ROM GEN skip compress[%d]!!!
//   gen rom(%s) fail.
//
// 关键行为：生成失败时模拟器**不报错、进程继续跑**，只在 stdout 打一行。
// 所以"模拟器起来了"证明不了"卡带加载了"，只能看 ROM 文件。
// ---------------------------------------------------------------------------

test('romPathFor 是卡带路径加 .rom —— 不是替换扩展名', () => {
	// 用户看到的是 <文件名>.clx.rom，别写成 <文件名>.rom
	assert.equal(romPathFor('/p/game.clx'), '/p/game.clx.rom');
	assert.equal(romPathFor('C:\\p\\game.clx'), 'C:\\p\\game.clx.rom');
});

test('romPathFor 不使用 -d 目录，ROM 总在卡带旁边', () => {
	const rom = romPathFor('/work/src/game.clx');
	assert.ok(rom.startsWith('/work/src/'));
	assert.ok(!rom.includes('/work/') || rom.startsWith('/work/src/'));
});



// ---------------------------------------------------------------------------
// buildRomArgs —— `coloXtool -b` 的参数表
//
// 为什么逐字钉住：源码里 `-b` 一旦被解析就 `exit(coloX_build_rom(...))`，
// 会立即结束进程。所以 -d / -r 必须排在它前面，顺序错了就会去构建默认卡带
// （`codetest.clx`）而不是用户的文件，而且**没有任何报错**。
// ---------------------------------------------------------------------------

test('buildRomArgs 把 -b 放在最后，-d/-r 在前', () => {
	const args = buildRomArgs('/p/game.clx');

	// 语法层面就断言顺序：-b 的下标必须最大
	const b = args.indexOf('-b');
	assert.equal(b, args.length - 2, '-b 必须在倒数第二位（后面紧跟输出路径）');
	assert.ok(args.indexOf('-d') < b, '-d 必须在 -b 之前');
	assert.ok(args.indexOf('-r') < b, '-r 必须在 -b 之前');
});

test('buildRomArgs 的 -d 带尾部分隔符', () => {
	const args = buildRomArgs('/p/game.clx');
	const d = args[args.indexOf('-d') + 1];

	// 少了它，模拟器内部 '%s/%s%s' 会拼成 /pgame.clx，静默失败
	assert.ok(d.endsWith('/'), `-d 必须以分隔符结尾，实际是 ${JSON.stringify(d)}`);
	assert.equal(d, '/p/');
});

test('buildRomArgs 的 -r 只给文件名，不给全路径', () => {
	const args = buildRomArgs('/p/deep/game.clx');
	assert.equal(args[args.indexOf('-r') + 1], 'game.clx');
});

test('buildRomArgs 的输出是完整的 <卡带>.rom 路径', () => {
	const args = buildRomArgs('/p/game.clx');
	const out = args[args.indexOf('-b') + 1];

	// -b 的 outfile 原样使用，不补后缀；漏了 .rom 会生成一个模拟器不认的文件
	assert.equal(out, '/p/game.clx.rom');
	assert.ok(out.endsWith('.rom'));
});

test('buildRomArgs 在 Windows 路径上同样成立', () => {
	// 用 win32 语义构造输入，验证拆分与拼接。
	// 刻意避开 C:\Users\<name> 这种形状：check-public 会把它当成真实的
	// 开发机路径拦下来（那条 grep 是对的，别为它加 allow-public）。
	const input = 'D:\\proj\\sub\\game.clx';
	const args = buildRomArgs(input);

	assert.equal(args.length, 6);
	assert.equal(args[args.length - 2], '-b');
	// 输出仍是 <源文件>.rom
	assert.equal(args[args.length - 1], input + '.rom');
	// -r 只取文件名，不带目录
	assert.equal(args[args.indexOf('-r') + 1], 'game.clx');
	// -d 用反斜杠并带尾分隔符
	assert.equal(args[args.indexOf('-d') + 1], 'D:\\proj\\sub\\');
});
