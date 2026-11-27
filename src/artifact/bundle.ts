'use strict';

/**
 * 可下载产物包（artifact bundle）的通用获取与安装，不 import vscode。
 *
 * 这一层只做确定性的事：下载、校验 sha256、解压 tar.gz、原子替换目录。
 * 它不关心下的是模拟器还是语言服务器 —— 那是调用方的事。
 *
 * 进度、日志、取消都从参数注入，所以可以在普通 Node 进程里直接测：这里是
 * 仓库中唯一处理不可信输入（下载到的归档字节）的代码，必须能测。
 *
 * 需要 VS Code 的那一侧（进度通知、确认弹窗、OutputChannel）在各自的
 * adapter 里，比如 src/emulator/emulator.ts。
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

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

/**
 * 下载用的 HTTP 传输。是 `node:http` / `node:https` 的 `get` 的结构子集。
 *
 * 单独抽出来是为了可测：`download()` 里的重定向、sha256 校验、取消、
 * 进度上报都是真实逻辑，但它们此前只能靠真的联网验证。注入一个假传输就能
 * 在普通 Node 里跑完整分支。
 */
export interface HttpTransport {
	get(
		url: URL,
		options: { headers: Record<string, string> },
		onResponse: (response: HttpTransportResponse) => void
	): HttpTransportRequest;
}

/** 应答对象用到的部分（IncomingMessage 的子集）。 */
export interface HttpTransportResponse {
	statusCode?: number;
	headers: Record<string, string | string[] | undefined>;
	on(event: 'data', listener: (chunk: Buffer) => void): void;
	on(event: 'error', listener: (error: Error) => void): void;
	resume(): void;
	pipe(destination: NodeJS.WritableStream): void;
}

/** 请求对象用到的部分（ClientRequest 的子集）。 */
export interface HttpTransportRequest {
	on(event: 'error', listener: (error: Error) => void): void;
	destroy(): void;
}

/** 默认传输：按 URL 协议选 http 或 https。 */
export const defaultTransport: HttpTransport = {
	get(url, options, onResponse) {
		const transport = url.protocol === 'http:' ? http : https;
		return transport.get(url, options, onResponse as never) as unknown as HttpTransportRequest;
	}
};

/** 产物包通用的错误类型。各产品可以派生自己的子类。 */
export class ArtifactError extends Error {
	constructor(message: string, public readonly detail?: string) {
		super(message);
		this.name = 'ArtifactError';
	}
}

/** 用户取消下载。内部用，转成 null 返回值对外表达。 */
export class CancelledError extends Error {
	constructor() {
		super('cancelled');
		this.name = 'CancelledError';
	}
}

/** 缓存目录里的完成标记文件名。内容由调用方决定。 */
export const MARKER_FILE = '.complete';

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}
	return `${bytes} B`;
}

/** 删除目录或文件，失败只记日志不抛。清理是尽力而为。 */
export function removePath(target: string, log?: (message: string) => void): void {
	try {
		fs.rmSync(target, { recursive: true, force: true });
	} catch (e) {
		log?.(`Failed to remove ${target}: ${e}`);
	}
}

export interface InstallRequest {
	/** 最终安装目录，绝对路径 */
	directory: string;
	/** 归档下载地址 */
	url: string;
	/** 归档的 sha256，下载完校验 */
	sha256: string;
	/**
	 * 缓存条目的身份键，用于给同级的临时文件命名。
	 * 必须与 directory 的 basename 一致，临时文件才会和目录在同一分区。
	 */
	key: string;
	/** 写进 .complete 的内容，便于排查这份缓存是什么 */
	marker: Record<string, unknown>;
	/** 失败信息里用的产物名，比如 "CLX emulator" */
	label: string;
	log?: (message: string) => void;
	progress?: ProgressSink;
	cancellation?: Cancellation;
}

/**
 * 下载、校验、解压、安装到 request.directory。
 *
 * 用户取消时抛 CancelledError —— 由调用方决定转成 null 还是别的。
 * 其它失败抛 ArtifactError，message 已经足够给用户看。
 */
export async function installArchive(
	request: InstallRequest,
	transport: HttpTransport = defaultTransport
): Promise<void> {
	const { directory, url, sha256, key, marker, label, log, progress, cancellation } = request;
	const parent = path.dirname(directory);
	fs.mkdirSync(parent, { recursive: true });

	const archive = path.join(parent, `${key}.download`);
	const staging = path.join(parent, `${key}.partial`);
	removePath(archive, log);
	removePath(staging, log);

	log?.(`Downloading ${url}`);

	try {
		await download(url, archive, sha256, progress, cancellation, 0, transport);
	} catch (e) {
		removePath(archive, log);
		if (e instanceof CancelledError) {
			throw e;
		}
		throw new ArtifactError(`Failed to download ${label} from ${url}.`, `${e}`);
	}

	try {
		progress?.report({ message: 'Extracting…', increment: 0 });
		extract(archive, staging);
		fs.writeFileSync(path.join(staging, MARKER_FILE), JSON.stringify(marker, null, 2));
	} catch (e) {
		removePath(staging, log);
		removePath(archive, log);
		throw new ArtifactError(`Failed to extract the ${label} archive.`, `${e}`);
	}
	removePath(archive, log);

	// 解压完成后才把临时目录改名成正式目录：中途被杀不会留下"看起来能用"的缓存
	if (fs.existsSync(directory)) {
		removePath(directory, log);
	}
	fs.renameSync(staging, directory);
	log?.(`Installed ${label} into ${directory}`);
}

/**
 * 下载到 destination，边下边算 sha256，结束后比对。
 * 取消时 reject CancelledError；其它错误原样 reject。
 */
export function download(
	url: string,
	destination: string,
	expectedSha256: string,
	progress: ProgressSink | undefined,
	cancellation: Cancellation | undefined,
	redirects = 0,
	transport: HttpTransport = defaultTransport
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
					download(new URL(location, target).toString(), destination, expectedSha256, progress, cancellation, redirects + 1, transport)
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
		// 可执行位必须保留，否则 macOS 上模拟器和语言服务器都起不来
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
