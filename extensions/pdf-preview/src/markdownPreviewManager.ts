/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownPreview, ShowMarkdownOptions } from './markdownPreview';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

export class MarkdownPreviewManager implements vscode.CustomReadonlyEditorProvider {

	public static readonly viewType = 'markdownPreview.editor';

	private readonly _previews = new Set<MarkdownPreview>();
	private _activePreview: MarkdownPreview | undefined;

	// Map to track programmatic previews
	private readonly _programmaticPreviews = new Map<string, MarkdownPreview>();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
	) { }

	public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => { } };
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
	): Promise<void> {
		const preview = new MarkdownPreview(
			this.extensionUri,
			document.uri,
			webviewPanel,
			this.zoomStatusBarEntry
		);

		this._previews.add(preview);
		this.setActivePreview(preview);

		webviewPanel.onDidDispose(() => {
			this._previews.delete(preview);
			if (this._activePreview === preview) {
				this.setActivePreview(undefined);
			}
		});

		webviewPanel.onDidChangeViewState(() => {
			if (webviewPanel.active) {
				this.setActivePreview(preview);
			} else if (this._activePreview === preview && !webviewPanel.active) {
				this.setActivePreview(undefined);
			}
		});
	}

	public get activePreview(): MarkdownPreview | undefined {
		return this._activePreview;
	}

	private setActivePreview(value: MarkdownPreview | undefined): void {
		this._activePreview = value;
	}

	/**
	 * Public API for showing Markdown previews programmatically
	 */
	public async showMarkdownPreview(options: ShowMarkdownOptions): Promise<MarkdownPreview> {
		const key = options.sourceUri?.toString() || options.markdownUri?.toString() || 'temp';

		// Check if we already have a preview for this source
		const existingPreview = this._programmaticPreviews.get(key);
		if (existingPreview && !existingPreview.isDisposed) {
			await existingPreview.updateMarkdown(options);
			if (!options.preserveFocus) {
				existingPreview.reveal();
			}
			return existingPreview;
		}

		// Create new webview panel
		const title = options.sourceUri
			? `Markdown Preview: ${this.getFileName(options.sourceUri)}`
			: options.markdownUri
				? this.getFileName(options.markdownUri)
				: 'Markdown Preview';

		const panel = vscode.window.createWebviewPanel(
			'markdownPreview.programmatic',
			title,
			options.viewColumn || vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.extensionUri, 'media'),
					...(options.markdownUri ? [vscode.Uri.joinPath(options.markdownUri, '..')] : [])
				]
			}
		);

		const preview = new MarkdownPreview(
			this.extensionUri,
			options.markdownUri || options.sourceUri || vscode.Uri.parse('untitled:preview'),
			panel,
			this.zoomStatusBarEntry,
			options
		);

		this._previews.add(preview);
		this._programmaticPreviews.set(key, preview);
		this.setActivePreview(preview);

		panel.onDidDispose(() => {
			this._previews.delete(preview);
			this._programmaticPreviews.delete(key);
			if (this._activePreview === preview) {
				this.setActivePreview(undefined);
			}
		});

		panel.onDidChangeViewState(() => {
			if (panel.active) {
				this.setActivePreview(preview);
			}
		});

		return preview;
	}

	/**
	 * Get Markdown preview by source URI
	 */
	public getMarkdownPreviewBySource(sourceUri: string): MarkdownPreview | undefined {
		const preview = this._programmaticPreviews.get(sourceUri);
		if (preview && !preview.isDisposed) {
			return preview;
		}
		return undefined;
	}

	private getFileName(uri: vscode.Uri): string {
		const path = uri.path;
		const lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
	}
}

