"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopmostLineMonitor = void 0;
exports.getVisibleLine = getVisibleLine;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const file_1 = require("../util/file");
const resourceMap_1 = require("../util/resourceMap");
class TopmostLineMonitor extends dispose_1.Disposable {
    #pendingUpdates = new resourceMap_1.ResourceMap();
    #throttle = 50;
    #previousTextEditorInfo = new resourceMap_1.ResourceMap();
    #previousStaticEditorInfo = new resourceMap_1.ResourceMap();
    constructor() {
        super();
        if (vscode.window.activeTextEditor) {
            const line = getVisibleLine(vscode.window.activeTextEditor);
            this.setPreviousTextEditorLine({ uri: vscode.window.activeTextEditor.document.uri, line: line ?? 0 });
        }
        this._register(vscode.window.onDidChangeTextEditorVisibleRanges(event => {
            if ((0, file_1.isMarkdownFile)(event.textEditor.document)) {
                const line = getVisibleLine(event.textEditor);
                if (typeof line === 'number') {
                    this.updateLine(event.textEditor.document.uri, line);
                    this.setPreviousTextEditorLine({ uri: event.textEditor.document.uri, line: line });
                }
            }
        }));
    }
    #onChanged = this._register(new vscode.EventEmitter());
    onDidChanged = this.#onChanged.event;
    setPreviousStaticEditorLine(scrollLocation) {
        this.#previousStaticEditorInfo.set(scrollLocation.uri, scrollLocation);
    }
    getPreviousStaticEditorLineByUri(resource) {
        const scrollLoc = this.#previousStaticEditorInfo.get(resource);
        this.#previousStaticEditorInfo.delete(resource);
        return scrollLoc?.line;
    }
    setPreviousTextEditorLine(scrollLocation) {
        this.#previousTextEditorInfo.set(scrollLocation.uri, scrollLocation);
    }
    getPreviousTextEditorLineByUri(resource) {
        const scrollLoc = this.#previousTextEditorInfo.get(resource);
        this.#previousTextEditorInfo.delete(resource);
        return scrollLoc?.line;
    }
    getPreviousStaticTextEditorLineByUri(resource) {
        const state = this.#previousStaticEditorInfo.get(resource);
        return state?.line;
    }
    updateLine(resource, line) {
        if (!this.#pendingUpdates.has(resource)) {
            // schedule update
            setTimeout(() => {
                if (this.#pendingUpdates.has(resource)) {
                    this.#onChanged.fire({
                        resource,
                        line: this.#pendingUpdates.get(resource)
                    });
                    this.#pendingUpdates.delete(resource);
                }
            }, this.#throttle);
        }
        this.#pendingUpdates.set(resource, line);
    }
}
exports.TopmostLineMonitor = TopmostLineMonitor;
/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
function getVisibleLine(editor) {
    if (!editor.visibleRanges.length) {
        return undefined;
    }
    const firstVisiblePosition = editor.visibleRanges[0].start;
    const lineNumber = firstVisiblePosition.line;
    const line = editor.document.lineAt(lineNumber);
    const progress = firstVisiblePosition.character / (line.text.length + 2);
    return lineNumber + progress;
}
//# sourceMappingURL=topmostLineMonitor.js.map