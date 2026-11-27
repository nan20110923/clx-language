/**
 * 语言客户端生命周期：命令接管与串行化。
 *
 * 这两条对应的都是"故障表现离原因很远"的线上问题，所以用测试钉住：
 *
 * 1. 命令重名。VS Code 的命令是全局命名空间。用户同时装了 LuaLS 自己的 VS Code
 *    扩展时，`lua.removeSpace` 已被占用；vscode-languageclient 原始的
 *    `registerCommand` 会抛错，而这个异常发生在 initializeFeatures 里，**整个
 *    语言客户端**会跟着启动失败，用户看到 "couldn't create connection to server"。
 *    一个命令名撞车不该弄掉补全和诊断。
 *
 * 2. 客户端泄漏。旧版 restart() 是"先丢句柄、再 await stop()"。stop() 对还在
 *    starting 的客户端会拒绝，句柄此时已经丢了 —— 那个客户端仍在跑、命令仍注册
 *    着，之后每一次启动都撞重名，直到重载窗口。串行队列让"启动中"不再是可能状态。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adoptCommands, LifecycleQueue } from '../src/language/lifecycle';
import type { Disposable } from '../src/language/lifecycle';

/** 模拟 VS Code 的全局命令表：重名直接抛错，与真实行为一致。 */
function registry(): {
	register: (command: string, handler: (...args: never[]) => unknown) => Disposable;
	names: () => string[];
	invoke: (command: string, ...args: unknown[]) => unknown;
} {
	const table = new Map<string, (...args: unknown[]) => unknown>();
	return {
		register(command, handler) {
			if (table.has(command)) {
				throw new Error(`command '${command}' already exists`);
			}
			table.set(command, handler as (...args: unknown[]) => unknown);
			return {
				dispose() {
					table.delete(command);
				}
			};
		},
		names: () => [...table.keys()],
		invoke(command, ...args) {
			const handler = table.get(command);
			assert.ok(handler, `command '${command}' 没有注册`);
			return handler(...args);
		}
	};
}

/** 测试用的 handler：把收到的命令名与参数记下来，模拟转发给服务器。 */
function recorder(sent: { command: string; args: unknown[] }[]) {
	return (command: string) =>
		(...args: unknown[]) => {
			sent.push({ command, args });
			return `sent:${command}`;
		};
}

// ---------------------------------------------------------------------------
// adoptCommands
// ---------------------------------------------------------------------------

test('adoptCommands 注册全部未占用的命令', () => {
	const reg = registry();
	const result = adoptCommands(['lua.removeSpace', 'lua.solve'], reg.register, recorder([]));

	assert.deepEqual(result.skipped, []);
	assert.equal(result.adopted.length, 2);
	assert.deepEqual(reg.names(), ['lua.removeSpace', 'lua.solve']);
});

test('adoptCommands 注册的 handler 把命令名与参数都转出去', () => {
	const reg = registry();
	const sent: { command: string; args: unknown[] }[] = [];
	adoptCommands(['lua.removeSpace'], reg.register, recorder(sent));

	// 快速修复要把 uri 之类作为 arguments 传给服务器，吞掉就变成空操作
	const reply = reg.invoke('lua.removeSpace', { uri: 'file:///a.clx' });

	assert.equal(reply, 'sent:lua.removeSpace');
	assert.deepEqual(sent, [{ command: 'lua.removeSpace', args: [{ uri: 'file:///a.clx' }] }]);
});

test('adoptCommands 跳过已被占用的命令，而不是让整批失败', () => {
	const reg = registry();
	// 先占一个，模拟用户装了 LuaLS 自己的扩展
	reg.register('lua.removeSpace', () => undefined);

	const result = adoptCommands(
		['lua.removeSpace', 'lua.solve', 'lua.getConfig'],
		reg.register,
		recorder([])
	);

	assert.deepEqual(result.skipped, ['lua.removeSpace']);
	assert.equal(result.adopted.length, 2);
	// 关键：剩下的命令照常注册。旧行为是这里一个都不剩，客户端整体启动失败。
	assert.deepEqual(reg.names(), ['lua.removeSpace', 'lua.solve', 'lua.getConfig']);
});

test('adoptCommands 在全部命令都被占用时返回空 adopted', () => {
	const reg = registry();
	for (const name of ['lua.removeSpace', 'lua.solve']) {
		reg.register(name, () => undefined);
	}

	const result = adoptCommands(['lua.removeSpace', 'lua.solve'], reg.register, recorder([]));

	assert.equal(result.adopted.length, 0);
	assert.deepEqual(result.skipped, ['lua.removeSpace', 'lua.solve']);
});

test('adoptCommands 撤销后命令名可以被重新注册', () => {
	const reg = registry();
	const first = adoptCommands(['lua.removeSpace'], reg.register, recorder([]));
	first.adopted.forEach(d => d.dispose());

	// 这就是 restart 的场景：老客户端撤干净后，新客户端必须能拿到同一个名字
	const second = adoptCommands(['lua.removeSpace'], reg.register, recorder([]));

	assert.deepEqual(second.skipped, []);
	assert.equal(second.adopted.length, 1);
});

test('adoptCommands 空列表不注册任何东西', () => {
	const reg = registry();
	const result = adoptCommands([], reg.register, recorder([]));

	assert.equal(result.adopted.length, 0);
	assert.equal(result.skipped.length, 0);
});

// ---------------------------------------------------------------------------
// LifecycleQueue
// ---------------------------------------------------------------------------

test('LifecycleQueue 串行执行，不会让两个操作重叠', async () => {
	const queue = new LifecycleQueue();
	const events: string[] = [];
	let active = 0;

	const op = (name: string) => async () => {
		active += 1;
		assert.equal(active, 1, `${name} 与前一个操作重叠了`);
		events.push(`${name}:start`);
		// 让出事件循环，给"重叠"留出发生的机会
		await new Promise(resolve => setTimeout(resolve, 1));
		events.push(`${name}:end`);
		active -= 1;
	};

	await Promise.all([
		queue.run(op('start')),
		queue.run(op('stop')),
		queue.run(op('start'))
	]);

	assert.deepEqual(events, [
		'start:start',
		'start:end',
		'stop:start',
		'stop:end',
		'start:start',
		'start:end'
	]);
});

test('LifecycleQueue 保留每个调用方自己的失败', async () => {
	const queue = new LifecycleQueue();
	const boom = new Error('stop failed');

	await assert.rejects(
		queue.run(async () => {
			throw boom;
		}),
		boom
	);
});

test('LifecycleQueue 在前一个操作失败后仍然继续服务', async () => {
	const queue = new LifecycleQueue();
	const events: string[] = [];

	// 这就是旧 bug 的形状：restart 里的 stop() 抛错，后续启动不能让队列卡死
	await assert.rejects(
		queue.run(async () => {
			events.push('failing');
			throw new Error('Client is not running and can\'t be stopped');
		})
	);
	await queue.run(async () => {
		events.push('after');
	});

	assert.deepEqual(events, ['failing', 'after']);
});

test('LifecycleQueue 返回操作本身的返回值', async () => {
	const queue = new LifecycleQueue();

	const value = await queue.run(async () => 42);

	assert.equal(value, 42);
});

test('LifecycleQueue 并发调用按提交顺序完成', async () => {
	const queue = new LifecycleQueue();
	const order: number[] = [];

	// 故意让先提交的更慢，验证顺序由提交顺序决定而不是耗时决定
	await Promise.all(
		[0, 1, 2].map(n =>
			queue.run(async () => {
				await new Promise(resolve => setTimeout(resolve, (3 - n) * 2));
				order.push(n);
			})
		)
	);

	assert.deepEqual(order, [0, 1, 2]);
});
