"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var child_process = __toESM(require("child_process"));
var os = __toESM(require("os"));
var path = require("path");
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.clx-language.run", (resource) => {
      let targetResource = resource;
      if (!targetResource && vscode.window.activeTextEditor) {
        targetResource = vscode.window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        let extensionPath = context.extensionPath;
        console.log("lyc===111222", extensionPath);
        let platform2 = os.platform();
        let coloxToolPath = "";
        if (platform2 == "darwin") {
          coloxToolPath = path.resolve(extensionPath, "debugger", "osx/MacOS", "coloXtool");
        }
        let dir = path.dirname(targetResource.fsPath);
        let fileName = path.basename(targetResource.fsPath);
        let cmdStr = `${coloxToolPath} -d ` + dir + path.sep + " -r " + fileName;
        try {
          child_process.execSync(cmdStr);
        } catch (e) {
          console.log("run coloXtool exception: ", e);
        }
      }
    }),
    vscode.commands.registerCommand("extension.clx-language.debug", (resource) => {
      console.log("lyc===222");
      let targetResource = resource;
      if (!targetResource && vscode.window.activeTextEditor) {
        targetResource = vscode.window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        vscode.debug.startDebugging(void 0, {
          type: "mock",
          name: "Debug File",
          request: "launch",
          program: targetResource.fsPath,
          stopOnEntry: true
        });
      }
    })
  );
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("clx", new DebugAdapterExecutableFactory()));
}
function deactivate() {
}
var DebugAdapterExecutableFactory = class {
  createDebugAdapterDescriptor(_session, executable) {
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
    return executable;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
