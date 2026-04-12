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
exports.MediaPreview = void 0;
exports.reopenAsText = reopenAsText;
const vscode = __importStar(require("vscode"));
const vscode_uri_1 = require("vscode-uri");
const dispose_1 = require("./util/dispose");
async function reopenAsText(resource, viewColumn) {
    await vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
}
class MediaPreview extends dispose_1.Disposable {
    _resource;
    _webviewEditor;
    _binarySizeStatusBarEntry;
    previewState = 1 /* PreviewState.Visible */;
    _binarySize;
    constructor(extensionRoot, _resource, _webviewEditor, _binarySizeStatusBarEntry) {
        super();
        this._resource = _resource;
        this._webviewEditor = _webviewEditor;
        this._binarySizeStatusBarEntry = _binarySizeStatusBarEntry;
        _webviewEditor.webview.options = {
            enableScripts: true,
            enableForms: false,
            localResourceRoots: [
                vscode_uri_1.Utils.dirname(_resource),
                extensionRoot,
            ]
        };
        this._register(_webviewEditor.onDidChangeViewState(() => {
            this.updateState();
        }));
        this._register(_webviewEditor.onDidDispose(() => {
            this.previewState = 0 /* PreviewState.Disposed */;
            this.dispose();
        }));
        const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(_resource, '*')));
        this._register(watcher.onDidChange(e => {
            if (e.toString() === this._resource.toString()) {
                this.updateBinarySize();
                this.render();
            }
        }));
        this._register(watcher.onDidDelete(e => {
            if (e.toString() === this._resource.toString()) {
                this._webviewEditor.dispose();
            }
        }));
    }
    dispose() {
        super.dispose();
        this._binarySizeStatusBarEntry.hide(this);
    }
    get resource() {
        return this._resource;
    }
    updateBinarySize() {
        vscode.workspace.fs.stat(this._resource).then(({ size }) => {
            this._binarySize = size;
            this.updateState();
        });
    }
    async render() {
        if (this.previewState === 0 /* PreviewState.Disposed */) {
            return;
        }
        const content = await this.getWebviewContents();
        if (this.previewState === 0 /* PreviewState.Disposed */) {
            return;
        }
        this._webviewEditor.webview.html = content;
    }
    updateState() {
        if (this.previewState === 0 /* PreviewState.Disposed */) {
            return;
        }
        if (this._webviewEditor.active) {
            this.previewState = 2 /* PreviewState.Active */;
            this._binarySizeStatusBarEntry.show(this, this._binarySize);
        }
        else {
            this._binarySizeStatusBarEntry.hide(this);
            this.previewState = 1 /* PreviewState.Visible */;
        }
    }
}
exports.MediaPreview = MediaPreview;
//# sourceMappingURL=mediaPreview.js.map