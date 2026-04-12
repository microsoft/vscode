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
exports.SimpleBrowserView = void 0;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("./dispose");
const uuid_1 = require("./uuid");
class SimpleBrowserView extends dispose_1.Disposable {
    extensionUri;
    static viewType = 'simpleBrowser.view';
    static title = vscode.l10n.t("Simple Browser");
    static getWebviewLocalResourceRoots(extensionUri) {
        return [
            vscode.Uri.joinPath(extensionUri, 'media')
        ];
    }
    static getWebviewOptions(extensionUri) {
        return {
            enableScripts: true,
            enableForms: true,
            localResourceRoots: SimpleBrowserView.getWebviewLocalResourceRoots(extensionUri),
        };
    }
    _webviewPanel;
    _onDidDispose = this._register(new vscode.EventEmitter());
    onDispose = this._onDidDispose.event;
    static create(extensionUri, url, showOptions) {
        const webview = vscode.window.createWebviewPanel(SimpleBrowserView.viewType, SimpleBrowserView.title, {
            viewColumn: showOptions?.viewColumn ?? vscode.ViewColumn.Active,
            preserveFocus: showOptions?.preserveFocus
        }, {
            retainContextWhenHidden: true,
            ...SimpleBrowserView.getWebviewOptions(extensionUri)
        });
        return new SimpleBrowserView(extensionUri, url, webview);
    }
    static restore(extensionUri, url, webviewPanel) {
        return new SimpleBrowserView(extensionUri, url, webviewPanel);
    }
    constructor(extensionUri, url, webviewPanel) {
        super();
        this.extensionUri = extensionUri;
        this._webviewPanel = this._register(webviewPanel);
        this._webviewPanel.webview.options = SimpleBrowserView.getWebviewOptions(extensionUri);
        this._register(this._webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'openExternal':
                    try {
                        const url = vscode.Uri.parse(e.url);
                        vscode.env.openExternal(url);
                    }
                    catch {
                        // Noop
                    }
                    break;
            }
        }));
        this._register(this._webviewPanel.onDidDispose(() => {
            this.dispose();
        }));
        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('simpleBrowser.focusLockIndicator.enabled')) {
                const configuration = vscode.workspace.getConfiguration('simpleBrowser');
                this._webviewPanel.webview.postMessage({
                    type: 'didChangeFocusLockIndicatorEnabled',
                    focusLockEnabled: configuration.get('focusLockIndicator.enabled', true)
                });
            }
        }));
        this.show(url);
    }
    dispose() {
        this._onDidDispose.fire();
        super.dispose();
    }
    show(url, options) {
        this._webviewPanel.webview.html = this.getHtml(url);
        this._webviewPanel.reveal(options?.viewColumn, options?.preserveFocus);
    }
    getHtml(url) {
        const configuration = vscode.workspace.getConfiguration('simpleBrowser');
        const nonce = (0, uuid_1.generateUuid)();
        const mainJs = this.extensionResourceUrl('media', 'index.js');
        const mainCss = this.extensionResourceUrl('media', 'main.css');
        const codiconsUri = this.extensionResourceUrl('media', 'codicon.css');
        return /* html */ `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">

				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					font-src data:;
					style-src ${this._webviewPanel.webview.cspSource};
					script-src 'nonce-${nonce}';
					frame-src *;
					">

				<meta id="simple-browser-settings" data-settings="${escapeAttribute(JSON.stringify({
            url: url,
            focusLockEnabled: configuration.get('focusLockIndicator.enabled', true)
        }))}">

				<link rel="stylesheet" type="text/css" href="${mainCss}">
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">
			</head>
			<body>
				<header class="header">
					<nav class="controls">
						<button
							title="${vscode.l10n.t("Back")}"
							class="back-button icon"><i class="codicon codicon-arrow-left"></i></button>

						<button
							title="${vscode.l10n.t("Forward")}"
							class="forward-button icon"><i class="codicon codicon-arrow-right"></i></button>

						<button
							title="${vscode.l10n.t("Reload")}"
							class="reload-button icon"><i class="codicon codicon-refresh"></i></button>
					</nav>

					<input class="url-input" type="text">

					<nav class="controls">
						<button
							title="${vscode.l10n.t("Open in browser")}"
							class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
					</nav>
				</header>
				<div class="content">
					<div class="iframe-focused-alert">${vscode.l10n.t("Focus Lock")}</div>
					<iframe sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe>
				</div>

				<script src="${mainJs}" nonce="${nonce}"></script>
			</body>
			</html>`;
    }
    extensionResourceUrl(...parts) {
        return this._webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts));
    }
}
exports.SimpleBrowserView = SimpleBrowserView;
function escapeAttribute(value) {
    return value.toString().replace(/"/g, '&quot;');
}
//# sourceMappingURL=simpleBrowserView.js.map