'use strict';

/**
 * 模拟器包的 VS Code 适配层。
 *
 * 真正干活的逻辑（清单校验、下载、sha256、解压、原子替换）在 emulatorBundle.ts，
 * 那里不 import vscode，可以直接在 Node 里测。这一层只负责和编辑器交互：
 * 读清单文件、算缓存根目录、确认下载、显示进度、写 OutputChannel。
 *
 * 术语见 GLOSSARY.md：模拟器（emulator）≠ 调试适配器（debug adapter）。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
	EmulatorBundle,
	EmulatorError,
	EmulatorLaunch,
	EmulatorManifest,
	findBundle,
	formatBytes,
	locateBundle,
	parseManifest,
	provision
} from './emulatorBundle';

// EmulatorError 需要再导出：runClxFile 用它区分"清单/下载失败"和普通异常，
// 而它属于 emulatorBundle 的词汇。其余类型消费者直接去 emulatorBundle 取，
// 不在这里做第二道贩子（历史上四个 type re-export 有两个是无人使用的）。
export { EmulatorError } from './emulatorBundle';

const MANIFEST_PATH = ['res', 'emulator-manifest.json'];
const DOWNLOAD_CONFIRMED_KEY = 'emulatorDownloadConfirmed';

/** 同一份模拟器包的并发请求共用一次下载。null 表示用户取消了下载。 */
const inflight = new Map<string, Promise<EmulatorLaunch | null>>();

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
	return parseManifest(raw, `The emulator manifest at ${file}`);
}

function cacheRoot(context: vscode.ExtensionContext): string {
	return path.join(context.globalStorageUri.fsPath, 'emulators');
}

/**
 * 确保本机有一份可用的模拟器包，返回启动所需的路径。
 * 用户取消下载时返回 null（调用方应静默退出，不要重复报错）。
 */
export async function ensureEmulator(
	context: vscode.ExtensionContext
): Promise<EmulatorLaunch | null> {
	const manifest = readManifest(context);
	const bundle = findBundle(manifest, os.platform());
	const install = locateBundle(cacheRoot(context), bundle);

	if (install.launch) {
		return install.launch;
	}

	const key = `${bundle.product}-${bundle.platform}-${bundle.date}-${bundle.sha256}`;
	let pending = inflight.get(key);
	if (!pending) {
		// 注意：取消（null）也要缓存这一次，否则并发请求会各弹一次确认框。
		// 下一次调用会重新尝试，因为 clear 已经把 key 移除了。
		const created = provisionWithUi(context, manifest, bundle, install.directory);
		pending = created;
		inflight.set(key, pending);
		const clear = () => inflight.delete(key);
		pending.then(clear, clear);
	}
	return await pending;
}

/**
 * 下载前的确认弹窗和下载中的进度条，把纯逻辑包起来。
 * 返回 null 表示用户主动取消 —— 这不是错误，调用方应静默退出。
 */
async function provisionWithUi(
	context: vscode.ExtensionContext,
	manifest: EmulatorManifest,
	bundle: EmulatorBundle,
	directory: string
): Promise<EmulatorLaunch | null> {
	if (!(await confirmDownload(context, bundle))) {
		return null;
	}

	const token = new vscode.CancellationTokenSource();
	try {
		return await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Downloading the CLX emulator (${bundle.product})`,
				cancellable: true
			},
			async (progress, cancelToken) => {
				const registration = cancelToken.onCancellationRequested(() => token.cancel());
				try {
					return await provision({
						manifest,
						bundle,
						directory,
						log,
						progress,
						cancellation: token.token
					});
				} finally {
					registration.dispose();
				}
			}
		);
	} finally {
		token.dispose();
	}
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
