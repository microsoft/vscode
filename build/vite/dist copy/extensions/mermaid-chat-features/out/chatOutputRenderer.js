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
exports.registerChatSupport = registerChatSupport;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const html_1 = require("./util/html");
const uuid_1 = require("./util/uuid");
const dispose_1 = require("./util/dispose");
/**
 * Mime type used to identify Mermaid diagram data in chat output.
 */
const mime = 'text/vnd.mermaid';
/**
 * View type that uniquely identifies the Mermaid chat output renderer.
 */
const viewType = 'vscode.chat-mermaid-features.chatOutputItem';
class MermaidChatOutputRenderer {
    _extensionUri;
    _webviewManager;
    constructor(_extensionUri, _webviewManager) {
        this._extensionUri = _extensionUri;
        this._webviewManager = _webviewManager;
    }
    async renderChatOutput({ value }, chatOutputWebview, _ctx, _token) {
        const webview = chatOutputWebview.webview;
        const decoded = decodeMermaidData(value);
        const mermaidSource = decoded.source;
        const title = decoded.title;
        // Generate unique ID for this webview
        const webviewId = (0, uuid_1.generateUuid)();
        const disposables = [];
        // Register and set as active
        disposables.push(this._webviewManager.registerWebview(webviewId, webview, mermaidSource, title, 'chat'));
        // Listen for messages from the webview
        disposables.push(webview.onDidReceiveMessage(message => {
            if (message.type === 'openInEditor') {
                vscode.commands.executeCommand('_mermaid-chat.openInEditor', { mermaidWebviewId: webviewId });
            }
        }));
        // Dispose resources when webview is disposed
        chatOutputWebview.onDidDispose(() => {
            (0, dispose_1.disposeAll)(disposables);
        });
        // Set the options for the webview
        const mediaRoot = vscode.Uri.joinPath(this._extensionUri, 'chat-webview-out');
        webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaRoot],
        };
        // Set the HTML content for the webview
        const nonce = (0, uuid_1.generateUuid)();
        const mermaidScript = vscode.Uri.joinPath(mediaRoot, 'index.js');
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'codicon.css'));
        webview.html = `
			<!DOCTYPE html>
			<html lang="en">

			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Mermaid Diagram</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src data:;" />
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">

				<style>
					body {
						padding: 0;
					}
					.mermaid {
						visibility: hidden;
					}
					.mermaid.rendered {
						visibility: visible;
					}
					.open-in-editor-btn {
						position: absolute;
						top: 8px;
						right: 8px;
						display: flex;
						align-items: center;
						justify-content: center;
						width: 26px;
						height: 26px;
						background: var(--vscode-editorWidget-background);
						color: var(--vscode-icon-foreground);
						border: 1px solid var(--vscode-editorWidget-border);
						border-radius: 6px;
						cursor: pointer;
						z-index: 100;
						opacity: 0;
						transition: opacity 0.2s;
					}
					body:hover .open-in-editor-btn {
						opacity: 1;
					}
					.open-in-editor-btn:hover {
						opacity: 1;
						background: var(--vscode-toolbar-hoverBackground);
					}
				</style>
			</head>

			<body data-vscode-context='${JSON.stringify({ preventDefaultContextMenuItems: true, mermaidWebviewId: webviewId })}' data-vscode-mermaid-webview-id="${webviewId}">
				<button class="open-in-editor-btn" title="${vscode.l10n.t('Open in Editor')}"><i class="codicon codicon-open-preview"></i></button>
				<pre class="mermaid">
					${(0, html_1.escapeHtmlText)(mermaidSource)}
				</pre>

				<script type="module" nonce="${nonce}" src="${webview.asWebviewUri(mermaidScript)}"></script>
			</body>
			</html>`;
    }
}
function registerChatSupport(context, webviewManager, editorManager) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('_mermaid-chat.openInEditor', (ctx) => {
        const webviewInfo = ctx?.mermaidWebviewId ? webviewManager.getWebview(ctx.mermaidWebviewId) : webviewManager.activeWebview;
        if (webviewInfo) {
            editorManager.openPreview(webviewInfo.mermaidSource, webviewInfo.title);
        }
    }));
    // Register lm tools
    disposables.push(vscode.lm.registerTool('renderMermaidDiagram', {
        invoke: async (options, _token) => {
            const sourceCode = options.input.markup;
            const title = options.input.title;
            return writeMermaidToolOutput(sourceCode, title);
        },
    }));
    // Register the chat output renderer for Mermaid diagrams.
    // This will be invoked with the data generated by the tools.
    // It can also be invoked when rendering old Mermaid diagrams in the chat history.
    const renderer = new MermaidChatOutputRenderer(context.extensionUri, webviewManager);
    disposables.push(vscode.chat.registerChatOutputRenderer(viewType, renderer));
    return vscode.Disposable.from(...disposables);
}
function writeMermaidToolOutput(sourceCode, title) {
    // Expose the source code as a markdown mermaid code block
    const fence = getFenceForContent(sourceCode);
    const result = new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`${fence}mermaid\n${sourceCode}\n${fence}`)
    ]);
    // And store custom data in the tool result details to indicate that a custom renderer should be used for it.
    // Encode source and optional title as JSON.
    const data = JSON.stringify({ source: sourceCode, title });
    // Add cast to use proposed API
    result.toolResultDetails2 = {
        mime,
        value: new TextEncoder().encode(data),
    };
    return result;
}
function getFenceForContent(content) {
    const backtickMatch = content.matchAll(/`+/g);
    if (!backtickMatch) {
        return '```';
    }
    const maxBackticks = Math.max(...Array.from(backtickMatch, s => s[0].length));
    return '`'.repeat(Math.max(3, maxBackticks + 1));
}
function decodeMermaidData(value) {
    const text = new TextDecoder().decode(value);
    // Try to parse as JSON (new format with title), fall back to plain text (legacy format)
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && typeof parsed.source === 'string') {
            return { title: parsed.title, source: parsed.source };
        }
    }
    catch {
        // Not JSON, treat as legacy plain text format
    }
    return { title: undefined, source: text };
}
//# sourceMappingURL=chatOutputRenderer.js.map