/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BasePreview, BaseWebviewMessage, PreviewState } from './basePreview';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';
import { getMarkdownViewerHtml } from './markdownViewerHtml';

/**
 * Options for showing a Markdown preview programmatically
 */
export interface ShowMarkdownOptions {
	markdownContent?: string;
	markdownUri?: vscode.Uri;
	sourceUri?: vscode.Uri;
	viewColumn?: vscode.ViewColumn;
	enableSyncClick?: boolean;
	onSyncClick?: string;
	preserveFocus?: boolean;
}

/**
 * Markdown-specific webview message interface
 */
interface MarkdownWebviewMessage extends BaseWebviewMessage {
	html?: string;
	text?: string;
	content?: string;
}

/**
 * Markdown Preview implementation
 * Extends BasePreview with Markdown-specific functionality
 */
export class MarkdownPreview extends BasePreview {

	private _markdownContent: string | undefined;
	private _onSyncClick: string | undefined;
	private _sourceUri: vscode.Uri | undefined;

	// Event emitter for click sync (preview → editor)
	private readonly _onDidClickPreview = this._register(new vscode.EventEmitter<{ percent: number; text: string }>());
	public readonly onDidClickPreview = this._onDidClickPreview.event;

	constructor(
		extensionUri: vscode.Uri,
		resource: vscode.Uri,
		webviewPanel: vscode.WebviewPanel,
		zoomStatusBarEntry: ZoomStatusBarEntry,
		options?: ShowMarkdownOptions
	) {
		super(extensionUri, resource, webviewPanel, zoomStatusBarEntry);

		// Set default sync mode for markdown
		this._syncMode = 'scroll';

		this._markdownContent = options?.markdownContent;
		this._onSyncClick = options?.onSyncClick;
		this._sourceUri = options?.sourceUri;

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(extensionUri, 'media'),
				vscode.Uri.joinPath(extensionUri, 'vendors'),
				vscode.Uri.joinPath(resource, '..')
			]
		};

		// Watch for file changes if we're loading from a file
		if (!options?.markdownContent) {
			const watcher = this._register(vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(resource, '*')
			));
			this._register(watcher.onDidChange((e: vscode.Uri) => {
				if (e.toString() === this.resource.toString()) {
					this.reloadFromFilesystem();
				}
			}));
		}

		this.initializeRender();
		this.updateState();
	}

	public get isSyncEnabled(): boolean {
		return this._syncMode !== 'off';
	}

	public get sourceUri(): vscode.Uri | undefined {
		return this._sourceUri;
	}

	/**
	 * Update the markdown content
	 */
	public async updateMarkdown(options: ShowMarkdownOptions): Promise<void> {
		this._markdownContent = options.markdownContent;
		this._onSyncClick = options.onSyncClick;

		if (this._markdownContent && this._previewState !== PreviewState.Disposed) {
			this.webviewPanel.webview.postMessage({
				type: 'updateContent',
				content: this._markdownContent
			});
		} else {
			await this.render();
		}
	}

	/**
	 * Export to PDF
	 */
	public exportPdf(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'exportPdf' });
		}
	}

	/**
	 * Scroll to a specific line
	 */
	public scrollToLine(line: number, source?: 'click' | 'scroll'): void {
		if (this._previewState !== PreviewState.Disposed) {
			this.webviewPanel.webview.postMessage({ type: 'scrollToLine', line, source });
		}
	}

	// Protected overrides

	protected override handleSpecificMessage(message: MarkdownWebviewMessage): void {
		switch (message.type) {
			case 'syncClick':
				// Emit click event for click-based sync (preview → editor)
				if (this._syncMode === 'click') {
					this._onDidClickPreview.fire({
						percent: message.percent ?? 0,
						text: message.text ?? ''
					});
				}
				break;
			case 'exportPdf':
				this.handleExportPdf(message.html);
				break;
			case 'ready':
				// Markdown rendered successfully
				break;
		}
	}

	protected override getErrorMessage(error?: string): string {
		return vscode.l10n.t('Failed to render Markdown: {0}', error ?? 'Unknown error');
	}

	protected async render(): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		const html = getMarkdownViewerHtml(
			this.webviewPanel.webview,
			this.extensionUri,
			this.resource,
			{
				content: this._markdownContent || '',
				enableSyncClick: !!this._onSyncClick
			}
		);

		this.webviewPanel.webview.html = html;
	}

	protected async initializeRender(): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		// If we don't have content, load from filesystem
		if (!this._markdownContent) {
			try {
				const data = await vscode.workspace.fs.readFile(this.resource);
				this._markdownContent = new TextDecoder().decode(data);
			} catch (error) {
				console.error('Failed to read Markdown file:', error);
			}
		}

		await this.render();
	}

	// Private methods

	private async reloadFromFilesystem(): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		try {
			const data = await vscode.workspace.fs.readFile(this.resource);
			this._markdownContent = new TextDecoder().decode(data);
			this.webviewPanel.webview.postMessage({
				type: 'updateContent',
				content: this._markdownContent
			});
		} catch (error) {
			console.error('Failed to reload Markdown file:', error);
			await this.render();
		}
	}

	private async handleExportPdf(htmlContent?: string): Promise<void> {
		if (!htmlContent) {
			vscode.window.showErrorMessage('No content to export');
			return;
		}

		// Create a complete HTML document for printing
		const fullHtml = `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>Markdown Export</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
			font-size: 16px;
			line-height: 1.6;
			color: #24292e;
			max-width: 900px;
			margin: 0 auto;
			padding: 40px 20px;
		}
		h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
		h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
		h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
		code { background-color: rgba(27, 31, 35, 0.05); padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
		pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
		pre code { background: transparent; padding: 0; }
		blockquote { margin: 0; padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; }
		table { border-collapse: collapse; width: 100%; }
		table th, table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
		table th { background-color: #f6f8fa; font-weight: 600; }
		img { max-width: 100%; }
		@media print {
			body { margin: 0; padding: 20px; }
		}
	</style>
</head>
<body>
	${htmlContent}
	<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

		// Ask user where to save the HTML file
		const defaultName = this._sourceUri
			? this._sourceUri.path.replace(/\.md$/i, '.html').split('/').pop()
			: 'markdown-export.html';

		const saveUri = await vscode.window.showSaveDialog({
			defaultUri: this._sourceUri
				? vscode.Uri.joinPath(vscode.Uri.joinPath(this._sourceUri, '..'), defaultName || 'export.html')
				: undefined,
			filters: {
				'HTML Files': ['html'],
				'All Files': ['*']
			},
			saveLabel: 'Export'
		});

		if (saveUri) {
			try {
				const encoder = new TextEncoder();
				await vscode.workspace.fs.writeFile(saveUri, encoder.encode(fullHtml));

				const openInBrowser = await vscode.window.showInformationMessage(
					'HTML exported successfully. Open in browser to print as PDF?',
					'Open in Browser',
					'Close'
				);

				if (openInBrowser === 'Open in Browser') {
					await vscode.env.openExternal(saveUri);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to export: ${error}`);
			}
		}
	}
}

// Re-export PreviewState for backwards compatibility
export { PreviewState };
