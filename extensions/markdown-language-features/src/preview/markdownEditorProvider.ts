/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';

/**
 * Experimental hybrid (WYSIWYG) Markdown editor backed by the
 * `@vscode/markdown-editor` component. The {@link vscode.TextDocument} remains
 * the single source of truth, so native undo/redo, dirty state and hot-exit are
 * preserved.
 */
export class MarkdownEditorProvider extends Disposable implements vscode.CustomTextEditorProvider {

	public static readonly viewType = 'vscode.markdown.editor';

	readonly #mediaRoot: vscode.Uri;
	readonly #extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri) {
		super();
		this.#extensionUri = extensionUri;
		this.#mediaRoot = vscode.Uri.joinPath(this.#extensionUri, 'markdown-editor-out');
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const webview = webviewPanel.webview;
		webview.options = { enableScripts: true, localResourceRoots: [this.#mediaRoot] };
		webview.html = this.#getHtml(webview);
		this.#wireSingle(document, webviewPanel);
	}

	#wireSingle(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
		const webview = webviewPanel.webview;
		let isUpdatingFromWebview = false;

		const onMessage = webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'ready': {
					webview.postMessage({ type: 'init', content: document.getText(), readonly: false });
					break;
				}
				case 'edit': {
					const content = message.content as string;
					if (content === document.getText()) {
						return;
					}
					isUpdatingFromWebview = true;
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						document.uri,
						new vscode.Range(0, 0, document.lineCount, 0),
						content,
					);
					try {
						await vscode.workspace.applyEdit(edit);
					} finally {
						isUpdatingFromWebview = false;
					}
					break;
				}
			}
		});

		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() !== document.uri.toString() || isUpdatingFromWebview) {
				return;
			}
			webview.postMessage({ type: 'update', content: document.getText() });
		});

		const highlight = this.#wireHighlight(webview);

		webviewPanel.onDidDispose(() => {
			onMessage.dispose();
			onDocumentChange.dispose();
			highlight.dispose();
		});
	}

	/**
	 * Proxies the webview's syntax highlighting requests to the
	 * `documentSyntaxHighlighting` proposed API, since the webview cannot call
	 * it directly. Also forwards theme changes so the webview can re-highlight.
	 */
	#wireHighlight(webview: vscode.Webview): vscode.Disposable {
		const onMessage = webview.onDidReceiveMessage(async (message) => {
			if (message.type !== 'highlight') {
				return;
			}
			const result = await vscode.languages.computeFullSyntaxHighlighting(message.source, message.languageId);
			webview.postMessage({
				type: 'highlightResult',
				requestId: message.requestId,
				tokens: result.tokens,
				colorMap: result.colorMap,
			});
		});

		const onThemeChange = vscode.languages.onDidChangeSyntaxHighlighting(() => {
			webview.postMessage({ type: 'highlightThemeChanged' });
		});

		return vscode.Disposable.from(onMessage, onThemeChange);
	}

	#getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.css'));
		const nonce = getNonce();

		const body = /* html */ `
	<div id="editor"></div>`;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Markdown Editor</title>
</head>
<body>${body}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
