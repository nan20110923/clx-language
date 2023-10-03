'use strict';

import * as vscode from 'vscode';
import { ClxDebugSession } from './ClxDebugSession';
import { ClxDebugConfigurationProvider } from './ClxDebugProvider';

export function activateDebug(context: vscode.ExtensionContext) {

	// regiser debug provider
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("clx_debug", new ClxDebugConfigurationProvider('clx_debug', context)));

	// regiser debug adapter
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('clx_debug', new InlineDebugAdapterFactory()));

	// override VS Code's default implementation of the "inline values" feature"
	let clxInlineValueProvider = new ClxInlineValuesProvider();
	context.subscriptions.push(vscode.languages.registerInlineValuesProvider('clx_debug', clxInlineValueProvider));
}


class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new ClxDebugSession());
	}
}

class ClxInlineValuesProvider implements vscode.InlineValuesProvider {

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
					// value found via variable lookup
					allValues.push(new vscode.InlineValueVariableLookup(varRange, varName, false));
					break;
				}
			}

		}

		return allValues;
	}
}