'use strict';

/**
 * CLX 语言服务器（EmmyLua 修改版，server/lua_ls.jar）的生命周期。
 *
 * 一个 Java 子进程，通过 stdin/stdout 讲 LSP。这里管三件事：找到可用的 Java、
 * 起停客户端、在 Java 路径变化时重启。
 *
 * 标准库存根按 VS Code 的界面语言选：中文用 res/std_zh，其他用 res/std。
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { LanguageClientOptions, LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import findJava from './javaLocator';

export const LANGUAGE_ID = 'clx';

/** java 11+ 才够用；这里只看 stderr 里报的版本号 */
function validateJava(javaPath: string): Promise<void> {
	const exePath = javaPath || 'java';
	return new Promise<void>((resolve, reject) => {
		child_process.exec(`"${exePath}" -version`, (e, stdout, stderr) => {
			const regexp = /(?:java|openjdk) version "((\d+)(\.(\d+).+?)?)"/g;
			if (stderr) {
				const match = regexp.exec(stderr);
				if (match) {
					const major = parseInt(match[2]) || 0;
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

export class ClxLanguageServer {
	private _client: LanguageClient | undefined;
	private javaPath: string | null;

	constructor(private readonly extensionPath: string) {
		this.javaPath = findJava();
	}

	/** 给注解模块用：它需要一个 LanguageClient 去发 emmy/annotator 请求。 */
	get client(): LanguageClient | undefined {
		return this._client;
	}

	get isRunning(): boolean {
		return this._client !== undefined;
	}

	/** 往语言服务器发请求。客户端没起来时静默丢弃 —— 调用方都是"尽力而为"。 */
	sendRequest(method: string, params: unknown): void {
		this._client?.sendRequest(method, params);
	}

	/** 启动客户端。Java 不可用时报错并保持未启动状态。 */
	async start(): Promise<void> {
		try {
			await validateJava(this.javaPath || 'java');
		} catch (e) {
			vscode.window.showErrorMessage('Please install Java 11 or above.');
			return;
		}

		try {
			const client = new LanguageClient(
				LANGUAGE_ID,
				'CLX language client',
				this.serverOptions(),
				this.clientOptions()
			);
			this._client = client;
			await client.start();
			console.log('CLX language client ready');
		} catch (reason) {
			console.log(`Failed to start clx language server!\n${reason}`);
			this._client = undefined;
		}
	}

	/** 先停再起。没起来过就直接起。 */
	async restart(): Promise<void> {
		if (!this._client) {
			await this.start();
			return;
		}
		const client = this._client;
		this._client = undefined;
		await client.stop();
		await this.start();
	}

	async stop(): Promise<void> {
		const client = this._client;
		this._client = undefined;
		await client?.stop();
	}

	/**
	 * 重新检测 Java 路径（设置项 JAVA_HOME、环境变量、PATH 任一可能改了）。
	 * 返回是否发生变化 —— 变了就得重启才生效。
	 */
	refreshJavaPath(): boolean {
		const next = findJava();
		if (next === this.javaPath) {
			return false;
		}
		this.javaPath = next;
		return true;
	}

	private clientOptions(): LanguageClientOptions {
		// 中文界面用中文标准库，其他语言用英文。只看前缀，zh-CN / zh-TW 都算中文。
		const isZh = vscode.env.language.startsWith('zh');
		return {
			documentSelector: [{ scheme: 'file', language: LANGUAGE_ID }],
			synchronize: {
				configurationSection: ['clx', 'files.associations'],
				fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.clx')]
			},
			initializationOptions: {
				stdFolder: vscode.Uri.file(
					path.resolve(this.extensionPath, isZh ? 'res/std_zh' : 'res/std')
				).toString(),
				apiFolders: [],
				client: 'vsc'
			}
		};
	}

	private serverOptions(): ServerOptions {
		// java -cp <extension>/server/* com.tang.vscode.MainKt
		// server/ 下的 jar 由 package.json 打进 vsix；这个通配符交给 JVM 展开。
		const classpath = path.resolve(this.extensionPath, 'server', '*');
		return {
			command: this.javaPath || 'java',
			args: ['-cp', classpath, 'com.tang.vscode.MainKt', '-XX:+UseG1GC', '-XX:+UseStringDeduplication']
		};
	}
}
