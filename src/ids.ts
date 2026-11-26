/**
 * 两个 id 和设置命名空间的唯一住所。
 *
 * 这两个 id 极易混淆，且历史上确实混错过：`clx` 是 VS Code 的 language id，
 * `clx_debug` 是 debugger type。语言类功能（语法、补全、inline values、语言配置、
 * Run 命令）用前者；调试类（配置提供者、适配器工厂）用后者。
 *
 * 环境里没有别的办法强制它们与 package.json 一致，所以这里的注释就是校验：
 * 改动时必须同时改 package.json 的 contributes.languages[].id 和
 * contributes.debuggers[].type。
 */

/** language id，对应 package.json 的 contributes.languages[].id。 */
export const LANGUAGE_ID = 'clx';

/** debugger type，对应 package.json 的 contributes.debuggers[].type。 */
export const DEBUG_TYPE = 'clx_debug';

/** 本扩展所有设置项都在这个命名空间下。 */
export const SETTINGS_NAMESPACE = 'clx-language';
