/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Messages from webview to extension
 */
export interface WebviewMessage {
	type: 'ready' | 'update' | 'save' | 'requestLink';
	content?: string;
}

/**
 * Messages from extension to webview
 */
export interface ExtensionMessage {
	type: 'load' | 'setTheme' | 'setLink';
	content?: string;
	format?: 'markdown' | 'typst';
	theme?: 'light' | 'dark';
	url?: string;
}

/**
 * Base class for rich text editor providers
 */
export abstract class BaseEditorProvider implements vscode.CustomTextEditorProvider {
	public abstract readonly viewType: string;
	protected abstract readonly format: 'markdown' | 'typst';

	constructor(protected readonly context: vscode.ExtensionContext) { }

	/**
	 * Called when a custom editor is opened
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Configure webview
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media')
			]
		};

		// Set initial HTML
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Track document version to detect external changes
		let lastKnownVersion = document.version;
		// Track if we're waiting for our own edit to be applied
		let pendingVersion: number | null = null;

		// Send content to webview when ready
		const updateWebview = () => {
			const message: ExtensionMessage = {
				type: 'load',
				content: document.getText(),
				format: this.format
			};
			webviewPanel.webview.postMessage(message);
			lastKnownVersion = document.version;
		};

		// Handle messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case 'ready':
						// Webview is ready, send content
						updateWebview();
						// Send theme
						this.sendTheme(webviewPanel.webview);
						break;

					case 'update':
						// Content changed in webview, update document
						if (message.content !== undefined && message.content !== document.getText()) {
							// Mark that we're about to change the document
							pendingVersion = document.version;
							const edit = new vscode.WorkspaceEdit();
							edit.replace(
								document.uri,
								new vscode.Range(0, 0, document.lineCount, 0),
								message.content
							);
							await vscode.workspace.applyEdit(edit);
							// Update our tracked version to the new one
							lastKnownVersion = document.version;
							pendingVersion = null;
						}
						break;

					case 'save':
						// Save the document
						await document.save();
						break;

					case 'requestLink': {
						// Show input box for URL
						const url = await vscode.window.showInputBox({
							prompt: 'Enter URL',
							placeHolder: 'https://example.com',
							validateInput: (value) => {
								if (!value) {
									return 'URL is required';
								}
								return null;
							}
						});
						if (url) {
							const linkMessage: ExtensionMessage = {
								type: 'setLink',
								url
							};
							webviewPanel.webview.postMessage(linkMessage);
						}
						break;
					}
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Update webview ONLY when document changes externally (e.g., from source editor)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				// Ignore if this is our own pending edit
				if (pendingVersion !== null) {
					return;
				}
				// Only update if the version changed from something other than our last update
				if (document.version !== lastKnownVersion) {
					updateWebview();
				}
			}
		});

		// Listen for theme changes
		const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
			this.sendTheme(webviewPanel.webview);
		});

		// Cleanup when panel is closed
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			themeChangeSubscription.dispose();
		});
	}

	/**
	 * Send current theme to webview
	 */
	private sendTheme(webview: vscode.Webview): void {
		const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
			? 'dark'
			: 'light';

		const message: ExtensionMessage = {
			type: 'setTheme',
			theme
		};
		webview.postMessage(message);
	}

	/**
	 * Generate HTML for the webview
	 */
	protected getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dist', 'editor.js')
		);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src ${webview.cspSource} 'unsafe-inline';
		script-src 'nonce-${nonce}';
		img-src ${webview.cspSource} https: data:;
		font-src ${webview.cspSource};
	">
	<title>Rich Editor</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif);
			font-size: var(--vscode-font-size, 14px);
			color: var(--vscode-editor-foreground, #333);
			background-color: var(--vscode-editor-background, #fff);
			line-height: 1.6;
			padding: 0;
			margin: 0;
			height: 100vh;
			overflow: hidden;
		}

		.editor-container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}

		.toolbar {
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 8px 12px;
			background: var(--vscode-editor-background, #fff);
			border-bottom: 1px solid var(--vscode-panel-border, #e0e0e0);
			flex-wrap: wrap;
		}

		.toolbar-button {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			border: none;
			background: transparent;
			border-radius: 4px;
			cursor: pointer;
			color: var(--vscode-editor-foreground, #333);
			font-size: 14px;
		}

		.toolbar-button:hover {
			background: var(--vscode-toolbar-hoverBackground, rgba(0,0,0,0.1));
		}

		.toolbar-button.active {
			background: var(--vscode-toolbar-activeBackground, rgba(0,0,0,0.15));
		}

		.toolbar-separator {
			width: 1px;
			height: 20px;
			background: var(--vscode-panel-border, #e0e0e0);
			margin: 0 4px;
		}

		.editor-content {
			flex: 1;
			overflow-y: auto;
			padding: 20px 40px;
		}

		/* TipTap editor styles */
		.ProseMirror {
			outline: none;
			min-height: 100%;
		}

		.ProseMirror > * + * {
			margin-top: 0.75em;
		}

		.ProseMirror h1 {
			font-size: 2em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror h2 {
			font-size: 1.5em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror h3 {
			font-size: 1.25em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror p {
			margin: 0.5em 0;
		}

		.ProseMirror ul,
		.ProseMirror ol {
			padding-left: 1.5em;
			margin: 0.5em 0;
		}

		.ProseMirror li {
			margin: 0.25em 0;
		}

		.ProseMirror blockquote {
			border-left: 3px solid var(--vscode-textBlockQuote-border, #ddd);
			padding-left: 1em;
			margin: 0.5em 0;
			color: var(--vscode-textBlockQuote-foreground, #666);
		}

		.ProseMirror code {
			background: var(--vscode-textCodeBlock-background, #f0f0f0);
			padding: 0.2em 0.4em;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.9em;
		}

		.ProseMirror pre {
			background: var(--vscode-textCodeBlock-background, #f0f0f0);
			padding: 1em;
			border-radius: 4px;
			overflow-x: auto;
			margin: 0.5em 0;
		}

		.ProseMirror pre code {
			background: none;
			padding: 0;
		}

		.ProseMirror a {
			color: var(--vscode-textLink-foreground, #0066cc);
			text-decoration: underline;
		}

		.ProseMirror a:hover {
			color: var(--vscode-textLink-activeForeground, #0044aa);
		}

		.ProseMirror img {
			max-width: 100%;
			height: auto;
		}

		.ProseMirror hr {
			border: none;
			border-top: 1px solid var(--vscode-panel-border, #e0e0e0);
			margin: 1em 0;
		}

		.ProseMirror p.is-editor-empty:first-child::before {
			content: attr(data-placeholder);
			float: left;
			color: var(--vscode-input-placeholderForeground, #999);
			pointer-events: none;
			height: 0;
		}

		.statusbar {
			display: flex;
			justify-content: space-between;
			padding: 4px 12px;
			background: var(--vscode-statusBar-background, #f5f5f5);
			border-top: 1px solid var(--vscode-panel-border, #e0e0e0);
			font-size: 12px;
			color: var(--vscode-statusBar-foreground, #666);
		}

		.loading {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: var(--vscode-descriptionForeground, #666);
		}
	</style>
</head>
<body>
	<div class="editor-container">
		<div class="toolbar" id="toolbar">
			<button class="toolbar-button" data-command="bold" title="Bold (Cmd+B)"><b>B</b></button>
			<button class="toolbar-button" data-command="italic" title="Italic (Cmd+I)"><i>I</i></button>
			<button class="toolbar-button" data-command="strike" title="Strikethrough"><s>S</s></button>
			<button class="toolbar-button" data-command="code" title="Inline Code">⌘</button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="heading1" title="Heading 1">H1</button>
			<button class="toolbar-button" data-command="heading2" title="Heading 2">H2</button>
			<button class="toolbar-button" data-command="heading3" title="Heading 3">H3</button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="bulletList" title="Bullet List">•</button>
			<button class="toolbar-button" data-command="orderedList" title="Numbered List">1.</button>
			<button class="toolbar-button" data-command="blockquote" title="Quote">&quot;</button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="link" title="Link (Cmd+K)">#</button>
			<button class="toolbar-button" data-command="horizontalRule" title="Horizontal Rule">-</button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="undo" title="Undo (Cmd+Z)">&larr;</button>
			<button class="toolbar-button" data-command="redo" title="Redo (Cmd+Shift+Z)">&rarr;</button>
		</div>
		<div class="editor-content" id="editor">
			<div class="loading">Loading editor...</div>
		</div>
		<div class="statusbar">
			<span id="status-left">Ready</span>
			<span id="status-right"></span>
		</div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate a random nonce for CSP
	 */
	protected getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}

