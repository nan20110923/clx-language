/**
 * 用 `set` 命令改变量时，把用户输入的值转成 Lua 字面量。
 *
 * 为什么需要它：VS Code 的 Variables 面板里，用户在一个字符串变量上编辑时
 * 输入的是**裸文本**（去掉引号后的内容），而模拟器的 `set <var>=<value>` 把
 * 右边当 Lua 代码求值。所以 `set x=hello` 会让 x 变成 nil（hello 是个未定义
 * 全局），用户会以为赋值坏了。
 *
 * 规则：
 *   - 数字、`true`/`false`/`nil` 原样（用户明确想要布尔或数值）
 *   - 已带引号的字符串原样（用户自己写了引号，尊重）
 *   - 表构造 `{...}` 或函数调用原样（用户在做表达式）
 *   - 其余全部当字符串加引号
 *
 * 这个判断放在纯逻辑层，因为它有真实的取舍（错一次就静默把变量变成 nil），
 * 值得被测试覆盖。不 import vscode。
 */
export function toLuaLiteral(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return '""';
	}
	if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
		return trimmed;
	}
	if (trimmed === 'true' || trimmed === 'false' || trimmed === 'nil') {
		return trimmed;
	}
	if (/^(['"]).*\1$/s.test(trimmed)) {
		return trimmed;
	}
	if (/^[{(]/.test(trimmed) || /\w\s*\(/.test(trimmed)) {
		return trimmed;
	}
	// 其余当字符串。用 JSON 转义：Lua 和 JSON 的字符串转义在这几个字符上一致
	// （\" \\ \n \r \t），足够安全。
	return JSON.stringify(trimmed);
}

/** 用点号连接 Lua 表访问路径。父路径为空时直接返回名字。 */
export function joinLuaPath(parent: string, name: string): string {
	return parent.length === 0 ? name : `${parent}.${name}`;
}
