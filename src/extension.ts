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
import * as net from "net";
import * as child_process from "child_process";
import path = require('path');
import * as os from 'os';
import findJava from './findJava';
import * as Annotator from "./annotator";
import { LanguageClientOptions, LanguageClient, ServerOptions, StreamInfo } from 'vscode-languageclient/node';
import { ClxLanguageConfiguration } from './languageConfiguration';
import { activateDebug } from './debugger/activeDebug';


export let extensionContext: vscode.ExtensionContext;
export let languageClient: LanguageClient;
export const LANGUAGE_ID: string = "clx";
export let coloxProcess: child_process.ChildProcess | undefined;

let javaExecutablePath: string | null;
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
			if (!isColoXToolRunning()) {
				runColoXTool(resource, false)
			}
		}),
		// vscode.commands.registerCommand('extension.clx-language.debug', (resource: vscode.Uri) => {
		// 	cmdRun(context, resource)
		// }),
		vscode.commands.registerCommand("extension.clx-language.restartServer", restartServer)
	);


	startServer();

	// debug
	activateDebug(context);

	return {
		reportAPIDoc: (classDoc: any) => {
			languageClient?.sendRequest("emmy/reportAPI", classDoc);
		}
	}
}

export function isColoXToolRunning() {
	return coloxProcess && coloxProcess.exitCode == null
}

export function terminateColoXTool() {
	if (isColoXToolRunning()) {
		coloxProcess?.kill()
	}
}

export function runColoXTool(resource: vscode.Uri | null, debug: boolean) {
	let targetResource = resource;
	if (!targetResource && vscode.window.activeTextEditor) {
		targetResource = vscode.window.activeTextEditor.document.uri;
	}

	if (targetResource) {
		vscode.workspace.fs.readFile(targetResource).then(content => {
			const contentStr = new TextDecoder().decode(content)
			
			const lines = contentStr.split(/\r?\n/)

			if (lines.length == 0) {
				vscode.window.showErrorMessage('CLX file no content!!')
				return
			}
			const firstLine = lines[0]
			var matches = firstLine.match(/coloX-(4|16|32)(P|B|C|L|W)?/g)
			if (matches && matches.length >= 1) {
				const sizeSpec = matches[1]
				const debuggerPath = selectDebuggerPath(sizeSpec)
				if (!debuggerPath) return

				let dir = path.dirname(targetResource!.fsPath);
				let fileName = path.basename(targetResource!.fsPath);
				let cmdStr = `${debuggerPath} -d ` + dir + path.sep + " -r " + fileName;
				if (debug) {
					cmdStr += " -x"
				}
				try {
					coloxProcess = child_process.exec(`export DYLD_LIBRARY_PATH=${path.dirname(debuggerPath)}\n${cmdStr}`)
					coloxProcess.on('close', (code) => {
						console.log('coloxProcess exit: ', code)
					})
				} catch (e) {
					vscode.window.showErrorMessage(`Run coloXtool failed: ${e}`)
				}

			} else {
				vscode.window.showErrorMessage('The devcice specification must be labeled on the first line!!')
				return
			}
		})
	}
}

// 当用户自定义Debugger Path时，使用用户自定义的
// 当用户指定Debugger为For Nature时，使用Natuer Debugger
// 默认根据文件首行标识的设备规格来选择Debugger
function selectDebuggerPath(sizeSpec : string) : string | null {
	var debuggerType = vscode.workspace.getConfiguration("clx-language").get<string>("debugger")
	var debuggerCustomPath = vscode.workspace.getConfiguration("clx-language").get<string>("debuggerCustomPath")
	if (debuggerType == 'Custom' && debuggerCustomPath && debuggerCustomPath.length > 0) {
		return debuggerCustomPath
	}
	
	if (debuggerType == 'Nature' || sizeSpec == '32') {
		return getDebuggerPathByType('Nature')
	}
	return getDebuggerPathByType('ColoPlay')
}

function getDebuggerPathByType(debugType: string) : string | null {
	let extensionPath = extensionContext.extensionPath
	let platform: string = os.platform()
	let coloxToolPath : string | null = null
	if (platform == 'darwin') {
		if (debugType == 'Nature') {
			coloxToolPath = path.resolve(extensionPath, "debugger", "nature/osx/bin", "coloXtool");
		} else {
			coloxToolPath = path.resolve(extensionPath, "debugger", "osx/MacOS", "coloXtool");
		}
	} else if (platform == 'win32') {
		// win32 暂时不支持nature
		coloxToolPath = path.resolve(extensionPath, "debugger", "win32", "coloXtool.exe");
	} else {
		vscode.window.showErrorMessage(`Not support platform: ${platform}`)
	}
	return coloxToolPath
}

export function deactivate() {
	languageClient?.stop();
}

async function validateJava(): Promise<void> {
	const exePath = javaExecutablePath || "java";
	// console.log('exe path : ' + exePath);
	return new Promise<void>((resolve, reject) => {
		child_process.exec(`"${exePath}" -version`, (e, stdout, stderr) => {
			let regexp: RegExp = /(?:java|openjdk) version "((\d+)(\.(\d+).+?)?)"/g;
			if (stderr) {
				let match = regexp.exec(stderr);
				if (match) {
					let major = parseInt(match[2]) || 0;
					// let minor = parseInt(match[4]) || 0;
					// console.log(`major: ${major} minor: ${minor}`)
					// java 11+
					if (major >= 11) {
						resolve();
						return;
					}
					reject(`Unsupported Java version: ${match[1]}, please install Java 11 or above.`);
					return;
				}
			}
			reject("Can't find Java! Please install Java 11 or above and set JAVA_HOME environment variable.");
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
		vscode.window.showErrorMessage("Please install Java 11 or above.");
		return;
	}

	doStartServer().then(() => {
		onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
	}).catch(reason => {
		console.log(`Failed to start clx language server!\n${reason}`);
	});
}

async function doStartServer() {
	let currentLanguage = vscode.env.language;
	let isZh = false
	if (currentLanguage.startsWith("zh")) {
		isZh = true
	}
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: LANGUAGE_ID }],
		synchronize: {
			configurationSection: ["clx", "files.associations"],
			fileEvents: [
				vscode.workspace.createFileSystemWatcher("**/*.clx")
			]
		},
		initializationOptions: {
			stdFolder: vscode.Uri.file(path.resolve(extensionContext.extensionPath, isZh ? "res/std_zh" : "res/std")).toString(),
			apiFolders: [],
			client: 'vsc',
		}
	}

	let serverOptions: ServerOptions;
    if (false) {
        const connectionInfo = {
            port: 9999
        };
        serverOptions = () => {
            // Connect to language server via socket
            let socket = net.connect(connectionInfo);
            let result: StreamInfo = {
                writer: socket,
                reader: socket as NodeJS.ReadableStream
            };
            socket.on("close", () => {
                console.log("client connect error!");
            });
            return Promise.resolve(result);
        };
    } else {
		const cp = path.resolve(extensionContext.extensionPath, "server", "*");
		const exePath = javaExecutablePath || "java";
		serverOptions = {
			command: exePath,
			args: ["-cp", cp, "com.tang.vscode.MainKt", "-XX:+UseG1GC", "-XX:+UseStringDeduplication"]
		};
	}

	// languageClient.onNotification("emmy/setServerStatus", (param: ServerStatusParams) => {
	// 	setServerStatus(param);
	// });

	languageClient = new LanguageClient(LANGUAGE_ID, "CLX language client", serverOptions, clientOptions);
	languageClient.start().then(() => {
		console.log("CLX language client ready");
	})
}


// function setServerStatus(status: ServerStatusParams) {
// 	console.log('ServerStatus: ', status)
// 	switch (status.health) {
// 		case "ok":
// 			break;
// 		case "warning":
// 			break;
// 		case "error":
// 			break;
// 		case "stop":
// 			break;
// 	}
// }

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
	if (activeEditor && activeEditor.document === event.document
		&& activeEditor.document.languageId === LANGUAGE_ID
		&& languageClient != undefined
	) {
		Annotator.requestAnnotators(activeEditor, languageClient);
	}
}

function onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
	if (editor && editor.document.languageId === LANGUAGE_ID && languageClient != undefined) {
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