'use strict';

import * as vscode from 'vscode';
import path = require('path');
import { DebugConfiguration } from 'vscode';
import { DEBUG_HOST, DEBUG_PORT } from '../emulatorProcess';

export interface DebugLocalConfiguration extends DebugConfiguration {
    host: string;
    port: number;
}

// const isWin = process.platform === "win32";

// function isAbsolutePath(strPath: string): boolean {
//     if (isWin) {
//         if ((strPath.startsWith("\\") && !strPath.startsWith("\\\\")) || (strPath.startsWith("/") && !strPath.startsWith("//")))
//             strPath = strPath.substring(1);
//     }
//     return path.isAbsolute(strPath);
// }

export class ConfigurationProvider implements vscode.DebugConfigurationProvider, vscode.Disposable {
    constructor(
        protected type: string,
        protected context: vscode.ExtensionContext
    ) {
        context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
            if (e.session.type === this.type) {
                this.onDebugCustomEvent(e);
            }
        }));
        context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(e => this.onTerminateDebugSession(e)));
    }

    private showWaitConnectionToken = new vscode.CancellationTokenSource();

    protected async onDebugCustomEvent(e: vscode.DebugSessionCustomEvent) {
        if (e.event === 'showWaitConnection') {
            this.showWaitConnectionToken.cancel();
            this.showWaitConnectionToken = new vscode.CancellationTokenSource();
            this.showWaitConnection(e.session, this.showWaitConnectionToken.token);
        }
        else if (e.event === 'onNewConnection') {
            this.showWaitConnectionToken.cancel();
        }
    }

    private async showWaitConnection(session: vscode.DebugSession, token: vscode.CancellationToken) {
        return vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Wait for connection.',
                cancellable: true
            },
            async (progress, userCancelToken) => {
                userCancelToken.onCancellationRequested(e => {
                    session.customRequest('stopWaitConnection');
                });
                await new Promise((r, e) => token.onCancellationRequested(r));
            }
        );
    }

    protected onTerminateDebugSession(session: vscode.DebugSession) {
        this.showWaitConnectionToken.cancel();
    }

    protected isNullOrEmpty(s?: string): boolean {
        return !s || s.trim().length === 0;
    }

    protected getSourceRoots(): string[] {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const list = workspaceFolders.map(f => { return f.uri.fsPath; });
        const config = <Array<string>>vscode.workspace.getConfiguration("emmylua").get("source.roots") || [];
        return list.concat(config.map(item => { return path.normalize(item); }));
    }

    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: DebugLocalConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        // console.log('resolveDebugConfiguration!!!')
        debugConfiguration.extensionPath = this.context.extensionPath;
        debugConfiguration.sourcePaths = this.getSourceRoots();
        if (!debugConfiguration.request) {
            debugConfiguration.request = "launch";
            debugConfiguration.type = "clx_debug";
            debugConfiguration.host = DEBUG_HOST;
            debugConfiguration.port = DEBUG_PORT;
        }
        return debugConfiguration;
    }

    dispose() { }
}
