'use strict';

/**
 * 语言客户端生命周期里两段决定性逻辑，不 import vscode。
 *
 * 抽出来是因为它们最容易出连锁故障，而故障表现离原因很远：
 *
 * 1. `adoptCommands` —— 服务器宣告的 workspace 命令（LuaLS 是 `lua.removeSpace`
 *    那 6 个）由我们自己注册。交给 vscode-languageclient 注册的话，命令重名会让
 *    客户端的 initializeFeatures 抛异常，整个语言客户端跟着启动失败。用户看到
 *    的是 "couldn't create connection to server"，完全看不出这只是一个命令名撞车。
 *
 * 2. `LifecycleQueue` —— 两个客户端同时在役时就会撞上上面的重名，所以启动、停止、
 *    重启必须串行。队列还要在某个操作失败后继续服务，否则一次下载失败会把后续
 *    所有重启都卡死。
 */

/** 只依赖 dispose()，不依赖 vscode.Disposable 的具体类型。 */
export interface Disposable {
	dispose(): void;
}

/**
 * 把命令名映射到注册动作。
 *
 * 用这个接口而不是直接要 `vscode.commands.registerCommand`，是为了让"重名要跳过"
 * 这条规则在普通 Node 里可测：真实 registerCommand 在重名时抛错。
 */
export interface CommandRegistrar {
	(command: string, handler: (...args: never[]) => unknown): Disposable;
}

/** 一次接管的结果，供调用方记日志。 */
export interface AdoptResult {
	/** 成功注册的命令，撤销时按这个列表 dispose。 */
	adopted: Disposable[];
	/** 已被别人占用、因而跳过的命令名。 */
	skipped: string[];
}

/**
 * 注册服务器宣告的命令，重名的跳过而不是让整条启动失败。
 *
 * VS Code 的命令是全局命名空间。用户同时装了 LuaLS 自己的 VS Code 扩展、或者
 * 别的 Lua 扩展时，`lua.removeSpace` 之类的名字早被占了 —— 那不该妨碍 CLX 的
 * 补全和诊断。
 *
 * `handler` 接收命令名，返回要注册的处理函数。由调用方决定怎么转发给服务器，
 * 这里只管"重名跳过"这一条规则。
 *
 * 被跳过的命令会落到占用它的那个扩展上。这不是完美结果，但它们本来就已经被占了，
 * 我们能做的只有不让它拖垮整个客户端。
 */
export function adoptCommands(
	commands: readonly string[],
	register: CommandRegistrar,
	handler: (command: string) => (...args: never[]) => unknown
): AdoptResult {
	const adopted: Disposable[] = [];
	const skipped: string[] = [];

	for (const command of commands) {
		try {
			adopted.push(register(command, handler(command)));
		} catch {
			// 这里刻意吞掉异常：注册失败的**唯一**预期原因是名字已被占用，
			// 而那种情况下服务器本身仍然可用。记在 skipped 里由调用方打日志。
			skipped.push(command);
		}
	}

	return { adopted, skipped };
}

/**
 * 串行执行异步操作。
 *
 * 与 `debugChannel` 的请求队列同一套思路：把 promise 接在当前尾巴后面。
 * 区别在于这里**不保留失败** —— 每个调用方拿到自己的失败，队列本身继续可用。
 */
export class LifecycleQueue {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(op: () => Promise<T>): Promise<T> {
		const result = this.tail.then(op);
		// 接在 then(..., ...) 上而不是 catch：两种情况都要让后续操作能继续，
		// 但调用方仍透过 result 看到原始成功值或失败。
		this.tail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
}
