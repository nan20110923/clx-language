'use strict';

/**
 * 决定用哪个模拟器，然后启动它。
 *
 * 只有两条路：用户配了 `clx-language.debugger` = `Custom` 且填了
 * `debuggerCustomPath` 时完全接管（不下载、不回落）；否则用按需下载的官方包。
 *
 * 注意 `Nature` 选项已废弃：官方已不再单独发布 Nature 模拟器，
 * 设备规格由同一个二进制处理。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ensureEmulator, EmulatorError, logEmulatorOutput } from './emulator/emulator';
import { EmulatorLaunch } from './emulator/emulatorBundle';
import { startEmulator, type LaunchOutcome } from './emulator/emulatorProcess';

/**
 * 启动模拟器运行指定的 CLX 文件。
 * resource 为 null 时回落到当前活动编辑器。
 */
export async function runClxFile(
	context: vscode.ExtensionContext,
	resource: vscode.Uri | null,
	debug: boolean
): Promise<LaunchOutcome> {
	let target = resource;
	if (!target && vscode.window.activeTextEditor) {
		target = vscode.window.activeTextEditor.document.uri;
	}
	if (!target) {
		return 'failed';
	}

	const spec = await readDeviceSpec(target);
	if (spec === undefined) {
		return 'failed';
	}

	const customPath = selectCustomEmulator();
	let launch: EmulatorLaunch | null;
	if (customPath) {
		if (!fs.existsSync(customPath)) {
			vscode.window.showErrorMessage(`The configured emulator does not exist: ${customPath}`);
			return 'failed';
		}
		launch = { executable: customPath, libraryDir: path.dirname(customPath) };
	} else {
		launch = await ensureEmulatorReady(context);
	}
	// 用户拒绝下载时 ensureEmulatorReady 已经静默返回 null，这里不要再报错
	if (!launch) {
		return 'cancelled';
	}

	// 模拟器的输出全部转进 "CLX Emulator" 通道。以前 onStdout 从来没人传，
	// 这些行只进 DevTools console —— 排查"没有 .rom"时等于把唯一的线索丢掉。
	return startEmulator({
		file: target,
		debug,
		launch,
		onStdout: logEmulatorOutput
	});
}

/**
 * 读出首行的设备规格。模拟器自己判断规格内容，插件只确认"首行确实标了"。
 * 返回 undefined 表示文件不可用（已经提示过用户）。
 */
async function readDeviceSpec(file: vscode.Uri): Promise<string | undefined> {
	const content = await vscode.workspace.fs.readFile(file);
	const contentStr = new TextDecoder().decode(content);
	const lines = contentStr.split(/\r?\n/);

	if (lines.length === 0) {
		vscode.window.showErrorMessage('CLX file no content!!');
		return undefined;
	}

	// 不维护规格白名单：官方会加新规格（coloX-PICO8 就是这么出现的），
	// 这里拦下来只会挡住合法文件。
	const firstLine = lines[0];
	const hasDeviceSpec = /coloX-[A-Za-z0-9]+/.test(firstLine) || /X-\d+x\d+(_\d+)?/.test(firstLine);
	if (!hasDeviceSpec) {
		vscode.window.showErrorMessage('The device specification must be labeled on the first line!!');
		return undefined;
	}
	return firstLine;
}

/** 用户指定的模拟器路径。设置了就完全接管，不下载也不回落。 */
function selectCustomEmulator(): string | null {
	const config = vscode.workspace.getConfiguration('clx-language');
	const type = config.get<string>('debugger');
	const customPath = config.get<string>('debuggerCustomPath');
	if (type === 'Custom' && customPath && customPath.length > 0) {
		return customPath;
	}
	return null;
}

/** 拿到可用的模拟器；下载失败时把三条出路讲清楚 */
async function ensureEmulatorReady(context: vscode.ExtensionContext): Promise<EmulatorLaunch | null> {
	try {
		return await ensureEmulator(context);
	} catch (e) {
		if (e instanceof EmulatorError) {
			const openSettings = 'Choose a Local Copy';
			const answer = await vscode.window.showErrorMessage(
				`${e.message} ${e.detail ?? ''} If you are offline or behind a firewall, point "clx-language.debuggerCustomPath" at a local copy of the simulator instead.`,
				openSettings
			);
			if (answer === openSettings) {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'clx-language.debuggerCustomPath');
			}
		} else {
			vscode.window.showErrorMessage(`Failed to prepare the CLX emulator: ${e}`);
		}
		return null;
	}
}
