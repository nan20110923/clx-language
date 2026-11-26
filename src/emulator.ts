'use strict';

/**
 * 模拟器包（emulator bundle）的获取与缓存。
 *
 * 1.0.19 起模拟器不再随插件包分发，改为按需从 GitHub Releases 下载。
 * 这里负责：读清单、判断缓存是否可用、下载、校验 sha256、解压、原子替换。
 *
 * 术语见 GLOSSARY.md：模拟器（emulator）≠ 调试适配器（debug adapter）。
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';

export type EmulatorPlatform = 'darwin' | 'win32';

/** 一个已就绪的模拟器包，路径均为绝对路径。 */
export interface EmulatorLaunch {
	executable: string;
	/** macOS 下需要设置 DYLD_LIBRARY_PATH 的目录 */
	libraryDir?: string;
}

interface EmulatorBundle {
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

interface EmulatorManifest {
	release: string;
	baseUrl: string;
	bundles: EmulatorBundle[];
}

const MANIFEST_PATH = ['res', 'emulator-manifest.json'];
const MARKER_FILE = '.complete';
const DOWNLOAD_CONFIRMED_KEY = 'emulatorDownloadConfirmed';

/** 同一份模拟器包的并发请求共用一次下载 */
const inflight = new Map<string, Promise<EmulatorLaunch>>();

let outputChannel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('CLX Emulator');
	}
	return outputChannel;
}

export function disposeEmulatorOutput(): void {
	outputChannel?.dispose();
	outputChannel = undefined;
}

function log(message: string): void {
	channel().appendLine(message);
}

function manifestPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, ...MANIFEST_PATH);
}

function readManifest(context: vscode.ExtensionContext): EmulatorManifest {
	const file = manifestPath(context);
	let raw: string;
	try {
		raw = fs.readFileSync(file, 'utf8');
	} catch (e) {
		throw new EmulatorError(`Cannot read the emulator manifest at ${file}.`, `${e}`);
	}
	let parsed: EmulatorManifest;
	try {
		parsed = JSON.parse(raw) as EmulatorManifest;
	} catch (e) {
		throw new EmulatorError(`The emulator manifest at ${file} is not valid JSON.`, `${e}`);
	}
	if (!parsed || !Array.isArray(parsed.bundles) || typeof parsed.baseUrl !== 'string' || typeof parsed.release !== 'string') {
		throw new EmulatorError(`The emulator manifest at ${file} is malformed.`);
	}
	return parsed;
}

function findBundle(context: vscode.ExtensionContext, platform: string): EmulatorBundle {
	const manifest = readManifest(context);
	const bundle = manifest.bundles.find(b => b.platform === platform);
	if (!bundle) {
		throw new EmulatorError(`No emulator bundle is available for ${platform}.`);
	}
	return bundle;
}

function cacheRoot(context: vscode.ExtensionContext): string {
	return path.join(context.globalStorageUri.fsPath, 'emulators');
}

function versionKey(bundle: EmulatorBundle): string {
	return `${bundle.product}-${bundle.platform}-${bundle.date}-${bundle.sha256.slice(0, 8)}`;
}

function bundleDir(context: vscode.ExtensionContext, bundle: EmulatorBundle): string {
	return path.join(cacheRoot(context), versionKey(bundle));
}

/** 缓存目录里是否有一份完整可用的包 */
function isReady(dir: string, bundle: EmulatorBundle): boolean {
	if (!fs.existsSync(path.join(dir, MARKER_FILE))) {
		return false;
	}
	const executable = path.join(dir, bundle.executable);
	try {
		return fs.statSync(executable).isFile();
	} catch {
		return false;
	}
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

/**
 * 确保本机有一份可用的模拟器包，返回启动所需的路径。
 * 用户取消下载时返回 null（调用方应静默退出，不要重复报错）。
 */
export async function ensureEmulator(
	context: vscode.ExtensionContext
): Promise<EmulatorLaunch | null> {
	const platform = os.platform();
	const bundle = findBundle(context, platform);
	const dir = bundleDir(context, bundle);

	if (isReady(dir, bundle)) {
		return launchFor(dir, bundle);
	}

	const key = versionKey(bundle);
	let pending = inflight.get(key);
	if (!pending) {
		pending = provision(context, bundle, dir);
		inflight.set(key, pending);
		const clear = () => inflight.delete(key);
		pending.then(clear, clear);
	}
	try {
		return await pending;
	} catch (e) {
		if (e instanceof CancelledError) {
			return null;
		}
		throw e;
	}
}

function launchFor(dir: string, bundle: EmulatorBundle): EmulatorLaunch {
	const executable = path.join(dir, bundle.executable);
	const launch: EmulatorLaunch = { executable };
	if (bundle.libraryPath) {
		launch.libraryDir = path.join(dir, bundle.libraryPath);
	}
	return launch;
}

async function provision(
	context: vscode.ExtensionContext,
	bundle: EmulatorBundle,
	dir: string
): Promise<EmulatorLaunch> {
	const manifest = readManifest(context);
	const url = `${manifest.baseUrl.replace(/\/+$/, '')}/${manifest.release}/${bundle.asset}`;

	if (!(await confirmDownload(context, bundle))) {
		throw new CancelledError();
	}

	const token = new vscode.CancellationTokenSource();
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Downloading the CLX emulator (${bundle.product})`,
			cancellable: true
		},
		async (progress, cancelToken) => {
			const registration = cancelToken.onCancellationRequested(() => token.cancel());
			try {
				return await downloadAndInstall(bundle, url, dir, progress, token.token);
			} finally {
				registration.dispose();
				token.dispose();
			}
		}
	);
}

/** 首次下载前确认一次，之后不再打扰 */
async function confirmDownload(context: vscode.ExtensionContext, bundle: EmulatorBundle): Promise<boolean> {
	if (context.globalState.get<boolean>(DOWNLOAD_CONFIRMED_KEY)) {
		return true;
	}
	const download = 'Download';
	const chooseManually = 'Choose a Local Copy';
	const answer = await vscode.window.showInformationMessage(
		`The CLX emulator (${bundle.product}) is not bundled with this extension and has to be downloaded once (about ${formatBytes(bundle.size)}). Continue?`,
		{ modal: true },
		download,
		chooseManually
	);
	if (answer === download) {
		await context.globalState.update(DOWNLOAD_CONFIRMED_KEY, true);
		return true;
	}
	if (answer === chooseManually) {
		await vscode.commands.executeCommand('workbench.action.openSettings', 'clx-language.debuggerCustomPath');
	}
	return false;
}

async function downloadAndInstall(
	bundle: EmulatorBundle,
	url: string,
	dir: string,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken
): Promise<EmulatorLaunch> {
	const parent = path.dirname(dir);
	fs.mkdirSync(parent, { recursive: true });

	const archive = path.join(parent, `${versionKey(bundle)}.download`);
	const staging = path.join(parent, `${versionKey(bundle)}.partial`);
	removeDir(archive);
	removeDir(staging);

	log(`Downloading ${url}`);

	try {
		await download(url, archive, bundle.sha256, progress, token);
	} catch (e) {
		removeDir(archive);
		if (e instanceof CancelledError) {
			log('Download cancelled.');
			throw e;
		}
		throw new EmulatorError(
			`Failed to download the CLX emulator from ${url}.`,
			`${e}`
		);
	}

	try {
		progress.report({ message: 'Extracting…', increment: 0 });
		extract(archive, staging);
		fs.writeFileSync(
			path.join(staging, MARKER_FILE),
			JSON.stringify({ product: bundle.product, platform: bundle.platform, date: bundle.date, sha256: bundle.sha256 }, null, 2)
		);
	} catch (e) {
		removeDir(staging);
		removeDir(archive);
		throw new EmulatorError('Failed to extract the CLX emulator archive.', `${e}`);
	}
	removeDir(archive);

	// 解压完成后才把临时目录改名成正式目录：中途被杀不会留下“看起来能用”的缓存
	if (fs.existsSync(dir)) {
		removeDir(dir);
	}
	fs.renameSync(staging, dir);
	log(`Installed the CLX emulator into ${dir}`);

	if (!isReady(dir, bundle)) {
		removeDir(dir);
		throw new EmulatorError('The downloaded CLX emulator is incomplete: the executable is missing.');
	}

	return launchFor(dir, bundle);
}

function removeDir(target: string): void {
	try {
		fs.rmSync(target, { recursive: true, force: true });
	} catch (e) {
		log(`Failed to remove ${target}: ${e}`);
	}
}

function download(
	url: string,
	destination: string,
	expectedSha256: string,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken,
	redirects = 0
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (redirects > 5) {
			reject(new Error('Too many redirects.'));
			return;
		}
		if (token.isCancellationRequested) {
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
					download(new URL(location, target).toString(), destination, expectedSha256, progress, token, redirects + 1)
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

				const cancel = token.onCancellationRequested(() => {
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
							progress.report({
								message: `${percent}% of ${formatBytes(total)}`,
								increment: percent - lastPercent
							});
							lastPercent = percent;
						}
					} else {
						progress.report({ message: `${formatBytes(received)} downloaded`, increment: 0 });
					}
				});
				response.on('error', e => {
					cancel.dispose();
					reject(e);
				});
				out.on('error', e => {
					cancel.dispose();
					reject(e);
				});
				out.on('finish', () => {
					cancel.dispose();
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

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}
	return `${bytes} B`;
}

/** 解压 tar.gz；只支持普通文件和目录，拒绝任何越界路径 */
function extract(archive: string, destination: string): void {
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
