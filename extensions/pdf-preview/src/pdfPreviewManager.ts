/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';
import { BasePreviewManager, BaseShowPreviewOptions } from './basePreviewManager';
import { BinarySizeStatusBarEntry } from './statusBar/binarySizeStatusBarEntry';
import { PageStatusBarEntry } from './statusBar/pageStatusBarEntry';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

/**
 * Options for showing a PDF preview programmatically
 */
export interface ShowPdfOptions extends BaseShowPreviewOptions {
	/** PDF binary data */
	pdfData?: Uint8Array;
	/** URI to the PDF file */
	pdfUri?: vscode.Uri;
	/** Position to sync to after loading */
	syncPosition?: { page: number; x?: number; y?: number };
	/** Command to call when user clicks in PDF for source navigation (click sync mode) */
	onSyncClick?: string;
	/** Command to call when user scrolls in PDF for source navigation (scroll sync mode) */
	onSyncScroll?: string;
}

/**
 * PDF Preview Manager
 * Manages PDF preview instances and provides the custom editor provider interface
 */
export class PdfPreviewManager extends BasePreviewManager<PdfPreview, ShowPdfOptions> {

	public static readonly viewType = 'pdfPreview.editor';

	constructor(
		extensionUri: vscode.Uri,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
		private readonly pageStatusBarEntry: PageStatusBarEntry,
		zoomStatusBarEntry: ZoomStatusBarEntry,
	) {
		super(extensionUri, zoomStatusBarEntry);
	}

	/**
	 * Public API for showing PDF previews programmatically (used by LaTeX/Typst)
	 */
	public async showPdfPreview(options: ShowPdfOptions): Promise<PdfPreview> {
		return this.showPreviewBase(
			options,
			() => options.sourceUri?.toString() || options.pdfUri?.toString() || 'temp',
			() => this.getPreviewTitle(options)
		);
	}

	/**
	 * Get PDF preview by source URI (for programmatic previews)
	 */
	public getPdfPreviewBySource(sourceUri: string): PdfPreview | undefined {
		return this.getPreviewBySource(sourceUri);
	}

	// Protected overrides

	protected override getViewType(): string {
		return PdfPreviewManager.viewType;
	}

	protected override getLocalResourceRoots(options: ShowPdfOptions): vscode.Uri[] {
		return [
			vscode.Uri.joinPath(this.extensionUri, 'media'),
			vscode.Uri.joinPath(this.extensionUri, 'vendors'),
			...(options.pdfUri ? [vscode.Uri.joinPath(options.pdfUri, '..')] : [])
		];
	}

	protected override createPreviewForEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): PdfPreview {
		return new PdfPreview(
			this.extensionUri,
			document.uri,
			webviewPanel,
			this.binarySizeStatusBarEntry,
			this.pageStatusBarEntry,
			this.zoomStatusBarEntry
		);
	}

	protected override createPreviewForProgrammatic(panel: vscode.WebviewPanel, options: ShowPdfOptions): PdfPreview {
		return new PdfPreview(
			this.extensionUri,
			options.pdfUri || options.sourceUri || vscode.Uri.parse('untitled:preview'),
			panel,
			this.binarySizeStatusBarEntry,
			this.pageStatusBarEntry,
			this.zoomStatusBarEntry,
			options
		);
	}

	protected override async updateExistingPreview(preview: PdfPreview, options: ShowPdfOptions): Promise<void> {
		await preview.updatePdf(options);
	}

	// Private methods

	private getPreviewTitle(options: ShowPdfOptions): string {
		const isLatexSource = options.sourceUri?.path.endsWith('.tex') || options.onSyncClick?.startsWith('latex.');
		if (options.sourceUri) {
			return `${isLatexSource ? 'LaTeX ' : ''}Preview: ${this.getFileName(options.sourceUri)}`;
		}
		if (options.pdfUri) {
			return this.getFileName(options.pdfUri);
		}
		return 'PDF Preview';
	}
}
