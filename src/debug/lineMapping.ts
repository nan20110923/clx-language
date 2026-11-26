/**
 * `.clx` 原文件行号 ↔ 模拟器 `__lua__` 行号的映射。
 *
 * 为什么需要它：卡带加载时，`__lua__` 段的每一行被**逐行拼接**进一个 buffer
 * （`coloX_cart.c` 的 `_cart_dealwith_include`），然后整块以名字 `__lua__`
 * 交给 Lua。模拟器报告的行号是那个 buffer 里的行号，不是 `.clx` 文件里的行号。
 *
 * 三种情况：
 *   1. 没有 `#include` —— 两者只差一个固定偏移
 *   2. 有 `#include x.lua` —— 被包含文件的**全部行**插在指令所在位置，
 *      之后所有行都往后挪
 *   3. 有 `#blob` —— 二进制，不占 Lua 行
 *
 * 校准策略：`src __lua__` 会返回拼接后的完整源码，所以**以内容为准**对齐，
 * 而不是猜拼接格式。做法是逐行对拍；一旦失配（说明此处发生了 include 展开），
 * 就用下一行内容在 `.clx` 里重新找锚点，继续对拍 —— 于是得到**多段**映射，
 * include 前后的行都能定位。
 *
 * `#include` 的行数解析只作为交叉校验：若期望值与实际行数不符，说明拼接
 * 口径变了，此时必须失败而不是静默错位。
 *
 * 这个文件不 import vscode，纯函数，可在 node:test 里直接覆盖。
 */

/** 映射无法建立时的原因。调用方据此拒绝启动调试。 */
export class LineMappingError extends Error {
	constructor(message: string, public readonly detail?: string) {
		super(message);
		this.name = 'LineMappingError';
	}
}

/** 文件里的一段连续可映射区间。 */
export interface Segment {
	/** `.clx` 里这段的第一行（1-based，与 VS Code 一致） */
	fileStart: number;
	/** 这段有多少行 */
	count: number;
	/** 这段对应 `__lua__` 里的第一行（1-based） */
	emulatorStart: number;
}

export interface LineMapping {
	/** `.clx` 行号 → `__lua__` 行号；不在 Lua 区段内时抛 LineMappingError */
	toEmulator(fileLine: number): number;
	/** `__lua__` 行号 → `.clx` 行号；映射不到时返回 undefined */
	toFile(emulatorLine: number): number | undefined;
	/** `.clx` 的某行是否落在 Lua 正文里（即值得为它设断点） */
	isExecutable(fileLine: number): boolean;
	/** 校准出的区段，供诊断和测试观察 */
	readonly segments: readonly Segment[];
}

/**
 * 建立映射。
 *
 * @param fileLines       原始 `.clx` 的全部行
 * @param emulatorSource  `src __lua__` 返回的源码行
 * @param includedLines   每个 `#include` 目标文件展开后的行数，按出现顺序；
 *                        只为交叉校验。拿不到时传空数组，此时只做内容校准。
 */
export function buildLineMapping(
	fileLines: string[],
	emulatorSource: string[],
	includedLines: number[] = []
): LineMapping {
	const segments = calibrate(fileLines, emulatorSource);
	if (segments.length === 0) {
		throw new LineMappingError(
			'Cannot map the original file onto the code the emulator loaded.',
			'The emulator returned source that does not line up with this .clx file. ' +
			'This usually means the file changed after the emulator loaded it, or the ' +
			'emulator splices #include directives differently than expected.'
		);
	}

	if (includedLines.length > 0) {
		const predicted = luaBodyLineCount(fileLines) + sum(includedLines);
		if (predicted !== emulatorSource.length) {
			throw new LineMappingError(
				'Cannot map the original file onto the code the emulator loaded.',
				`Parsing the #include directives predicts ${predicted} Lua lines but the emulator ` +
				`reported ${emulatorSource.length}. The emulator splices directives differently ` +
				'than this extension expects.'
			);
		}
	}

	return new Mapping(segments, fileLines);
}

class Mapping implements LineMapping {
	constructor(
		readonly segments: readonly Segment[],
		private readonly fileLines: readonly string[]
	) { }

	toEmulator(fileLine: number): number {
		for (const s of this.segments) {
			if (fileLine >= s.fileStart && fileLine < s.fileStart + s.count) {
				return s.emulatorStart + (fileLine - s.fileStart);
			}
		}
		throw new LineMappingError(
			`Line ${fileLine} is not inside the Lua section of this file.`,
			'Only lines inside the __lua__ section can carry breakpoints.'
		);
	}

	toFile(emulatorLine: number): number | undefined {
		for (const s of this.segments) {
			if (emulatorLine >= s.emulatorStart && emulatorLine < s.emulatorStart + s.count) {
				return s.fileStart + (emulatorLine - s.emulatorStart);
			}
		}
		return undefined;
	}

	isExecutable(fileLine: number): boolean {
		return (
			fileLine >= 1 &&
			fileLine <= this.fileLines.length &&
			this.segments.some(s => fileLine >= s.fileStart && fileLine < s.fileStart + s.count)
		);
	}
}

/**
 * 逐行对拍，失配处重新找锚点，得出多段映射。
 *
 * 失配发生在 `#include` 展开的位置：`__lua__` 里出现了 `.clx` 里没有的行。
 * 此时用 `__lua__` 的下一行在 `.clx` 里重新定位，继续对拍。
 *
 * 重新定位要求唯一出现，否则放弃后续部分 —— 宁可少映射也不猜。
 */
function calibrate(fileLines: string[], emulatorSource: string[]): Segment[] {
	const segments: Segment[] = [];
	let fileIndex = 0;
	let emulatorIndex = 0;

	// 起点：第一段非空行。设备规格行/区段标记会被自然跳过。
	while (emulatorIndex < emulatorSource.length && normalize(emulatorSource[emulatorIndex]).length === 0) {
		emulatorIndex++;
	}
	if (emulatorIndex >= emulatorSource.length) {
		return segments;
	}

	let current: Segment | undefined;

	for (; emulatorIndex < emulatorSource.length; emulatorIndex++) {
		const wanted = normalize(emulatorSource[emulatorIndex]);

		if (current !== undefined && fileIndex < fileLines.length && normalize(fileLines[fileIndex]) === wanted) {
			current.count++;
			fileIndex++;
			continue;
		}

		// 失配（或还没有段）：用这一行内容重新找锚点
		const anchor = uniqueOccurrence(fileLines, wanted, fileIndex);
		if (anchor === undefined) {
			// 这一行在 .clx 里找不到唯一位置 —— 可能是 include 展开的行，
			// 跳过它继续寻找，但不把它计入任何段
			if (current !== undefined) {
				segments.push(current);
				current = undefined;
			}
			continue;
		}

		if (current !== undefined) {
			segments.push(current);
		}
		current = { fileStart: anchor + 1, count: 1, emulatorStart: emulatorIndex + 1 };
		fileIndex = anchor + 1;
	}

	if (current !== undefined) {
		segments.push(current);
	}

	return segments.filter(s => s.count > 0);
}

function normalize(line: string): string {
	return line.replace(/\r$/, '').trim();
}

/** 从 from 开始找 needle 的唯一出现位置（0-based）。出现 0 或多次返回 undefined。 */
function uniqueOccurrence(haystack: string[], needle: string, from: number): number | undefined {
	let found = -1;
	for (let i = from; i < haystack.length; i++) {
		if (normalize(haystack[i]) === needle) {
			if (found !== -1) {
				return undefined;
			}
			found = i;
		}
	}
	return found === -1 ? undefined : found;
}

function sum(values: number[]): number {
	return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// #include 解析（交叉校验用，不单独决定映射）
// ---------------------------------------------------------------------------

/** 从 `.clx` 文件里按出现顺序取出所有 `#include` 的目标路径。 */
export function findIncludes(fileLines: string[]): string[] {
	const out: string[] = [];
	for (const line of fileLines) {
		const m = /^\s*#include\s+(.+?)\s*$/.exec(line);
		if (m) {
			out.push(m[1]);
		}
	}
	return out;
}

/**
 * `.clx` 里属于 Lua 正文的行数：`__lua__` 区段内的行，去掉区段标记和
 * `#include` / `#blob` 指令本身。用于交叉校验的期望值。
 */
export function luaBodyLineCount(fileLines: string[]): number {
	let inLua = false;
	let count = 0;
	for (const line of fileLines) {
		const trimmed = line.trim();
		if (/^__[a-z]+__$/.test(trimmed)) {
			inLua = trimmed === '__lua__';
			continue;
		}
		if (!inLua) {
			continue;
		}
		if (trimmed.startsWith('#include ') || trimmed.startsWith('#blob ')) {
			continue;
		}
		count++;
	}
	return count;
}
