/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	compileWithSpans,
	resolveSourceLocationByText,
	isRendererReady,
	SourceLocation,
} from '../wasm';

export class TypstBidirectionalPreview {
	public static currentPanel: TypstBidirectionalPreview | undefined;
	private static readonly viewType = 'typstBidirectionalPreview';

	private readonly _panel: vscode.WebviewPanel;
	private _document: vscode.TextDocument | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _lastCompiledVersion: number = -1;
	private _cursorSyncTimer: ReturnType<typeof setTimeout> | undefined;
	private _syncEnabled: boolean = false;
	private _ignoreSelectionChange: boolean = false;
	private _ignoreSelectionChangeTimer: ReturnType<typeof setTimeout> | undefined;

	public static async createOrShow(
		extensionUri: vscode.Uri,
		document: vscode.TextDocument
	): Promise<TypstBidirectionalPreview> {
		const column = vscode.ViewColumn.Beside;

		if (TypstBidirectionalPreview.currentPanel) {
			TypstBidirectionalPreview.currentPanel._panel.reveal(column);
			TypstBidirectionalPreview.currentPanel.setDocument(document);
			return TypstBidirectionalPreview.currentPanel;
		}

		const panel = vscode.window.createWebviewPanel(
			TypstBidirectionalPreview.viewType,
			'Typst Preview (Sync)',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			}
		);

		const preview = new TypstBidirectionalPreview(panel, document);
		TypstBidirectionalPreview.currentPanel = preview;

		return preview;
	}

	private constructor(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
		this._panel = panel;
		this._document = document;
		this._panel.webview.html = this._getHtmlForWebview();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.onDidChangeViewState(
			() => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				await this._handleMessage(message);
			},
			null,
			this._disposables
		);

		this._disposables.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (this._document && e.document.uri.toString() === this._document.uri.toString()) {
					this._scheduleUpdate();
				}
			})
		);

		this._disposables.push(
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (this._document && doc.uri.toString() === this._document.uri.toString()) {
					this._update();
				}
			})
		);

		this._disposables.push(
			vscode.window.onDidChangeTextEditorSelection((e) => {
				if (this._ignoreSelectionChange) {
					return;
				}
				if (
					this._document &&
					e.textEditor.document.uri.toString() === this._document.uri.toString()
				) {
					this._scheduleCursorSync(e.textEditor);
				}
			})
		);

		this._update();
	}

	public setDocument(document: vscode.TextDocument): void {
		this._document = document;
		this._lastCompiledVersion = -1;
		this._update();
	}

	private _updateTimer: ReturnType<typeof setTimeout> | undefined;

	private _scheduleUpdate(): void {
		if (this._updateTimer) {
			clearTimeout(this._updateTimer);
		}
		this._updateTimer = setTimeout(() => {
			this._update();
		}, 300);
	}

	private _scheduleCursorSync(editor: vscode.TextEditor): void {
		if (this._cursorSyncTimer) {
			clearTimeout(this._cursorSyncTimer);
		}
		this._cursorSyncTimer = setTimeout(() => {
			this._syncCursorToPreview(editor);
		}, 80);
	}

	private _syncCursorToPreview(editor: vscode.TextEditor): void {
		if (!this._syncEnabled) {
			return;
		}

		const position = editor.selection.active;
		const totalLines = editor.document.lineCount;
		const currentLine = position.line;

		const scrollPercent = totalLines > 1 ? currentLine / (totalLines - 1) : 0;

		this._panel.webview.postMessage({
			type: 'scrollToPercent',
			percent: scrollPercent,
		});
	}

	private async _update(): Promise<void> {
		if (!this._document) {
			return;
		}
		if (this._document.version === this._lastCompiledVersion) {
			return;
		}

		this._lastCompiledVersion = this._document.version;
		const source = this._document.getText();

		try {
			const result = await compileWithSpans(source);

			if (result.success && result.svg) {
				this._syncEnabled = isRendererReady();
				this._panel.webview.postMessage({
					type: 'updateSvg',
					svg: result.svg,
					syncReady: this._syncEnabled,
				});
			} else if (result.errors && result.errors.length > 0) {
				const errorHtml = result.errors
					.map(
						(e) =>
							'<div class="error">Line ' +
							(e.range.start.line + 1) +
							': ' +
							e.message.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
							'</div>'
					)
					.join('');
				this._panel.webview.postMessage({ type: 'showError', html: errorHtml });
			}
		} catch (error) {
			this._panel.webview.postMessage({
				type: 'showError',
				html: '<div class="error">Compilation failed: ' + error + '</div>',
			});
		}
	}

	private async _handleMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'jumpToSource':
				await this._jumpToSourceByText(message.text);
				break;
			case 'ready':
				this._update();
				break;
		}
	}

	private async _jumpToSourceByText(textContent: string): Promise<void> {
		if (!textContent || textContent.length < 2) {
			return;
		}

		try {
			const location = await resolveSourceLocationByText(textContent);
			if (location) {
				await this._navigateToLocation(location);
			}
		} catch (_) {
			// Silently ignore errors
		}
	}

	private async _navigateToLocation(location: SourceLocation): Promise<void> {
		try {
			let uri: vscode.Uri;

			if (
				location.filepath === '/main.typ' ||
				location.filepath === 'main.typ' ||
				location.filepath === '' ||
				!location.filepath
			) {
				if (this._document) {
					uri = this._document.uri;
				} else {
					return;
				}
			} else if (location.filepath.startsWith('/') || location.filepath.match(/^[a-zA-Z]:/)) {
				uri = vscode.Uri.file(location.filepath);
			} else if (this._document) {
				const docDir = vscode.Uri.joinPath(this._document.uri, '..');
				uri = vscode.Uri.joinPath(docDir, location.filepath);
			} else {
				return;
			}

			const position = new vscode.Position(
				Math.max(0, location.line - 1),
				Math.max(0, location.column - 1)
			);

			this._ignoreSelectionChange = true;
			if (this._ignoreSelectionChangeTimer) {
				clearTimeout(this._ignoreSelectionChangeTimer);
			}
			this._ignoreSelectionChangeTimer = setTimeout(() => {
				this._ignoreSelectionChange = false;
			}, 500);

			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(
				new vscode.Range(position, position),
				vscode.TextEditorRevealType.InCenter
			);
		} catch (_) {
			// Silently ignore errors
		}
	}

	public dispose(): void {
		TypstBidirectionalPreview.currentPanel = undefined;
		if (this._updateTimer) {
			clearTimeout(this._updateTimer);
		}
		if (this._cursorSyncTimer) {
			clearTimeout(this._cursorSyncTimer);
		}
		if (this._ignoreSelectionChangeTimer) {
			clearTimeout(this._ignoreSelectionChangeTimer);
		}
		this._panel.dispose();
		while (this._disposables.length) {
			const d = this._disposables.pop();
			if (d) {
				d.dispose();
			}
		}
	}

	private _getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
	<title>Typst Preview</title>
	<style>
		:root { --bg: #f5f5f5; --error-bg: #fee; }
		@media (prefers-color-scheme: dark) { :root { --bg: #1e1e1e; --error-bg: #2d1515; } }
		* { box-sizing: border-box; }
		body { margin: 0; padding: 0; background: var(--bg); font-family: system-ui; overflow: hidden; }
		#scroll-container { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: auto; }
		#svg-container { display: flex; flex-direction: column; align-items: center; padding: 20px; min-height: 100%; }
		#svg-container svg { display: block; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.15); border-radius: 4px; margin-bottom: 20px; cursor: pointer; }
		.error { background: var(--error-bg); border: 1px solid #fcc; padding: 12px; border-radius: 4px; margin: 8px 20px; font-family: monospace; color: #c00; }
	</style>
</head>
<body>
	<div id="scroll-container">
		<div id="svg-container"><p style="color: #666;">Loading preview...</p></div>
		<div id="errors"></div>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const scrollEl = document.getElementById('scroll-container');
		const svgEl = document.getElementById('svg-container');
		const errEl = document.getElementById('errors');
		

		vscode.postMessage({ type: 'ready' });

		window.addEventListener('message', e => {
			const msg = e.data;
			
			if (msg.type === 'updateSvg') {
				svgEl.innerHTML = msg.svg;
				errEl.innerHTML = '';
				const svg = svgEl.querySelector('svg');
				if (svg) svg.addEventListener('click', onClick);
				
				
			} else if (msg.type === 'showError') {
				errEl.innerHTML = msg.html;
				
				
			} else if (msg.type === 'scrollToPercent') {
				const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
				if (maxScroll > 0) {
					scrollEl.scrollTo({ top: Math.round(maxScroll * msg.percent), behavior: 'smooth' });
				}
			}
		});

		function onClick(e) {
			e.preventDefault();
			e.stopPropagation();
			
			let textContent = '';
			let el = e.target;
			
			if (el.textContent) textContent = el.textContent.trim();
			
			if (!textContent || textContent.length < 2) {
				let parent = el.parentElement;
				while (parent && (!textContent || textContent.length < 2)) {
					if (parent.textContent) textContent = parent.textContent.trim();
					parent = parent.parentElement;
					if (parent === svgEl) break;
				}
			}
			
			if (textContent && textContent.length > 0) {
				vscode.postMessage({ type: 'jumpToSource', text: textContent.substring(0, 200) });
			}
		}
	</script>
</body>
</html>`;
	}
}

export function registerBidirectionalPreview(
	context: vscode.ExtensionContext,
	_logger?: vscode.OutputChannel
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand('typst.previewBidirectional', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'typst') {
				vscode.window.showWarningMessage('No Typst document is currently active');
				return;
			}
			await TypstBidirectionalPreview.createOrShow(context.extensionUri, editor.document);
		}),
	];
}
