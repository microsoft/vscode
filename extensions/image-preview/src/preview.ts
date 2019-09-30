/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';
import { Disposable } from './dispose';

export class Preview extends Disposable {

	public static readonly viewType = 'imagePreview.previewEditor';

	private _active = true;

	constructor(
		private readonly extensionRoot: vscode.Uri,
		resource: vscode.Uri,
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

		webviewEditor.webview.html = this.getWebiewContents(webviewEditor, resource);

		this._register(webviewEditor.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'size':
					{
						this.sizeStatusBarEntry.update(message.value);
						break;
					}
				case 'zoom':
					{
						this.zoomStatusBarEntry.update(message.value);
						break;
					}
			}
		}));

		this._register(zoomStatusBarEntry.onDidChangeScale(e => {
			this.webviewEditor.webview.postMessage({ type: 'setScale', scale: e.scale });
		}));

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.update();
		}));
		this._register(webviewEditor.onDidDispose(() => {
			if (this._active) {
				this.sizeStatusBarEntry.hide();
				this.zoomStatusBarEntry.hide();
			}
		}));
		this.update();
	}

	private update() {
		this._active = this.webviewEditor.active;
		if (this._active) {
			this.sizeStatusBarEntry.show();
			this.zoomStatusBarEntry.show();
		} else {
			this.sizeStatusBarEntry.hide();
			this.zoomStatusBarEntry.hide();
		}
	}

	private getWebiewContents(webviewEditor: vscode.WebviewEditor, resource: vscode.Uri): string {
		const settings = {
			isMac: process.platform === 'darwin',
			src: this.getResourcePath(webviewEditor, resource)
		};

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<title>Image Preview</title>
	<link rel="stylesheet" class="code-user-style" href="${escapeAttribute(this.extensionResource('/media/main.css'))}" type="text/css" media="screen">

	<meta id="image-preview-settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container image scale-to-fit">
	<div class='loading'></div>
	<script src="${escapeAttribute(this.extensionResource('/media/main.js'))}"></script>
</body>
</html>`;
	}

	private getResourcePath(webviewEditor: vscode.WebviewEditor, resource: vscode.Uri) {
		if (resource.scheme === 'data') {
			return encodeURI(resource.toString(true));
		}

		return encodeURI(webviewEditor.webview.asWebviewUri(resource).toString(true));
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
