/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Disposable } from './dispose';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { Scale, ZoomStatusBarEntry } from './zoomStatusBarEntry';

const localize = nls.loadMessageBundle();

const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

export class Preview extends Disposable {

	public static readonly viewType = 'imagePreview.previewEditor';

	private readonly id: string = `${Date.now()}-${Math.random().toString()}`;

	private _previewState = PreviewState.Visible;
	private _imageSize: string | undefined;
	private _imageZoom: Scale | undefined;

	constructor(
		private readonly extensionRoot: vscode.Uri,
		private readonly resource: vscode.Uri,
		private readonly webviewEditor: vscode.WebviewEditor,
		private readonly sizeStatusBarEntry: SizeStatusBarEntry,
		private readonly zoomStatusBarEntry: ZoomStatusBarEntry,
	) {
		super();
		const resourceRoot = resource.with({
			path: resource.path.replace(/\/[^\/]+?\.\w+$/, '/'),
		});

		webviewEditor.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				resourceRoot,
				extensionRoot,
			]
		};

		this._register(webviewEditor.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'size':
					{
						this._imageSize = message.value;
						this.update();
						break;
					}
				case 'zoom':
					{
						this._imageZoom = message.value;
						this.update();
						break;
					}
			}
		}));

		this._register(zoomStatusBarEntry.onDidChangeScale(e => {
			if (this._previewState === PreviewState.Active) {
				this.webviewEditor.webview.postMessage({ type: 'setScale', scale: e.scale });
			}
		}));

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.update();
		}));

		this._register(webviewEditor.onDidDispose(() => {
			if (this._previewState === PreviewState.Active) {
				this.sizeStatusBarEntry.hide(this.id);
				this.zoomStatusBarEntry.hide(this.id);
			}
			this._previewState = PreviewState.Disposed;
		}));

		const watcher = this._register(vscode.workspace.createFileSystemWatcher(resource.fsPath));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this.resource.toString()) {
				this.render();
			}
		}));
		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this.resource.toString()) {
				this.webviewEditor.dispose();
			}
		}));

		this.render();
		this.update();
	}

	private render() {
		if (this._previewState !== PreviewState.Disposed) {
			this.webviewEditor.webview.html = this.getWebiewContents();
		}
	}

	private update() {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewEditor.active) {
			this._previewState = PreviewState.Active;
			this.sizeStatusBarEntry.show(this.id, this._imageSize || '');
			this.zoomStatusBarEntry.show(this.id, this._imageZoom || 'fit');
		} else {
			if (this._previewState === PreviewState.Active) {
				this.sizeStatusBarEntry.hide(this.id);
				this.zoomStatusBarEntry.hide(this.id);
			}
			this._previewState = PreviewState.Visible;
		}
	}

	private getWebiewContents(): string {
		const version = Date.now().toString();
		const settings = {
			isMac: process.platform === 'darwin',
			src: this.getResourcePath(this.webviewEditor, this.resource, version),
		};

		const nonce = Date.now().toString();

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<title>Image Preview</title>

	<link rel="stylesheet" href="${escapeAttribute(this.extensionResource('/media/main.css'))}" type="text/css" media="screen" nonce="${nonce}">

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: ${this.webviewEditor.webview.cspSource}; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}';">
	<meta id="image-preview-settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container image scale-to-fit loading">
	<div class="loading-indicator"></div>
	<div class="image-load-error-message">${localize('preview.imageLoadError', "An error occurred while loading the image")}</div>
	<script src="${escapeAttribute(this.extensionResource('/media/main.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
	}

	private getResourcePath(webviewEditor: vscode.WebviewEditor, resource: vscode.Uri, version: string) {
		switch (resource.scheme) {
			case 'data':
				return encodeURI(resource.toString(true));

			case 'git':
				// Show blank image
				return encodeURI('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42gEFAPr/AP///wAI/AL+Sr4t6gAAAABJRU5ErkJggg==');


			default:
				return encodeURI(webviewEditor.webview.asWebviewUri(resource).toString(true) + `?version=${version}`);
		}
	}

	private extensionResource(path: string) {
		return this.webviewEditor.webview.asWebviewUri(this.extensionRoot.with({
			path: this.extensionRoot.path + path
		}));
	}
}

function escapeAttribute(value: string | vscode.Uri): string {
	return value.toString().replace(/"/g, '&quot;');
}
