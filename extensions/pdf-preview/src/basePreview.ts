/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';
import { Scale, ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

/**
 * Preview state enum shared by all preview types
 */
export const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

/**
 * Base interface for webview messages
 */
export interface BaseWebviewMessage {
	type: string;
	scale?: Scale;
	mode?: string;
	percent?: number;
	error?: string;
}

/**
 * Abstract base class for preview implementations (PDF, Markdown, etc.)
 * Contains shared functionality for webview management, sync modes, zoom, and event handling.
 */
export abstract class BasePreview extends Disposable {

	protected _previewState = PreviewState.Visible;
	protected _currentScale: Scale = 1;
	protected _syncMode: 'off' | 'click' | 'scroll' = 'click';

	// Event emitter for scroll sync (preview → editor)
	protected readonly _onDidScrollPreview = this._register(new vscode.EventEmitter<number>());
	public readonly onDidScrollPreview = this._onDidScrollPreview.event;

	// Event emitter for sync mode change
	protected readonly _onDidChangeSyncMode = this._register(new vscode.EventEmitter<string>());
	public readonly onDidChangeSyncMode = this._onDidChangeSyncMode.event;

	public get syncMode(): string { return this._syncMode; }

	constructor(
		protected readonly extensionUri: vscode.Uri,
		protected readonly resource: vscode.Uri,
		protected readonly webviewPanel: vscode.WebviewPanel,
		protected readonly zoomStatusBarEntry: ZoomStatusBarEntry
	) {
		super();

		this._register(webviewPanel.webview.onDidReceiveMessage((message: BaseWebviewMessage) => {
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
	}

	public override get isDisposed(): boolean {
		return this._previewState === PreviewState.Disposed;
	}

	public override dispose(): void {
		super.dispose();
		this.zoomStatusBarEntry.hide(this);
	}

	/**
	 * Reveal the preview panel
	 */
	public reveal(): void {
		this.webviewPanel.reveal();
	}

	/**
	 * Zoom in the preview
	 */
	public zoomIn(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'zoomIn' });
		}
	}

	/**
	 * Zoom out the preview
	 */
	public zoomOut(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'zoomOut' });
		}
	}

	/**
	 * Open the find dialog
	 */
	public openFind(): void {
		if (this._previewState === PreviewState.Active) {
			this.webviewPanel.webview.postMessage({ type: 'openFind' });
		}
	}

	/**
	 * Scroll to a percentage of the document
	 */
	public scrollToPercent(percent: number, source?: 'click' | 'scroll'): void {
		if (this._previewState !== PreviewState.Disposed) {
			this.webviewPanel.webview.postMessage({ type: 'scrollToPercent', percent, source });
		}
	}

	/**
	 * Handle base webview messages common to all preview types
	 * Returns true if the message was handled, false otherwise
	 */
	protected handleBaseMessage(message: BaseWebviewMessage): boolean {
		switch (message.type) {
			case 'scaleChanged':
				this._currentScale = message.scale ?? 1;
				this.updateState();
				return true;
			case 'syncModeChanged':
				this._syncMode = (message.mode as 'off' | 'click' | 'scroll') ?? 'click';
				this._onDidChangeSyncMode.fire(this._syncMode);
				return true;
			case 'scrollChanged':
				// Handle scroll sync (preview → editor) in scroll mode
				if (message.percent !== undefined && this._syncMode === 'scroll') {
					this._onDidScrollPreview.fire(message.percent);
				}
				// Return false to allow subclasses to also handle scrollChanged
				// (e.g., to execute onSyncScroll callback for Typst integration)
				return false;
			case 'error':
				vscode.window.showErrorMessage(this.getErrorMessage(message.error));
				return true;
		}
		return false;
	}

	/**
	 * Handle incoming webview messages
	 * Subclasses should override this to handle their specific messages
	 */
	protected handleMessage(message: BaseWebviewMessage): void {
		// First try to handle as base message
		if (this.handleBaseMessage(message)) {
			return;
		}
		// Subclasses should handle remaining messages
		this.handleSpecificMessage(message);
	}

	/**
	 * Handle messages specific to the preview type
	 * Subclasses should override this method
	 */
	protected abstract handleSpecificMessage(message: BaseWebviewMessage): void;

	/**
	 * Get the error message to display
	 * Subclasses can override to customize the error message format
	 */
	protected getErrorMessage(error?: string): string {
		return vscode.l10n.t('Preview error: {0}', error ?? 'Unknown error');
	}

	/**
	 * Update the preview state based on panel visibility
	 */
	protected updateState(): void {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewPanel.active) {
			this._previewState = PreviewState.Active;
			this.zoomStatusBarEntry.show(this, this._currentScale);
			this.onBecameActive();
		} else {
			this._previewState = PreviewState.Visible;
			this.zoomStatusBarEntry.hide(this);
			this.onBecameInactive();
		}
	}

	/**
	 * Called when the preview becomes active
	 * Subclasses can override to perform additional actions
	 */
	protected onBecameActive(): void {
		// Default: do nothing
	}

	/**
	 * Called when the preview becomes inactive
	 * Subclasses can override to perform additional actions
	 */
	protected onBecameInactive(): void {
		// Default: do nothing
	}

	/**
	 * Render the preview content
	 */
	protected abstract render(): Promise<void>;

	/**
	 * Initialize and render the preview
	 */
	protected abstract initializeRender(): Promise<void>;
}

