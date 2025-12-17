/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BasePreview, BaseWebviewMessage, PreviewState } from './basePreview';
import { BinarySizeStatusBarEntry } from './statusBar/binarySizeStatusBarEntry';
import { PageStatusBarEntry } from './statusBar/pageStatusBarEntry';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';
import { getPdfViewerHtml } from './pdfViewerHtml';
import { ShowPdfOptions } from './pdfPreviewManager';

/**
 * PDF-specific webview message interface
 */
interface PdfWebviewMessage extends BaseWebviewMessage {
	page?: number;
	totalPages?: number;
	x?: number;
	y?: number;
	text?: string;
}

/**
 * PDF Preview implementation
 * Extends BasePreview with PDF-specific functionality like page navigation, rotation, and SyncTeX support
 */
export class PdfPreview extends BasePreview {

	private _currentPage = 1;
	private _totalPages = 1;
	private _rotation = 0;
	private _binarySize: number | undefined;
	private _pdfData: Uint8Array | undefined;
	private _onSyncClick: string | undefined;
	private _onSyncScroll: string | undefined;

	constructor(
		extensionUri: vscode.Uri,
		resource: vscode.Uri,
		webviewPanel: vscode.WebviewPanel,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
		private readonly pageStatusBarEntry: PageStatusBarEntry,
		zoomStatusBarEntry: ZoomStatusBarEntry,
		options?: ShowPdfOptions
	) {
		super(extensionUri, resource, webviewPanel, zoomStatusBarEntry);

		// Set default scale for PDF
		this._currentScale = 'fitWidth';

		this._pdfData = options?.pdfData;
		this._onSyncClick = options?.onSyncClick;
		this._onSyncScroll = options?.onSyncScroll;

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(extensionUri, 'media'),
				vscode.Uri.joinPath(extensionUri, 'vendors'),
				vscode.Uri.joinPath(resource, '..')
			]
		};

		// Watch for file changes
		if (!options?.pdfData) {
			const watcher = this._register(vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(resource, '*')
			));
			this._register(watcher.onDidChange((e: vscode.Uri) => {
				if (e.toString() === this.resource.toString()) {
					this.updateBinarySize();
					this.reloadFromFilesystem();
				}
			}));
		}

		this.updateBinarySize();
		this.initializeRender(options?.syncPosition);
		this.updateState();
	}

	public override dispose(): void {
		super.dispose();
		this.binarySizeStatusBarEntry.hide(this);
		this.pageStatusBarEntry.hide(this);
	}

	/**
	 * Update the PDF with new data
	 */
	public async updatePdf(options: ShowPdfOptions): Promise<void> {
		this._pdfData = options.pdfData;
		this._onSyncClick = options.onSyncClick;
		this._onSyncScroll = options.onSyncScroll;

		if (this._pdfData && this._previewState !== PreviewState.Disposed) {
			const base64 = this.uint8ArrayToBase64(this._pdfData);
			this.webviewPanel.webview.postMessage({
				type: 'updatePdf',
				pdfData: base64
			});
			this.updateBinarySize();
		} else {
			await this.render(options.syncPosition);
		}
	}

	// PDF-specific public methods

	public fitWidth(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'fitWidth' });
		}
	}

	public fitPage(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'fitPage' });
		}
	}

	public goToPage(page: number): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'goToPage', page });
		}
	}

	public rotate(degrees: number): void {
		if (this._previewState === PreviewState.Active) {
			this._rotation = (this._rotation + degrees + 360) % 360;
			this.webviewPanel.webview.postMessage({ type: 'rotate', rotation: this._rotation });
		}
	}

	public download(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'download' });
		}
	}

	public scrollToText(text: string, source?: 'click' | 'scroll'): void {
		if (this._previewState !== PreviewState.Disposed) {
			this.webviewPanel.webview.postMessage({ type: 'scrollToText', text, source });
		}
	}

	// Protected overrides

	protected override handleSpecificMessage(message: PdfWebviewMessage): void {
		switch (message.type) {
			case 'pageChanged':
				this._currentPage = message.page ?? 1;
				this._totalPages = message.totalPages ?? 1;
				this.updateState();
				break;
			case 'syncClick':
				if (this._onSyncClick) {
					vscode.commands.executeCommand(this._onSyncClick, {
						page: message.page,
						x: message.x,
						y: message.y,
						text: message.text
					});
				}
				break;
			case 'scrollChanged':
				// Parent class handles scroll sync, but we also support the onSyncScroll callback
				if (message.percent !== undefined && this._syncMode === 'scroll' && this._onSyncScroll) {
					vscode.commands.executeCommand(this._onSyncScroll, {
						percent: message.percent
					});
				}
				break;
		}
	}

	protected override getErrorMessage(error?: string): string {
		return vscode.l10n.t('Failed to load PDF: {0}', error ?? 'Unknown error');
	}

	protected override onBecameActive(): void {
		this.binarySizeStatusBarEntry.show(this, this._binarySize);
		this.pageStatusBarEntry.show(this, this._currentPage, this._totalPages);
	}

	protected override onBecameInactive(): void {
		this.binarySizeStatusBarEntry.hide(this);
		this.pageStatusBarEntry.hide(this);
	}

	protected async render(syncPosition?: { page: number; x?: number; y?: number }): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		const html = getPdfViewerHtml(
			this.webviewPanel.webview,
			this.extensionUri,
			this.resource,
			this._pdfData,
			syncPosition,
			!!this._onSyncClick
		);

		this.webviewPanel.webview.html = html;
	}

	protected async initializeRender(syncPosition?: { page: number; x?: number; y?: number }): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		// If we don't have pdfData, load from filesystem to use base64 data URL
		if (!this._pdfData) {
			try {
				this._pdfData = await vscode.workspace.fs.readFile(this.resource);
			} catch (error) {
				console.error('Failed to read PDF file, falling back to URL loading:', error);
			}
		}

		await this.render(syncPosition);
	}

	// Private methods

	private uint8ArrayToBase64(bytes: Uint8Array): string {
		let binary = '';
		const len = bytes.byteLength;
		const chunkSize = 0x8000;

		for (let i = 0; i < len; i += chunkSize) {
			const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
			binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
		}

		const btoaFn = (globalThis as unknown as { btoa: (s: string) => string }).btoa;
		return btoaFn(binary);
	}

	private updateBinarySize(): void {
		if (this._pdfData) {
			this._binarySize = this._pdfData.length;
			this.updateState();
		} else {
			vscode.workspace.fs.stat(this.resource).then(
				(stat: vscode.FileStat) => {
					this._binarySize = stat.size;
					this.updateState();
				},
				() => {
					// Ignore errors
				}
			);
		}
	}

	private async reloadFromFilesystem(): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		try {
			this._pdfData = await vscode.workspace.fs.readFile(this.resource);
			const base64 = this.uint8ArrayToBase64(this._pdfData);
			this.webviewPanel.webview.postMessage({
				type: 'updatePdf',
				pdfData: base64
			});
		} catch (error) {
			console.error('Failed to reload PDF file:', error);
			await this.render();
		}
	}
}

// Re-export PreviewState for backwards compatibility
export { PreviewState };
