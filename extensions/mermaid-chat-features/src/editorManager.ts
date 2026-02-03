/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { generateUuid } from './util/uuid';
import { MermaidWebviewManager } from './webviewManager';
import { escapeHtmlText } from './util/html';
import { Disposable } from './util/dispose';

export const mermaidEditorViewType = 'vscode.chat-mermaid-features.preview';

interface MermaidPreviewState {
	readonly webviewId: string;
	readonly mermaidSource: string;
}

/**
 * Manages mermaid diagram editor panels, ensuring only one editor per diagram.
 */
export class MermaidEditorManager extends Disposable implements vscode.WebviewPanelSerializer {

	private readonly _previews = new Map<string, MermaidPreview>();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _webviewManager: MermaidWebviewManager
	) {
		super();

		this._register(vscode.window.registerWebviewPanelSerializer(mermaidEditorViewType, this));
	}

	/**
	 * Opens a preview for the given diagram
	 *
	 * If a preview already exists for this diagram, it will be revealed instead of creating a new one.
	 */
	public openPreview(mermaidSource: string, title?: string): void {
		const webviewId = getWebviewId(mermaidSource);
		const existingPreview = this._previews.get(webviewId);
		if (existingPreview) {
			existingPreview.reveal();
			return;
		}

		const preview = MermaidPreview.create(
			webviewId,
			mermaidSource,
			title,
			this._extensionUri,
			this._webviewManager,
			vscode.ViewColumn.Active);

		this._registerPreview(preview);
	}

	public async deserializeWebviewPanel(
		webviewPanel: vscode.WebviewPanel,
		state: MermaidPreviewState
	): Promise<void> {
		if (!state?.mermaidSource) {
			webviewPanel.webview.html = this._getErrorHtml();
			return;
		}

		const webviewId = getWebviewId(state.mermaidSource);

		const preview = MermaidPreview.revive(
			webviewPanel,
			webviewId,
			state.mermaidSource,
			this._extensionUri,
			this._webviewManager
		);

		this._registerPreview(preview);
	}

	private _registerPreview(preview: MermaidPreview): void {
		this._previews.set(preview.diagramId, preview);

		preview.onDispose(() => {
			this._previews.delete(preview.diagramId);
		});
	}

	private _getErrorHtml(): string {
		return /* html */`<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Mermaid Preview</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
				<style>
					body {
						display: flex;
						justify-content: center;
						align-items: center;
						height: 100vh;
						margin: 0;
					}
				</style>
			</head>
			<body>
				<p>An unexpected error occurred while restoring the Mermaid preview.</p>
			</body>
			</html>`;
	}

	public override dispose(): void {
		super.dispose();

		for (const preview of this._previews.values()) {
			preview.dispose();
		}
		this._previews.clear();
	}
}

class MermaidPreview extends Disposable {

	private readonly _onDisposeEmitter = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this._onDisposeEmitter.event;

	public static create(
		diagramId: string,
		mermaidSource: string,
		title: string | undefined,
		extensionUri: vscode.Uri,
		webviewManager: MermaidWebviewManager,
		viewColumn: vscode.ViewColumn
	): MermaidPreview {
		const webviewPanel = vscode.window.createWebviewPanel(
			mermaidEditorViewType,
			title ?? vscode.l10n.t('Mermaid Diagram'),
			viewColumn,
			{
				retainContextWhenHidden: false,
			}
		);

		return new MermaidPreview(webviewPanel, diagramId, mermaidSource, extensionUri, webviewManager);
	}

	public static revive(
		webviewPanel: vscode.WebviewPanel,
		diagramId: string,
		mermaidSource: string,
		extensionUri: vscode.Uri,
		webviewManager: MermaidWebviewManager
	): MermaidPreview {
		return new MermaidPreview(webviewPanel, diagramId, mermaidSource, extensionUri, webviewManager);
	}

	private constructor(
		private readonly _webviewPanel: vscode.WebviewPanel,
		public readonly diagramId: string,
		private readonly _mermaidSource: string,
		private readonly _extensionUri: vscode.Uri,
		private readonly _webviewManager: MermaidWebviewManager
	) {
		super();

		this._webviewPanel.iconPath = new vscode.ThemeIcon('graph');

		this._webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'chat-webview-out')
			],
		};

		this._webviewPanel.webview.html = this._getHtml();

		// Register with the webview manager
		this._register(this._webviewManager.registerWebview(this.diagramId, this._webviewPanel.webview, this._mermaidSource, undefined, 'editor'));

		this._register(this._webviewPanel.onDidChangeViewState(e => {
			if (e.webviewPanel.active) {
				this._webviewManager.setActiveWebview(this.diagramId);
			}
		}));

		this._register(this._webviewPanel.onDidDispose(() => {
			this._onDisposeEmitter.fire();
			this.dispose();
		}));
	}

	public reveal(): void {
		this._webviewPanel.reveal();
	}

	public override dispose() {
		this._onDisposeEmitter.fire();

		super.dispose();

		this._webviewPanel.dispose();
	}

	private _getHtml(): string {
		const nonce = generateUuid();

		const mediaRoot = vscode.Uri.joinPath(this._extensionUri, 'chat-webview-out');
		const scriptUri = this._webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(mediaRoot, 'index-editor.js')
		);
		const codiconsUri = this._webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(mediaRoot, 'codicon.css')
		);

		return /* html */`<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Mermaid Diagram</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${this._webviewPanel.webview.cspSource} 'unsafe-inline'; font-src data:;" />
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">
				<style>
					html, body {
						margin: 0;
						padding: 0;
						height: 100%;
						width: 100%;
						overflow: hidden;
					}
					.mermaid {
						visibility: hidden;
					}
					.mermaid.rendered {
						visibility: visible;
					}
					.mermaid-wrapper {
						height: 100%;
						width: 100%;
					}
					.zoom-controls {
						position: absolute;
						top: 8px;
						right: 8px;
						display: flex;
						gap: 2px;
						z-index: 100;
						background: var(--vscode-editorWidget-background);
						border: 1px solid var(--vscode-editorWidget-border);
						border-radius: 6px;
						padding: 3px;
					}
					.zoom-controls button {
						display: flex;
						align-items: center;
						justify-content: center;
						width: 26px;
						height: 26px;
						background: transparent;
						color: var(--vscode-icon-foreground);
						border: none;
						border-radius: 4px;
						cursor: pointer;
					}
					.zoom-controls button:hover {
						background: var(--vscode-toolbar-hoverBackground);
					}
				</style>
			</head>
			<body data-vscode-context='${JSON.stringify({ preventDefaultContextMenuItems: true, mermaidWebviewId: this.diagramId })}' data-vscode-mermaid-webview-id="${this.diagramId}">
				<div class="zoom-controls">
					<button class="zoom-out-btn" title="${vscode.l10n.t('Zoom Out')}"><i class="codicon codicon-zoom-out"></i></button>
					<button class="zoom-in-btn" title="${vscode.l10n.t('Zoom In')}"><i class="codicon codicon-zoom-in"></i></button>
					<button class="zoom-reset-btn" title="${vscode.l10n.t('Reset Zoom')}"><i class="codicon codicon-screen-normal"></i></button>
				</div>
				<pre class="mermaid">
					${escapeHtmlText(this._mermaidSource)}
				</pre>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}


/**
 * Generates a unique ID for a diagram based on its content.
 * This ensures the same diagram content always gets the same ID.
 */
function getWebviewId(source: string): string {
	// Simple hash function for generating a content-based ID
	let hash = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(16);
}
