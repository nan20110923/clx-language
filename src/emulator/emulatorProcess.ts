'use strict';

/**
 * 模拟器进程的生命周期。
 *
 * 收拢三件原本散在 extension.ts 和 debugger/debugSession.ts 里的事：
 * 启动（spawn）、调试通道的就绪判定、终止。调试端口号只在这里出现。
 *
 * 为什么值得一个 module：3563 只允许一个客户端连接，所以"模拟器在跑吗"
 * 和"端口能连上吗"是两个不同的问题，但必须由同一处回答，否则一边探测
 * 一边就会把另一边正在用的连接挤掉。
 *
 * 术语见 GLOSSARY.md：模拟器（emulator）是调试目标，不是调试适配器。
 */

import * as net from 'net';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EmulatorLaunch, buildRomArgs, missingWindowsDebugCrt, romPathFor } from './emulatorBundle';

/** 模拟器的调试通道。只允许一个客户端连接。 */
export const DEBUG_HOST = '127.0.0.1';
export const DEBUG_PORT = 3563;

/** 启动模拟器的结果：区分"用户取消"和"真的失败"，调用方据此决定要不要弹框。 */
export type LaunchOutcome = 'started' | 'cancelled' | 'failed';

export interface LaunchRequest {
	/** 要运行的 CLX 文件 */
	file: vscode.Uri;
	/** 以调试模式启动（模拟器收到 -x） */
	debug: boolean;
	launch: EmulatorLaunch;
	/** 每次有 stdout 数据时回调，用于转发到 DAP 的 OutputEvent 或日志 */
	onStdout?: (text: string) => void;
}

/**
 * 端口上是否已经有东西在监听。
 * 注意这是破坏性的探测：这个模拟器只接受一个客户端，连上去再断开可能
 * 把别人正在用的会话挤掉。只在确实要知道"能不能直接连"时调用。
 */
export function probeDebugChannel(host = DEBUG_HOST, port = DEBUG_PORT): Promise<boolean> {
	return new Promise(resolve => {
		const socket = net.connect({ port, host })
			.on('connect', () => {
				socket.destroy()
				resolve(true)
			})
			.on('error', () => resolve(false))
	})
}

/** 建立一个到调试通道的客户端连接。调用方负责在结束时 destroy。 */
export function connectDebugChannel(host = DEBUG_HOST, port = DEBUG_PORT): net.Socket {
	return net.connect({ port, host })
}

/**
 * 等调试通道就绪。模拟器加载失败时也会继续监听端口，所以这个函数只说明
 * "端口能连上了"，不说明文件加载成功 —— 后者要看 .rom 文件。
 */
export async function waitForDebugChannel(timeoutMs: number, host = DEBUG_HOST, port = DEBUG_PORT, intervalMs = 1000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await probeDebugChannel(host, port)) {
			return true;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		await new Promise<void>(resolve => {
			setTimeout(resolve, intervalMs);
		});
	}
}

let current: child_process.ChildProcess | undefined;

/** 是否有一个由本扩展启动、还活着的模拟器进程。 */
export function isEmulatorRunning(): boolean {
	return current !== undefined && current.exitCode === null;
}

/** 终止由本扩展启动的模拟器进程。 */
export function terminateEmulator(): void {
	if (isEmulatorRunning()) {
		current?.kill();
	}
	current = undefined;
}

/** 一次 ROM 构建的结果。 */
export interface BuildRomResult {
	/** 构建出的文件路径。 */
	path: string;
	/** 是否成功（进程退出码为 0 且文件存在）。 */
	ok: boolean;
	/** 失败原因，成功时为 undefined。 */
	reason?: string;
}

/**
 * 用模拟器自带的 `-b` 构建 ROM，不启动窗口。
 *
 * 为什么需要：macOS 的模拟器包编译时开了 `COLOX_AUTO_GEN_ROM`，加载卡带后
 * 会自己在源码旁写一份 `.rom`；Windows 官方包**没开这个宏**，所以从来不会
 * 自动生成。`-b` 是官方 CLI 里的"只构建"入口（`exit(coloX_build_rom(...))`，
 * 既不进主循环也不开窗口），两个平台都支持。
 *
 * 参数顺序有强约束：源码里 `-b` 一旦被解析就**立即 exit**，所以 `-d` 和 `-r`
 * 必须排在它前面。不要为了"看起来整齐"重排。
 *
 * 输出路径是原样使用的，不会自动补 `.rom` —— 这里显式给 `<源文件>.clx.rom`，
 * 与 macOS 自动生成的名字保持一致，否则模拟器启动时找不到它。
 */
export function buildRom(request: {
	file: vscode.Uri;
	launch: EmulatorLaunch;
	onStdout?: (text: string) => void;
}): Promise<BuildRomResult> {
	const filePath = request.file.fsPath;
	const romPath = romPathFor(filePath);
	const args = buildRomArgs(filePath);

	let env = process.env;
	if (os.platform() === 'darwin' && request.launch.libraryDir) {
		env = { ...process.env, DYLD_LIBRARY_PATH: request.launch.libraryDir };
	}

	return new Promise<BuildRomResult>(resolve => {
		let child: child_process.ChildProcess;
		try {
			child = child_process.spawn(request.launch.executable, args, { env });
		} catch (e) {
			resolve({ path: romPath, ok: false, reason: `${e}` });
			return;
		}

		// 构建的输出同样进通道：失败时模拟器只打一行 `gen rom(...) fail.`
		child.stdout?.on('data', data => request.onStdout?.(String(data)));
		child.stderr?.on('data', data => request.onStdout?.(String(data)));

		let settled = false;
		const settle = (result: BuildRomResult) => {
			if (!settled) {
				settled = true;
				resolve(result);
			}
		};

		child.on('error', e => settle({ path: romPath, ok: false, reason: `${e}` }));
		// 用 close 而不是 exit：close 在 stdio 流关闭后才触发，日志才收得全
		child.on('close', code => {
			if (code === 0 && fs.existsSync(romPath)) {
				settle({ path: romPath, ok: true });
			} else if (code === 0) {
				settle({ path: romPath, ok: false, reason: 'the emulator reported success but wrote no file' });
			} else {
				settle({ path: romPath, ok: false, reason: `the emulator exited with code ${code}` });
			}
		});
	});
}

/**
 * 启动模拟器。resolve 时进程已经真的起来（收到 spawn 事件），
 * 不是 spawn 调用返回就算。
 */
export function startEmulator(request: LaunchRequest): Promise<LaunchOutcome> {
	const filePath = request.file.fsPath;
	// 传目录 + 文件名（模拟器用 -d 指定工作目录、-r 指定文件），
	// 所以路径分隔符交给 path 处理，不要手写切分。
	const cwd = path.dirname(filePath);
	const fileName = path.basename(filePath);

	// 以参数数组启动，路径不经过 shell：cmd.exe 不认单引号，会把引号当成
	// 路径的一部分传给模拟器，表现是 EIE:open file err。
	// -d 必须带尾部分隔符，这是模拟器自己的要求。
	const args = ['-d', cwd + path.sep, '-r', fileName];
	if (request.debug) {
		args.push('-x');
	}

	let env = process.env;
	if (os.platform() === 'darwin' && request.launch.libraryDir) {
		env = { ...process.env, DYLD_LIBRARY_PATH: request.launch.libraryDir };
	}

	return new Promise<LaunchOutcome>(resolve => {
		let child: child_process.ChildProcess;
		let settled = false;
		const settle = (outcome: LaunchOutcome) => {
			if (!settled) {
				settled = true;
				resolve(outcome);
			}
		};

		try {
			child = child_process.spawn(request.launch.executable, args, { env });
		} catch (e) {
			vscode.window.showErrorMessage(`Run coloX simulator failed: ${e}`);
			settle('failed');
			return;
		}

		current = child;
		child.stdout?.on('data', data => {
			const text = String(data);
			console.log('coloxProcess stdout: ', text);
			request.onStdout?.(text);
		});
		child.stderr?.on('data', data => {
			console.log('coloxProcess stderr: ', String(data));
			request.onStdout?.(String(data));
		});

		child.on('spawn', () => settle('started'));
		child.on('error', e => {
			console.log('coloxProcess error: ', e);
			current = undefined;
			// Windows 缺依赖 DLL 时也报 ENOENT，光说"启动失败"没法排查。
			// 这里只在**真的失败**时才去查 Debug CRT —— 能在 Windows 上正常
			// 跑模拟器的用户不该被一个前置检查挡住。
			const missing = missingWindowsDebugCrt(
				path.dirname(request.launch.executable),
				file => fs.existsSync(file)
			);
			const hint =
				missing.length > 0
					? `\n\nThe Microsoft Visual C++ Debug runtime is missing: ${missing.join(', ')}. ` +
						'These libraries are not redistributable, so neither this extension nor the official download can ship them. ' +
						'Installing the Visual C++ Redistributable does not help: it only contains the release runtime.'
					: '';
			vscode.window.showErrorMessage(
				`Run coloX simulator failed: ${e.message || e} (${request.launch.executable})${hint}`
			);
			settle('failed');
		});
		// close / exit / disconnect 都表示进程结束了。exit 先于 close 触发，
		// 但 close 之后流才关闭，两个都挂上只是为了让 settle 尽早发生。
		for (const event of ['close', 'exit', 'disconnect'] as const) {
			child.on(event, (code: unknown) => {
				console.log(`coloxProcess ${event}: `, code);
				current = undefined;
				settle('failed');
			});
		}
	});
}
