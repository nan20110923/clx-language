'use strict';

/**
 * LuaLS 语言服务器包的 VS Code 适配层。
 *
 * 干活的逻辑（清单校验、下载、sha256、解压、原子替换）在 lualsBundle.ts 和
 * artifact/bundle.ts，那里不 import vscode，可以直接在 Node 里测。
 * 这一层只负责和编辑器交互：读清单、算缓存根、显示进度、写配置。
 *
 * 与模拟器不同，这里**不弹确认框**：语言服务器是打开 .clx 就立刻要用的东西，
 * 挡一个模态框会让编辑体验变差（模拟器的下载是"点运行才需要"，确认一次合理）。
 * 下载在后台静默进行，进度显示在状态栏。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	describeProvisionFailure,
	findBundle,
	locateBundle,
	isReady,
	parseManifest,
	provisionLuals,
	LualsError
} from './lualsBundle';
import type {
	LualsBundle,
	LualsInstall,
	LualsManifest,
	ProvisionFailure
} from './lualsBundle';
import { renderConfig, stubsLanguage } from './lualsConfig';

export { LualsError } from './lualsBundle';

const MANIFEST_PATH = ['res', 'luals-manifest.json'];

let outputChannel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('CLX Language Server');
	}
	return outputChannel;
}

export function disposeLualsOutput(): void {
	outputChannel?.dispose();
	outputChannel = undefined;
}

function log(message: string): void {
	channel().appendLine(message);
}

function manifestPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, ...MANIFEST_PATH);
}

function readManifest(context: vscode.ExtensionContext): LualsManifest {
	const file = manifestPath(context);
	let raw: string;
	try {
		raw = fs.readFileSync(file, 'utf8');
	} catch (e) {
		throw new LualsError(`Cannot read the LuaLS manifest at ${file}.`, `${e}`);
	}
	return parseManifest(raw, `The LuaLS manifest at ${file}`);
}

function cacheRoot(context: vscode.ExtensionContext): string {
	return path.join(context.globalStorageUri.fsPath, 'luals');
}

/**
 * 把 LuaLS 的临时文件（生成的 meta 定义、日志）收进扩展自己的存储目录。
 *
 * 不设的话它默认写到用户主目录下的 .cache / .local 之类位置，卸载扩展后
 * 留一堆垃圾。LLS_META_PATH / LLS_LOG_PATH 是 LuaLS 认的环境变量。
 */
function serverEnv(context: vscode.ExtensionContext): NodeJS.ProcessEnv {
	const root = cacheRoot(context);
	return {
		...process.env,
		LLS_META_PATH: path.join(root, 'meta'),
		LLS_LOG_PATH: path.join(root, 'log')
	};
}

/** 同一份包的并发请求共用一次下载。 */
const inflight = new Map<string, Promise<LualsInstall | null>>();

/**
 * 确保 LuaLS 已就位，返回可执行的路径。
 *
 * 返回 null 表示用户取消了下载 —— 调用方应静默降级（没有语言服务，但语法
 * 高亮仍然可用，因为那是 TextMate 语法，不依赖语言服务器）。
 */
export async function ensureLuals(context: vscode.ExtensionContext): Promise<LualsInstall | null> {
	const manifest = readManifest(context);
	const bundle = findBundle(manifest, os.platform(), process.arch);
	const install = locateBundle(cacheRoot(context), bundle);

	if (isReady(install)) {
		return install;
	}

	const key = `${bundle.platform}-${bundle.arch}-${bundle.version}-${bundle.sha256}`;
	let pending = inflight.get(key);
	if (!pending) {
		const created = downloadWithStatus(context, manifest, bundle, install);
		pending = created;
		inflight.set(key, pending);
		const clear = () => inflight.delete(key);
		pending.then(clear, clear);
	}
	return await pending;
}

async function downloadWithStatus(
	context: vscode.ExtensionContext,
	manifest: LualsManifest,
	bundle: LualsBundle,
	install: LualsInstall
): Promise<LualsInstall | null> {
	const token = new vscode.CancellationTokenSource();
	// 状态栏而不是通知弹窗：语言服务器在切到 .clx 时就要用，不该打断用户
	const status = vscode.window.setStatusBarMessage(
		`$(sync~spin) CLX language server: downloading ${formatSize(bundle.size)}…`
	);
	log(`Downloading LuaLS ${bundle.version} for ${bundle.platform}/${bundle.arch} (${formatSize(bundle.size)})`);

	const attempt = () =>
		provisionLuals({
			manifest,
			bundle,
			install,
			log,
			cancellation: token.token
		});

	try {
		const ok = await attempt();
		if (!ok) {
			log('Download cancelled by the user.');
			return null;
		}
		return install;
	} catch (first) {
		const failure = describeProvisionFailure(first);

		// 网络类失败重试一次：这类失败常常是瞬时的（DNS、代理、连接被重置）。
		// 404 和校验失败不重试 —— 那不是运气问题，重试只会让用户多等。
		if (failure.retryable && !token.token.isCancellationRequested) {
			log(`Attempt failed (${failure.kind}), retrying once.`);
			log(`Reason: ${failure.detail}`);
			try {
				const ok = await attempt();
				if (ok) {
					log('Retry succeeded.');
					return install;
				}
				log('Download cancelled by the user.');
				return null;
			} catch (second) {
				const again = describeProvisionFailure(second);
				reportFailure(again);
				return null;
			}
		}

		reportFailure(failure);
		return null;
	} finally {
		status.dispose();
		token.dispose();
	}
}

/**
 * 记日志并给用户一个不打扰的提示。
 *
 * 措辞分两段：一句说清"语言功能没了但语法高亮照常"，一句说原因与能不能重试。
 * 不弹模态框 —— 这是可降级的功能，不该拦住用户写代码。
 */
function reportFailure(failure: ProvisionFailure): void {
	log(`Failed (${failure.kind}): ${failure.detail}`);
	const retryHint = failure.retryable ? ' Try "CLX: Restart Lua Server" later.' : '';
	void vscode.window
		.showWarningMessage(
			`${failure.summary}${retryHint} Syntax highlighting still works.`,
			'Show Log'
		)
		.then(answer => {
			if (answer === 'Show Log') {
				channel().show();
			}
		});
}

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${Math.round(bytes / 1024)} KB`;
}

/**
 * 写一份 configpath 指向的配置文件，返回它的路径。
 *
 * 放在 globalStorage 而不是工作区：CLX 的行为不该依赖、也不该污染用户的仓库。
 * 每次启动重写，这样扩展升级后存根路径和插件路径自动跟上。
 */
export function writeServerConfig(context: vscode.ExtensionContext): string {
	const directory = cacheRoot(context);
	fs.mkdirSync(directory, { recursive: true });
	const file = path.join(directory, 'config.lua');
	const content = renderConfig({
		extensionPath: context.extensionPath,
		pluginPath: path.join(context.extensionPath, 'res', 'luals', 'clx.lua'),
		language: stubsLanguage(vscode.env.language)
	});
	fs.writeFileSync(file, content, 'utf8');
	return file;
}

/** 启动 LuaLS 需要的全部信息。 */
export interface LualsServerSpec {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
	configPath: string;
}

/**
 * 准备启动规格。返回 null 表示语言服务器不可用（用户取消下载或下载失败）。
 */
export async function prepareServer(context: vscode.ExtensionContext): Promise<LualsServerSpec | null> {
	const install = await ensureLuals(context);
	if (!install) {
		return null;
	}
	const configPath = writeServerConfig(context);
	return {
		command: install.executable,
		// --configpath 让 LuaLS 只读我们生成的配置，不读工作区里的 .luarc.json
		args: [`--configpath=${configPath}`],
		env: serverEnv(context),
		configPath
	};
}
