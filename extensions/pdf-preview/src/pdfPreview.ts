/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';
import { BinarySizeStatusBarEntry } from './statusBar/binarySizeStatusBarEntry';
import { PageStatusBarEntry } from './statusBar/pageStatusBarEntry';
import { Scale, ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';
import { getPdfViewerHtml } from './pdfViewerHtml';
import { ShowPdfOptions } from './pdfPreviewManager';

export const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

interface WebviewMessage {
	type: string;
	page?: number;
	totalPages?: number;
	scale?: Scale;
	x?: number;
	y?: number;
	error?: string;
}

export class PdfPreview extends Disposable {

	private _previewState = PreviewState.Visible;
	private _currentPage = 1;
	private _totalPages = 1;
	private _currentScale: Scale = 'fitWidth';
	private _rotation = 0;
	private _binarySize: number | undefined;
	private _pdfData: Uint8Array | undefined;
	private _onSyncClick: string | undefined;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly resource: vscode.Uri,
		private readonly webviewPanel: vscode.WebviewPanel,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
		private readonly pageStatusBarEntry: PageStatusBarEntry,
		private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
		options?: ShowPdfOptions
	) {
		super();

		this._pdfData = options?.pdfData;
		this._onSyncClick = options?.onSyncClick;

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(extensionUri, 'media'),
				vscode.Uri.joinPath(extensionUri, 'vendors'),
				vscode.Uri.joinPath(resource, '..')
			]
		};

		this._register(webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
			this.handleMessage(message);
		}));

		this._register(zoomStatusBarEntry.onDidChangeScale((e: { scale: Scale }) => {
			if (this._previewState === PreviewState.Active) {
				this.webviewPanel.webview.postMessage({ type: 'setScale', scale: e.scale });
			}
		}));

		this._register(webviewPanel.onDidChangeViewState(() => {
			this.updateState();
		}));

		this._register(webviewPanel.onDidDispose(() => {
			this._previewState = PreviewState.Disposed;
			this.dispose();
		}));

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
		// Initialize: if no pdfData provided, load from filesystem to avoid vscode-resource auth issues in web
		this.initializeRender(options?.syncPosition);
		this.updateState();
	}

	public override get isDisposed(): boolean {
		return this._previewState === PreviewState.Disposed;
	}

	public override dispose(): void {
		super.dispose();
		this.binarySizeStatusBarEntry.hide(this);
		this.pageStatusBarEntry.hide(this);
		this.zoomStatusBarEntry.hide(this);
	}

	public reveal(): void {
		this.webviewPanel.reveal();
	}

	public async updatePdf(options: ShowPdfOptions): Promise<void> {
		this._pdfData = options.pdfData;
		this._onSyncClick = options.onSyncClick;

		// If we have PDF data, send it to the webview to update without losing state
		if (this._pdfData && this._previewState !== PreviewState.Disposed) {
			const base64 = this.uint8ArrayToBase64(this._pdfData);
			this.webviewPanel.webview.postMessage({
				type: 'updatePdf',
				pdfData: base64
			});
			this.updateBinarySize();
		} else {
			// Fallback to full re-render if no data
			await this.render(options.syncPosition);
		}
	}

	private uint8ArrayToBase64(bytes: Uint8Array): string {
		// Convert Uint8Array to base64 string
		// This approach works in both Node.js and browser environments
		let binary = '';
		const len = bytes.byteLength;
		const chunkSize = 0x8000; // Process in chunks to avoid call stack issues

		for (let i = 0; i < len; i += chunkSize) {
			const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
			binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
		}

		// btoa is available in both browser and Node.js 16+
		// Use type assertion for cross-environment compatibility
		const btoaFn = (globalThis as unknown as { btoa: (s: string) => string }).btoa;
		return btoaFn(binary);
	}

	public zoomIn(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'zoomIn' });
		}
	}

	public zoomOut(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'zoomOut' });
		}
	}

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

	public openFind(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'openFind' });
		}
	}

	private handleMessage(message: WebviewMessage): void {
		switch (message.type) {
			case 'pageChanged':
				this._currentPage = message.page ?? 1;
				this._totalPages = message.totalPages ?? 1;
				this.updateState();
				break;
			case 'scaleChanged':
				this._currentScale = message.scale ?? 1.5;
				this.updateState();
				break;
			case 'syncClick':
				if (this._onSyncClick) {
					vscode.commands.executeCommand(this._onSyncClick, {
						page: message.page,
						x: message.x,
						y: message.y
					});
				}
				break;
			case 'error':
				vscode.window.showErrorMessage(vscode.l10n.t('Failed to load PDF: {0}', message.error ?? 'Unknown error'));
				break;
		}
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

	private async render(syncPosition?: { page: number; x?: number; y?: number }): Promise<void> {
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

	/**
	 * Initialize render - loads PDF from filesystem if no pdfData provided.
	 * This avoids vscode-resource authentication issues in web environments.
	 */
	private async initializeRender(syncPosition?: { page: number; x?: number; y?: number }): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		// If we don't have pdfData, load from filesystem to use base64 data URL
		// This avoids 401 authentication errors with vscode-resource in web production
		if (!this._pdfData) {
			try {
				this._pdfData = await vscode.workspace.fs.readFile(this.resource);
			} catch (error) {
				// If reading fails, fall back to URL-based loading (original behavior)
				console.error('Failed to read PDF file, falling back to URL loading:', error);
			}
		}

		await this.render(syncPosition);
	}

	/**
	 * Reload PDF from filesystem when file changes
	 */
	private async reloadFromFilesystem(): Promise<void> {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		try {
			this._pdfData = await vscode.workspace.fs.readFile(this.resource);
			// Send updated data to webview without full re-render to preserve state
			const base64 = this.uint8ArrayToBase64(this._pdfData);
			this.webviewPanel.webview.postMessage({
				type: 'updatePdf',
				pdfData: base64
			});
		} catch (error) {
			console.error('Failed to reload PDF file:', error);
			// Fall back to full re-render
			await this.render();
		}
	}

	private updateState(): void {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewPanel.active) {
			this._previewState = PreviewState.Active;
			this.binarySizeStatusBarEntry.show(this, this._binarySize);
			this.pageStatusBarEntry.show(this, this._currentPage, this._totalPages);
			this.zoomStatusBarEntry.show(this, this._currentScale);
		} else {
			this._previewState = PreviewState.Visible;
			this.binarySizeStatusBarEntry.hide(this);
			this.pageStatusBarEntry.hide(this);
			this.zoomStatusBarEntry.hide(this);
		}
	}
}

