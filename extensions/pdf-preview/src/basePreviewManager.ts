/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BasePreview } from './basePreview';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

/**
 * Base options for showing a preview programmatically
 */
export interface BaseShowPreviewOptions {
	/** URI of the source file (e.g., .tex, .typ, .md) */
	sourceUri?: vscode.Uri;
	/** The view column to show the preview in */
	viewColumn?: vscode.ViewColumn;
	/** If true, don't steal focus when updating an existing preview */
	preserveFocus?: boolean;
}

/**
 * Abstract base class for preview manager implementations
 * Handles common functionality for managing preview instances
 */
export abstract class BasePreviewManager<T extends BasePreview, TOptions extends BaseShowPreviewOptions> implements vscode.CustomReadonlyEditorProvider {

	protected readonly _previews = new Set<T>();
	protected _activePreview: T | undefined;

	// Map to track programmatic previews (from LaTeX/Typst/etc.)
	protected readonly _programmaticPreviews = new Map<string, T>();

	constructor(
		protected readonly extensionUri: vscode.Uri,
		protected readonly zoomStatusBarEntry: ZoomStatusBarEntry
	) { }

	/**
	 * Open a custom document (required by CustomReadonlyEditorProvider)
	 */
	public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => { } };
	}

	/**
	 * Resolve a custom editor (required by CustomReadonlyEditorProvider)
	 */
	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
	): Promise<void> {
		const preview = this.createPreviewForEditor(document, webviewPanel);

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

	/**
	 * Get the currently active preview
	 */
	public get activePreview(): T | undefined {
		return this._activePreview;
	}

	/**
	 * Set the active preview
	 */
	protected setActivePreview(value: T | undefined): void {
		this._activePreview = value;
	}

	/**
	 * Get a preview by source URI (for programmatic previews)
	 */
	public getPreviewBySource(sourceUri: string): T | undefined {
		const preview = this._programmaticPreviews.get(sourceUri);
		if (preview && !preview.isDisposed) {
			return preview;
		}
		return undefined;
	}

	/**
	 * Extract filename from a URI
	 */
	protected getFileName(uri: vscode.Uri): string {
		const path = uri.path;
		const lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
	}

	/**
	 * Show a preview programmatically
	 * Subclasses should call this base implementation and then customize
	 */
	protected async showPreviewBase(options: TOptions, getKey: () => string, getTitle: () => string): Promise<T> {
		const key = getKey();

		// Check if we already have a preview for this source
		const existingPreview = this._programmaticPreviews.get(key);
		if (existingPreview && !existingPreview.isDisposed) {
			await this.updateExistingPreview(existingPreview, options);
			if (!options.preserveFocus) {
				existingPreview.reveal();
			}
			return existingPreview;
		}

		// Create new webview panel
		const panel = this.createWebviewPanel(getTitle(), options);

		const preview = this.createPreviewForProgrammatic(panel, options);

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
	 * Create a webview panel for programmatic previews
	 */
	protected createWebviewPanel(title: string, options: TOptions): vscode.WebviewPanel {
		return vscode.window.createWebviewPanel(
			this.getViewType() + '.programmatic',
			title,
			options.viewColumn || vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: this.getLocalResourceRoots(options)
			}
		);
	}

	/**
	 * Get the view type for this preview manager
	 */
	protected abstract getViewType(): string;

	/**
	 * Get local resource roots for the webview
	 */
	protected abstract getLocalResourceRoots(options: TOptions): vscode.Uri[];

	/**
	 * Create a preview for the custom editor
	 */
	protected abstract createPreviewForEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): T;

	/**
	 * Create a preview for programmatic use
	 */
	protected abstract createPreviewForProgrammatic(panel: vscode.WebviewPanel, options: TOptions): T;

	/**
	 * Update an existing preview with new options
	 */
	protected abstract updateExistingPreview(preview: T, options: TOptions): Promise<void>;
}

