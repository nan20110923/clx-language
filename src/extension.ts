'use strict';

/**
 * 扩展入口：只做装配。
 *
 * 具体的活都在各自的 module 里：
 * - language/          语言服务器（LuaLS 的下载与生命周期）、配置生成、路径补全
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
import { registerIncludeCompletion } from './language/includeCompletion';
import { disposeLualsOutput } from './language/lualsServer';
import { runClxFile } from './runClxFile';
import { buildRomCommand } from './buildRom';
import { activateDebug } from './debug/activate';
import { disposeEmulatorOutput } from './emulator/emulator';
import { isEmulatorRunning, probeDebugChannel } from './emulator/emulatorProcess';

let languageServer: ClxLanguageServer | undefined;

export function activate(context: vscode.ExtensionContext) {
	languageServer = new ClxLanguageServer(context);

	context.subscriptions.push(
		vscode.languages.setLanguageConfiguration(LANGUAGE_ID, clxLanguageConfiguration),
		registerIncludeCompletion(),
		vscode.commands.registerCommand('extension.clx-language.run', async (resource: vscode.Uri) => {
			const busy = (await probeDebugChannel()) || isEmulatorRunning();
			if (busy) {
				vscode.window.showErrorMessage('ColoX emulator is already running!!');
				return;
			}
			// 'cancelled' 时用户已经拒绝过下载，不再弹任何框
			await runClxFile(context, resource, false);
		}),
		vscode.commands.registerCommand('extension.clx-language.restartServer', () => restartServer()),
		// 只构建 ROM，不启动窗口。Windows 的模拟器包不会自动生成，见 buildRom.ts
		vscode.commands.registerCommand('extension.clx-language.buildRom', (resource?: vscode.Uri) =>
			buildRomCommand(context, resource)
		)
	);

	void startServer();

	// 调试会话需要启动模拟器，用回调注入以避开 debug/ -> extension 的反向依赖
	activateDebug(context, (debug: boolean) => runClxFile(context, null, debug));

	return {
		/**
		 * 旧版对外的 API：转发给 EmmyLua 的 emmy/reportAPI 请求。
		 *
		 * LuaLS 没有这个方法，所以现在只是记一条日志。保留导出而不是直接删掉，
		 * 是因为可能有别的扩展通过 getExtension().exports.reportAPIDoc 调用它 ——
		 * 删掉会让那边在调用时抛异常，保留则是一个无害的 no-op。
		 */
		reportAPIDoc: (classDoc: unknown) => {
			console.log('reportAPIDoc is no longer supported: the language server is LuaLS.', classDoc);
		}
	};
}

export function deactivate() {
	disposeLualsOutput();
	disposeEmulatorOutput();
	void languageServer?.stop();
}

async function startServer(): Promise<void> {
	await languageServer?.start();
}

async function restartServer(): Promise<void> {
	await languageServer?.restart();
}
