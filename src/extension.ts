/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * extension.ts (and activateMockDebug.ts) forms the "plugin" that plugs into VS Code and contains the code that
 * connects VS Code with the debug adapter.
 * 
 * extension.ts contains code for launching the debug adapter in three different ways:
 * - as an external program communicating with VS Code via stdin/stdout,
 * - as a server process communicating with VS Code via sockets or named pipes, or
 * - as inlined code running in the extension itself (default).
 * 
 * Since the code in extension.ts uses node.js APIs it cannot run in the browser.
 */

'use strict';

import * as vscode from 'vscode';
import { ProviderResult } from 'vscode';
import * as child_process from "child_process";
import path = require('path');
import * as os from 'os';


export function activate(context: vscode.ExtensionContext) {
	// regiser command
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.clx-language.run', (resource: vscode.Uri) => {
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}

			if (targetResource) {
				let extensionPath = context.extensionPath;
				console.log("lyc===111222", extensionPath)
				let platform: string = os.platform();
				let coloxToolPath: string = "";
				if (platform == 'darwin') {
					coloxToolPath = path.resolve(extensionPath, "debugger", "osx/MacOS", "coloXtool");
				}

				let dir = path.dirname(targetResource.fsPath);
				let fileName = path.basename(targetResource.fsPath);
				let cmdStr = `${coloxToolPath} -d ` + dir + path.sep + " -r " + fileName;
				try {
					child_process.execSync(cmdStr);
				} catch (e) {
					console.log("run coloXtool exception: ", e);
				}
			}
		}),
		vscode.commands.registerCommand('extension.clx-language.debug', (resource: vscode.Uri) => {
			console.log("lyc===222")
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}
			if (targetResource) {
				vscode.debug.startDebugging(undefined, {
					type: 'mock',
					name: 'Debug File',
					request: 'launch',
					program: targetResource.fsPath,
					stopOnEntry: true
				});
			}
		}),
	);

	// regiser debug adapter
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('clx', new DebugAdapterExecutableFactory()));
}

export function deactivate() {
	// nothing to do
}

class DebugAdapterExecutableFactory implements vscode.DebugAdapterDescriptorFactory {

	// The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
	// Since the code implements the default behavior, it is absolutely not neccessary and we show it here only for educational purpose.

	createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): ProviderResult<vscode.DebugAdapterDescriptor> {
		// param "executable" contains the executable optionally specified in the package.json (if any)

		// use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
		if (!executable) {
			const command = "absolute path to my DA executable";
			const args = [
				"some args",
				"another arg"
			];
			const options = {
				cwd: "working directory for executable",
				env: { "envVariable": "some value" }
			};
			executable = new vscode.DebugAdapterExecutable(command, args, options);
		}

		// make VS Code launch the DA executable
		return executable;
	}
}