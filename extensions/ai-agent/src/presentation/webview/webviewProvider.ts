/**
 * Webview Provider
 * Manages the Code Ship chat webview panel
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentController } from '../../application/agentController';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../types';

/**
 * WebviewProvider options
 */
export interface WebviewProviderOptions {
    /** Extension URI for resource loading */
    extensionUri: vscode.Uri;
    /** AgentController instance */
    controller: AgentController;
}

/**
 * WebviewProvider class
 * Provides the chat webview panel for Code Ship
 */
export class WebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'codeShip.chatView';

    private readonly extensionUri: vscode.Uri;
    private readonly controller: AgentController;
    private readonly disposables: vscode.Disposable[] = [];

    private view?: vscode.WebviewView;
    private panel?: vscode.WebviewPanel;

    constructor(options: WebviewProviderOptions) {
        this.extensionUri = options.extensionUri;
        this.controller = options.controller;
    }

    /**
     * Called when the webview view is resolved (for sidebar view)
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = this.getWebviewOptions();
        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        this.setupMessageHandling(webviewView.webview);

        // Send locale to webview
        this.sendLocale(webviewView.webview);

        webviewView.onDidDispose(() => {
            this.view = undefined;
        }, null, this.disposables);
    }

    /**
     * Show the chat panel (for editor panel)
     */
    showPanel(): vscode.WebviewPanel {
        if (this.panel) {
            this.panel.reveal();
            return this.panel;
        }

        this.panel = vscode.window.createWebviewPanel(
            WebviewProvider.viewType,
            'Code Ship Chat',
            vscode.ViewColumn.Beside,
            this.getWebviewOptions()
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);
        this.setupMessageHandling(this.panel.webview);

        // Send locale to webview
        this.sendLocale(this.panel.webview);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.disposables);

        return this.panel;
    }

    /**
     * Send current locale to webview
     */
    private sendLocale(webview: vscode.Webview): void {
        const locale = vscode.env.language;
        webview.postMessage({ type: 'locale', data: locale });
    }

    /**
     * Post a message to the webview
     */
    postMessage(message: ExtensionToWebviewMessage): boolean {
        const webview = this.view?.webview ?? this.panel?.webview;
        if (webview) {
            webview.postMessage(message);
            return true;
        }
        return false;
    }

    /**
     * Get webview options
     */
    private getWebviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')
            ]
        };
    }

    /**
     * Setup message handling between webview and extension
     */
    private setupMessageHandling(webview: vscode.Webview): void {
        // Set postMessage function on controller
        this.controller.setPostMessage((message: ExtensionToWebviewMessage) => {
            webview.postMessage(message);
        });

        // Handle messages from webview
        const messageHandler = webview.onDidReceiveMessage(
            async (message: WebviewToExtensionMessage) => {
                await this.controller.handleWebviewMessage(message);
            },
            null,
            this.disposables
        );

        this.disposables.push(messageHandler);
    }

    /**
     * Get HTML content for the webview
     */
    private getHtmlContent(webview: vscode.Webview): string {
        // Read CSS and JS files directly to inline them (bypass CDN resource loading)
        const webviewOutPath = path.join(this.extensionUri.fsPath, 'out', 'webview');

        let cssContent = '';
        let jsContent = '';

        try {
            const cssPath = path.join(webviewOutPath, 'index.css');
            if (fs.existsSync(cssPath)) {
                cssContent = fs.readFileSync(cssPath, 'utf8');
            }
        } catch (err) {
            console.error('[Code Ship] Failed to read CSS:', err);
        }

        try {
            const jsPath = path.join(webviewOutPath, 'main.js');
            if (fs.existsSync(jsPath)) {
                jsContent = fs.readFileSync(jsPath, 'utf8');
            }
        } catch (err) {
            console.error('[Code Ship] Failed to read JS:', err);
        }

        // Generate nonce for CSP
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Code Ship Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background-color: var(--vscode-editor-background, #1e1e1e);
            height: 100vh;
            overflow: hidden;
        }

        #root {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        @keyframes pulse {
            0%, 80%, 100% {
                opacity: 0.3;
            }
            40% {
                opacity: 1;
            }
        }
    </style>
    <style>${cssContent}</style>
</head>
<body>
    <div id="root">
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-foreground);">
            <span>Loading Code Ship...</span>
        </div>
    </div>
    <script>${jsContent}</script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
