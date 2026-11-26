/**
 * 找到能用的 Java，并展开设置里的路径变量。
 *
 * 查找顺序：设置项 `clx-language.JAVA_HOME` → 环境变量 `JAVA_HOME` → `PATH`。
 * 这里只负责"找到候选路径"，不验证版本 —— 版本检查在 languageServer.ts
 * （跑一次 `java -version` 读 stderr）。
 */

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 把 `${workspaceFolder}` / `${workspaceFolder:名字}` 展开成实际路径。
 * 没有对应工作区时回落到第一个工作区。
 */
export function substituteFolder(originalPath: string): string {
	let result = originalPath;
	const pattern = /(?:\$\{workspaceFolder(?:[:]([^.]+))?\})/;
	const match = pattern.exec(originalPath);
	if (match !== null) {
		const folder = findWorkspaceFolderByName(match[1]);
		if (folder) {
			result = originalPath.replace(pattern, folder);
		}
	}
	return path.resolve(result);
}

function findWorkspaceFolderByName(workspaceName?: string): string | null {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		return null;
	}
	const folder = folders.find(w => w.name === workspaceName);
	return folder ? folder.uri.fsPath : folders[0].uri.fsPath;
}

/**
 * 找 Java 可执行文件。返回 null 表示没找到 —— 调用方应回落到裸 `"java"`
 * 让 PATH 自己解析，而不是直接失败。
 */
export default function findJava(): string | null {
	const executable = process.platform === 'win32' ? 'java.exe' : 'java';

	const configured = vscode.workspace.getConfiguration('clx-language').get<string>('JAVA_HOME');
	if (configured) {
		return path.join(substituteFolder(configured), 'bin', executable);
	}

	if (process.env.JAVA_HOME) {
		return path.join(process.env.JAVA_HOME, 'bin', executable);
	}

	// PATH 里逐个目录拼。历史上这里会调一个 validateJava 判断存在性，
	// 但那个函数是恒返回 false 的空桩，所以整段扫描从来没成功过；
	// 与其假装检查，不如返回 null 让调用方用裸命令交给系统解析。
	return null;
}
