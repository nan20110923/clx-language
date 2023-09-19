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
import findJava from './findJava';
import * as Annotator from "./annotator";
import { LanguageClientOptions, LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { ClxLanguageConfiguration } from './languageConfiguration';


export let extensionContext: vscode.ExtensionContext;
export let languageClient: LanguageClient;
let javaExecutablePath: string | null;
export const LANGUAGE_ID: string = "clx";

let activeEditor: vscode.TextEditor;


export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	javaExecutablePath = findJava();

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration, null, context.subscriptions));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument, null, context.subscriptions));
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor, null, context.subscriptions));
	context.subscriptions.push(vscode.languages.setLanguageConfiguration("clx", new ClxLanguageConfiguration()));

	// regiser command
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.clx-language.run', (resource: vscode.Uri) => {
			let targetResource = resource;
			if (!targetResource && vscode.window.activeTextEditor) {
				targetResource = vscode.window.activeTextEditor.document.uri;
			}

			if (targetResource) {
				let extensionPath = context.extensionPath;
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

	startServer();
	return {
		reportAPIDoc: (classDoc: any) => {
			languageClient?.sendRequest("emmy/reportAPI", classDoc);
		}
	}
}

export function deactivate() {
	languageClient?.stop();
}

async function validateJava(): Promise<void> {
	const exePath = javaExecutablePath || "java";
	console.log('exe path : ' + exePath);
	return new Promise<void>((resolve, reject) => {
		child_process.exec(`"${exePath}" -version`, (e, stdout, stderr) => {
			let regexp: RegExp = /(?:java|openjdk) version "((\d+)(\.(\d+).+?)?)"/g;
			if (stderr) {
				let match = regexp.exec(stderr);
				if (match) {
					let major = parseInt(match[2]) || 0;
					let minor = parseInt(match[4]) || 0;
					// java 1.8+
					if (major > 1 || (major === 1 && minor >= 8)) {
						resolve();
						return;
					}
					reject(`Unsupported Java version: ${match[1]}, please install Java 1.8 or above.`);
					return;
				}
			}
			reject("Can't find Java! Please install Java 1.8 or above and set JAVA_HOME environment variable.");
		});
	});
}

function restartServer() {
	if (!languageClient) {
		startServer();
	} else {
		languageClient.stop().then(startServer);
	}
}

async function startServer() {
	try {
		await validateJava();
	} catch (e) {
		console.log("JAVA NOT FOUND");
		return;
	}

	doStartServer().then(() => {
		onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
	}).catch(reason => {
		console.log(`Failed to start clx language server!\n${reason}`);
	});
}

async function doStartServer() {
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: LANGUAGE_ID }],
		synchronize: {
			configurationSection: ["clx", "files.associations"],
			fileEvents: [
				vscode.workspace.createFileSystemWatcher("**/*.clx")
			]
		},
		initializationOptions: {
			stdFolder: vscode.Uri.file(path.resolve(extensionContext.extensionPath, "res/std")).toString(),
			apiFolders: [],
			client: 'vsc',
		}
	}


	const cp = path.resolve(extensionContext.extensionPath, "server", "*");
	const exePath = javaExecutablePath || "java";
	let serverOptions: ServerOptions = {
		command: exePath,
		args: ["-cp", cp, "com.tang.vscode.MainKt", "-XX:+UseG1GC", "-XX:+UseStringDeduplication"]
	};

	languageClient = new LanguageClient(LANGUAGE_ID, "CLX language client", serverOptions, clientOptions);
	languageClient.start().then(() => {
		console.log("CLX language client ready");
	})
}



function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
	if (activeEditor && activeEditor.document === event.document
		&& activeEditor.document.languageId === LANGUAGE_ID
		&& languageClient != undefined
	) {
		Annotator.requestAnnotators(activeEditor, languageClient);
	}
}

function onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
	if (editor
	&& editor.document.languageId === LANGUAGE_ID
	&& languageClient != undefined) {
		activeEditor = editor as vscode.TextEditor;
		Annotator.requestAnnotators(activeEditor, languageClient);
	}
}

function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
	let shouldRestart = false;
	let newJavaExecutablePath = findJava();
	if (newJavaExecutablePath !== javaExecutablePath) {
		javaExecutablePath = newJavaExecutablePath;
		shouldRestart = true;
	}

	if (languageClient !== undefined) {
		Annotator.onDidChangeConfiguration(languageClient);
	}

	if (shouldRestart) {
		restartServer();
	}
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