'use strict';

/**
 * 模拟器包（emulator bundle）的获取与安装，不 import vscode。
 *
 * 这一层只做确定性的事：解析清单、下载、校验 sha256、解压、原子替换。
 * 进度、日志、取消都从参数注入，所以可以在普通 Node 进程里直接测 —— 这里是
 * 仓库中唯一处理不可信输入（下载到的归档字节）的代码，必须能测。
 *
 * 需要 VS Code 的那一侧（进度通知、确认弹窗、OutputChannel）在 emulator.ts。
 * 术语见 GLOSSARY.md：模拟器（emulator）≠ 调试适配器（debug adapter）。
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

export type EmulatorPlatform = 'darwin' | 'win32';

/** 一个已就绪的模拟器包，路径均为绝对路径。 */
export interface EmulatorLaunch {
	executable: string;
	/** macOS 下需要设置 DYLD_LIBRARY_PATH 的目录 */
	libraryDir?: string;
}

export interface EmulatorBundle {
	product: string;
	platform: string;
	date: string;
	asset: string;
	/** 归档字节数，用于提示文案和时间估算 */
	size: number;
	sha256: string;
	executable: string;
	libraryPath?: string;
}

export interface EmulatorManifest {
	release: string;
	baseUrl: string;
	bundles: EmulatorBundle[];
}

/**
 * vscode.CancellationToken 的结构子集。
 * 用结构类型而不是 import，这个文件才不需要 vscode，测试传个假对象即可。
 */
export interface Cancellation {
	readonly isCancellationRequested: boolean;
	onCancellationRequested(listener: () => void): { dispose(): void };
}

/** vscode.Progress 的结构子集，同理。 */
export interface ProgressSink {
	report(value: { message?: string; increment?: number }): void;
}

export interface ProvisionRequest {
	manifest: EmulatorManifest;
	bundle: EmulatorBundle;
	/** 最终的安装目录，绝对路径 */
	directory: string;
	log?: (message: string) => void;
	progress?: ProgressSink;
	cancellation?: Cancellation;
}

/** 本地缓存里一份包的位置。launch 为 null 表示还需要下载。 */
export interface BundleInstall {
	directory: string;
	launch: EmulatorLaunch | null;
}

export class EmulatorError extends Error {
	constructor(message: string, public readonly detail?: string) {
		super(message);
		this.name = 'EmulatorError';
	}
}

class CancelledError extends Error {
	constructor() {
		super('cancelled');
		this.name = 'CancelledError';
	}
}

const MARKER_FILE = '.complete';

/**
 * 解析并校验清单。清单坏了没有可用的降级路径，所以直接抛：
 * 调用方唯一正确的反应是告诉用户。
 */
export function parseManifest(raw: string, source = 'The emulator manifest'): EmulatorManifest {
	let parsed: EmulatorManifest;
	try {
		parsed = JSON.parse(raw) as EmulatorManifest;
	} catch (e) {
		throw new EmulatorError(`${source} is not valid JSON.`, `${e}`);
	}
	if (!parsed || !Array.isArray(parsed.bundles) || typeof parsed.baseUrl !== 'string' || typeof parsed.release !== 'string') {
		throw new EmulatorError(`${source} is malformed.`);
	}
	return parsed;
}

export function findBundle(manifest: EmulatorManifest, platform: string): EmulatorBundle {
	const bundle = manifest.bundles.find(b => b.platform === platform);
	if (!bundle) {
		throw new EmulatorError(`No emulator bundle is available for ${platform}.`);
	}
	return bundle;
}

/** 本地缓存里该包的位置，以及它是否已经可用。 */
export function locateBundle(cacheRoot: string, bundle: EmulatorBundle): BundleInstall {
	const directory = path.join(cacheRoot, versionKey(bundle));
	return {
		directory,
		launch: isReady(directory, bundle) ? launchFor(directory, bundle) : null
	};
}

/**
 * 让 request.directory 里有一份可用的包：下载、校验、解压、原子替换。
 * 用户取消时返回 null —— 这不是错误，调用方应静默退出。
 */
export async function provision(request: ProvisionRequest): Promise<EmulatorLaunch | null> {
	const url = assetUrl(request.manifest, request.bundle);
	try {
		return await install(request, url);
	} catch (e) {
		if (e instanceof CancelledError) {
			request.log?.('Download cancelled.');
			return null;
		}
		throw e;
	}
}

function assetUrl(manifest: EmulatorManifest, bundle: EmulatorBundle): string {
	return `${manifest.baseUrl.replace(/\/+$/, '')}/${manifest.release}/${bundle.asset}`;
}

function versionKey(bundle: EmulatorBundle): string {
	return `${bundle.product}-${bundle.platform}-${bundle.date}-${bundle.sha256.slice(0, 8)}`;
}

/** 缓存目录里是否有一份完整可用的包 */
function isReady(directory: string, bundle: EmulatorBundle): boolean {
	if (!fs.existsSync(path.join(directory, MARKER_FILE))) {
		return false;
	}
	try {
		return fs.statSync(path.join(directory, bundle.executable)).isFile();
	} catch {
		return false;
	}
}

function launchFor(directory: string, bundle: EmulatorBundle): EmulatorLaunch {
	const launch: EmulatorLaunch = { executable: path.join(directory, bundle.executable) };
	if (bundle.libraryPath) {
		launch.libraryDir = path.join(directory, bundle.libraryPath);
	}
	return launch;
}

async function install(request: ProvisionRequest, url: string): Promise<EmulatorLaunch> {
	const { bundle, directory, log, progress, cancellation } = request;
	const parent = path.dirname(directory);
	fs.mkdirSync(parent, { recursive: true });

	const archive = path.join(parent, `${versionKey(bundle)}.download`);
	const staging = path.join(parent, `${versionKey(bundle)}.partial`);
	removeDir(archive, log);
	removeDir(staging, log);

	log?.(`Downloading ${url}`);

	try {
		await download(url, archive, bundle.sha256, progress, cancellation);
	} catch (e) {
		removeDir(archive, log);
		if (e instanceof CancelledError) {
			throw e;
		}
		throw new EmulatorError(`Failed to download the CLX emulator from ${url}.`, `${e}`);
	}

	try {
		progress?.report({ message: 'Extracting…', increment: 0 });
		extract(archive, staging);
		fs.writeFileSync(
			path.join(staging, MARKER_FILE),
			JSON.stringify({ product: bundle.product, platform: bundle.platform, date: bundle.date, sha256: bundle.sha256 }, null, 2)
		);
	} catch (e) {
		removeDir(staging, log);
		removeDir(archive, log);
		throw new EmulatorError('Failed to extract the CLX emulator archive.', `${e}`);
	}
	removeDir(archive, log);

	// 解压完成后才把临时目录改名成正式目录：中途被杀不会留下“看起来能用”的缓存
	if (fs.existsSync(directory)) {
		removeDir(directory, log);
	}
	fs.renameSync(staging, directory);
	log?.(`Installed the CLX emulator into ${directory}`);

	if (!isReady(directory, bundle)) {
		removeDir(directory, log);
		throw new EmulatorError('The downloaded CLX emulator is incomplete: the executable is missing.');
	}

	return launchFor(directory, bundle);
}

function removeDir(target: string, log?: (message: string) => void): void {
	try {
		fs.rmSync(target, { recursive: true, force: true });
	} catch (e) {
		log?.(`Failed to remove ${target}: ${e}`);
	}
}

function download(
	url: string,
	destination: string,
	expectedSha256: string,
	progress: ProgressSink | undefined,
	cancellation: Cancellation | undefined,
	redirects = 0
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (redirects > 5) {
			reject(new Error('Too many redirects.'));
			return;
		}
		if (cancellation?.isCancellationRequested) {
			reject(new CancelledError());
			return;
		}

		const target = new URL(url);
		const transport = target.protocol === 'http:' ? http : https;
		const request = transport.get(
			target,
			{ headers: { 'User-Agent': 'vscode-clx-language', Accept: 'application/octet-stream' } },
			response => {
				const status = response.statusCode || 0;
				if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
					const location = response.headers.location;
					response.resume();
					if (!location) {
						reject(new Error(`Redirect ${status} without a Location header.`));
						return;
					}
					download(new URL(location, target).toString(), destination, expectedSha256, progress, cancellation, redirects + 1)
						.then(resolve, reject);
					return;
				}
				if (status !== 200) {
					response.resume();
					reject(new Error(`Server responded with HTTP ${status}.`));
					return;
				}

				const total = Number(response.headers['content-length'] || 0);
				let received = 0;
				let lastPercent = 0;
				const hash = crypto.createHash('sha256');
				const out = fs.createWriteStream(destination);

				const cancel = cancellation?.onCancellationRequested(() => {
					request.destroy();
					out.destroy();
					reject(new CancelledError());
				});

				response.on('data', (chunk: Buffer) => {
					received += chunk.length;
					hash.update(chunk);
					if (total > 0) {
						const percent = Math.floor((received / total) * 100);
						if (percent > lastPercent) {
							progress?.report({
								message: `${percent}% of ${formatBytes(total)}`,
								increment: percent - lastPercent
							});
							lastPercent = percent;
						}
					} else {
						progress?.report({ message: `${formatBytes(received)} downloaded`, increment: 0 });
					}
				});
				response.on('error', e => {
					cancel?.dispose();
					reject(e);
				});
				out.on('error', e => {
					cancel?.dispose();
					reject(e);
				});
				out.on('finish', () => {
					cancel?.dispose();
					const actual = hash.digest('hex');
					if (actual !== expectedSha256) {
						reject(new Error(`Checksum mismatch: expected ${expectedSha256}, got ${actual}.`));
						return;
					}
					resolve();
				});
				response.pipe(out);
			}
		);
		request.on('error', e => reject(e));
	});
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}
	return `${bytes} B`;
}

/**
 * 解压 tar.gz；只支持普通文件和目录，拒绝任何越界路径。
 * 归档字节来自网络，这里是唯一需要防路径穿越的地方。
 */
export function extract(archive: string, destination: string): void {
	const tar = zlib.gunzipSync(fs.readFileSync(archive));
	fs.mkdirSync(destination, { recursive: true });

	let offset = 0;
	let pendingPath: string | undefined;
	let pendingSize: number | undefined;

	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (isZeroBlock(header)) {
			break;
		}
		offset += 512;

		const name = readString(header, 0, 100);
		const mode = parseInt(readString(header, 100, 8).trim() || '0', 8);
		const sizeField = readString(header, 124, 12).trim();
		const size = pendingSize ?? (sizeField ? parseInt(sizeField, 8) : 0);
		const typeflag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
		const prefix = readString(header, 345, 155);
		const entryName = pendingPath ?? (prefix ? `${prefix}/${name}` : name);
		pendingPath = undefined;
		pendingSize = undefined;

		const dataStart = offset;
		const dataEnd = dataStart + size;
		if (dataEnd > tar.length) {
			throw new Error(`Truncated archive while reading ${entryName}.`);
		}
		const data = tar.subarray(dataStart, dataEnd);
		offset = dataStart + Math.ceil(size / 512) * 512;

		if (typeflag === 'x' || typeflag === 'X' || typeflag === 'g') {
			// pax：下一个条目的路径/长度可能被覆盖
			const records = parsePax(data.toString('utf8'));
			if (records.path) {
				pendingPath = records.path;
			}
			if (records.size !== undefined) {
				pendingSize = records.size;
			}
			continue;
		}
		if (typeflag === 'L') {
			// GNU longname
			pendingPath = cString(data.toString('utf8'));
			continue;
		}
		if (typeflag === 'K') {
			continue;
		}
		if (typeflag === '5') {
			fs.mkdirSync(safeJoin(destination, entryName), { recursive: true });
			continue;
		}
		if (typeflag !== '0' && typeflag !== '7') {
			throw new Error(`Unsupported archive entry type "${typeflag}" for ${entryName}.`);
		}

		const target = safeJoin(destination, entryName);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, data);
		// 可执行位必须保留，否则 macOS 上模拟器起不来
		fs.chmodSync(target, mode & 0o777 || 0o644);
	}
}

function isZeroBlock(block: Buffer): boolean {
	for (let i = 0; i < block.length; i++) {
		if (block[i] !== 0) {
			return false;
		}
	}
	return true;
}

function readString(buffer: Buffer, start: number, length: number): string {
	const slice = buffer.subarray(start, start + length);
	const end = slice.indexOf(0);
	return (end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
}

function cString(value: string): string {
	const end = value.indexOf('\0');
	return end === -1 ? value : value.slice(0, end);
}

function parsePax(data: string): { path?: string; size?: number } {
	const result: { path?: string; size?: number } = {};
	let index = 0;
	while (index < data.length) {
		const space = data.indexOf(' ', index);
		if (space === -1) {
			break;
		}
		const length = parseInt(data.slice(index, space), 10);
		if (!length || length <= 0) {
			break;
		}
		const record = data.slice(space + 1, index + length - 1);
		const equals = record.indexOf('=');
		if (equals !== -1) {
			const key = record.slice(0, equals);
			const value = record.slice(equals + 1);
			if (key === 'path') {
				result.path = value;
			} else if (key === 'size') {
				const parsed = parseInt(value, 10);
				if (!isNaN(parsed)) {
					result.size = parsed;
				}
			}
		}
		index += length;
	}
	return result;
}

function safeJoin(root: string, relative: string): string {
	const normalized = path.posix.normalize(relative.replace(/\\/g, '/')).replace(/^\/+/, '');
	if (normalized.startsWith('..')) {
		throw new Error(`Archive entry escapes the target directory: ${relative}`);
	}
	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(resolvedRoot, normalized);
	if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
		throw new Error(`Archive entry escapes the target directory: ${relative}`);
	}
	return resolved;
}
