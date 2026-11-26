'use strict';

/**
 * 扩展入口：只做装配。
 *
 * 具体的活都在各自的 module 里：
 * - language/          语言服务器（Java 子进程）、注解、语言配置
 * - emulator/          模拟器包的获取与进程生命周期
 * - debug/             调试适配器（DAP）与调试通道
 * - runClxFile.ts      选模拟器并启动，运行/调试都走它
 * - ids.ts             两个 id 与设置命名空间
 *
 * 这里不持有业务状态，只把它们的生命周期挂到 context.subscriptions 上。
 */

import * as vscode from 'vscode';
import { LANGUAGE_ID } from './ids';
import { clxLanguageConfiguration } from './language/languageConfiguration';
import { ClxLanguageServer } from './language/languageServer';
import { Annotations, disposeAnnotations, onAnnotationsConfigurationChanged } from './language/annotations';
import { runClxFile } from './runClxFile';
import { activateDebug } from './debug/activate';
import { disposeEmulatorOutput } from './emulator/emulator';
import { isEmulatorRunning, probeDebugChannel } from './emulator/emulatorProcess';

let languageServer: ClxLanguageServer | undefined;
let annotations: Annotations | undefined;

export function activate(context: vscode.ExtensionContext) {
	languageServer = new ClxLanguageServer(context.extensionPath);
	annotations = new Annotations(() => languageServer?.client);

	context.subscriptions.push(
		vscode.languages.setLanguageConfiguration(LANGUAGE_ID, clxLanguageConfiguration),
		annotations,
		vscode.commands.registerCommand('extension.clx-language.run', async (resource: vscode.Uri) => {
			const busy = (await probeDebugChannel()) || isEmulatorRunning();
			if (busy) {
				vscode.window.showErrorMessage('ColoX emulator is already running!!');
				return;
			}
			// 'cancelled' 时用户已经拒绝过下载，不再弹任何框
			await runClxFile(context, resource, false);
		}),
		vscode.commands.registerCommand('extension.clx-language.restartServer', () => restartServer())
	);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => onDidChangeConfiguration(e)));

	void startServer();

	// 调试会话需要启动模拟器，用回调注入以避开 debugger/ -> extension 的反向依赖
	activateDebug(context, (debug: boolean) => runClxFile(context, null, debug));

	return {
		reportAPIDoc: (classDoc: any) => {
			languageServer?.sendRequest('emmy/reportAPI', classDoc);
		}
	};
}

export function deactivate() {
	disposeAnnotations();
	disposeEmulatorOutput();
	void languageServer?.stop();
}

async function startServer(): Promise<void> {
	await languageServer?.start();
	annotations?.refresh(vscode.window.activeTextEditor);
}

async function restartServer(): Promise<void> {
	await languageServer?.restart();
	annotations?.refresh(vscode.window.activeTextEditor);
}

function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent): void {
	if (!languageServer) {
		return;
	}
	onAnnotationsConfigurationChanged(languageServer.client);

	// Java 路径可能变了（设置项、环境变量、PATH 任一），变了就得重启才生效
	if (languageServer.refreshJavaPath()) {
		void restartServer();
	}
}
