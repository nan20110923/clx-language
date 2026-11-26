/**
 * 测试自动化的纯逻辑：把注入类命令的应答解析成结构化结果。
 *
 * 和 Lua 调试是两件事 —— 一个操控被调试程序，一个观察它。所以它不并进
 * debugChannel 的主动词集合，只在 channel 的 `raw` 之上做解析。
 *
 * 格式权威是模拟器实现（`coloX_dbg.cpp` 的 `coloX_dbg_cmd_btn` 等），不是文档：
 * 文档列了命令，但应答体的确切措辞只能从实现或实测得到。
 *
 * 这个文件不 import vscode，也不碰 socket。
 */

import type { VariableNode } from './luaProtocol';

/** `btn` / `mouse` / `key` / `padset` 设置注入后的应答。 */
export interface InjectionReply {
	/** 注入成功后还剩多少帧；-1 表示一直按到显式取消 */
	left: number;
	/** 原始应答文本，供日志用 */
	raw: string;
}

/** `vmlist` 的目标选择结果。 */
export interface VmTarget {
	index: number;
	cart: string;
	frame: number;
	isTarget: boolean;
}

/**
 * 解析 `btn <keys> [dur]` 的成功应答：
 *   `btn inj=0x20 [LEFT ] left=30`
 *
 * 也接受 `btn inject off`（停止注入）—— 那是一个独立的确认，没有 left。
 */
export function parseButtonInjection(lines: string[]): InjectionReply | null {
	const raw = lines.join('\n').trim();
	if (raw.startsWith('btn inject off')) {
		return { left: 0, raw };
	}
	const m = /btn inj=0x([0-9a-fA-F]+)(?:\s*\[([^\]]*)\])?\s+left=(-?\d+)/.exec(raw);
	if (!m) {
		return null;
	}
	return { left: Number.parseInt(m[3], 10), raw };
}

/** 解析 `btn`（无参数）的查询应答：`KDown=0x00 KHeld=0x00 [-] inj=0x20 left=30`。 */
export interface ButtonState {
	/** 真实按键的按下沿掩码 */
	down: number;
	/** 真实按键的保持掩码 */
	held: number;
	/** 当前生效的注入掩码 */
	injected: number;
	/** 注入剩余帧数；-1 表示持续 */
	left: number;
}

export function parseButtonState(lines: string[]): ButtonState | null {
	const text = lines.join(' ');
	const down = /KDown=0x([0-9a-fA-F]+)/.exec(text);
	const held = /KHeld=0x([0-9a-fA-F]+)/.exec(text);
	const inj = /inj=0x([0-9a-fA-F]+)/.exec(text);
	const left = /left=(-?\d+)/.exec(text);
	if (!down && !held && !inj) {
		return null;
	}
	return {
		down: down ? Number.parseInt(down[1], 16) : 0,
		held: held ? Number.parseInt(held[1], 16) : 0,
		injected: inj ? Number.parseInt(inj[1], 16) : 0,
		left: left ? Number.parseInt(left[1], 10) : 0
	};
}

/**
 * 解析 `mouse <x> <y> [btn] [dur]` 的成功应答：
 *   `mouse inj=240,120 btn=0x01 left=15`
 */
export interface MouseInjectionReply extends InjectionReply {
	x: number;
	y: number;
	buttons: number;
}

export function parseMouseInjection(lines: string[]): MouseInjectionReply | null {
	const raw = lines.join('\n').trim();
	if (raw.startsWith('mouse inject off')) {
		return { left: 0, raw, x: 0, y: 0, buttons: 0 };
	}
	const m = /mouse inj=(-?\d+),(-?\d+) btn=0x([0-9a-fA-F]+) left=(-?\d+)/.exec(raw);
	if (!m) {
		return null;
	}
	return {
		x: Number.parseInt(m[1], 10),
		y: Number.parseInt(m[2], 10),
		buttons: Number.parseInt(m[3], 16),
		left: Number.parseInt(m[4], 10),
		raw
	};
}

/** 解析 `key <name> [dur]` 的成功应答：`key inj='a' left=15`。 */
export interface KeyInjectionReply extends InjectionReply {
	key: string;
}

export function parseKeyInjection(lines: string[]): KeyInjectionReply | null {
	const raw = lines.join('\n').trim();
	if (raw.startsWith('key inject off')) {
		return { left: 0, raw, key: '' };
	}
	const m = /key inj='([^']*)' left=(-?\d+)/.exec(raw);
	if (!m) {
		return null;
	}
	return { key: m[1], left: Number.parseInt(m[2], 10), raw };
}

/**
 * 解析 `shot` 的应答：
 *   `shot: /tmp/a.bmp 480x480 bpp=4 md5=<32 hex> frame=1234`
 *
 * md5 只覆盖像素数据（BGR、4 字节行对齐、底向上），与文件头无关 ——
 * 所以同一画面跨平台 md5 相同，除非调色板不同。可以拿它做金图比对的键，
 * 但本扩展只把它显示出来，不做比对。
 */
export interface ShotResult {
	path: string;
	width: number;
	height: number;
	bpp: number;
	md5: string;
	frame: number;
}

export function parseShot(lines: string[]): ShotResult | null {
	const raw = lines.join('\n').trim();
	const m = /shot: (.*) (\d+)x(\d+) bpp=(\d+) md5=([0-9a-fA-F]{32}) frame=(\d+)/.exec(raw);
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

/**
 * 解析 `vmlist`。表头 `idx\tcart\tframe\ttarget`，目标 VM 的 target 列是 `*`。
 * 目标未定时模拟器会追加一行说明文字，忽略。
 */
export function parseVmTargets(lines: string[]): VmTarget[] {
	const out: VmTarget[] = [];
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
			isTarget: (cols[3] ?? '').trim() === '*'
		});
	}
	return out;
}

/**
 * 把 vector 里的按键状态行解析成 `input?` 的整体快照。
 *
 * `input?` 的应答是几行固定前缀的文本（frame/KDown/mouse/kb/padN），
 * 这里只挑出对"现在什么被按着"有用的部分，其余原样保留供日志。
 */
export interface InputSnapshot {
	frame: number;
	fps: number;
	cart: string;
	buttons: ButtonState | null;
	mouse: { x: number; y: number; buttons: number } | null;
	key: string;
	pads: { player: number; connected: boolean; down: number; injected: number }[];
	/** 原始行，供输出通道 */
	raw: string[];
}

export function parseInputSnapshot(lines: string[]): InputSnapshot {
	let frame = 0;
	let fps = 0;
	let cart = '';
	const pads: InputSnapshot['pads'] = [];

	for (const line of lines) {
		const head = /frame=(\d+) fps=(\d+) cart=(\S*)/.exec(line);
		if (head) {
			frame = Number.parseInt(head[1], 10);
			fps = Number.parseInt(head[2], 10);
			cart = head[3];
			continue;
		}
		const pad = /^pad(\d+): conn=(\d+) down=0x([0-9a-fA-F]+).*?inj=0x([0-9a-fA-F]+)/.exec(line);
		if (pad) {
			pads.push({
				player: Number.parseInt(pad[1], 10),
				connected: pad[2] === '1',
				down: Number.parseInt(pad[3], 16),
				injected: Number.parseInt(pad[4], 16)
			});
		}
	}

	const mouseLine = lines.find(l => l.startsWith('mouse='));
	const mouseMatch = mouseLine ? /mouse=(-?\d+),(-?\d+) btn=0x([0-9a-fA-F]+)/.exec(mouseLine) : null;
	const keyLine = lines.find(l => l.startsWith('kb='));
	const keyMatch = keyLine ? /key='([^']*)'/.exec(keyLine) : null;

	return {
		frame,
		fps,
		cart,
		buttons: parseButtonState(lines),
		mouse: mouseMatch
			? {
				x: Number.parseInt(mouseMatch[1], 10),
				y: Number.parseInt(mouseMatch[2], 10),
				buttons: Number.parseInt(mouseMatch[3], 16)
			}
			: null,
		key: keyMatch ? keyMatch[1] : '',
		pads,
		raw: lines
	};
}

// ---------------------------------------------------------------------------
// 输入构造
// ---------------------------------------------------------------------------

/** 注入时长：帧数、毫秒，或不指定（持续到显式取消）。 */
export type Duration = { kind: 'frames'; frames: number } | { kind: 'ms'; ms: number } | { kind: 'hold' };

/** 把时长转成命令行参数。纯函数，便于测试边界。 */
export function durationArgument(duration: Duration): string {
	switch (duration.kind) {
		case 'frames':
			return String(Math.max(1, Math.trunc(duration.frames)));
		case 'ms':
			return `${Math.max(1, Math.trunc(duration.ms))}ms`;
		case 'hold':
			return '';
	}
}

/**
 * 把若干 CLX 键名拼成 `btn` 的键位参数。
 *
 * 键名大小写不敏感，模拟器自己认；这里只做规整和去重，不维护白名单 ——
 * 官方会加新键位，插件拦下来只会挡住合法用法。
 */
export function keyList(keys: string[]): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const key of keys) {
		const normalized = key.trim().toUpperCase();
		if (normalized.length === 0 || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		out.push(normalized);
	}
	return out.join(' ');
}

/**
 * 组装一条注入命令，统一 `btn` 一类的键位+时长语法。
 * `command` 是 `btn` 或 `padset <player>` 这样的前缀。
 */
export function injectionDuration(command: string, keys: string[], duration: Duration): string {
	const list = keyList(keys);
	if (list.length === 0) {
		return command;
	}
	const arg = durationArgument(duration);
	return arg.length > 0 ? `${command} ${list} ${arg}` : `${command} ${list}`;
}

/** 组装完整命令行。`keys` 为空时返回查询（`btn` 无参数）。 */
export function buttonCommand(keys: string[], duration?: Duration): string {
	const list = keyList(keys);
	if (list.length === 0) {
		return 'btn';
	}
	const arg = duration ? durationArgument(duration) : '';
	return arg.length > 0 ? `btn ${list} ${arg}` : `btn ${list}`;
}

/** 停止注入。 */
export const BUTTON_STOP = 'btn 0';
export const MOUSE_STOP = 'mouse 0';
export const KEY_STOP = 'key 0';

/** 供 `!cmd` 控制台里做参数补全的候选键名（仅提示，不校验）。 */
export const CLX_KEY_NAMES = ['X', 'Y', 'A', 'B', 'CENTER', 'LEFT', 'RIGHT', 'SYS'] as const;

/** 供日志/输出通道的简短描述。 */
export function describeNodes(nodes: VariableNode[], limit = 8): string {
	if (nodes.length === 0) {
		return '(none)';
	}
	const shown = nodes.slice(0, limit).map(n => {
		const value = n.value === '' ? '{…}' : n.value;
		return `${n.name}=${value}`;
	});
	const more = nodes.length > limit ? ` (+${nodes.length - limit} more)` : '';
	return shown.join(', ') + more;
}
