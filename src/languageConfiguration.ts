import { LanguageConfiguration, IndentAction } from "vscode";

export class ClxLanguageConfiguration implements LanguageConfiguration {
    public onEnterRules = [
        {
			action: { indentAction: IndentAction.None, appendText: "---" },
			beforeText: /^---/,
        }
    ];

    public wordPattern = /((?<=')[^']+(?='))|((?<=")[^"]+(?="))|(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g;
}