'use strict';

/**
 * 模拟器包（emulator bundle）的获取与安装，不 import vscode。
 *
 * 下载、校验、解压、原子替换这些与产品无关的活都在 src/artifact/bundle.ts；
 * 这里只放模拟器自己的东西：清单形状、缓存键、就绪判定、启动规格。
 *
 * 需要 VS Code 的那一侧（进度通知、确认弹窗、OutputChannel）在 emulator.ts。
 * 术语见 GLOSSARY.md：模拟器（emulator）≠ 调试适配器（debug adapter）。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	ArtifactError,
	CancelledError,
	HttpTransport,
	MARKER_FILE,
	ProgressSink,
	Cancellation,
	installArchive,
	removePath
} from '../artifact/bundle';

// 通用件原样再导出：runClxFile、emulator.ts 和测试都从这里取，不用改导入路径。
export { formatBytes, extract, download, MARKER_FILE } from '../artifact/bundle';
export type {
	Cancellation,
	ProgressSink,
	HttpTransport,
	HttpTransportRequest,
	HttpTransportResponse
} from '../artifact/bundle';

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

export class EmulatorError extends ArtifactError {
	constructor(message: string, detail?: string) {
		super(message, detail);
		this.name = 'EmulatorError';
	}
}

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
export async function provision(
	request: ProvisionRequest,
	transport?: HttpTransport
): Promise<EmulatorLaunch | null> {
	const { bundle, directory } = request;
	const key = versionKey(bundle);
	try {
		await installArchive(
			{
				directory,
				url: assetUrl(request.manifest, bundle),
				sha256: bundle.sha256,
				key,
				marker: { product: bundle.product, platform: bundle.platform, date: bundle.date, sha256: bundle.sha256 },
				label: 'CLX emulator',
				log: request.log,
				progress: request.progress,
				cancellation: request.cancellation
			},
			transport
		);
	} catch (e) {
		if (e instanceof CancelledError) {
			request.log?.('Download cancelled.');
			return null;
		}
		if (e instanceof ArtifactError) {
			// 保持 EmulatorError 类型，调用方按它区分"清单/下载失败"和普通异常
			throw new EmulatorError(e.message, e.detail);
		}
		throw e;
	}

	if (!isReady(directory, bundle)) {
		removePath(directory, request.log);
		throw new EmulatorError('The downloaded CLX emulator is incomplete: the executable is missing.');
	}

	return launchFor(directory, bundle);
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
