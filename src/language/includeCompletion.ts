'use strict';

/**
 * `#include` / `#blob` / `#png` 后面路径补全的 VS Code 侧。
 *
 * 纯逻辑在 includePath.ts（可测）；这里只负责读目录、构造 CompletionItem。
 *
 * 为什么在 VS Code 侧而不是改 LuaLS：
 *   - VS Code 会把所有 CompletionItemProvider 的结果合并，两边不冲突
 *   - LuaLS 的插件机制没有补全钩子（只有 OnSetText / OnTransformAst /
 *     ResolveRequire），要加就得改它的源码，升级时得重新 diff
 *   - 在这里能用 node:test 直接测路径解析
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LANGUAGE_ID } from '../ids';
import { parseDirective, staysInside, suggest } from './includePath';
import type { PathEntry } from './includePath';

/** 触发字符。`/` 用于进入子目录，`.` 用于补扩展名，`_` 与 `-` 常见于文件名。 */
const TRIGGER_CHARACTERS = ['/', '.', '_', '-'];

/** 列出 cart 目录下（或 prefix 指向的子目录下）的条目。目录不可读时返回空。 */
function readEntries(cartDirectory: string, prefix: string): PathEntry[] {
	const slash = prefix.lastIndexOf('/');
	const dirPart = slash === -1 ? '' : prefix.slice(0, slash);
	// 模拟器把路径与 cart 目录直接拼接，这里保持同样的相对语义
	const target = path.join(cartDirectory, dirPart);
	let names: fs.Dirent[];
	try {
		names = fs.readdirSync(target, { withFileTypes: true });
	} catch {
		// 目录不存在或没权限：静默给空列表，不要弹错误
		return [];
	}
	return names
		.filter(entry => !entry.name.startsWith('.'))
		.map(entry => ({
			name: entry.name,
			isDirectory: entry.isDirectory()
		}));
}

export function registerIncludeCompletion(): vscode.Disposable {
	const provider: vscode.CompletionItemProvider = {
		provideCompletionItems(document, position) {
			const lineText = document.lineAt(position.line).text;
			// 只看光标之前的部分：光标后面可能还有内容（补全时不该被它影响）
			const before = lineText.slice(0, position.character);
			const context = parseDirective(before);
			if (!context) {
				return undefined;
			}
			// `../` 已经走出 cart 目录，不列上级目录
			if (!staysInside(context.prefix)) {
				return undefined;
			}

			const cartDirectory = path.dirname(document.uri.fsPath);
			const entries = readEntries(cartDirectory, context.prefix);
			if (entries.length === 0) {
				return undefined;
			}

			const suggestions = suggest(context.prefix, entries);
			if (suggestions.length === 0) {
				return undefined;
			}

			// 替换范围：从路径前缀的开头到光标。这样补全会替换掉已输入的部分，
			// 而不是把它拼两遍。
			const prefixStart = position.character - context.prefix.length;
			const range = new vscode.Range(
				position.line,
				prefixStart,
				position.line,
				position.character
			);

			return suggestions.map(suggestion => {
				const item = new vscode.CompletionItem(
					suggestion.label,
					suggestion.isDirectory
						? vscode.CompletionItemKind.Folder
						: vscode.CompletionItemKind.File
				);
				item.insertText = suggestion.insertText;
				item.range = range;
				// 目录补完后通常还要继续往下一层走，不在这里自动弹补全
				item.command = suggestion.isDirectory
					? { command: 'editor.action.triggerSuggest', title: 'Suggest' }
					: undefined;
				// 路径补全应该比 LuaLS 的关键字建议更靠前
				item.sortText = `0${suggestion.label}`;
				return item;
			});
		}
	};

	return vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file', language: LANGUAGE_ID },
		provider,
		...TRIGGER_CHARACTERS
	);
}
