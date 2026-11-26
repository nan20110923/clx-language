import { LanguageConfiguration, IndentAction } from 'vscode';

/**
 * CLX 的括号、注释、缩进规则里需要在运行时补的那部分。
 *
 * 其余规则在根目录的 language-configuration.json 里；这里只放 VS Code 的
 * JSON 配置表达不了的正则。导出的是配置对象本身，不是包装类 ——
 * 历史上它是个 11 行的 class，只为持两个字段，没有换来实现上的隔离。
 */
export const clxLanguageConfiguration: LanguageConfiguration = {
	onEnterRules: [
		{
			// 输入 `---` 后回车：下一行自动补 `---`，用于多行注释续行
			action: { indentAction: IndentAction.None, appendText: '---' },
			beforeText: /^---/
		}
	],

	// 单词边界：引号内的整段算一个词，数字（含小数）算一个词，其余按
	// CLX 的符号集切分。这个字符类刻意逐个转义，与 VS Code 文档的示例保持一致 ——
	// 冗余的转义无害，但改错会改变匹配语义。
	wordPattern: /((?<=')[^']+(?='))|((?<=")[^"]+(?="))|(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g
};
