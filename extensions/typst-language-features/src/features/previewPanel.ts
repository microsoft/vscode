/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	compileWithSpans,
	resolveSourceLocation,
	findDocumentPositions,
	isRendererReady,
	SourceLocation,
} from '../wasm';

/**
 * Manages the Typst preview panel with bidirectional sync support.
 * Uses SVG rendering with debug info for precise source-to-preview navigation.
 */
export class TypstPreviewPanel {
	public static currentPanel: TypstPreviewPanel | undefined;
	private static readonly viewType = 'typstPreview';

	private readonly _panel: vscode.WebviewPanel;
	private _document: vscode.TextDocument | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _lastCompiledVersion: number = -1;

	public static createOrShow(
		extensionUri: vscode.Uri,
		document: vscode.TextDocument,
		logger?: vscode.OutputChannel
	): TypstPreviewPanel {
		const column = vscode.ViewColumn.Beside;

		// If we already have a panel, show it
		if (TypstPreviewPanel.currentPanel) {
			TypstPreviewPanel.currentPanel._panel.reveal(column);
			TypstPreviewPanel.currentPanel.setDocument(document);
			return TypstPreviewPanel.currentPanel;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			TypstPreviewPanel.viewType,
			'Typst Preview',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			}
		);

		TypstPreviewPanel.currentPanel = new TypstPreviewPanel(panel, extensionUri, document, logger);
		return TypstPreviewPanel.currentPanel;
	}

	private constructor(
		panel: vscode.WebviewPanel,
		_extensionUri: vscode.Uri,
		document: vscode.TextDocument,
		private readonly _logger?: vscode.OutputChannel
	) {
		this._panel = panel;
		this._document = document;

		// Set the webview's initial html content
		this._panel.webview.html = this.getHtmlForWebview();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content when the view changes
		this._panel.onDidChangeViewState(
			() => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				await this._handleMessage(message);
			},
			null,
			this._disposables
		);

		// Listen for document changes
		this._disposables.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (this._document && e.document.uri.toString() === this._document.uri.toString()) {
					this._scheduleUpdate();
				}
			})
		);

		// Listen for save events for immediate refresh
		this._disposables.push(
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (this._document && doc.uri.toString() === this._document.uri.toString()) {
					this._update();
				}
			})
		);

		// Listen for cursor position changes for source-to-preview sync
		this._disposables.push(
			vscode.window.onDidChangeTextEditorSelection(async (e) => {
				if (
					this._document &&
					e.textEditor.document.uri.toString() === this._document.uri.toString()
				) {
					await this._syncCursorToPreview(e.textEditor.selection.active);
				}
			})
		);

		this._log('Preview panel created');
	}

	private _log(message: string): void {
		if (this._logger) {
			this._logger.appendLine('[Preview] ' + message);
		}
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
		// Debounce updates to 300ms
		this._updateTimer = setTimeout(() => {
			this._update();
		}, 300);
	}

	private async _update(): Promise<void> {
		if (!this._document) {
			return;
		}

		// Skip if document hasn't changed
		if (this._document.version === this._lastCompiledVersion) {
			return;
		}

		this._lastCompiledVersion = this._document.version;
		const source = this._document.getText();

		this._log('Compiling document (version ' + this._document.version + ')...');

		try {
			// Compile with span info for bidirectional sync
			const result = await compileWithSpans(source);

			if (result.success && result.svg) {
				this._log('Compilation successful, updating preview');
				this._panel.webview.postMessage({
					type: 'updateSvg',
					svg: result.svg,
				});
			} else if (result.errors && result.errors.length > 0) {
				const errorHtml = this._formatErrors(result.errors);
				this._panel.webview.postMessage({
					type: 'showError',
					html: errorHtml,
				});
				this._log('Compilation failed: ' + result.errors[0].message);
			}
		} catch (error) {
			this._log('Compilation error: ' + error);
			this._panel.webview.postMessage({
				type: 'showError',
				html: '<div class="error">Compilation failed: ' + error + '</div>',
			});
		}
	}

	private _formatErrors(
		errors: Array<{ message: string; range: { start: { line: number } } }>
	): string {
		return errors
			.map(
				(e) =>
					'<div class="error">Line ' +
					(e.range.start.line + 1) +
					': ' +
					this._escapeHtml(e.message) +
					'</div>'
			)
			.join('');
	}

	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	private async _handleMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'jumpToSource':
				await this._jumpToSource(message.path);
				break;
			case 'log':
				this._log('[Webview] ' + message.message);
				break;
			case 'ready':
				this._log('Webview ready, triggering initial update');
				this._update();
				break;
		}
	}

	/**
	 * Handle click-to-source navigation (preview -> source)
	 */
	private async _jumpToSource(elementPath: number[]): Promise<void> {
		this._log('Jump to source requested for path: [' + elementPath.join(', ') + ']');

		try {
			const location = await resolveSourceLocation(elementPath);

			if (location) {
				await this._navigateToLocation(location);
			} else {
				this._log('Could not resolve source location for element path');
			}
		} catch (error) {
			this._log('Error resolving source location: ' + error);
		}
	}

	private async _navigateToLocation(location: SourceLocation): Promise<void> {
		this._log('Navigating to ' + location.filepath + ':' + location.line + ':' + location.column);

		try {
			// Determine the file URI
			let uri: vscode.Uri;

			if (location.filepath.startsWith('/') || location.filepath.match(/^[a-zA-Z]:/)) {
				// Absolute path
				uri = vscode.Uri.file(location.filepath);
			} else if (this._document) {
				// Relative path - resolve from document directory
				const docDir = vscode.Uri.joinPath(this._document.uri, '..');
				uri = vscode.Uri.joinPath(docDir, location.filepath);
			} else {
				this._log('Cannot resolve relative path without document context');
				return;
			}

			// Convert to 0-based positions
			const position = new vscode.Position(
				Math.max(0, location.line - 1),
				Math.max(0, location.column - 1)
			);

			// Open and navigate to the document
			const document = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

			// Set cursor and reveal
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(
				new vscode.Range(position, position),
				vscode.TextEditorRevealType.InCenter
			);

			this._log('Navigated to line ' + location.line + ', column ' + location.column);
		} catch (error) {
			this._log('Failed to navigate: ' + error);
		}
	}

	/**
	 * Sync cursor position to preview (source -> preview)
	 */
	private async _syncCursorToPreview(position: vscode.Position): Promise<void> {
		if (!this._document || !isRendererReady()) {
			return;
		}

		try {
			const positions = await findDocumentPositions(
				this._document.getText(),
				position.line,
				position.character
			);

			if (positions.length > 0) {
				const pos = positions[0];
				this._panel.webview.postMessage({
					type: 'scrollTo',
					page: pos.page,
					x: pos.x,
					y: pos.y,
				});
				this._log('Scrolling preview to page ' + pos.page + ' at (' + pos.x + ', ' + pos.y + ')');
			}
		} catch (error) {
			// Silently ignore - source-to-preview sync is best-effort
		}
	}

	public dispose(): void {
		TypstPreviewPanel.currentPanel = undefined;

		if (this._updateTimer) {
			clearTimeout(this._updateTimer);
		}

		this._panel.dispose();

		while (this._disposables.length) {
			const d = this._disposables.pop();
			if (d) {
				d.dispose();
			}
		}

		this._log('Preview panel disposed');
	}

	/**
	 * Get the HTML content for the webview
	 */
	public getHtmlForWebview(): string {
		// Using template literal to avoid quote escaping issues
		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
	<title>Typst Preview</title>
	<style>
		:root {
			--background: #ffffff;
			--text: #000000;
			--error-bg: #fee;
			--error-border: #fcc;
			--error-text: #c00;
		}
		@media (prefers-color-scheme: dark) {
			:root {
				--background: #1e1e1e;
				--text: #d4d4d4;
				--error-bg: #2d1515;
				--error-border: #4a2020;
				--error-text: #ff6b6b;
			}
		}
		body {
			margin: 0;
			padding: 20px;
			background: var(--background);
			color: var(--text);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		}
		#preview-container {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 20px;
		}
		#svg-container {
			background: white;
			box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
			border-radius: 4px;
			overflow: auto;
			max-width: 100%;
		}
		#svg-container svg {
			display: block;
		}
		#svg-container [data-tid]:hover,
		#svg-container .typst-group:hover,
		#svg-container .typst-text:hover {
			cursor: pointer;
			outline: 2px solid rgba(0, 120, 215, 0.5);
			outline-offset: 2px;
		}
		#error-container {
			width: 100%;
			max-width: 800px;
		}
		.error {
			background: var(--error-bg);
			border: 1px solid var(--error-border);
			color: var(--error-text);
			padding: 12px 16px;
			border-radius: 4px;
			margin-bottom: 8px;
			font-family: monospace;
			font-size: 13px;
		}
		.loading {
			color: var(--text);
			opacity: 0.6;
			font-style: italic;
		}
	</style>
</head>
<body>
	<div id="preview-container">
		<div id="svg-container">
			<p class="loading">Loading preview...</p>
		</div>
		<div id="error-container"></div>
	</div>
	<script>
		(function() {
			const vscode = acquireVsCodeApi();
			const svgContainer = document.getElementById('svg-container');
			const errorContainer = document.getElementById('error-container');
			vscode.postMessage({ type: 'ready' });
			window.addEventListener('message', event => {
				const message = event.data;
				switch (message.type) {
					case 'updateSvg':
						updateSvg(message.svg);
						break;
					case 'showError':
						showError(message.html);
						break;
					case 'scrollTo':
						scrollToPosition(message.page, message.x, message.y);
						break;
				}
			});
			function updateSvg(svgContent) {
				svgContainer.innerHTML = svgContent;
				errorContainer.innerHTML = '';
				const svg = svgContainer.querySelector('svg');
				if (svg) {
					svg.addEventListener('click', handleSvgClick);
				}
			}
			function showError(html) {
				errorContainer.innerHTML = html;
			}
			function handleSvgClick(event) {
				event.preventDefault();
				const path = buildElementPath(event.target);
				if (path.length > 0) {
					vscode.postMessage({
						type: 'jumpToSource',
						path: path
					});
				}
			}
			function buildElementPath(element) {
				const path = [];
				let current = element;
				const svg = svgContainer.querySelector('svg');
				while (current && current !== svg && current !== document.body) {
					const tid = current.getAttribute('data-tid');
					if (tid) {
						const id = parseInt(tid, 16) || parseInt(tid, 10);
						if (!isNaN(id)) {
							path.unshift(id);
						}
					} else {
						const parent = current.parentElement;
						if (parent) {
							const siblings = Array.from(parent.children);
							const index = siblings.indexOf(current);
							if (index >= 0) {
								path.unshift(index);
							}
						}
					}
					current = current.parentElement;
				}
				return path;
			}
			function scrollToPosition(page, x, y) {
				const svg = svgContainer.querySelector('svg');
				if (!svg) { return; }
				const svgRect = svg.getBoundingClientRect();
				const viewBox = svg.viewBox.baseVal;
				if (viewBox.width > 0 && viewBox.height > 0) {
					const scaleX = svgRect.width / viewBox.width;
					const scaleY = svgRect.height / viewBox.height;
					const scrollX = x * scaleX;
					const scrollY = y * scaleY;
					svgContainer.scrollTo({
						left: Math.max(0, scrollX - svgContainer.clientWidth / 2),
						top: Math.max(0, scrollY - svgContainer.clientHeight / 2),
						behavior: 'smooth'
					});
				}
			}
		})();
	</script>
</body>
</html>`;
	}
}

/**
 * Register the preview panel command and related functionality
 */
export function registerPreviewPanel(
	context: vscode.ExtensionContext,
	logger?: vscode.OutputChannel
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Register the preview command
	disposables.push(
		vscode.commands.registerCommand('typst.previewSync', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'typst') {
				vscode.window.showWarningMessage('No Typst document is currently active');
				return;
			}

			TypstPreviewPanel.createOrShow(context.extensionUri, editor.document, logger);
		})
	);

	return disposables;
}
