/**
 * 参数名、全局变量等注解：协议类型、渲染、接线。
 *
 * 语言服务器算好注解区间返回，这里只负责在合适的时机去问、再把结果画到编辑器上。
 * 两个触发源：活动编辑器切换、文档内容变化。都做了 150ms 防抖。
 *
 * 注意 activeEditor 只跟踪 .clx 文档：切到其他语言时保留上一个 .clx，
 * 这样在别处打字不会把注解清掉。
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { LANGUAGE_ID } from '../ids';

// ---------------------------------------------------------------------------
// 语言服务器的 emmy/annotator 报文
// ---------------------------------------------------------------------------

export interface AnnotatorParams {
    uri: string;
}

export enum AnnotatorType {
    Param,
    Global,
    DocType,
    Upvalue,
    NotUse
}

export interface RenderRange {
    range: vscode.Range;
    hint: string;
}

export interface IAnnotator {
    uri: string;
    ranges: RenderRange[];
    type: AnnotatorType;
}

// ---------------------------------------------------------------------------
// 装饰类型
// ---------------------------------------------------------------------------

let D_PARAM: vscode.TextEditorDecorationType;
let D_GLOBAL: vscode.TextEditorDecorationType;
let D_DOC_TYPE: vscode.TextEditorDecorationType;
let D_UPVALUE: vscode.TextEditorDecorationType;
let D_NOTUSE: vscode.TextEditorDecorationType;

function createDecoration(key: string | undefined, config: vscode.DecorationRenderOptions = {}): vscode.TextEditorDecorationType {
    if (key === undefined) {
        return vscode.window.createTextEditorDecorationType(config);
    }
    const color = vscode.workspace.getConfiguration("clx-language").get(key);
    if (typeof (color) === 'string') {
        config.light = { color: color };
        config.dark = { color: color };
    }
    return vscode.window.createTextEditorDecorationType(config);
}

function updateDecorations() {
    // 各种方式更新时之前的decoration没有dispose导致重复渲染
    if (D_PARAM) {
        D_PARAM.dispose();
        D_GLOBAL.dispose();
        D_DOC_TYPE.dispose();
        D_UPVALUE.dispose();
        D_NOTUSE.dispose();
    }

    D_PARAM = createDecoration("colors.parameter");
    D_GLOBAL = createDecoration("colors.global");
    D_DOC_TYPE = createDecoration("colors.doc_type");

    const upvalueColor = vscode.workspace.getConfiguration("clx-language").get("colors.upvalue");
    if (upvalueColor && upvalueColor !== "") {
        D_UPVALUE = createDecoration(undefined, {
            textDecoration: `underline;text-decoration-color:${upvalueColor};`
        });
    }
    else {
        D_UPVALUE = createDecoration(undefined);
    }

    D_NOTUSE = createDecoration("colors.not_use", {});
}

/** 释放全部装饰类型。扩展卸载时调用，否则这些资源留给进程收尾。 */
export function disposeAnnotations() {
    for (const d of [D_PARAM, D_GLOBAL, D_DOC_TYPE, D_UPVALUE, D_NOTUSE]) {
        d?.dispose();
    }
}

// ---------------------------------------------------------------------------
// 请求与渲染
// ---------------------------------------------------------------------------

let timeoutToReqAnn: NodeJS.Timeout;

export function requestAnnotators(editor: vscode.TextEditor, client: LanguageClient) {
    clearTimeout(timeoutToReqAnn);
    timeoutToReqAnn = setTimeout(() => {
        requestAnnotatorsImpl(editor, client);
    }, 150);
}

/** 颜色等设置变化时重建装饰类型。 */
export function onAnnotationsConfigurationChanged(client: LanguageClient | undefined) {
    if (client) {
        updateDecorations();
    }
}

function requestAnnotatorsImpl(editor: vscode.TextEditor, client: LanguageClient) {
    if (!D_PARAM) {
        updateDecorations();
    }

    const params: AnnotatorParams = { uri: editor.document.uri.toString() };
    client.sendRequest<IAnnotator[]>("emmy/annotator", params).then(list => {
        const map: Map<AnnotatorType, RenderRange[]> = new Map();
        map.set(AnnotatorType.DocType, []);
        map.set(AnnotatorType.Param, []);
        map.set(AnnotatorType.Global, []);
        map.set(AnnotatorType.Upvalue, []);
        map.set(AnnotatorType.NotUse, []);
        if (!list) {
            return;
        }

        list.forEach(data => {
            const uri = vscode.Uri.parse(data.uri);
            const uriSet = new Set<string>();
            // 而vscode 在diff，分屏以及其他一些情况下可以获得多个相同的uri
            vscode.window.visibleTextEditors.forEach((editor) => {
                const docUri = editor.document.uri;
                if (uriSet.has(docUri.path)) {
                    return;
                }
                uriSet.add(docUri.path)

                if (uri.path.toLowerCase() === docUri.path.toLowerCase()) {
                    let list = map.get(data.type);
                    if (list === undefined) {
                        list = data.ranges;
                    } else {
                        list = list.concat(data.ranges);
                    }
                    map.set(data.type, list);
                }
            });
        });
        map.forEach((v, k) => {
            updateAnnotators(editor, k, v);
        });
    });
}

function updateAnnotators(editor: vscode.TextEditor, type: AnnotatorType, renderRanges: RenderRange[]) {
    switch (type) {
        case AnnotatorType.Param:
            editor.setDecorations(D_PARAM, renderRanges.map(e => e.range));
            break;
        case AnnotatorType.Global:
            editor.setDecorations(D_GLOBAL, renderRanges.map(e => e.range));
            break;
        case AnnotatorType.DocType:
            editor.setDecorations(D_DOC_TYPE, renderRanges.map(e => e.range));
            break;
        case AnnotatorType.Upvalue:
            editor.setDecorations(D_UPVALUE, renderRanges.map(e => e.range));
            break;
        case AnnotatorType.NotUse:
            editor.setDecorations(D_NOTUSE, renderRanges.map(e => e.range));
            break;
    }
}

// ---------------------------------------------------------------------------
// 接线：谁在什么时候来触发
// ---------------------------------------------------------------------------

export class Annotations implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private activeEditor: vscode.TextEditor | undefined;

    constructor(private readonly client: () => LanguageClient | undefined) {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => this.onDidChangeTextDocument(e)),
            vscode.window.onDidChangeActiveTextEditor(e => this.onDidChangeActiveTextEditor(e))
        );
    }

    /** 语言服务器起来后补一次：之前可能已经有打开的 .clx 文件了。 */
    refresh(editor: vscode.TextEditor | undefined): void {
        this.onDidChangeActiveTextEditor(editor);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const client = this.client();
        if (!client) {
            return;
        }
        if (this.activeEditor?.document === event.document && event.document.languageId === LANGUAGE_ID) {
            requestAnnotators(this.activeEditor, client);
        }
    }

    private onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        const client = this.client();
        if (!client) {
            return;
        }
        if (editor?.document.languageId === LANGUAGE_ID) {
            this.activeEditor = editor;
            requestAnnotators(editor, client);
        }
    }
}
