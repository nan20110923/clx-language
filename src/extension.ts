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
import * as fs from 'fs';
import * as os from 'os';
import findJava from './findJava';
import * as Annotator from "./annotator";
import { LanguageClientOptions, LanguageClient, ServerOptions, StreamInfo } from 'vscode-languageclient/node';
import { ClxLanguageConfiguration } from './languageConfiguration';
import { activateDebug } from './debugger/activeDebug';
import { ensureEmulator, EmulatorError, EmulatorLaunch, disposeEmulatorOutput } from './emulator';


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
		vscode.commands.registerCommand('extension.clx-language.run', async (resource: vscode.Uri) => {
			var connect = await tryConnectColoXTool()
			if (!connect && !isColoXToolRunning()) {
				await runColoXTool(resource, false)
			} else {
				vscode.window.showErrorMessage("ColoX emulator is already running!!")
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

export async function tryConnectColoXTool() : Promise<boolean> {
	return new Promise((resolve, reject) => {
		var socket = net.connect({
			port: 3563,
			host: '127.0.0.1'
		}).on('connect', () => {
			socket.destroy()
			resolve(true)
		}).on('error', err => {
			resolve(false)
		})
	})
}

export function isColoXToolRunning() {
	return coloxProcess && coloxProcess.exitCode == null
}

export function terminateColoXTool() {
	if (isColoXToolRunning()) {
		coloxProcess?.kill()
	}
}

/**
 * 启动模拟器运行指定的 CLX 文件。
 * 返回是否成功启动：调用方据此决定要不要开始等调试端口。
 */
export async function runColoXTool(resource: vscode.Uri | null, debug: boolean): Promise<boolean> {
	let targetResource = resource;
	if (!targetResource && vscode.window.activeTextEditor) {
		targetResource = vscode.window.activeTextEditor.document.uri;
	}

	if (!targetResource) {
		return false;
	}

	const content = await vscode.workspace.fs.readFile(targetResource);
	const contentStr = new TextDecoder().decode(content)

	const lines = contentStr.split(/\r?\n/)

	if (lines.length == 0) {
		vscode.window.showErrorMessage('CLX file no content!!')
		return false
	}
	// 首行必须标出设备规格。这里不维护规格列表，交给模拟器自己判断，
	// 免得新规格（例如 coloX-PICO8）出现时插件先把它拦下来。
	const firstLine = lines[0]
	const hasDeviceSpec = /coloX-[A-Za-z0-9]+/.test(firstLine)
		|| /X-\d+x\d+(_\d+)?/.test(firstLine)

	if (!hasDeviceSpec) {
		vscode.window.showErrorMessage('The device specification must be labeled on the first line!!')
		return false
	}

	const customPath = selectCustomDebugger()
	// 自定义路径一旦设置就完全接管，不做任何下载或回落
	const emulator = customPath
		? { executable: customPath, libraryDir: path.dirname(customPath) }
		: await ensureEmulatorReady()
	if (!emulator) {
		return false
	}
	if (customPath && !fs.existsSync(customPath)) {
		vscode.window.showErrorMessage(`The configured emulator does not exist: ${customPath}`)
		return false
	}

	const dir = path.dirname(targetResource.fsPath);
	const fileName = path.basename(targetResource.fsPath);
	// 以参数数组启动，路径不经过 shell：cmd.exe 不认单引号，会把引号当成路径的一部分传给模拟器
	let args = ['-d', dir + path.sep, '-r', fileName]
	if (debug) {
		args.push('-x')
	}
	let env = process.env
	if (os.platform() == 'darwin' && emulator.libraryDir) {
		env = { ...process.env, DYLD_LIBRARY_PATH: emulator.libraryDir }
	}
	console.log('runColoXTool: ', emulator.executable, args)

	// spawn 失败是异步的（error 事件），要等它真的起来才报告成功，
	// 否则调用方会白等调试端口。
	return new Promise<boolean>(resolve => {
		let child: child_process.ChildProcess
		let settled = false
		const settle = (ok: boolean) => {
			if (!settled) {
				settled = true
				resolve(ok)
			}
		}

		try {
			child = child_process.spawn(emulator.executable, args, { env: env })
		} catch (e) {
			vscode.window.showErrorMessage(`Run coloX simulator failed: ${e}`)
			settle(false)
			return
		}

		coloxProcess = child
		child.stdout?.on('data', (data) => { console.log('coloxProcess stdout: ', String(data)) })
		child.stderr?.on('data', (data) => { console.log('coloxProcess stderr: ', String(data)) })
		child.on('spawn', () => settle(true))
		child.on('error', (e) => {
			console.log('coloxProcess error: ', e)
			coloxProcess = undefined
			vscode.window.showErrorMessage(`Run coloX simulator failed: ${e}`)
			settle(false)
		})
		child.on('close', (code) => {
			console.log('coloxProcess close: ', code)
			coloxProcess = undefined
			settle(false)
		})
		child.on('exit', (code) => {
			console.log('coloxProcess exit: ', code)
			coloxProcess = undefined
			settle(false)
		})
		child.on('disconnect', (code) => {
			console.log('coloxProcess disconnect: ', code)
			coloxProcess = undefined
			settle(false)
		})
	})
}

/** 拿到可用的模拟器；下载失败时把三条出路讲清楚 */
async function ensureEmulatorReady(): Promise<EmulatorLaunch | null> {
	try {
		return await ensureEmulator(extensionContext)
	} catch (e) {
		if (e instanceof EmulatorError) {
			const openSettings = 'Choose a Local Copy'
			const answer = await vscode.window.showErrorMessage(
				`${e.message} ${e.detail ?? ''} If you are offline or behind a firewall, point "clx-language.debuggerCustomPath" at a local copy of the simulator instead.`,
				openSettings
			)
			if (answer === openSettings) {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'clx-language.debuggerCustomPath');
			}
		} else {
			vscode.window.showErrorMessage(`Failed to prepare the CLX emulator: ${e}`)
		}
		return null
	}
}

/**
 * 用户指定的模拟器路径。设置了就完全接管，不下载也不回落。
 * 注意 `clx-language.debugger` 的 `Nature` 选项已废弃：官方已不再单独发布
 * Nature 模拟器，设备规格由同一个二进制处理。
 */
function selectCustomDebugger(): string | null {
	const debuggerType = vscode.workspace.getConfiguration("clx-language").get<string>("debugger")
	const debuggerCustomPath = vscode.workspace.getConfiguration("clx-language").get<string>("debuggerCustomPath")
	if (debuggerType == 'Custom' && debuggerCustomPath && debuggerCustomPath.length > 0) {
		return debuggerCustomPath
	}
	return null
}

export function deactivate() {
	languageClient?.stop();
	disposeEmulatorOutput();
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