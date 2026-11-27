'use strict';

/**
 * `#include` / `#blob` / `#png` 的路径补全逻辑，不 import vscode。
 *
 * 规则直接来自模拟器源码（c/coloX/src/coloX_cart.c 的 _cart_dealwith_include）：
 *   - 只有三条指令，且**必须带一个空格**（`memcmp(buf, "#include ", 9) == 0`）
 *   - 指令后面的文本被当作路径，与 cart 文件所在目录直接做字符串拼接
 *     （不解析 `..`，不规范化，所以这里也只按相对路径处理）
 *   - 三条指令在任何区段都能用；`#png` 只在 __gfx__ 有意义，但补全不必区分
 *   - 不递归展开：被 include 文件里的指令不会被处理
 *
 * 因此补全的候选就是「当前 .clx 所在目录下的条目」，不按扩展名过滤 ——
 * 指令本身不区分文件类型，.lua / .clx / .png / 任意二进制都能塞进去。
 */

/** 三条例指令，注意都带尾随空格 */
const DIRECTIVES = ['#include ', '#blob ', '#png '];

/** 一条待补全的指令上下文。 */
export interface DirectiveContext {
	/** 是哪条指令 */
	directive: string;
	/** 指令后面已经输入的路径前缀（可能含子目录，以 / 分隔） */
	prefix: string;
}

/**
 * 从当前行里认出指令和已输入的路径前缀。
 *
 * 只在「行首（允许前置空白）就是指令」时返回结果 —— 这与模拟器的行为一致：
 * 它是在行首做 memcmp 的，`x = 1 #include foo` 这种不是指令。
 */
export function parseDirective(line: string): DirectiveContext | null {
	const trimmed = line.replace(/^\s+/, '');
	for (const directive of DIRECTIVES) {
		if (trimmed.startsWith(directive)) {
			// 指令后面到行尾都是路径；指令只吃一个空格，多余的也算路径的一部分
			return { directive, prefix: trimmed.slice(directive.length) };
		}
	}
	return null;
}

/** 一个候选条目。 */
export interface PathEntry {
	name: string;
	isDirectory: boolean;
}

/** 补全候选项，已经算好插入文本。 */
export interface PathSuggestion {
	/** 显示的标签 */
	label: string;
	/** 选中后插入的文本（目录带尾随 /） */
	insertText: string;
	/** 是否为目录 */
	isDirectory: boolean;
}

/**
 * 把候选条目按已输入前缀过滤，并算出每个的插入文本。
 *
 * 前缀里的目录部分（最后一个 `/` 之前）保持不变，只对最后一段做过滤 ——
 * 这样在 `assets/im` 上补全时给的是 `assets/images/`，而不是 `images/`。
 *
 * 过滤是**大小写敏感的前缀匹配**：路径在 Windows 上不区分大小写，但补全
 * 应该补出磁盘上真实的文件名，把 `Assets` 改成 `assets` 会让路径在大小写敏感
 * 的文件系统上失配。需要宽松匹配时用户在 VS Code 里关掉"按输入过滤"即可。
 */
export function suggest(prefix: string, entries: PathEntry[]): PathSuggestion[] {
	const slash = prefix.lastIndexOf('/');
	const dirPart = slash === -1 ? '' : prefix.slice(0, slash + 1);
	const leafPart = slash === -1 ? prefix : prefix.slice(slash + 1);

	const out: PathSuggestion[] = [];
	for (const entry of entries) {
		if (leafPart !== '' && !entry.name.startsWith(leafPart)) {
			continue;
		}
		const insertText = dirPart + entry.name + (entry.isDirectory ? '/' : '');
		out.push({
			label: entry.name + (entry.isDirectory ? '/' : ''),
			insertText,
			isDirectory: entry.isDirectory
		});
	}

	// 目录排在文件前面，同类按名字排。用户在补路径时通常先往目录里走。
	// 用统一的 code-unit 比较而不是 localeCompare：路径补全的排序不该随
	// 系统区域设置变化，否则同一个目录在两台机器上的顺序会不同。
	out.sort((a, b) => {
		if (a.isDirectory !== b.isDirectory) {
			return a.isDirectory ? -1 : 1;
		}
		const an = a.label;
		const bn = b.label;
		return an < bn ? -1 : an > bn ? 1 : 0;
	});
	return out;
}

/**
 * 判断某个相对路径的相对目录部分是否越出 cart 目录。
 *
 * 模拟器不检查这个（它直接拼字符串交给 fopen），所以 `#include ../x.lua`
 * 在模拟器里能跑。但补全不去读上级目录：那会暴露工作区外的文件名，而且
 * 用户手打 `../` 时本来也不需要补全提示。这里只用来决定"要不要列目录"。
 */
export function staysInside(prefix: string): boolean {
	const parts = prefix.split('/');
	let depth = 0;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (part === '' || part === '.') {
			continue;
		}
		if (part === '..') {
			depth--;
			if (depth < 0) {
				return false;
			}
			continue;
		}
		depth++;
	}
	return true;
}
