'use strict';

/**
 * 生成 LuaLS 的配置文件内容，不 import vscode。
 *
 * 为什么不用 .luarc.json 而是 `--configpath`：
 *   - 不往用户的源码目录里写任何文件（这个扩展不该在工作区留垃圾）
 *   - 用户的 .luarc.json / .emmyrc.json 不会影响 CLX 的行为，结果是确定的
 *   - 代价是工作区里已有的 Lua 配置对 .clx 不生效。对 CLX 专属语言这是
 *     可接受甚至更好的取舍，详见 docs/adr/0003。
 *
 * 生成的是 Lua 源文件（LuaLS 的 configpath 要求一个 return table 的 Lua 文件），
 * 不是 JSON —— LuaLS 两种都支持，但 Lua 格式能写注释，排查问题时有用。
 */

export interface LualsConfigInput {
	/** 扩展根目录，用来拼 res/ 下的存根路径 */
	extensionPath: string;
	/** OnSetText 插件的绝对路径 */
	pluginPath: string;
	/** 'en' 或 'zh' */
	language: 'en' | 'zh';
}

/** Lua 字符串字面量转义。路径里可能有反斜杠（Windows）和单引号。 */
function quote(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * 生成 configpath 指向的 Lua 文件内容。
 *
 * 关键项说明：
 *   - runtime.version = 'Lua 5.4'：CLX 是定制版 5.4（32 位数值）
 *   - runtime.plugin：我们自己的 OnSetText，负责把 .clx 的非 Lua 段屏蔽成注释
 *   - runtime.builtin.os / io = 'disable'：CLX 里这两个库完全不存在
 *   - workspace.library：CLX 内置 API + 方言差异两层存根
 *   - diagnostics.globals：模拟器回调的入口函数，用户不该被提示"未定义"
 *   - diagnostics.libraryFiles = 'Disable'：存根文件自己不要报诊断
 */
export function renderConfig(input: LualsConfigInput): string {
	const stdRoot = `${input.extensionPath}/res/clx-std/${input.language}`;
	const luaRoot = `${input.extensionPath}/res/clx-lua/${input.language}`;
	const normalize = (p: string) => p.replace(/\\/g, '/');

	return `-- 由 clx-language 扩展生成，不要手工编辑。
-- 这个文件每次启动语言服务器都会重写；要改 CLX 的行为请改扩展。
return {
  runtime = {
    version = 'Lua 5.4',
    plugin = ${quote(normalize(input.pluginPath))},
    builtin = {
      -- CLX 没有 os 和 io：时间用 stat(90..96)，文件访问用 __resread/__reslist
      os = 'disable',
      io = 'disable',
    },
  },

  workspace = {
    library = {
      -- CLX 内置 API（pset / circfill / stat …）
      ${quote(normalize(stdRoot))},
      -- CLX 的 Lua 方言差异（loads、printh、tostr …）
      ${quote(normalize(luaRoot))},
    },
    checkThirdParty = false,
  },

  diagnostics = {
    -- 存根是给补全用的，它们自己的"未使用参数"之类不是用户的问题
    libraryFiles = 'Disable',
    -- 模拟器回调：这些名字由模拟器调用，不该提示未定义。
    -- 它们也在 res/clx-std/<lang>/lifecycle.lua 里声明；两边要一起改。
    globals = {
      '_init',
      '_update',
      '_draw',
      '_idle_update',
      '_idle_draw',
      '_cfg_update',
      '_cfg_draw',
      '_initsvc',
      '_updatesvc',
      '_svcind',
      '_setstat',
    },
    -- 全小写全局变量通常是用户真的写错了，但 CLX 的 API 全是小写（pset、cls…），
    -- 而且 .clx 里大量直接用它们的返回值，这条检查只会制造噪声。
    disable = {
      'lowercase-global',
    },
  },

  hint = {
    enable = true,
    paramHint = true,
  },
}
`;
}

/** 从 VS Code 的界面语言推出用哪套存根。只看前缀，zh-CN / zh-TW 都算中文。 */
export function stubsLanguage(vscodeLanguage: string): 'en' | 'zh' {
	return vscodeLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
