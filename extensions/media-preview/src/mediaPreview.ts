/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { Disposable } from './util/dispose';

export async function reopenAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined): Promise<void> {
	await vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
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
		protected readonly _resource: vscode.Uri,
		protected readonly _webviewEditor: vscode.WebviewPanel,
		private readonly _binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) {
		super();

		_webviewEditor.webview.options = {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: [
				Utils.dirname(_resource),
				extensionRoot,
			]
		};

		this._register(_webviewEditor.onDidChangeViewState(() => {
			this.updateState();
		}));

		this._register(_webviewEditor.onDidDispose(() => {
			this.previewState = PreviewState.Disposed;
			this.dispose();
		}));

		const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(_resource, '*')));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this._resource.toString()) {
				this.updateBinarySize();
				this.render();
			}
		}));

		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this._resource.toString()) {
				this._webviewEditor.dispose();
			}
		}));
	}

	public override dispose() {
		super.dispose();
		this._binarySizeStatusBarEntry.hide(this);
	}

	public get resource() {
		return this._resource;
	}

	protected updateBinarySize() {
		vscode.workspace.fs.stat(this._resource).then(({ size }) => {
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

		this._webviewEditor.webview.html = content;
	}

	protected abstract getWebviewContents(): Promise<string>;

	protected updateState() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		if (this._webviewEditor.active) {
			this.previewState = PreviewState.Active;
			this._binarySizeStatusBarEntry.show(this, this._binarySize);
		} else {
			this._binarySizeStatusBarEntry.hide(this);
			this.previewState = PreviewState.Visible;
		}
	}
}
