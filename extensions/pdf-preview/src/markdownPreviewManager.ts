/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownPreview, ShowMarkdownOptions } from './markdownPreview';
import { BasePreviewManager, BaseShowPreviewOptions } from './basePreviewManager';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

/**
 * Extended options for showing Markdown preview (extends base options)
 */
interface ShowMarkdownManagerOptions extends BaseShowPreviewOptions, ShowMarkdownOptions { }

/**
 * Markdown Preview Manager
 * Manages Markdown preview instances and provides the custom editor provider interface
 */
export class MarkdownPreviewManager extends BasePreviewManager<MarkdownPreview, ShowMarkdownManagerOptions> {

	public static readonly viewType = 'markdownPreview.editor';

	constructor(
		extensionUri: vscode.Uri,
		zoomStatusBarEntry: ZoomStatusBarEntry,
	) {
		super(extensionUri, zoomStatusBarEntry);
	}

	/**
	 * Public API for showing Markdown previews programmatically
	 */
	public async showMarkdownPreview(options: ShowMarkdownOptions): Promise<MarkdownPreview> {
		return this.showPreviewBase(
			options,
			() => options.sourceUri?.toString() || options.markdownUri?.toString() || 'temp',
			() => this.getPreviewTitle(options)
		);
	}

	/**
	 * Get Markdown preview by source URI
	 */
	public getMarkdownPreviewBySource(sourceUri: string): MarkdownPreview | undefined {
		return this.getPreviewBySource(sourceUri);
	}

	// Protected overrides

	protected override getViewType(): string {
		return MarkdownPreviewManager.viewType;
	}

	protected override getLocalResourceRoots(options: ShowMarkdownManagerOptions): vscode.Uri[] {
		return [
			vscode.Uri.joinPath(this.extensionUri, 'media'),
			vscode.Uri.joinPath(this.extensionUri, 'vendors'),
			...(options.markdownUri ? [vscode.Uri.joinPath(options.markdownUri, '..')] : [])
		];
	}

	protected override createPreviewForEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): MarkdownPreview {
		return new MarkdownPreview(
			this.extensionUri,
			document.uri,
			webviewPanel,
			this.zoomStatusBarEntry
		);
	}

	protected override createPreviewForProgrammatic(panel: vscode.WebviewPanel, options: ShowMarkdownManagerOptions): MarkdownPreview {
		return new MarkdownPreview(
			this.extensionUri,
			options.markdownUri || options.sourceUri || vscode.Uri.parse('untitled:preview'),
			panel,
			this.zoomStatusBarEntry,
			options
		);
	}

	protected override async updateExistingPreview(preview: MarkdownPreview, options: ShowMarkdownManagerOptions): Promise<void> {
		await preview.updateMarkdown(options);
	}

	// Private methods

	private getPreviewTitle(options: ShowMarkdownOptions): string {
		if (options.sourceUri) {
			return `Markdown Preview: ${this.getFileName(options.sourceUri)}`;
		}
		if (options.markdownUri) {
			return this.getFileName(options.markdownUri);
		}
		return 'Markdown Preview';
	}
}
