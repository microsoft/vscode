/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { Disposable } from './util/dispose';

export function reopenAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined) {
	vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
}

export const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

export abstract class MediaPreview extends Disposable {

	protected previewState = PreviewState.Visible;
	private _binarySize: number | undefined;

	constructor(
		extensionRoot: vscode.Uri,
		protected readonly resource: vscode.Uri,
		protected readonly webviewEditor: vscode.WebviewPanel,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) {
		super();

		const resourceRoot = resource.with({
			path: resource.path.replace(/\/[^\/]+?\.\w+$/, '/'),
		});

		webviewEditor.webview.options = {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: [
				resourceRoot,
				extensionRoot,
			]
		};

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.updateState();
		}));

		this._register(webviewEditor.onDidDispose(() => {
			if (this.previewState === PreviewState.Active) {
				this.binarySizeStatusBarEntry.hide(this);
			}
			this.previewState = PreviewState.Disposed;
		}));

		const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(resource, '*')));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this.resource.toString()) {
				this.updateBinarySize();
				this.render();
			}
		}));

		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this.resource.toString()) {
				this.webviewEditor.dispose();
			}
		}));
	}

	protected updateBinarySize() {
		vscode.workspace.fs.stat(this.resource).then(({ size }) => {
			this._binarySize = size;
			this.updateState();
		});
	}

	protected async render() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		const content = await this.getWebviewContents();
		if (this.previewState as PreviewState === PreviewState.Disposed) {
			return;
		}

		this.webviewEditor.webview.html = content;
	}

	protected abstract getWebviewContents(): Promise<string>;

	protected updateState() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewEditor.active) {
			this.previewState = PreviewState.Active;
			this.binarySizeStatusBarEntry.show(this, this._binarySize);
		} else {
			this.binarySizeStatusBarEntry.hide(this);
			this.previewState = PreviewState.Visible;
		}
	}
}
