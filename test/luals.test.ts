/**
 * LuaLS 包的清单校验与配置生成。
 *
 * lualsBundle 的关键差异（相对模拟器）：清单**带 arch**。LuaLS 按
 * darwin-arm64 / darwin-x64 / win32-x64 分别发布，一个平台不止一份包；
 * 模拟器只有 x86_64，所以它刻意不带 arch。这里把这条差异固化成断言。
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	LualsError,
	describeProvisionFailure,
	findBundle,
	isReady,
	locateBundle,
	parseManifest,
	versionKey
} from '../src/language/lualsBundle';
import type { LualsBundle, LualsManifest } from '../src/language/lualsBundle';
import { ArtifactError } from '../src/artifact/bundle';
import { renderConfig, stubsLanguage } from '../src/language/lualsConfig';

let workDir: string;

before(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clx-luals-test-'));
});

after(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

function bundle(overrides: Partial<LualsBundle> = {}): LualsBundle {
	return {
		product: 'LuaLS',
		platform: 'darwin',
		arch: 'arm64',
		version: '3.19.2',
		asset: 'luals-darwin-arm64-3.19.2.tar.gz',
		size: 1013911,
		sha256: 'c6279c8821bdf1876eb5bcb7f4ce21bbb21b0efc6c389b3cb97e12a65769e2e4',
		executable: 'bin/lua-language-server',
		...overrides
	};
}

function manifest(bundles: LualsBundle[]): LualsManifest {
	return { release: 'luals-3.19.2', baseUrl: 'https://example.test/download', bundles };
}

const VERSION_KEY = 'LuaLS-darwin-arm64-3.19.2-c6279c88';

// ---------------------------------------------------------------------------
// parseManifest
// ---------------------------------------------------------------------------

test('parseManifest 接受合法清单', () => {
	const parsed = parseManifest(JSON.stringify(manifest([bundle()])));
	assert.equal(parsed.release, 'luals-3.19.2');
	assert.equal(parsed.bundles.length, 1);
});

test('parseManifest 拒绝非 JSON', () => {
	assert.throws(() => parseManifest('{oops'), LualsError);
});

test('parseManifest 拒绝缺顶层字段的清单', () => {
	assert.throws(() => parseManifest(JSON.stringify({ bundles: [] })), /malformed/);
});

test('parseManifest 逐个校验 bundle 字段——缺 arch 必须报错', () => {
	// arch 是 LuaLS 与模拟器清单的关键差异，缺了必须在这里就失败，
	// 而不是等到 findBundle 拿到 undefined 才莫名其妙地找不到包
	const missingArch = { ...bundle() } as Record<string, unknown>;
	delete missingArch.arch;
	assert.throws(() => parseManifest(JSON.stringify(manifest([missingArch as unknown as LualsBundle]))), /arch/);
});

test('parseManifest 拒绝非正的 size', () => {
	assert.throws(() => parseManifest(JSON.stringify(manifest([bundle({ size: 0 })]))), /size/);
});

// ---------------------------------------------------------------------------
// findBundle
// ---------------------------------------------------------------------------

test('findBundle 按 platform + arch 精确匹配', () => {
	const m = manifest([
		bundle(),
		bundle({ arch: 'x64', asset: 'luals-darwin-x64-3.19.2.tar.gz' }),
		bundle({ platform: 'win32', arch: 'x64', asset: 'luals-win32-x64-3.19.2.tar.gz' })
	]);

	assert.equal(findBundle(m, 'darwin', 'arm64').arch, 'arm64');
	assert.equal(findBundle(m, 'darwin', 'x64').arch, 'x64');
	assert.equal(findBundle(m, 'win32', 'x64').platform, 'win32');
});

test('findBundle 找不到时列出可选项', () => {
	const m = manifest([bundle()]);
	assert.throws(
		() => findBundle(m, 'linux', 'x64'),
		(e: unknown) => {
			assert.ok(e instanceof LualsError);
			assert.match(e.message, /No LuaLS bundle is available for linux\/x64/);
			assert.match(e.message, /darwin\/arm64/, '错误信息要告诉调用方有哪些可用');
			return true;
		}
	);
});

// ---------------------------------------------------------------------------
// 缓存位置与就绪判定
// ---------------------------------------------------------------------------

test('versionKey 带 arch，让同平台的不同架构能共存', () => {
	assert.equal(versionKey(bundle()), VERSION_KEY);
	assert.notEqual(versionKey(bundle()), versionKey(bundle({ arch: 'x64' })));
});

test('versionKey 带 sha 前 8 位，同一版本的不同构建也互不覆盖', () => {
	const a = versionKey(bundle());
	const b = versionKey(bundle({ sha256: 'ffffffff00000000000000000000000000000000000000000000000000000000' }));
	assert.notEqual(a, b);
});

test('locateBundle 拼出目录与可执行文件路径', () => {
	const install = locateBundle('/cache/luals', bundle());
	assert.equal(install.directory, path.join('/cache/luals', VERSION_KEY));
	assert.equal(install.executable, path.join(install.directory, 'bin/lua-language-server'));
});

test('isReady 在没有 .complete 时为 false', () => {
	const install = locateBundle(workDir, bundle());
	assert.equal(isReady(install), false);
});

test('isReady 需要 marker 和可执行文件都存在', () => {
	const install = locateBundle(workDir, bundle());
	fs.mkdirSync(path.dirname(install.executable), { recursive: true });
	fs.writeFileSync(install.executable, '#!/bin/sh\n');

	// 只有可执行文件、没有 marker：还不算就绪（可能在解压中途）
	assert.equal(isReady(install), false);

	fs.writeFileSync(path.join(install.directory, '.complete'), '{}');
	assert.equal(isReady(install), true);

	// marker 在但可执行文件被删了：视为损坏
	fs.rmSync(install.executable);
	assert.equal(isReady(install), false);
});

// ---------------------------------------------------------------------------
// 配置生成
// ---------------------------------------------------------------------------

const CONFIG_INPUT = {
	extensionPath: '/ext/clx-language',
	pluginPath: '/ext/clx-language/res/luals/clx.lua',
	language: 'en' as const
};

test('renderConfig 生成 Lua 表而不是 JSON', () => {
	const config = renderConfig(CONFIG_INPUT);
	assert.match(config, /^return \{/m);
	assert.match(config, /version = 'Lua 5\.4'/);
});

test('renderConfig 禁用 os 和 io——CLX 里它们不存在', () => {
	const config = renderConfig(CONFIG_INPUT);
	assert.match(config, /os = 'disable'/);
	assert.match(config, /io = 'disable'/);
});

test('renderConfig 指向插件与两层存根', () => {
	const config = renderConfig(CONFIG_INPUT);
	assert.match(config, /plugin = '\/ext\/clx-language\/res\/luals\/clx\.lua'/);
	assert.match(config, /'\/ext\/clx-language\/res\/clx-std\/en'/);
	assert.match(config, /'\/ext\/clx-language\/res\/clx-lua\/en'/);
});

test('renderConfig 按语言切换存根目录', () => {
	const en = renderConfig({ ...CONFIG_INPUT, language: 'en' });
	const zh = renderConfig({ ...CONFIG_INPUT, language: 'zh' });
	assert.match(en, /clx-std\/en/);
	assert.match(zh, /clx-std\/zh/);
	assert.doesNotMatch(en, /clx-std\/zh/);
});

test('renderConfig 声明模拟器回调为全局，避免未定义提示', () => {
	const config = renderConfig(CONFIG_INPUT);
	for (const name of ['_init', '_update', '_draw', '_idle_update', '_idle_draw', '_svcind']) {
		assert.ok(config.includes(`'${name}'`), `缺少全局声明: ${name}`);
	}
});

test('renderConfig 把 Windows 反斜杠转成正斜杠并正确转义', () => {
	// Windows 上 extensionPath 带反斜杠；Lua 字符串里 \\ 才是字面反斜杠，
	// 而 LuaLS 接受正斜杠路径，所以直接归一成 / 更省事
	const config = renderConfig({
		extensionPath: 'C:\\Users\\me\\.vscode\\ext\\clx',  // allow-public: 示例路径
		pluginPath: 'C:\\Users\\me\\.vscode\\ext\\clx\\res\\luals\\clx.lua',  // allow-public: 示例路径
		language: 'en'
	});
	assert.match(config, /'C:\/Users\/me\/\.vscode\/ext\/clx\/res\/luals\/clx\.lua'/);
	assert.doesNotMatch(config, /C:\\\\Users/, '不该留下需要双重转义的路径');
});

test('renderConfig 转义路径里的单引号', () => {
	const config = renderConfig({
		extensionPath: "/ext/it's here",
		pluginPath: "/ext/it's here/clx.lua",
		language: 'en'
	});
	assert.match(config, /it\\'s here/);
});

test('stubsLanguage 只看前缀，zh-CN / zh-TW 都算中文', () => {
	assert.equal(stubsLanguage('zh-cn'), 'zh');
	assert.equal(stubsLanguage('zh-TW'), 'zh');
	assert.equal(stubsLanguage('en'), 'en');
	assert.equal(stubsLanguage('ja'), 'en');
	assert.equal(stubsLanguage(''), 'en');
});

// ---------------------------------------------------------------------------
// 下载失败的分类
//
// 这一组存在的理由：底层把错误包成 ArtifactError 后，message 只剩
// "Failed to download ..."，真正的原因在 detail 里。分类器不读 detail 的话，
// 用户看到的是无法行动的一句废话 —— 而"清单指向不存在的 release"和
// "我这台机器断网了"需要完全不同的反应。
// ---------------------------------------------------------------------------

test('describeProvisionFailure 认出 404——清单指向未发布的 release', () => {
	const error = new LualsError(
		'Failed to download the CLX language server from https://x/y.tar.gz.',
		'Error: Server responded with HTTP 404.'
	);
	const failure = describeProvisionFailure(error);
	assert.equal(failure.kind, 'not-found');
	// 这种情况重试没用，是发布侧的问题
	assert.equal(failure.retryable, false);
	assert.match(failure.summary, /has not been published/);
	assert.match(failure.detail, /HTTP 404/, 'detail 要保留原始原因供日志排查');
});

test('describeProvisionFailure 认出 403', () => {
	const failure = describeProvisionFailure(new LualsError('x', 'Server responded with HTTP 403.'));
	assert.equal(failure.kind, 'not-found');
	assert.equal(failure.retryable, false);
});

test('describeProvisionFailure 把校验失败标为可重试', () => {
	// 代理注入或传输损坏可能只是这一次
	const failure = describeProvisionFailure(
		new LualsError('x', 'Error: Checksum mismatch: expected aa, got bb.')
	);
	assert.equal(failure.kind, 'checksum');
	assert.equal(failure.retryable, true);
	assert.match(failure.summary, /integrity check/);
});

test('describeProvisionFailure 把 5xx 与网络错误归为可重试', () => {
	for (const detail of [
		'Server responded with HTTP 502.',
		'Error: ECONNRESET',
		'Error: ETIMEDOUT',
		'getaddrinfo ENOTFOUND github.com',
		'socket hang up',
		'Too many redirects.'
	]) {
		const failure = describeProvisionFailure(new LualsError('x', detail));
		assert.equal(failure.kind, 'network', `应识别为网络错误: ${detail}`);
		assert.equal(failure.retryable, true, `应可重试: ${detail}`);
	}
});

test('describeProvisionFailure 把磁盘错误标为不可重试', () => {
	for (const detail of ['ENOSPC: no space left', 'EACCES: permission denied']) {
		const failure = describeProvisionFailure(new LualsError('x', detail));
		assert.equal(failure.kind, 'disk', `应识别为磁盘问题: ${detail}`);
		assert.equal(failure.retryable, false, `重试无用: ${detail}`);
	}
});

test('describeProvisionFailure 对未知错误给保守答案', () => {
	const failure = describeProvisionFailure(new Error('something odd'));
	assert.equal(failure.kind, 'unknown');
	assert.equal(failure.retryable, false);
	assert.ok(failure.detail.includes('something odd'));
});

test('describeProvisionFailure 能吃非 Error 的抛出物', () => {
	const failure = describeProvisionFailure('plain string');
	assert.equal(failure.kind, 'unknown');
	assert.match(failure.detail, /plain string/);
});

test('describeProvisionFailure 从 ArtifactError.detail 里读原因', () => {
	// 这是实际的包装形式：provisionLuals 把 ArtifactError 转成 LualsError 时
	// 保留 detail，分类器必须看这一层
	const failure = describeProvisionFailure(new ArtifactError('wrapped', 'Error: HTTP 404'));
	assert.equal(failure.kind, 'not-found');
});
