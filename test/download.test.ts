/**
 * emulatorBundle 的下载路径：重定向、sha256、取消、进度、以及 provision 的原子安装。
 *
 * 这条路径此前完全没有测试，因为它直接调 `https.get`。现在 HTTP 传输是注入的
 * （见 HttpTransport），所以可以在普通 Node 里跑完每个分支 —— 不需要联网。
 *
 * 最要紧的是两条安全性质：
 *   1. sha256 不匹配时必须失败，且不能留下"看起来能用"的缓存
 *   2. 用户取消不是错误，调用方应静默退出
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
	EmulatorError,
	provision
} from '../src/emulator/emulatorBundle';
import type {
	Cancellation,
	EmulatorBundle,
	EmulatorManifest,
	HttpTransport,
	HttpTransportRequest,
	HttpTransportResponse,
	ProvisionRequest
} from '../src/emulator/emulatorBundle';

let workDir: string;

before(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clx-download-test-'));
});

after(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 假传输
// ---------------------------------------------------------------------------

interface FakeResponseSpec {
	statusCode?: number;
	headers?: Record<string, string>;
	/** 按顺序吐出的正文分片 */
	chunks?: Buffer[];
	/** 在 body 之前/替代 body 触发错误 */
	error?: Error;
}

/**
 * 按 URL 路径返回预设应答的假 HTTP 传输。
 * 记录每次请求的 URL，便于断言重定向链。
 */
class FakeTransport implements HttpTransport {
	readonly requests: string[] = [];
	private readonly routes: Map<string, FakeResponseSpec>;

	constructor(routes: Map<string, FakeResponseSpec>) {
		this.routes = routes;
	}

	get(url: URL, _options: { headers: Record<string, string> }, onResponse: (r: HttpTransportResponse) => void): HttpTransportRequest {
		this.requests.push(url.toString());
		const spec = this.routes.get(url.pathname) ?? { statusCode: 404 };
		const request = new EventEmitter() as unknown as HttpTransportRequest & EventEmitter;

		// 异步送出应答，避免在 get() 返回之前就回调
		setImmediate(() => {
			if (spec.error) {
				request.emit('error', spec.error);
				return;
			}
			const response = new EventEmitter() as unknown as HttpTransportResponse & EventEmitter;
			(response as unknown as { statusCode?: number }).statusCode = spec.statusCode ?? 200;
			(response as unknown as { headers: Record<string, string> }).headers = spec.headers ?? {};
			(response as unknown as { resume(): void }).resume = () => undefined;
			// pipe：把 chunks 当作 data 事件推给下游可写流，再 end 它
			(response as unknown as { pipe(dest: NodeJS.WritableStream): void }).pipe = dest => {
				for (const chunk of spec.chunks ?? []) {
					response.emit('data', chunk);
					dest.write(chunk);
				}
				dest.end();
			};
			onResponse(response);
		});

		return request;
	}
}

function sha256(data: Buffer): string {
	return crypto.createHash('sha256').update(data).digest('hex');
}

function bundleOf(sha: string, size: number): EmulatorBundle {
	return {
		product: 'ColoPlay',
		platform: 'darwin',
		date: '2026-11-19',
		asset: 'emu.tar.gz',
		size,
		sha256: sha,
		executable: 'Contents/MacOS/coloXtool'
	};
}

/**
 * 造清单。注意 `assetUrl` 会拼成 <baseUrl>/<release>/<asset>，
 * 所以 baseUrl 是目录，不是文件 URL。
 */
function manifestFor(baseUrl: string): EmulatorManifest {
	return {
		release: RELEASE,
		baseUrl,
		bundles: []
	};
}

/** 与 manifestFor 里的 release 一致。 */
const RELEASE = 'emu-test';

/**
 * 把「baseUrl 里的目录 + 磁盘文件名」映射成假传输看到的 pathname。
 *
 * assetUrl 拼的是 `<baseUrl>/<release>/<asset>`，所以 release 在 baseUrl **之后**：
 *   baseUrl https://example.test/old  +  release emu-test  +  asset emu.tar.gz
 *   -> /old/emu-test/emu.tar.gz
 */
function routePath(basePath: string, asset = 'emu.tar.gz'): string {
	return `${basePath}/${RELEASE}/${asset}`;
}

/** 造一个真的能被 extract 解开的 tar.gz（含一个可执行文件）。 */
function makeArchive(): Buffer {
	const header = Buffer.alloc(512, 0);
	header.write('Contents/MacOS/coloXtool', 0, 100, 'utf8');
	header.write('0000755', 100, 8, 'utf8');
	header.write('0000000', 108, 8, 'utf8');
	header.write('0000000', 116, 8, 'utf8');
	const content = Buffer.from('fake binary', 'utf8');
	header.write(content.length.toString(8).padStart(11, '0'), 124, 12, 'utf8');
	header.write('00000000000', 136, 12, 'utf8');
	header.write('        ', 148, 8, 'utf8');
	header.write('0', 156, 1, 'utf8');
	header.write('ustar\0', 257, 6, 'utf8');

	const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512, 0);
	content.copy(padded);

	return zlib.gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024, 0)]));
}

/** progress 记录器。 */
function recordingProgress(): { messages: string[]; report(v: { message?: string }): void } {
	const messages: string[] = [];
	return {
		messages,
		report(v) {
			if (v.message) {
				messages.push(v.message);
			}
		}
	};
}

/** 可从外部触发的取消。 */
function makeCancellation(): Cancellation & { cancel(): void } {
	const listeners: (() => void)[] = [];
	let requested = false;
	return {
		get isCancellationRequested() {
			return requested;
		},
		onCancellationRequested(listener) {
			listeners.push(listener);
			return { dispose() { /* noop */ } };
		},
		cancel() {
			requested = true;
			for (const l of listeners) {
				l();
			}
		}
	};
}

function provisionRequest(baseUrl: string, bundle: EmulatorBundle): ProvisionRequest & { directory: string } {
	return {
		manifest: manifestFor(baseUrl),
		bundle,
		directory: path.join(workDir, `install-${Math.random().toString(36).slice(2)}`, 'emulator'),
		log: () => undefined
	};
}

// ---------------------------------------------------------------------------
// 重定向
// ---------------------------------------------------------------------------

test('跟随重定向并在最终 URL 上完成下载', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath('/old'), { statusCode: 302, headers: { location: routePath('/new') } }],
		[routePath('/new'), { statusCode: 200, chunks: [payload] }]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);
	const req = provisionRequest('https://example.test/old', bundle);

	const launch = await provision(req, transport);

	assert.ok(launch, 'should install');
	assert.deepEqual(transport.requests, [
		`https://example.test/old/${RELEASE}/emu.tar.gz`,
		`https://example.test/new/${RELEASE}/emu.tar.gz`
	]);
	assert.ok(fs.existsSync(launch.executable), 'executable should exist after install');
});

test('Location 可以是绝对 URL，跳到另一个 baseUrl', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath('/a'), { statusCode: 301, headers: { location: `https://example.test/b/${RELEASE}/emu.tar.gz` } }],
		[routePath('/b'), { statusCode: 200, chunks: [payload] }]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);

	await provision(provisionRequest('https://example.test/a', bundle), transport);

	assert.deepEqual(transport.requests, [
		`https://example.test/a/${RELEASE}/emu.tar.gz`,
		`https://example.test/b/${RELEASE}/emu.tar.gz`
	]);
});

test('重定向次数超限时失败', async () => {
	// 每次重定向都指向下一个绝对 URL，永远到不了 200
	const routes = new Map<string, { statusCode?: number; headers?: Record<string, string> }>();
	for (let i = 0; i < 10; i++) {
		routes.set(`/hop${i}/emu-test/emu.tar.gz`, {
			statusCode: 302,
			headers: { location: `https://example.test/hop${i + 1}/emu-test/emu.tar.gz` }
		});
	}
	const transport = new FakeTransport(routes as never);
	const bundle = bundleOf('0'.repeat(64), 1);
	const req = provisionRequest('https://example.test/hop0', bundle);

	await assert.rejects(provision(req, transport), (e: unknown) => {
		assert.ok(e instanceof EmulatorError);
		assert.match((e as EmulatorError).detail ?? '', /Too many redirects/);
		return true;
	});
});

test('重定向缺 Location 时报错', async () => {
	const transport = new FakeTransport(new Map([
		[routePath('/bad'), { statusCode: 302 }]
	]));
	const bundle = bundleOf('0'.repeat(64), 1);

	await assert.rejects(
		provision(provisionRequest('https://example.test/bad', bundle), transport),
		(e: unknown) => {
			assert.ok(e instanceof EmulatorError);
			assert.match((e as EmulatorError).detail ?? '', /Redirect 302 without a Location/);
			return true;
		}
	);
});

// ---------------------------------------------------------------------------
// HTTP 状态
// ---------------------------------------------------------------------------

test('非 200 应答失败并把状态码带进消息', async () => {
	const transport = new FakeTransport(new Map([
		[routePath('/gone'), { statusCode: 404 }]
	]));
	const bundle = bundleOf('0'.repeat(64), 1);

	await assert.rejects(
		provision(provisionRequest('https://example.test/gone', bundle), transport),
		(e: unknown) => {
			assert.ok(e instanceof EmulatorError);
			assert.match((e as EmulatorError).detail ?? '', /HTTP 404/);
			return true;
		}
	);
});

test('传输层错误被包成 EmulatorError', async () => {
	const transport = new FakeTransport(new Map([
		[routePath('/flaky'), { error: new Error('ECONNRESET') }]
	]));
	const bundle = bundleOf('0'.repeat(64), 1);

	await assert.rejects(
		provision(provisionRequest('https://example.test/flaky', bundle), transport),
		(e: unknown) => {
			assert.ok(e instanceof EmulatorError);
			assert.match((e as EmulatorError).detail ?? '', /ECONNRESET/);
			return true;
		}
	);
});

// ---------------------------------------------------------------------------
// sha256：最要紧的一条
// ---------------------------------------------------------------------------

test('sha256 不匹配时失败，且不留下可用的缓存目录', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath(''), { statusCode: 200, chunks: [payload] }]
	]));
	// 故意给错的摘要
	const bundle = bundleOf('f'.repeat(64), payload.length);
	const req = provisionRequest('https://example.test', bundle);

	await assert.rejects(provision(req, transport), (e: unknown) => {
		assert.ok(e instanceof EmulatorError);
		assert.match((e as EmulatorError).detail ?? '', /Checksum mismatch/);
		return true;
	});

	// 关键：不存在"看起来装好了"的目录
	assert.equal(fs.existsSync(req.directory), false, 'no install dir after a checksum failure');
	// 临时下载文件也不该留着
	const parent = path.dirname(req.directory);
	if (fs.existsSync(parent)) {
		const leftovers = fs.readdirSync(parent).filter(f => f.endsWith('.download') || f.endsWith('.partial'));
		assert.deepEqual(leftovers, [], 'no partial artifacts left behind');
	}
});

test('sha256 匹配时安装成功并写入 .complete 标记', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath(''), { statusCode: 200, chunks: [payload] }]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);
	const req = provisionRequest('https://example.test', bundle);

	const launch = await provision(req, transport);

	assert.ok(launch);
	assert.ok(fs.existsSync(path.join(req.directory, '.complete')), 'marker should exist');
	const marker = JSON.parse(fs.readFileSync(path.join(req.directory, '.complete'), 'utf8'));
	assert.equal(marker.sha256, bundle.sha256, 'marker records the verified digest');
});

// ---------------------------------------------------------------------------
// 取消
// ---------------------------------------------------------------------------

test('已取消的请求在下载开始前就返回 null（不是错误）', async () => {
	const transport = new FakeTransport(new Map([
		[routePath(''), { statusCode: 200, chunks: [makeArchive()] }]
	]));
	const bundle = bundleOf('0'.repeat(64), 1);
	const cancellation = makeCancellation();
	cancellation.cancel();

	const req = { ...provisionRequest('https://example.test', bundle), cancellation };
	const result = await provision(req, transport);

	assert.equal(result, null, 'cancellation is not an error; caller stays silent');
	assert.deepEqual(transport.requests, [], 'no request should be issued');
});

test('下载中途取消返回 null，而不是抛错', async () => {
	const payload = makeArchive();
	// 先建好组合的 transport：第一个 chunk 之后触发取消
	const transport: HttpTransport = {
		get(url, options, onResponse) {
			const request = new EventEmitter() as unknown as HttpTransportRequest & EventEmitter;
			setImmediate(() => {
				const response = new EventEmitter() as unknown as HttpTransportResponse & EventEmitter;
				(response as unknown as { statusCode: number }).statusCode = 200;
				(response as unknown as { headers: Record<string, string> }).headers = {
					'content-length': String(payload.length)
				};
				(response as unknown as { resume(): void }).resume = () => undefined;
				(response as unknown as { pipe(dest: NodeJS.WritableStream): void }).pipe = dest => {
					// 只写一半就停住，然后由外部取消
					response.emit('data', payload.subarray(0, 100));
					dest.write(payload.subarray(0, 100));
					cancellation.cancel();
				};
				onResponse(response);
			});
			request.destroy = () => undefined;
			return request;
		}
	};
	const bundle = bundleOf(sha256(payload), payload.length);
	const cancellation = makeCancellation();
	const req = { ...provisionRequest('https://example.test', bundle), cancellation };

	const result = await Promise.race([
		provision(req, transport),
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error('provision hung on cancel')), 2_000))
	]);

	assert.equal(result, null, 'mid-download cancel resolves to null');
});

// ---------------------------------------------------------------------------
// 进度
// ---------------------------------------------------------------------------

test('有 content-length 时按百分比上报', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath(''), {
			statusCode: 200,
			headers: { 'content-length': String(payload.length) },
			chunks: [payload]
		}]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);
	const progress = recordingProgress();
	await provision({ ...provisionRequest('https://example.test', bundle), progress }, transport);

	assert.ok(
		progress.messages.some(m => /% of .* (B|KB|MB)/.test(m)),
		`expected a percentage message, got: ${JSON.stringify(progress.messages)}`
	);
	assert.ok(
		progress.messages.some(m => m.startsWith('Extracting')),
		'extraction is reported too'
	);
});

test('没有 content-length 时上报已下载量', async () => {
	const payload = makeArchive();
	const transport = new FakeTransport(new Map([
		[routePath(''), { statusCode: 200, chunks: [payload] }]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);
	const progress = recordingProgress();
	await provision({ ...provisionRequest('https://example.test', bundle), progress }, transport);

	assert.ok(
		progress.messages.some(m => /downloaded/.test(m)),
		`expected a downloaded-bytes message, got: ${JSON.stringify(progress.messages)}`
	);
});

// ---------------------------------------------------------------------------
// 安装的原子性
// ---------------------------------------------------------------------------

test('重复安装同一份包会覆盖旧目录', async () => {
	const payload = makeArchive();
	const routes = new Map([[routePath(''), { statusCode: 200, chunks: [payload] }]]);
	const bundle = bundleOf(sha256(payload), payload.length);

	const req = provisionRequest('https://example.test', bundle);
	const first = await provision(req, new FakeTransport(routes));
	assert.ok(first);

	// 手动破坏一下，确认第二次会重装
	fs.writeFileSync(path.join(req.directory, bundle.executable), 'corrupted');

	const second = await provision(req, new FakeTransport(routes));
	assert.ok(second);
	assert.equal(
		fs.readFileSync(second.executable, 'utf8'),
		'fake binary',
		'second install should replace the corrupted file'
	);
});

test('归档里缺可执行文件时失败并清理安装目录', async () => {
	// 一个不含 executable 的归档：解压成功但 isReady 为 false
	const header = Buffer.alloc(512, 0);
	header.write('some/other/file.txt', 0, 100, 'utf8');
	header.write('0000644', 100, 8, 'utf8');
	header.write('0000000', 108, 8, 'utf8');
	header.write('0000000', 116, 8, 'utf8');
	header.write('00000000000', 124, 12, 'utf8');
	header.write('00000000000', 136, 12, 'utf8');
	header.write('        ', 148, 8, 'utf8');
	header.write('0', 156, 1, 'utf8');
	header.write('ustar\0', 257, 6, 'utf8');
	const payload = zlib.gzipSync(Buffer.concat([header, Buffer.alloc(1024, 0)]));

	const transport = new FakeTransport(new Map([
		[routePath(''), { statusCode: 200, chunks: [payload] }]
	]));
	const bundle = bundleOf(sha256(payload), payload.length);
	const req = provisionRequest('https://example.test', bundle);

	await assert.rejects(provision(req, transport), (e: unknown) => {
		assert.ok(e instanceof EmulatorError);
		assert.match((e as EmulatorError).message, /incomplete/);
		return true;
	});
	assert.equal(fs.existsSync(req.directory), false, 'incomplete install must be cleaned up');
});
