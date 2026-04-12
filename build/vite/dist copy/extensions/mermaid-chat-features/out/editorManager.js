"use strict";
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
exports.MermaidEditorManager = exports.mermaidEditorViewType = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const uuid_1 = require("./util/uuid");
const html_1 = require("./util/html");
const dispose_1 = require("./util/dispose");
exports.mermaidEditorViewType = 'vscode.chat-mermaid-features.preview';
/**
 * Manages mermaid diagram editor panels, ensuring only one editor per diagram.
 */
class MermaidEditorManager extends dispose_1.Disposable {
    _extensionUri;
    _webviewManager;
    _previews = new Map();
    constructor(_extensionUri, _webviewManager) {
        super();
        this._extensionUri = _extensionUri;
        this._webviewManager = _webviewManager;
        this._register(vscode.window.registerWebviewPanelSerializer(exports.mermaidEditorViewType, this));
    }
    /**
     * Opens a preview for the given diagram
     *
     * If a preview already exists for this diagram, it will be revealed instead of creating a new one.
     */
    openPreview(mermaidSource, title) {
        const webviewId = getWebviewId(mermaidSource);
        const existingPreview = this._previews.get(webviewId);
        if (existingPreview) {
            existingPreview.reveal();
            return;
        }
        const preview = MermaidPreview.create(webviewId, mermaidSource, title, this._extensionUri, this._webviewManager, vscode.ViewColumn.Active);
        this._registerPreview(preview);
    }
    async deserializeWebviewPanel(webviewPanel, state) {
        if (!state?.mermaidSource) {
            webviewPanel.webview.html = this._getErrorHtml();
            return;
        }
        const webviewId = getWebviewId(state.mermaidSource);
        const preview = MermaidPreview.revive(webviewPanel, webviewId, state.mermaidSource, this._extensionUri, this._webviewManager);
        this._registerPreview(preview);
    }
    _registerPreview(preview) {
        this._previews.set(preview.diagramId, preview);
        preview.onDispose(() => {
            this._previews.delete(preview.diagramId);
        });
    }
    _getErrorHtml() {
        return /* html */ `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Mermaid Preview</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
				<style>
					body {
						display: flex;
						justify-content: center;
						align-items: center;
						height: 100vh;
						margin: 0;
					}
				</style>
			</head>
			<body>
				<p>An unexpected error occurred while restoring the Mermaid preview.</p>
			</body>
			</html>`;
    }
    dispose() {
        super.dispose();
        for (const preview of this._previews.values()) {
            preview.dispose();
        }
        this._previews.clear();
    }
}
exports.MermaidEditorManager = MermaidEditorManager;
class MermaidPreview extends dispose_1.Disposable {
    _webviewPanel;
    diagramId;
    _mermaidSource;
    _extensionUri;
    _webviewManager;
    _onDisposeEmitter = this._register(new vscode.EventEmitter());
    onDispose = this._onDisposeEmitter.event;
    static create(diagramId, mermaidSource, title, extensionUri, webviewManager, viewColumn) {
        const webviewPanel = vscode.window.createWebviewPanel(exports.mermaidEditorViewType, title ?? vscode.l10n.t('Mermaid Diagram'), viewColumn, {
            retainContextWhenHidden: false,
        });
        return new MermaidPreview(webviewPanel, diagramId, mermaidSource, extensionUri, webviewManager);
    }
    static revive(webviewPanel, diagramId, mermaidSource, extensionUri, webviewManager) {
        return new MermaidPreview(webviewPanel, diagramId, mermaidSource, extensionUri, webviewManager);
    }
    constructor(_webviewPanel, diagramId, _mermaidSource, _extensionUri, _webviewManager) {
        super();
        this._webviewPanel = _webviewPanel;
        this.diagramId = diagramId;
        this._mermaidSource = _mermaidSource;
        this._extensionUri = _extensionUri;
        this._webviewManager = _webviewManager;
        this._webviewPanel.iconPath = new vscode.ThemeIcon('graph');
        this._webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'chat-webview-out')
            ],
        };
        this._webviewPanel.webview.html = this._getHtml();
        // Register with the webview manager
        this._register(this._webviewManager.registerWebview(this.diagramId, this._webviewPanel.webview, this._mermaidSource, undefined, 'editor'));
        this._register(this._webviewPanel.onDidChangeViewState(e => {
            if (e.webviewPanel.active) {
                this._webviewManager.setActiveWebview(this.diagramId);
            }
        }));
        this._register(this._webviewPanel.onDidDispose(() => {
            this._onDisposeEmitter.fire();
            this.dispose();
        }));
    }
    reveal() {
        this._webviewPanel.reveal();
    }
    dispose() {
        this._onDisposeEmitter.fire();
        super.dispose();
        this._webviewPanel.dispose();
    }
    _getHtml() {
        const nonce = (0, uuid_1.generateUuid)();
        const mediaRoot = vscode.Uri.joinPath(this._extensionUri, 'chat-webview-out');
        const scriptUri = this._webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'index-editor.js'));
        const codiconsUri = this._webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'codicon.css'));
        return /* html */ `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Mermaid Diagram</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${this._webviewPanel.webview.cspSource} 'unsafe-inline'; font-src data:;" />
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">
				<style>
					html, body {
						margin: 0;
						padding: 0;
						height: 100%;
						width: 100%;
						overflow: hidden;
					}
					.mermaid {
						visibility: hidden;
					}
					.mermaid.rendered {
						visibility: visible;
					}
					.mermaid-wrapper {
						height: 100%;
						width: 100%;
					}
					.zoom-controls {
						position: absolute;
						top: 8px;
						right: 8px;
						display: flex;
						gap: 2px;
						z-index: 100;
						background: var(--vscode-editorWidget-background);
						border: 1px solid var(--vscode-editorWidget-border);
						border-radius: 6px;
						padding: 3px;
					}
					.zoom-controls button {
						display: flex;
						align-items: center;
						justify-content: center;
						width: 26px;
						height: 26px;
						background: transparent;
						color: var(--vscode-icon-foreground);
						border: none;
						border-radius: 4px;
						cursor: pointer;
					}
					.zoom-controls button:hover {
						background: var(--vscode-toolbar-hoverBackground);
					}
				</style>
			</head>
			<body data-vscode-context='${JSON.stringify({ preventDefaultContextMenuItems: true, mermaidWebviewId: this.diagramId })}' data-vscode-mermaid-webview-id="${this.diagramId}">
				<div class="zoom-controls">
					<button class="zoom-out-btn" title="${vscode.l10n.t('Zoom Out')}"><i class="codicon codicon-zoom-out"></i></button>
					<button class="zoom-in-btn" title="${vscode.l10n.t('Zoom In')}"><i class="codicon codicon-zoom-in"></i></button>
					<button class="zoom-reset-btn" title="${vscode.l10n.t('Reset Zoom')}"><i class="codicon codicon-screen-normal"></i></button>
				</div>
				<pre class="mermaid">
					${(0, html_1.escapeHtmlText)(this._mermaidSource)}
				</pre>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
/**
 * Generates a unique ID for a diagram based on its content.
 * This ensures the same diagram content always gets the same ID.
 */
function getWebviewId(source) {
    // Simple hash function for generating a content-based ID
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
        const char = source.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
}
//# sourceMappingURL=editorManager.js.map