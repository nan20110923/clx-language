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
 *
 * start / restart / stop 都走同一条串行队列。这不是洁癖：VS Code 的命令是全局
 * 命名空间，两个客户端同时在役时，后一个会因为 LuaLS 宣告的 `lua.removeSpace`
 * 重名而整个启动失败（用户看到 "couldn't create connection to server"）。
 * 见 lifecycle.ts 里那两段逻辑的说明。
 */

import * as vscode from 'vscode';
import {
	ExecuteCommandRequest,
	LanguageClientOptions,
	LanguageClient,
	ServerOptions
} from 'vscode-languageclient/node';
import { LANGUAGE_ID } from '../ids';
import { prepareServer } from './lualsServer';
import { adoptCommands, LifecycleQueue } from './lifecycle';
import type { Disposable } from './lifecycle';

export class ClxLanguageServer {
	private _client: LanguageClient | undefined;
	/** 我们代替语言客户端注册的命令，停止时必须自己撤掉。 */
	private _commands: Disposable[] = [];
	private readonly _lifecycle = new LifecycleQueue();

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
	start(): Promise<void> {
		return this._lifecycle.run(() => this.startNow());
	}

	/** 先停再起。没起来过 stopNow 是空操作，效果等于直接起。 */
	restart(): Promise<void> {
		return this._lifecycle.run(async () => {
			await this.stopNow();
			await this.startNow();
		});
	}

	stop(): Promise<void> {
		return this._lifecycle.run(() => this.stopNow());
	}

	private async startNow(): Promise<void> {
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

		const client = new LanguageClient(
			LANGUAGE_ID,
			'CLX language client',
			this.serverOptions(spec),
			this.clientOptions()
		);
		this.takeOverCommands(client);
		try {
			await client.start();
			this._client = client;
			console.log('CLX language client ready');
		} catch (reason) {
			console.log(`Failed to start the CLX language server!\n${reason}`);
			await this.discard(client);
		}
	}

	private async stopNow(): Promise<void> {
		const client = this._client;
		this._client = undefined;
		// 命令先撤：即使下面 stop() 抛错，也不会留下重名的注册
		this.releaseCommands();
		if (!client) {
			return;
		}
		try {
			await client.stop();
		} catch (e) {
			// 客户端还卡在 starting 时 stop() 会拒绝（它只接受 running 状态）。
			// 这种情况不能就此把句柄丢掉 —— 那个客户端仍在跑、命令仍注册着，
			// 下一次启动就会撞上重名。discard 会连它的服务器进程一起收掉。
			console.log(`Stopping the CLX language server failed: ${e}`);
			await this.discard(client);
		}
	}

	/** 丢掉一个不再复用的客户端：撤掉注册、结束它的服务器进程。 */
	private async discard(client: LanguageClient): Promise<void> {
		this.releaseCommands();
		await client.dispose().catch(() => undefined);
	}

	private releaseCommands(): void {
		for (const command of this._commands.splice(0)) {
			command.dispose();
		}
	}

	/**
	 * 接管 LuaLS 宣告的 workspace 命令（`lua.removeSpace` / `lua.solve` /
	 * `lua.jsonToLua` …）。
	 *
	 * 为什么不交给 vscode-languageclient 自己注册：它对每个宣告的命令直接调
	 * `registerCommand`，名字被占用时抛 "command ... already exists"，而这个异常
	 * 发生在 initializeFeatures 里，整个语言客户端会跟着启动失败。一个命令名撞车
	 * 不该有这种后果。细节见 lifecycle.ts 的 adoptCommands。
	 */
	private takeOverCommands(client: LanguageClient): void {
		const feature = client.getFeature(ExecuteCommandRequest.method);
		feature.initialize = capabilities => {
			// 客户端内部重启（崩溃后自动重起）不走 stopNow，所以每次 initialize
			// 都按当前宣告重建一遍，避免上一轮的注册残留成重名。
			this.releaseCommands();
			const { adopted, skipped } = adoptCommands(
				capabilities.executeCommandProvider?.commands ?? [],
				(command, handler) => vscode.commands.registerCommand(command, handler),
				command => (...args: unknown[]) =>
					client.sendRequest(ExecuteCommandRequest.type, { command, arguments: args })
			);
			this._commands = adopted;
			for (const command of skipped) {
				console.log(`LuaLS command '${command}' is already registered, leaving it alone.`);
			}
		};
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
