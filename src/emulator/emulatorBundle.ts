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
import * as os from 'os';
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

/**
 * 卡带对应的 ROM 路径。
 *
 * 模拟器把 ROM 写成**卡带文件同目录**下的 sidecar：`<文件名>.clx.rom`，
 * 不是 `<文件名>.rom`。两个平台的包都会在加载卡带时自己写（Windows 包自
 * 2026-11-27 起也开了 `COLOX_AUTO_GEN_ROM`），扩展不参与生成，只在这里
 * 描述它落在哪 —— 排查和文档引用都用得上。
 */
export function romPathFor(cartridgePath: string): string {
	return `${cartridgePath}.rom`;
}

/**
 * 官方 Windows 版 `coloXtool.exe` 链接的是 MSVC **Debug** CRT。
 *
 * 这四个不在 REDIST 列表里，微软不允许随应用分发，官方 zip 也不带 —— 所以装
 * `vc_redist.x64.exe` 解决不了（那只装 Release CRT）。缺任何一个时 Windows
 * 在加载镜像阶段就失败：进程不起、不生成 `.rom`、`spawn` 的 error 事件只有
 * 无意义的 `ENOENT`/`UNKNOWN`，用户只看到"点了运行什么也没发生"。
 *
 * 注意这只解释"进程根本起不来"。如果模拟器**能运行**却没有 `.rom`，原因在别处
 * （卡带没加载、输出里有一行 `!!!ROM GEN FAIL`），不要拿这条去猜。
 *
 * 这里只能给出可诊断的提示。真正的修复在上游：改用 Release CRT 重新编译，
 * 或者 `/MT` 静态链接。不要试图把这些 DLL 打进归档 —— 那是许可证问题。
 */
export const WINDOWS_DEBUG_CRT = [
	'MSVCP140D.dll',
	'VCRUNTIME140D.dll',
	'VCRUNTIME140_1D.dll',
	'ucrtbased.dll'
] as const;

/**
 * 检查 Windows 上缺哪些 Debug CRT DLL。
 *
 * 查询顺序按 Windows 的搜索规则：应用目录 → System32 → PATH。`exists` 注入
 * 是为了在非 Windows 上也能测这段逻辑。
 *
 * 路径一律用 `path.win32` 拼接：这个检查只在 Windows 上有意义，而测试跑在
 * macOS/Linux 上，用平台原生的 `path.join` 会拼出 `/` 分隔的假路径。
 *
 * 返回空数组表示都找到了（或者不是 Windows）。
 */
export function missingWindowsDebugCrt(
	appDir: string,
	exists: (file: string) => boolean,
	platform: string = os.platform(),
	env: NodeJS.ProcessEnv = process.env
): string[] {
	if (platform !== 'win32') {
		return [];
	}

	const win = path.win32;
	const dirs = [appDir];
	const systemRoot = env.SystemRoot || env.windir;
	if (systemRoot) {
		dirs.push(win.join(systemRoot, 'System32'));
	}
	// Windows 的环境变量名大小写不敏感，两种写法都可能出现
	for (const entry of (env.PATH || env.Path || '').split(';')) {
		if (entry.length > 0) {
			dirs.push(entry);
		}
	}

	return WINDOWS_DEBUG_CRT.filter(dll => !dirs.some(dir => exists(win.join(dir, dll))));
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
