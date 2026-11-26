'use strict';

/**
 * 测试自动化的**适配层**：把命令面板的动作变成调试通道上的一条命令。
 *
 * 真正解析应答的纯逻辑在 testAutomation.ts，那里不 import vscode。这一层只做
 * 编辑器交互：让用户选键位、填时长、拿到当前活动的调试会话。
 *
 * 为什么必须经过调试会话而不是自己连 3563：
 * 那条通道只允许一个客户端，自己连会把扩展自己的连接挤掉 —— 表现就是
 * 调试会话突然断开，看起来像插件坏了。
 *
 * 和 `!cmd` 控制台前缀的关系：两者都是 adapter，背后同一个调试会话，
 * 同一个 `clx.testAutomation` 自定义请求。命令面板适合"我要截个图"，
 * 控制台适合"边跑边一帧一帧试"。
 */

import * as vscode from 'vscode';
import { CLX_KEY_NAMES, injectionDuration, type Duration } from './testAutomation';
import { DEBUG_TYPE } from '../ids';

/** 发给调试适配器的自定义命令名，与 DebugSession 里的分支对应。 */
const AUTOMATION_REQUEST = 'clx.testAutomation';

interface AutomationResponse {
	output?: string;
}

/**
 * 取当前活动会话。没有就提示一次并返回 undefined ——
 * 这些命令只在调试期间有意义。
 */
function activeSession(): vscode.DebugSession | undefined {
	const session = vscode.debug.activeDebugSession;
	if (!session || session.type !== DEBUG_TYPE) {
		void vscode.window.showInformationMessage('Start a CLX debug session first.');
		return undefined;
	}
	return session;
}

/** 发一条自动化命令，把结果写到输出通道并返回原始文本。 */
async function send(session: vscode.DebugSession, command: string): Promise<string | undefined> {
	try {
		const response = await session.customRequest(AUTOMATION_REQUEST, { command }) as AutomationResponse | undefined;
		const output = response?.output ?? '';
		if (output.length > 0) {
			channel().appendLine(`> ${command}`);
			channel().appendLine(output);
		}
		return output;
	} catch (e) {
		void vscode.window.showErrorMessage(`CLX test automation failed: ${e}`);
		return undefined;
	}
}

let outputChannel: vscode.OutputChannel | undefined;
function channel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('CLX Test Automation');
	}
	return outputChannel;
}

export function disposeTestAutomationOutput(): void {
	outputChannel?.dispose();
	outputChannel = undefined;
}

/** 问用户要哪些键位。多选，返回空数组表示取消。 */
async function pickKeys(): Promise<string[] | undefined> {
	const picked = await vscode.window.showQuickPick(
		CLX_KEY_NAMES.map(name => ({ label: name })),
		{ canPickMany: true, placeHolder: 'Which buttons to inject? (Esc to cancel)' }
	);
	return picked?.map(p => p.label);
}

/** 问用户注入多久。返回 undefined 表示取消。 */
async function pickDuration(): Promise<Duration | undefined> {
	const choice = await vscode.window.showQuickPick(
		[
			{ label: 'One frame', value: { kind: 'frames', frames: 1 } as Duration },
			{ label: '30 frames', value: { kind: 'frames', frames: 30 } as Duration },
			{ label: 'Half a second', value: { kind: 'ms', ms: 500 } as Duration },
			{ label: 'One second', value: { kind: 'ms', ms: 1000 } as Duration },
			{ label: 'Hold until stopped', value: { kind: 'hold' } as Duration }
		],
		{ placeHolder: 'How long should the injection last?' }
	);
	return choice?.value;
}

export function registerTestAutomationCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.clx-language.injectButtons', async () => {
			const session = activeSession();
			if (!session) {
				return;
			}
			const keys = await pickKeys();
			if (!keys || keys.length === 0) {
				return;
			}
			const duration = await pickDuration();
			if (!duration) {
				return;
			}
			await send(session, injectionDuration('btn', keys, duration));
		}),

		vscode.commands.registerCommand('extension.clx-language.injectKey', async () => {
			const session = activeSession();
			if (!session) {
				return;
			}
			const key = await vscode.window.showInputBox({
				prompt: 'Key name to hold (for example: a, up, left)',
				placeHolder: 'a'
			});
			if (!key) {
				return;
			}
			await send(session, `key ${key} 500ms`);
		}),

		vscode.commands.registerCommand('extension.clx-language.injectMouse', async () => {
			const session = activeSession();
			if (!session) {
				return;
			}
			// 坐标是卡带 VM 坐标系，与 mouse() 读到的一致
			const point = await vscode.window.showInputBox({
				prompt: 'Position as x,y in cartridge coordinates (a touch press is press-and-hold)',
				placeHolder: '120,120'
			});
			if (!point) {
				return;
			}
			const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(point);
			if (!match) {
				void vscode.window.showErrorMessage('Expected two numbers separated by a comma, for example 120,120.');
				return;
			}
			await send(session, `mouse ${match[1]} ${match[2]}`);
		}),

		vscode.commands.registerCommand('extension.clx-language.screenshot', async () => {
			const session = activeSession();
			if (!session) {
				return;
			}
			// 路径由适配器定向到扩展存储区，这里不传，避免写进用户工作区
			const output = await send(session, 'shot');
			if (output && output.includes('Screenshot: ')) {
				channel().show(true);
			}
		}),

		vscode.commands.registerCommand('extension.clx-language.inputState', async () => {
			const session = activeSession();
			if (!session) {
				return;
			}
			await send(session, 'input?');
			channel().show(true);
		}),

		{ dispose: disposeTestAutomationOutput }
	);
}
