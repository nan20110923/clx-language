'use strict';

/**
 * CLX 语言服务器的生命周期。
 *
 * 服务器是 LuaLS（lua-language-server，Rust/C++ 实现，无需运行时依赖），
 * 按需下载到 globalStorage。这里管三件事：确保它已就位、起停客户端、
 * 配置变化时重启。
 *
 * 为什么换掉了原来的 Java jar：
 *   - 不再需要用户预装 JDK
 *   - 不再需要仓库里维护一份改过的 EmmyLua 二进制
 *   - .clx 的格式差异由 res/luals/clx.lua 插件处理，不再靠魔改服务器
 * 详见 docs/adr/0003-luals-replaces-emmylua.md。
 *
 * 存根按 VS Code 的界面语言选：中文用 res/clx-std/zh，其他用 en。
 * 存根路径与 LuaLS 的其他配置都在 lualsConfig.ts 生成。
 */

import * as vscode from 'vscode';
import { LanguageClientOptions, LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { LANGUAGE_ID } from '../ids';
import { prepareServer } from './lualsServer';

export class ClxLanguageServer {
	private _client: LanguageClient | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {}

	get client(): LanguageClient | undefined {
		return this._client;
	}

	/**
	 * 往语言服务器发请求。
	 *
	 * 客户端没起来时静默丢弃 —— 调用方都是"尽力而为"。这里必须挂 catch：
	 * 服务器不认的方法会回 MethodNotFound，不接住就是 unhandled rejection。
	 */
	sendRequest(method: string, params: unknown): void {
		this._client?.sendRequest(method, params).catch(() => undefined);
	}

	/**
	 * 启动客户端。
	 *
	 * 语言服务器需要下载时在这里完成（静默 + 状态栏）。下载失败或用户跳过时
	 * 只是没有语言功能，语法高亮不受影响 —— 所以不弹错误框，直接返回。
	 */
	async start(): Promise<void> {
		let spec;
		try {
			spec = await prepareServer(this.context);
		} catch (e) {
			console.log(`Cannot prepare the CLX language server: ${e}`);
			return;
		}
		if (!spec) {
			// 用户取消下载或下载失败，lualsServer 已经记过日志
			return;
		}

		try {
			const client = new LanguageClient(
				LANGUAGE_ID,
				'CLX language client',
				this.serverOptions(spec),
				this.clientOptions()
			);
			this._client = client;
			await client.start();
			console.log('CLX language client ready');
		} catch (reason) {
			console.log(`Failed to start the CLX language server!\n${reason}`);
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

	private clientOptions(): LanguageClientOptions {
		return {
			documentSelector: [{ scheme: 'file', language: LANGUAGE_ID }],
			synchronize: {
				configurationSection: ['Lua', 'files.associations'],
				fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.clx')]
			},
			initializationOptions: {
				// 插件由本扩展提供（res/luals/clx.lua），不需要 LuaLS 再弹一次信任确认。
				// 见 LuaLS 的 script/plugin.lua checkTrustLoad 与 script/client.lua getOption。
				trustByClient: true
			}
		};
	}

	private serverOptions(spec: { command: string; args: string[]; env: NodeJS.ProcessEnv }): ServerOptions {
		return {
			command: spec.command,
			args: spec.args,
			options: {
				env: spec.env
			}
		};
	}
}
