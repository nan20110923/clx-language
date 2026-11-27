'use strict';

/**
 * LuaLS 语言服务器包的清单与安装，不 import vscode。
 *
 * 下载、校验、解压、原子替换都在 src/artifact/bundle.ts；这里只放 LuaLS
 * 自己的东西：清单形状（带 arch）、缓存键、就绪判定、启动规格。
 *
 * 与模拟器的一处关键差异：**必须带 arch**。LuaLS 按 darwin-arm64 /
 * darwin-x64 / win32-x64 分别发布，一个平台不止一份包。模拟器只有 x86_64
 * 二进制（macOS 靠 Rosetta），所以它的清单刻意不带 arch —— 那条规则不适用于这里。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	ArtifactError,
	CancelledError,
	MARKER_FILE,
	installArchive,
	removePath
} from '../artifact/bundle';
import type { Cancellation, HttpTransport, ProgressSink } from '../artifact/bundle';

/** 一个可下载的 LuaLS 包。 */
export interface LualsBundle {
	product: string;
	platform: string;
	/** 'arm64' | 'x64'。必须带：LuaLS 按 arch 分发 */
	arch: string;
	/** 上游 release tag，例如 '3.19.2' */
	version: string;
	asset: string;
	/** 归档字节数，用于提示文案和时间估算 */
	size: number;
	sha256: string;
	/** 归档内可执行文件的相对路径，例如 'bin/lua-language-server' */
	executable: string;
}

export interface LualsManifest {
	release: string;
	baseUrl: string;
	bundles: LualsBundle[];
}

/** 哪个平台的包该装到哪个目录 */
export interface LualsInstall {
	/** 缓存目录，绝对路径 */
	directory: string;
	/** 可执行文件绝对路径 */
	executable: string;
}

export class LualsError extends ArtifactError {
	constructor(message: string, detail?: string) {
		super(message, detail);
		this.name = 'LualsError';
	}
}

/** 下载失败的类型。用来决定提示措辞，以及值不值得重试。 */
export type ProvisionFailureKind = 'not-found' | 'checksum' | 'network' | 'disk' | 'unknown';

export interface ProvisionFailure {
	kind: ProvisionFailureKind;
	/** 给用户看的一句话。不含 URL —— 那个放在日志里。 */
	summary: string;
	/** 底层原因，写日志用 */
	detail: string;
	/** 重试有没有可能成功 */
	retryable: boolean;
}

/**
 * 把下载失败翻译成用户能看懂的一句话。
 *
 * 为什么需要它：底层把错误包成 ArtifactError 之后，`message` 只剩
 * "Failed to download the CLX language server from <url>."，真正的原因
 * （HTTP 404 / 校验不匹配 / 断网）藏在 `detail` 里。不读 detail 的话，
 * 用户看到的提示无法区分"清单指向了不存在的 release"和"我这边网络不通"，
 * 而这两种情况要采取的行动完全不同。
 */
export function describeProvisionFailure(error: unknown): ProvisionFailure {
	const message = error instanceof Error ? error.message : String(error);
	const rawDetail = error instanceof ArtifactError && error.detail ? error.detail : '';
	// 有些环境下 detail 是空串，这时的 message 就是全部信息
	const detail = [message, rawDetail].filter(Boolean).join(' — ');
	const haystack = detail.toLowerCase();

	// 404/403：清单指向的 release 或 asset 不存在。重试没用，是发布侧的问题。
	if (/http 40[34]\b/.test(haystack) || /\bnot found\b/.test(haystack)) {
		return {
			kind: 'not-found',
			summary:
				'The language server package could not be found. This means the extension points at a release that has not been published; retrying will not help. Please report it.',
			detail,
			retryable: false
		};
	}

	// 校验不匹配：下载到的字节不是我们发布的那份。重试可能拿到好的（例如代理注入）。
	if (/checksum mismatch/.test(haystack)) {
		return {
			kind: 'checksum',
			summary:
				'The downloaded language server failed its integrity check, so it was discarded. This can be caused by a proxy or a corrupted download.',
			detail,
			retryable: true
		};
	}

	// 网络与服务端临时错误：重试有意义。
	if (/http 5\d\d\b/.test(haystack) || /econnreset|etimedout|enotfound|eai_again|econnrefused|socket hang up|too many redirects/.test(haystack)) {
		return {
			kind: 'network',
			summary: 'The language server could not be downloaded because of a network error.',
			detail,
			retryable: true
		};
	}

	// 磁盘：装不下或没权限。重试也没用，得用户腾空间或改权限。
	if (/enospc|eacces|eperm|erofs/.test(haystack)) {
		return {
			kind: 'disk',
			summary: 'The language server could not be written to disk. Check free space and permissions.',
			detail,
			retryable: false
		};
	}

	return {
		kind: 'unknown',
		summary: 'The language server could not be downloaded.',
		detail,
		retryable: false
	};
}

/**
 * 解析并校验清单。
 *
 * 比模拟器的 parseManifest 严一些：逐个校验 bundle 字段。因为 LuaLS 多一个
 * arch 维度，字段缺失时按 arch 找包会得到难懂的 undefined，提前报错更好。
 */
export function parseManifest(raw: string, source = 'The LuaLS manifest'): LualsManifest {
	let parsed: LualsManifest;
	try {
		parsed = JSON.parse(raw) as LualsManifest;
	} catch (e) {
		throw new LualsError(`${source} is not valid JSON.`, `${e}`);
	}
	if (!parsed || !Array.isArray(parsed.bundles) || typeof parsed.baseUrl !== 'string' || typeof parsed.release !== 'string') {
		throw new LualsError(`${source} is malformed.`);
	}
	for (const bundle of parsed.bundles) {
		for (const field of ['product', 'platform', 'arch', 'version', 'asset', 'sha256', 'executable'] as const) {
			if (typeof bundle?.[field] !== 'string' || bundle[field] === '') {
				throw new LualsError(`${source} has a bundle without a valid "${field}".`);
			}
		}
		if (typeof bundle.size !== 'number' || !(bundle.size > 0)) {
			throw new LualsError(`${source} has a bundle without a valid "size".`);
		}
	}
	return parsed;
}

/**
 * 按 platform + arch 找包。
 *
 * VS Code 只跑在 64 位宿主上，process.arch 会是 'arm64' 或 'x64'；而
 * process.platform 是 'darwin' / 'win32' / 'linux'。Linux 上不发模拟器，
 * 但 LuaLS 有 linux 版本 —— 清单里没列时这里会明确报"没有对应的包"。
 */
export function findBundle(manifest: LualsManifest, platform: string, arch: string): LualsBundle {
	const bundle = manifest.bundles.find(b => b.platform === platform && b.arch === arch);
	if (!bundle) {
		throw new LualsError(
			`No LuaLS bundle is available for ${platform}/${arch}. ` +
				`Available: ${manifest.bundles.map(b => `${b.platform}/${b.arch}`).join(', ')}.`
		);
	}
	return bundle;
}

/** 缓存目录名。sha 前 8 位让同一版本的不同构建也能共存。 */
export function versionKey(bundle: LualsBundle): string {
	return `${bundle.product}-${bundle.platform}-${bundle.arch}-${bundle.version}-${bundle.sha256.slice(0, 8)}`;
}

/** 本地缓存里该包的位置，以及它是否已经可用。 */
export function locateBundle(cacheRoot: string, bundle: LualsBundle): LualsInstall {
	const directory = path.join(cacheRoot, versionKey(bundle));
	const executable = path.join(directory, bundle.executable);
	return { directory, executable };
}

/** 缓存目录里是否有一份完整可用的包 */
export function isReady(install: LualsInstall): boolean {
	if (!fs.existsSync(path.join(install.directory, MARKER_FILE))) {
		return false;
	}
	try {
		return fs.statSync(install.executable).isFile();
	} catch {
		return false;
	}
}

export interface ProvisionLualsRequest {
	manifest: LualsManifest;
	bundle: LualsBundle;
	install: LualsInstall;
	log?: (message: string) => void;
	progress?: ProgressSink;
	cancellation?: Cancellation;
}

/**
 * 让 install.directory 里有一份可用的 LuaLS：下载、校验、解压、原子替换。
 * 用户取消时返回 false —— 这不是错误，调用方应静默退出。
 */
export async function provisionLuals(
	request: ProvisionLualsRequest,
	transport?: HttpTransport
): Promise<boolean> {
	const { bundle, install } = request;
	const url = `${request.manifest.baseUrl.replace(/\/+$/, '')}/${request.manifest.release}/${bundle.asset}`;
	try {
		await installArchive(
			{
				directory: install.directory,
				url,
				sha256: bundle.sha256,
				key: versionKey(bundle),
				marker: {
					product: bundle.product,
					platform: bundle.platform,
					arch: bundle.arch,
					version: bundle.version,
					sha256: bundle.sha256
				},
				label: 'the CLX language server',
				log: request.log,
				progress: request.progress,
				cancellation: request.cancellation
			},
			transport
		);
	} catch (e) {
		if (e instanceof CancelledError) {
			request.log?.('Download cancelled.');
			return false;
		}
		if (e instanceof ArtifactError) {
			throw new LualsError(e.message, e.detail);
		}
		throw e;
	}

	if (!isReady(install)) {
		removePath(install.directory, request.log);
		throw new LualsError('The downloaded CLX language server is incomplete: the executable is missing.');
	}
	return true;
}
