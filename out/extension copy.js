/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * extension.ts (and activateMockDebug.ts) forms the "plugin" that plugs into VS Code and contains the code that
 * connects VS Code with the debug adapter.
 *
 * extension.ts contains code for launching the debug adapter in three different ways:
 * - as an external program communicating with VS Code via stdin/stdout,
 * - as a server process communicating with VS Code via sockets or named pipes, or
 * - as inlined code running in the extension itself (default).
 *
 * Since the code in extension.ts uses node.js APIs it cannot run in the browser.
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const Net = require("net");
const vscode = require("vscode");
const crypto_1 = require("crypto");
const os_1 = require("os");
const path_1 = require("path");
const process_1 = require("process");
const mockDebug_1 = require("./mockDebug");
const activateMockDebug_1 = require("./activateMockDebug");
/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */
const runMode = 'inline';
function activate(context) {
    // debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
    switch (runMode) {
        case 'server':
            // run the debug adapter as a server inside the extension and communicate via a socket
            (0, activateMockDebug_1.activateMockDebug)(context, new MockDebugAdapterServerDescriptorFactory());
            break;
        case 'namedPipeServer':
            // run the debug adapter as a server inside the extension and communicate via a named pipe (Windows) or UNIX domain socket (non-Windows)
            (0, activateMockDebug_1.activateMockDebug)(context, new MockDebugAdapterNamedPipeServerDescriptorFactory());
            break;
        case 'external':
        default:
            // run the debug adapter as a separate process
            (0, activateMockDebug_1.activateMockDebug)(context, new DebugAdapterExecutableFactory());
            break;
        case 'inline':
            // run the debug adapter inside the extension and directly talk to it
            (0, activateMockDebug_1.activateMockDebug)(context);
            break;
    }
}
exports.activate = activate;
function deactivate() {
    // nothing to do
}
exports.deactivate = deactivate;
class DebugAdapterExecutableFactory {
    // The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
    // Since the code implements the default behavior, it is absolutely not neccessary and we show it here only for educational purpose.
    createDebugAdapterDescriptor(_session, executable) {
        // param "executable" contains the executable optionally specified in the package.json (if any)
        // use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
        if (!executable) {
            const command = "absolute path to my DA executable";
            const args = [
                "some args",
                "another arg"
            ];
            const options = {
                cwd: "working directory for executable",
                env: { "envVariable": "some value" }
            };
            executable = new vscode.DebugAdapterExecutable(command, args, options);
        }
        // make VS Code launch the DA executable
        return executable;
    }
}
class MockDebugAdapterServerDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer(socket => {
                const session = new mockDebug_1.MockDebugSession(activateMockDebug_1.workspaceFileAccessor);
                session.setRunAsServer(true);
                session.start(socket, socket);
            }).listen(0);
        }
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer(this.server.address().port);
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
class MockDebugAdapterNamedPipeServerDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        if (!this.server) {
            // start listening on a random named pipe path
            const pipeName = (0, crypto_1.randomBytes)(10).toString('utf8');
            const pipePath = process_1.platform === "win32" ? (0, path_1.join)('\\\\.\\pipe\\', pipeName) : (0, path_1.join)((0, os_1.tmpdir)(), pipeName);
            this.server = Net.createServer(socket => {
                const session = new mockDebug_1.MockDebugSession(activateMockDebug_1.workspaceFileAccessor);
                session.setRunAsServer(true);
                session.start(socket, socket);
            }).listen(pipePath);
        }
        // make VS Code connect to debug server
        return new vscode.DebugAdapterNamedPipeServer(this.server.address());
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
//# sourceMappingURL=extension%20copy.js.map