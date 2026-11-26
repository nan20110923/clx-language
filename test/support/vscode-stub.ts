/**
 * 极小的 `vscode` 替身，只够 `debugSession.ts` 在普通 Node 里加载。
 *
 * 为什么需要它：`debugSession.ts` 是仓库里最容易出 bug 的 module（历史上
 * terminateRequest 没实现、stackTrace 返回过期帧、断点被丢弃，三处都在这里），
 * 但它 import 了 `vscode`，所以默认无法在 node:test 里驱动。
 *
 * 与其为了可测性把 DAP 逻辑拆成又一层间接，不如把 `vscode` 的表面钉死在
 * 下面这五个入口上 —— 它们恰好是 `debugSession.ts` 唯一用到的东西。
 * 一旦那个文件开始依赖别的 VS Code API，测试会立刻失败，这本身也是有用的信号。
 *
 * 用法见 test/debugSession.test.ts：在 import 被测模块**之前**把这个模块
 * 以 `vscode` 的名字注册进 require 缓存。
 */

import { EventEmitter } from 'node:events';

/** 最小 Uri：只需要 `fsPath` 和 `path`，以及 `joinPath`。 */
export class Uri {
	readonly fsPath: string;
	readonly path: string;
	readonly scheme = 'file';

	private constructor(fsPath: string) {
		this.fsPath = fsPath;
		this.path = fsPath;
	}

	static file(p: string): Uri {
		return new Uri(p);
	}

	static joinPath(base: Uri, ...segments: string[]): Uri {
		const joined = [base.fsPath, ...segments].join('/').replace(/\/+/g, '/');
		return new Uri(joined);
	}

	toString(): string {
		return `file://${this.fsPath}`;
	}
}

/**
 * 就绪的文件读写。测试可以在 `__files` 里预置内容，
 * `readFile` 找不到时抛错（与真实实现一致）。
 */
export const __files = new Map<string, Uint8Array>();

export const workspace = {
	fs: {
		async readFile(uri: Uri): Promise<Uint8Array> {
			const content = __files.get(uri.fsPath);
			if (content === undefined) {
				throw new Error(`ENOENT: ${uri.fsPath}`);
			}
			return content;
		},
		async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
			__files.set(uri.fsPath, content);
		},
		async createDirectory(): Promise<void> {
			// 目录是隐式的，不需要记录
		},
		async delete(): Promise<void> {
			// 未使用
		}
	}
};

export const window = {
	activeTextEditor: undefined as unknown
};

/** 测试辅助：清空预置文件。 */
export function __reset(): void {
	__files.clear();
	window.activeTextEditor = undefined;
}

/** 供测试观察：本模块只依赖 EventEmitter 的存在，不需要真实事件。 */
export const __EventEmitter = EventEmitter;
