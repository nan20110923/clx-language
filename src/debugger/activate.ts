'use strict';

/**
 * 注册调试相关的 provider 和工厂。
 *
 * 三个 id 要分清：
 * - `clx_debug` 是 debugger type（package.json 的 contributes.debuggers[].type）
 * - `clx`       是 language id（contributes.languages[].id）
 *
 * 调试配置提供者、适配器工厂用 type；inline values 是编辑器功能，必须按
 * language id 注册 —— 之前错写成 `clx_debug`，所以从未触发。
 */

import * as vscode from 'vscode';
import { DebugSession, StartEmulator } from './debugSession';
import { ConfigurationProvider } from './configurationProvider';
import { LANGUAGE_ID } from '../languageServer';

/** debugger type，必须与 package.json 的 contributes.debuggers[].type 一致 */
const DEBUG_TYPE = 'clx_debug';

/**
 * @param startEmulator 启动模拟器的回调，由扩展入口传入。
 *   调试会话通过它要一个模拟器，避免 debugger/ 反向 import extension。
 */
export function activateDebug(context: vscode.ExtensionContext, startEmulator: StartEmulator) {
	context.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, new ConfigurationProvider(DEBUG_TYPE)),
		vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, new InlineDebugAdapterFactory(startEmulator)),
		// inline values 是编辑器功能，按 language id 注册
		vscode.languages.registerInlineValuesProvider(LANGUAGE_ID, new InlineValuesProvider())
	);
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	constructor(private readonly startEmulator: StartEmulator) { }

	createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new DebugSession(this.startEmulator));
	}
}

class InlineValuesProvider implements vscode.InlineValuesProvider {

	provideInlineValues(document: vscode.TextDocument, viewport: vscode.Range, context: vscode.InlineValueContext): vscode.ProviderResult<vscode.InlineValue[]> {

		const allValues: vscode.InlineValue[] = [];
		const regExps = [
			/(?<=local\s+)[^\s,\<]+/,
			/(?<=---@param\s+)\S+/
		]

		for (let l = viewport.start.line; l <= context.stoppedLocation.end.line; l++) {
			const line = document.lineAt(l);

			for (const regExp of regExps) {
				const match = regExp.exec(line.text);
				if (match) {
					const varName = match[0];
					const varRange = new vscode.Range(l, match.index, l, match.index + varName.length);
					// 变量值走 evaluateRequest（context != repl，用 p 取名）
					allValues.push(new vscode.InlineValueVariableLookup(varRange, varName, false));
					break;
				}
			}
		}

		return allValues;
	}
}
