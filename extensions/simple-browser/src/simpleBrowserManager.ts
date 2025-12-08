/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ShowOptions, SimpleBrowserView } from './simpleBrowserView';

export class SimpleBrowserManager {

	private _activeView?: SimpleBrowserView;

	constructor(
		private readonly extensionUri: vscode.Uri,
	) { }

	dispose() {
		this._activeView?.dispose();
		this._activeView = undefined;
	}

	public show(inputUri: string | vscode.Uri, options?: ShowOptions): void {
		const url = typeof inputUri === 'string' ? inputUri : inputUri.toString(true);
		if (this._activeView) {
			this._activeView.show(url, options);
		} else {
			const view = SimpleBrowserView.create(this.extensionUri, url, options);
			this.registerWebviewListeners(view);

			this._activeView = view;
		}
	}

	public restore(panel: vscode.WebviewPanel, state: any): void {
		const url = state?.url ?? '';
		const view = SimpleBrowserView.restore(this.extensionUri, url, panel);
		this.registerWebviewListeners(view);
		this._activeView ??= view;
	}

	private registerWebviewListeners(view: SimpleBrowserView) {
		view.onDispose(() => {
			if (this._activeView === view) {
				this._activeView = undefined;
			}
		});
	}

}
