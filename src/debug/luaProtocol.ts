/**
 * coloX 调试通道的**纯解析**层：只有函数，没有 IO。
 *
 * 这里把模拟器吐出的文本应答翻译成结构化数据。所有格式知识集中在这一处 ——
 * 之前它散在 debugSession.ts 的各个 DAP handler 里，两次线上 bug（`c` 的发送时机、
 * `__lua__` 行号基准）都是因为协议知识没有归属。
 *
 * 格式权威来源是模拟器自己的实现（`coloX_dbg.cpp`），不是文档：
 * 文档是摘要，漏掉了应答体形状和错误文本。
 *
 * 这个文件不 import vscode，也不碰 socket，可以直接在 node:test 里测。
 */

/** `bt` 的一帧。`source` 是模拟器给的名字，卡带源码固定为 `__lua__`。 */
export interface StackFrame {
	/** 0 是最内层（当前执行点） */
	level: number;
	/** 函数名；模拟器拿不到时是 `?` */
	func: string;
	source: string;
	/** 1-based，相对 `source` */
	line: number;
}

/** 断点被接受（`verified`）或拒绝。 */
export interface BreakpointReply {
	verified: boolean;
	/** 模拟器分配的断点号，仅 verified 时有 */
	no?: number;
	/** 模拟器回报的源码行，仅 verified 时有 */
	code?: string;
	/** 拒绝原因，原样保留模拟器的文本 */
	message?: string;
}

/** `i b` 的一行。 */
export interface BreakpointInfo {
	no: number;
	enabled: boolean;
	file: string;
	line: number;
	hits: number;
	condition: string;
}

/** 停止事件（`@` 帧）。 */
export interface StopEvent {
	func: string;
	source: string;
	line: number;
	/** 停止处的源码，模拟器附带 */
	code?: string;
}

/** `i local` 解析出的一个变量。 */
export interface VariableNode {
	name: string;
	/** 展示用的值文本；有 children 时为空串 */
	value: string;
	/** 叶子变量的类型提示，来自格式推断 */
	type: 'number' | 'string' | 'boolean' | 'table' | 'unknown';
	children: VariableNode[];
}

/** `vmlist` 的一行。 */
export interface VmInfo {
	index: number;
	cart: string;
	frame: number;
	target: boolean;
}

// ---------------------------------------------------------------------------
// 停止事件
// ---------------------------------------------------------------------------

/**
 * 解析 `@` 帧的应答体。
 *
 * 形状（`coloX_dbg.cpp` 里两处 snprintf）：
 *     <func> at <source>:<line>
 *     <NNNN>><源码>
 *
 * 第二行是可选的（源码取不到时只有第一行）。函数名或源码里可能出现 " at "，
 * 所以从**右边**找 `:` + 末尾数字，再往前找最后一个 ` at `。
 */
export function parseStopFrame(lines: string[]): StopEvent | null {
	const head = lines.find(l => l.includes(' at '));
	if (head === undefined) {
		return null;
	}
	const m = /^(.*) at (.*):(\d+)\s*$/.exec(head);
	if (!m) {
		return null;
	}
	const stop: StopEvent = {
		func: m[1].trim() || '?',
		source: m[2],
		line: Number.parseInt(m[3], 10)
	};
	// 第二行形如 "0009>    counter = counter + 1"，前导数字是行号，已经解析过
	const codeLine = lines.find(l => /^\d+>/.test(l));
	if (codeLine !== undefined) {
		stop.code = codeLine.replace(/^\d+>/, '');
	}
	return stop;
}

// ---------------------------------------------------------------------------
// 调用栈
// ---------------------------------------------------------------------------

/**
 * 解析 `bt` 的应答体：深度 0 在最前。
 * 形状：`<level> in <func> at <source>:<line>`
 */
export function parseStackFrames(lines: string[]): StackFrame[] {
	const frames: StackFrame[] = [];
	for (const line of lines) {
		const m = /^(\d+) in (.*) at (.*):(\d+)\s*$/.exec(line);
		if (!m) {
			continue;
		}
		frames.push({
			level: Number.parseInt(m[1], 10),
			func: m[2].trim() || '?',
			source: m[3],
			line: Number.parseInt(m[4], 10)
		});
	}
	return frames;
}

// ---------------------------------------------------------------------------
// 断点
// ---------------------------------------------------------------------------

/**
 * 解析 `b <file>:<line>` 的应答体。
 *
 * 成功：`Breakpoint <no> at file <file>, line <n>, if <cond>` + `code: <源码>`
 * 失败：`there is no code at <file>:<n>` / `breakpoint need file:line` /
 *       `can not find function <name>` / 参数示例提示
 *
 * 模拟器只在**行是空白（去掉 CR/LF/空格后为空）**时拒绝，所以"没有代码"这个
 * 拒绝正好对应 DAP 的 `verified: false`，不需要我们预判哪行可执行。
 */
export function parseBreakpointReply(lines: string[]): BreakpointReply {
	const body = lines.join('\n');
	const ok = /Breakpoint (\d+) at file (.*), line (\d+), if (.*)/.exec(body);
	if (ok) {
		const codeLine = lines.find(l => l.startsWith('code: '));
		return {
			verified: true,
			no: Number.parseInt(ok[1], 10),
			code: codeLine === undefined ? undefined : codeLine.slice('code: '.length)
		};
	}
	const message = body.trim();
	return {
		verified: false,
		message: message.length > 0 ? message : 'The emulator rejected the breakpoint without saying why.'
	};
}

/**
 * 解析 `i b` 的应答体。第一行是表头 `Num\tEnb\tWhat\tHit\tIf`。
 * `What` 一列是 `<file>:<line>`，文件名本身可能含冒号，所以从右边切。
 */
export function parseBreakpointList(lines: string[]): BreakpointInfo[] {
	const result: BreakpointInfo[] = [];
	for (const line of lines) {
		const cols = line.split('\t');
		if (cols.length < 3) {
			continue;
		}
		const no = Number.parseInt(cols[0], 10);
		if (Number.isNaN(no)) {
			// 表头或空行
			continue;
		}
		const whatAt = cols[2];
		const colon = whatAt.lastIndexOf(':');
		result.push({
			no,
			enabled: cols[1] === 'y',
			file: colon === -1 ? whatAt : whatAt.slice(0, colon),
			line: colon === -1 ? 0 : Number.parseInt(whatAt.slice(colon + 1), 10) || 0,
			hits: Number.parseInt(cols[3] ?? '0', 10) || 0,
			condition: cols[4] ?? ''
		});
	}
	return result;
}

// ---------------------------------------------------------------------------
// 局部变量 / upvalue（`i local`）
// ---------------------------------------------------------------------------

/**
 * 解析 `i local` 的应答体。
 *
 * 形状来自 `__xlua_pprint({loc=…, up=…})`，是**缩进文本**不是 JSON：
 *   - 每层 2 个空格
 *   - 键被额外包了一层双引号：`"counter": 42`
 *   - 字符串值被包了**两层**引号：`"name": '"hi"'`
 *   - 表值只有 `"tbl": ` 然后换行接子项
 *   - `pairs()` 迭代，**键的顺序不稳定**，所以顶层必须按名字找 `loc` / `up`
 *   - 函数、userdata、thread 会被 `__xlua_tprint` **整个跳过**，不是显示成占位符；
 *     所以拿不到它们是协议本身的限制，不补
 * 解析失败时调用方应降级成原文（见 debugSession），不要抛。
 */
export function parseLocals(lines: string[]): { locals: VariableNode[]; upvalues: VariableNode[] } {
	const roots = parseVariableTree(lines);
	const pick = (name: string): VariableNode[] => {
		const found = roots.find(r => r.name === name);
		return found ? found.children : [];
	};
	return { locals: pick('loc'), upvalues: pick('up') };
}

/**
 * 把缩进文本还原成树。导出的原因是测试要直接覆盖它，
 * 也因为 `i local` 和将来可能的其它 pprint 出处共用同一套语法。
 */
export function parseVariableTree(lines: string[]): VariableNode[] {
	const root: VariableNode = { name: '', value: '', type: 'table', children: [] };
	// 用栈跟踪"当前深度的父节点"，depth 0 的子项都挂在 root 上
	const stack: { depth: number; node: VariableNode }[] = [{ depth: -1, node: root }];

	for (const raw of lines) {
		if (raw.trim().length === 0) {
			continue;
		}
		// 递归标记没有 key: 形式，作为独立节点保留，让用户看得见
		const recursion = /^\s*\*Recursion at (.*)\*\s*$/.exec(raw);
		if (recursion) {
			const depth = indentDepth(raw);
			attach(stack, depth, {
				name: '*recursion*',
				value: recursion[1],
				type: 'unknown',
				children: []
			});
			continue;
		}

		const m = /^(\s*)"((?:\\.|[^"\\])*)"\s*:\s?(.*)$/.exec(raw);
		if (!m) {
			continue;
		}
		const depth = Math.floor(m[1].length / 2);
		const name = unescapeQuoted(m[2]);
		const rest = m[3];

		if (rest.length === 0) {
			// 表值：只有 "key": 后面什么都没有，子项在下一层
			attach(stack, depth, { name, value: '', type: 'table', children: [] });
			continue;
		}
		const leaf = parseScalar(rest);
		attach(stack, depth, { name, value: leaf.value, type: leaf.type, children: [] });
	}

	return root.children;
}

function indentDepth(line: string): number {
	const m = /^(\s*)/.exec(line);
	return m ? Math.floor(m[1].length / 2) : 0;
}

function attach(stack: { depth: number; node: VariableNode }[], depth: number, node: VariableNode): void {
	// 弹出所有不比当前浅的层级，栈顶就是父节点
	while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
		stack.pop();
	}
	const parent = stack[stack.length - 1].node;
	parent.children.push(node);
	stack.push({ depth, node });
}

/** 解析 `__xlua_tostring` / `__xlua_tprint` 产出的标量文本。 */
function parseScalar(text: string): { value: string; type: VariableNode['type'] } {
	// 字符串值是 `'"内容"'`：外层单引号是 tprint 加的，内层双引号是 tostring 加的
	if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
		const inner = text.slice(1, -1);
		if (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
			return { value: inner.slice(1, -1), type: 'string' };
		}
		return { value: inner, type: 'string' };
	}
	if (text === 'true' || text === 'false') {
		return { value: text, type: 'boolean' };
	}
	if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || /^-?inf$/.test(text) || text === 'nan') {
		return { value: text, type: 'number' };
	}
	// `[table: 0x…]` 之类：tostring 对 table/function/userdata 的包装
	return { value: text, type: 'unknown' };
}

/** 还原 `string.format("\"%s\"")` 与转义。 */
function unescapeQuoted(s: string): string {
	return s
		.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
		.replace(/\\r/g, '\r')
		.replace(/\\n/g, '\n')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\');
}

// ---------------------------------------------------------------------------
// 源文件
// ---------------------------------------------------------------------------

/**
 * 解析 `src <name>` 的应答体。
 *
 * 第一行是 `<name>:<count>`。**`count` 是行数，不是起始行号** —— 这一点曾经被
 * 误读成"`__lua__` 段在原文件里的起始行"，导致断点行号整体错位。
 *
 * 正文随后是逐行原样内容。实测（2026-11-26，官方 2026-11-19 构建）：
 * 头部声明的数字**比正文行数少 1**，因为文件末尾最后一个空行不计入。
 * 例如 `__lua__:17` 对应 18 行正文。所以**不要**拿它做行数校验 ——
 * 正文本身就是权威，`count` 只在文件不存在时为 0（此时无正文）。
 */
export function parseSourceListing(lines: string[]): { name: string; lineCount: number; source: string[] } | null {
	if (lines.length === 0) {
		return null;
	}
	const m = /^(.*):(\d+)$/.exec(lines[0]);
	if (!m) {
		return null;
	}
	const name = m[1];
	const declared = Number.parseInt(m[2], 10);
	// 未知文件时模拟器只回 `<name>:0`，没有正文
	if (declared === 0) {
		return { name, lineCount: 0, source: [] };
	}
	// 正文是唯一权威：declared 比实际行数少 1（末尾空行不计），
	// 所以这里以 source 的长度为准，declared 仅作诊断保留。
	const source = lines.slice(1);
	return { name, lineCount: source.length || declared, source };
}

/** 解析 `src`（无参数）的文件清单：`File\tLines` 表头 + `<name>\t<count>`。 */
export function parseSourceList(lines: string[]): { name: string; lineCount: number }[] {
	const out: { name: string; lineCount: number }[] = [];
	for (const line of lines) {
		const cols = line.split('\t');
		if (cols.length < 2) {
			continue;
		}
		const count = Number.parseInt(cols[1], 10);
		if (Number.isNaN(count)) {
			continue;
		}
		out.push({ name: cols[0], lineCount: count });
	}
	return out;
}

// ---------------------------------------------------------------------------
// 多 VM
// ---------------------------------------------------------------------------

/**
 * 解析 `vmlist`。表头是 `idx\tcart\tframe\ttarget`，目标 VM 的 target 列是 `*`。
 * 没有目标时模拟器会多一行说明文字，忽略即可。
 */
export function parseVmList(lines: string[]): VmInfo[] {
	const out: VmInfo[] = [];
	for (const line of lines) {
		const cols = line.split('\t');
		if (cols.length < 3) {
			continue;
		}
		const index = Number.parseInt(cols[0], 10);
		if (Number.isNaN(index)) {
			continue;
		}
		out.push({
			index,
			cart: cols[1],
			frame: Number.parseInt(cols[2], 10) || 0,
			target: (cols[3] ?? '').trim() === '*'
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// 测试自动化
// ---------------------------------------------------------------------------

/** `shot` 的应答：`shot: <path> <w>x<h> bpp=<b> md5=<hex> frame=<n>`。 */
export interface ShotReply {
	path: string;
	width: number;
	height: number;
	bpp: number;
	/** 像素数据 md5（BGR、4 字节行对齐、底向上，与文件头无关） */
	md5: string;
	frame: number;
}

export function parseShotReply(lines: string[]): ShotReply | null {
	const body = lines.join('\n');
	const m = /shot: (.*) (\d+)x(\d+) bpp=(\d+) md5=([0-9a-fA-F]{32}) frame=(\d+)/.exec(body);
	if (!m) {
		return null;
	}
	return {
		path: m[1],
		width: Number.parseInt(m[2], 10),
		height: Number.parseInt(m[3], 10),
		bpp: Number.parseInt(m[4], 10),
		md5: m[5].toLowerCase(),
		frame: Number.parseInt(m[6], 10)
	};
}
