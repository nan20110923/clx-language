'use strict';

/**
 * `CLX: Build ROM` 命令。
 *
 * 为什么需要它：Windows 的官方模拟器包编译时没开 `COLOX_AUTO_GEN_ROM`，所以
 * 加载卡带后**不会**在源码旁写 `.rom`（macOS 包开了，行为不同）。官方的
 * `-b` 能在两个平台上显式构建，这条命令就是它的入口。
 *
 * 为什么是命令而不是一个"自动生成"的设置：
 *   - 自动生成会在每次运行时隐式产生一个文件，而 Windows 用户今天的预期是
 *     "不生成"。改成默认自动等于改变既有行为。
 *   - macOS 上任何参数都关不掉模拟器的自动生成，所以一个"要不要生成"的开关
 *     在 macOS 上必然无效，留在设置面板里只会制造困惑。
 *   命令是显式的、一次性的，且可以用 `when: isWindows` 在其它平台完全隐藏。
 *
 * 细节见 docs/development.md 的「ROM 生成」。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { logEmulatorOutput, showEmulatorOutput } from './emulator/emulator';
import { buildRom } from './emulator/emulatorProcess';
import { prepareLaunch, readDeviceSpec, resolveTarget } from './runClxFile';

/**
 * 构建当前 .clx 的 ROM。
 *
 * resource 来自菜单（`editor/title/run` 会传当前文件）；从命令面板调用时没有
 * 参数，回落到活动编辑器。
 */
export async function buildRomCommand(
	context: vscode.ExtensionContext,
	resource?: vscode.Uri
): Promise<void> {
	const target = resolveTarget(resource);
	if (!target) {
		vscode.window.showErrorMessage('Open a CLX file first.');
		return;
	}

	// 首行不是设备规格时不构建：模拟器会把这种文件当成菜单，导出一个没有
	// 意义的 ROM。这里提前拦下来，错误信息说清原因。
	const spec = await readDeviceSpec(target);
	if (spec === undefined) {
		return;
	}

	const launch = await prepareLaunch(context);
	if (!launch) {
		// 用户取消下载。prepareLaunch 已经记过日志，不再打扰。
		return;
	}

	const status = vscode.window.setStatusBarMessage('$(sync~spin) Building ROM…');
	try {
		const result = await buildRom({ file: target, launch, onStdout: logEmulatorOutput });
		if (result.ok) {
			// 成功静默：文件就出现在源码旁边，用户看得见。弹窗只是噪音。
			return;
		}
		const show = 'Show Output';
		const answer = await vscode.window.showErrorMessage(
			`Failed to build ${path.basename(result.path)}: ${result.reason}.`,
			show
		);
		if (answer === show) {
			showEmulatorOutput();
		}
	} finally {
		status.dispose();
	}
}
