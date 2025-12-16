/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';
import { BinarySizeStatusBarEntry } from './statusBar/binarySizeStatusBarEntry';
import { PageStatusBarEntry } from './statusBar/pageStatusBarEntry';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

export interface ShowPdfOptions {
	pdfData?: Uint8Array;
	pdfUri?: vscode.Uri;
	sourceUri?: vscode.Uri;
	viewColumn?: vscode.ViewColumn;
	syncPosition?: { page: number; x?: number; y?: number };
	onSyncClick?: string;
	/** If true, don't steal focus when updating an existing preview (useful for auto-refresh on save) */
	preserveFocus?: boolean;
}

export class PdfPreviewManager implements vscode.CustomReadonlyEditorProvider {

	public static readonly viewType = 'pdfPreview.editor';

	private readonly _previews = new Set<PdfPreview>();
	private _activePreview: PdfPreview | undefined;

	// Map to track programmatic previews (from LaTeX/Typst)
	private readonly _programmaticPreviews = new Map<string, PdfPreview>();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
		private readonly pageStatusBarEntry: PageStatusBarEntry,
		private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
	) { }

	public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => { } };
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
	): Promise<void> {
		const preview = new PdfPreview(
			this.extensionUri,
			document.uri,
			webviewPanel,
			this.binarySizeStatusBarEntry,
			this.pageStatusBarEntry,
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

	public get activePreview(): PdfPreview | undefined {
		return this._activePreview;
	}

	private setActivePreview(value: PdfPreview | undefined): void {
		this._activePreview = value;
	}

	/**
	 * Public API for showing PDF previews programmatically (used by LaTeX/Typst)
	 */
	public async showPdfPreview(options: ShowPdfOptions): Promise<PdfPreview> {
		const key = options.sourceUri?.toString() || options.pdfUri?.toString() || 'temp';

		// Check if we already have a preview for this source
		const existingPreview = this._programmaticPreviews.get(key);
		if (existingPreview && !existingPreview.isDisposed) {
			// Update existing preview
			await existingPreview.updatePdf(options);
			// Only reveal (steal focus) if preserveFocus is not set
			if (!options.preserveFocus) {
				existingPreview.reveal();
			}
			return existingPreview;
		}

		// Create new webview panel
		// Use "LaTeX Preview:" prefix when source is from LaTeX extension
		const isLatexSource = options.sourceUri?.path.endsWith('.tex') || options.onSyncClick?.startsWith('latex.');
		const title = options.sourceUri
			? `${isLatexSource ? 'LaTeX ' : ''}Preview: ${this.getFileName(options.sourceUri)}`
			: options.pdfUri
				? this.getFileName(options.pdfUri)
				: 'PDF Preview';

		const panel = vscode.window.createWebviewPanel(
			'pdfPreview.programmatic',
			title,
			options.viewColumn || vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.extensionUri, 'media'),
					vscode.Uri.joinPath(this.extensionUri, 'vendors'),
					...(options.pdfUri ? [vscode.Uri.joinPath(options.pdfUri, '..')] : [])
				]
			}
		);

		const preview = new PdfPreview(
			this.extensionUri,
			options.pdfUri || options.sourceUri || vscode.Uri.parse('untitled:preview'),
			panel,
			this.binarySizeStatusBarEntry,
			this.pageStatusBarEntry,
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
			// Note: We don't clear activePreview when panel loses focus
			// because we still want to sync to it from the editor
		});

		return preview;
	}

	/**
	 * Get PDF preview by source URI (for programmatic previews)
	 */
	public getPdfPreviewBySource(sourceUri: string): PdfPreview | undefined {
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
