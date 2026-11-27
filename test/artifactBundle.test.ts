/**
 * src/artifact/bundle.ts 的通用契约：下载校验、取消、原子安装、解压安全。
 *
 * 这一层被模拟器和语言服务器两个产品共用，所以测试的是"与产品无关"的性质：
 *  1. sha256 不匹配必须失败，且不能留下看起来能用的缓存
 *  2. 取消不是错误，抛 CancelledError 让调用方决定怎么表达
 *  3. 装完了才有 .complete，中途失败不留残留目录
 *  4. 归档里的 .. 和符号链接一律拒绝
 *
 * 模拟器特有的清单/启动规格在 emulatorBundle.test.ts 与 download.test.ts 里。
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { URL } from 'node:url';

import {
	ArtifactError,
	CancelledError,
	MARKER_FILE,
	extract,
	formatBytes,
	installArchive,
	removePath
} from '../src/artifact/bundle';
import type {
	Cancellation,
	HttpTransport,
	HttpTransportRequest,
	HttpTransportResponse,
	InstallRequest,
	ProgressSink
} from '../src/artifact/bundle';

let workDir: string;

before(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clx-artifact-test-'));
});

after(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// tar.gz 构造（与 emulatorBundle.test.ts 同一套路，故意留空校验和）
// ---------------------------------------------------------------------------

interface Entry {
	name: string;
	body?: string;
	typeflag?: string;
	mode?: number;
}

function tarHeader(name: string, opts: { size?: number; typeflag?: string; mode?: number } = {}): Buffer {
	const header = Buffer.alloc(512);
	header.write(name, 0, 100, 'utf8');
	header.write((opts.mode ?? 0o644).toString(8).padStart(7, '0') + '\0', 100, 8, 'utf8');
	header.write((opts.size ?? 0).toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8');
	header.write('0'.repeat(7) + '\0', 108, 8, 'utf8'); // mtime
	header.write('        ', 148, 8, 'utf8'); // 校验和占位（本实现不校验）
	header.write(opts.typeflag ?? '0', 156, 1, 'utf8');
	header.write('ustar\0', 257, 6, 'utf8');
	header.write('00', 263, 2, 'utf8');
	return header;
}

function makeArchive(entries: Entry[]): Buffer {
	const parts: Buffer[] = [];
	for (const entry of entries) {
		const body = Buffer.from(entry.body ?? '', 'utf8');
		parts.push(tarHeader(entry.name, { size: body.length, typeflag: entry.typeflag, mode: entry.mode }));
		parts.push(body);
		const pad = Math.ceil(body.length / 512) * 512 - body.length;
		parts.push(Buffer.alloc(pad));
	}
	parts.push(Buffer.alloc(1024));
	return zlib.gzipSync(Buffer.concat(parts));
}

// ---------------------------------------------------------------------------
// 假传输
// ---------------------------------------------------------------------------

interface FakeResponseSpec {
	statusCode?: number;
	headers?: Record<string, string>;
	chunks?: Buffer[];
	error?: Error;
}

class FakeTransport implements HttpTransport {
	readonly requests: string[] = [];
	constructor(private readonly routes: Map<string, FakeResponseSpec>) {}

	get(url: URL, _options: { headers: Record<string, string> }, onResponse: (r: HttpTransportResponse) => void): HttpTransportRequest {
		this.requests.push(url.toString());
		const spec = this.routes.get(url.pathname) ?? { statusCode: 404 };
		const request = new EventEmitter() as unknown as HttpTransportRequest & EventEmitter;

		setImmediate(() => {
			if (spec.error) {
				request.emit('error', spec.error);
				return;
			}
			const response = new EventEmitter() as unknown as HttpTransportResponse & EventEmitter;
			Object.assign(response, { statusCode: spec.statusCode ?? 200, headers: spec.headers ?? {}, resume: () => undefined });
			Object.assign(response, {
				pipe: (dest: NodeJS.WritableStream) => {
					for (const chunk of spec.chunks ?? []) {
						response.emit('data', chunk);
						dest.write(chunk);
					}
					dest.end();
				}
			});
			onResponse(response);
		});

		return request;
	}
}

function sha256(data: Buffer): string {
	return crypto.createHash('sha256').update(data).digest('hex');
}

function routeFor(payload: Buffer): Map<string, FakeResponseSpec> {
	return new Map<string, FakeResponseSpec>([
		['/pkg.tar.gz', { statusCode: 200, headers: { 'content-length': String(payload.length) }, chunks: [payload] }]
	]);
}

function requestFor(directory: string, payload: Buffer, overrides: Partial<InstallRequest> = {}): InstallRequest {
	return {
		directory,
		url: 'https://example.test/pkg.tar.gz',
		sha256: sha256(payload),
		key: path.basename(directory),
		marker: { product: 'test', sha256: sha256(payload) },
		label: 'the test package',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// 安装流水线
// ---------------------------------------------------------------------------

test('installArchive 成功时解压出内容并写 .complete', async () => {
	const payload = makeArchive([{ name: 'bin/tool', body: '#!/bin/sh\n', mode: 0o755 }]);
	const directory = path.join(workDir, 'install-ok');
	const transport = new FakeTransport(routeFor(payload));

	await installArchive(requestFor(directory, payload), transport);

	const tool = path.join(directory, 'bin', 'tool');
	assert.equal(fs.readFileSync(tool, 'utf8'), '#!/bin/sh\n');
	// 可执行位必须保留：语言服务器和模拟器都靠它启动
	assert.equal(fs.statSync(tool).mode & 0o777, 0o755);

	const marker = JSON.parse(fs.readFileSync(path.join(directory, MARKER_FILE), 'utf8'));
	assert.equal(marker.product, 'test');
});

test('installArchive 不留下下载中间文件', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-clean');
	await installArchive(requestFor(directory, payload), new FakeTransport(routeFor(payload)));

	const siblings = fs.readdirSync(workDir).filter(n => n.startsWith(path.basename(directory)));
	assert.deepEqual(siblings, [path.basename(directory)]);
});

test('sha256 不匹配时失败，且不留下目标目录', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-badsha');
	const request = requestFor(directory, payload, { sha256: 'a'.repeat(64) });

	// 底层错误被包成 ArtifactError，原始原因在 detail 里
	await assert.rejects(
		() => installArchive(request, new FakeTransport(routeFor(payload))),
		(e: unknown) => {
			assert.ok(e instanceof ArtifactError);
			assert.match(String(e.detail), /Checksum mismatch/);
			return true;
		}
	);
	assert.equal(fs.existsSync(directory), false, '损坏的下载不能留下可用的缓存目录');
});

test('下载失败包成 ArtifactError 并带上原始错误', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-neterr');
	const transport = new FakeTransport(new Map([['/pkg.tar.gz', { error: new Error('ECONNRESET') }]]));

	await assert.rejects(
		() => installArchive(requestFor(directory, payload), transport),
		(e: unknown) => {
			assert.ok(e instanceof ArtifactError);
			assert.match(e.message, /Failed to download the test package/);
			assert.match(String(e.detail), /ECONNRESET/);
			return true;
		}
	);
	assert.equal(fs.existsSync(directory), false);
});

test('解压失败时不留下 staging 目录', async () => {
	const broken = Buffer.from('this is not gzip', 'utf8');
	const directory = path.join(workDir, 'install-badextract');
	const transport = new FakeTransport(routeFor(broken));

	await assert.rejects(
		() => installArchive(requestFor(directory, broken), transport),
		/Failed to extract/
	);
	assert.equal(fs.existsSync(directory), false);
	const leftovers = fs.readdirSync(workDir).filter(n => n.startsWith(path.basename(directory)));
	assert.deepEqual(leftovers, [], 'staging 和下载文件都要清掉');
});

test('HTTP 非 200 直接失败', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-404');
	const transport = new FakeTransport(new Map([['/pkg.tar.gz', { statusCode: 500 }]]));

	await assert.rejects(
		() => installArchive(requestFor(directory, payload), transport),
		(e: unknown) => {
			assert.ok(e instanceof ArtifactError);
			assert.match(String(e.detail), /HTTP 500/);
			return true;
		}
	);
});

test('跟随重定向', async () => {
	const payload = makeArchive([{ name: 'moved.txt', body: 'hi' }]);
	const directory = path.join(workDir, 'install-redirect');
	const transport = new FakeTransport(new Map<string, FakeResponseSpec>([
		['/pkg.tar.gz', { statusCode: 302, headers: { location: '/real.tar.gz' } }],
		['/real.tar.gz', { statusCode: 200, headers: { 'content-length': String(payload.length) }, chunks: [payload] }]
	]));

	await installArchive(requestFor(directory, payload), transport);

	assert.equal(fs.readFileSync(path.join(directory, 'moved.txt'), 'utf8'), 'hi');
	assert.deepEqual(transport.requests.slice(1), ['https://example.test/real.tar.gz']);
});

// ---------------------------------------------------------------------------
// 取消
// ---------------------------------------------------------------------------

test('已经取消时立刻抛 CancelledError，不发起请求', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-precancel');
	const transport = new FakeTransport(routeFor(payload));
	const cancellation: Cancellation = {
		isCancellationRequested: true,
		onCancellationRequested: () => ({ dispose: () => undefined })
	};

	await assert.rejects(
		() => installArchive(requestFor(directory, payload, { cancellation }), transport),
		(e: unknown) => e instanceof CancelledError
	);
	assert.deepEqual(transport.requests, [], '取消后不该联网');
});

test('取消监听被注册并在结束后释放', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-cancelhook');
	const transport = new FakeTransport(routeFor(payload));
	let registered = 0;
	let disposed = 0;
	const cancellation: Cancellation = {
		isCancellationRequested: false,
		onCancellationRequested: () => {
			registered++;
			return { dispose: () => { disposed++; } };
		}
	};

	await installArchive(requestFor(directory, payload, { cancellation }), transport);

	// 假传输是同步吐完的，所以这里只能断言"注册过、且都释放了"。
	// 真正的"途中取消"分支由 download.test.ts 用可控时序的传输覆盖。
	assert.ok(registered > 0, '下载期间应注册过取消监听');
	assert.equal(disposed, registered, '结束后必须释放，否则 token 泄漏');
});

// ---------------------------------------------------------------------------
// extract 的安全性质
// ---------------------------------------------------------------------------

function archiveFile(entries: Entry[]): string {
	const file = path.join(workDir, `archive-${Math.random().toString(16).slice(2)}.tar.gz`);
	fs.writeFileSync(file, makeArchive(entries));
	return file;
}

test('extract 拒绝 ../ 路径穿越', () => {
	const archive = archiveFile([{ name: '../escape.txt', body: 'bad' }]);
	assert.throws(() => extract(archive, path.join(workDir, 'out-traversal')), /escapes the target directory/);
});

test('extract 拒绝反斜杠路径穿越（Windows 写法）', () => {
	const archive = archiveFile([{ name: '..\\escape.txt', body: 'bad' }]);
	assert.throws(() => extract(archive, path.join(workDir, 'out-backslash')), /escapes the target directory/);
});

test('extract 把绝对路径降级到目标目录内，而不是写到根', () => {
	const archive = archiveFile([{ name: '/etc/evil.txt', body: 'x' }]);
	const destination = path.join(workDir, 'out-absolute');
	extract(archive, destination);

	// 绝对路径被剥掉前导斜杠，落在目标目录里
	assert.ok(fs.existsSync(path.join(destination, 'etc', 'evil.txt')));
	assert.equal(fs.existsSync('/etc/evil.txt'), false);
});

test('extract 拒绝符号链接条目', () => {
	const archive = archiveFile([{ name: 'link', typeflag: '2' }]);
	assert.throws(() => extract(archive, path.join(workDir, 'out-symlink')), /Unsupported archive entry type/);
});

test('extract 拒绝截断的归档', () => {
	const full = makeArchive([{ name: 'a.txt', body: 'x'.repeat(100) }]);
	const truncated = full.subarray(0, full.length - 60);
	const archive = path.join(workDir, 'archive-truncated.tar.gz');
	fs.writeFileSync(archive, truncated);

	assert.throws(() => extract(archive, path.join(workDir, 'out-truncated')));
});

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

test('formatBytes 覆盖三个量级', () => {
	assert.equal(formatBytes(512), '512 B');
	assert.equal(formatBytes(2048), '2 KB');
	assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});

test('removePath 对不存在的路径不抛错', () => {
	assert.doesNotThrow(() => removePath(path.join(workDir, 'never-existed')));
	const messages: string[] = [];
	assert.doesNotThrow(() => removePath(path.join(workDir, 'never-existed'), m => messages.push(m)));
});

test('ProgressSink 收到进度上报', async () => {
	const payload = makeArchive([{ name: 'a.txt', body: 'x' }]);
	const directory = path.join(workDir, 'install-progress');
	const messages: string[] = [];
	const progress: ProgressSink = { report: v => messages.push(v.message ?? '') };

	await installArchive(requestFor(directory, payload, { progress }), new FakeTransport(routeFor(payload)));

	assert.ok(messages.some(m => m.includes('%')), `应该报过百分比，实际: ${messages.join(', ')}`);
	assert.ok(messages.includes('Extracting…'));
});
