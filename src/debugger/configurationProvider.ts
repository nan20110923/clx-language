'use strict';

/**
 * 补全 launch 配置。
 *
 * VS Code 在启动调试前把用户的 launch.json 交过来；空对象表示"用户在调试面板
 * 里直接按了启动，没写 config"，这时补一套默认值。host/port 在这里填，
 * 调试会话（debugSession.ts）再从中读取 —— 所以用户在 launch.json 里改是生效的。
 */

import * as vscode from 'vscode';
import { DEBUG_HOST, DEBUG_PORT } from '../emulatorProcess';

export interface DebugLocalConfiguration extends vscode.DebugConfiguration {
    host: string;
    port: number;
}

export class ConfigurationProvider implements vscode.DebugConfigurationProvider {

    constructor(protected type: string) { }

    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: DebugLocalConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // 没写 request 说明用户在调试面板里直接启动（VS Code 传的是空 config）
        if (!debugConfiguration.request) {
            debugConfiguration.request = 'launch';
            debugConfiguration.type = this.type;
        }
        // 用户没写就补默认值；写了就尊重 launch.json
        if (!debugConfiguration.host) {
            debugConfiguration.host = DEBUG_HOST;
        }
        if (!debugConfiguration.port) {
            debugConfiguration.port = DEBUG_PORT;
        }
        return debugConfiguration;
    }
}
