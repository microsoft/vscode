/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ShowOptions, SimpleBrowserView } from './simpleBrowserView';

export class SimpleBrowserManager {

	private _activeView?: SimpleBrowserView;
	private _pendingShow?: { url: string; options?: ShowOptions };

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
			if (this._pendingShow) {
				this._pendingShow = { url, options };
				return;
			}
			this._pendingShow = { url, options };
			try {
				const view = SimpleBrowserView.create(this.extensionUri, url, options);
				this.registerWebviewListeners(view);
				this._activeView = view;

				const pending = this._pendingShow;
				if (pending.url !== url || pending.options !== options) {
					view.show(pending.url, pending.options);
				}
			} finally {
				this._pendingShow = undefined;
			}
		}
	}

	public restore(panel: vscode.WebviewPanel, state: any): void {
		const url = state?.url ?? '';
		const view = SimpleBrowserView.restore(this.extensionUri, url, panel);
		if (this._activeView) {
			view.dispose();
			return;
		}
		this.registerWebviewListeners(view);
		this._activeView = view;
	}

	private registerWebviewListeners(view: SimpleBrowserView) {
		view.onDispose(() => {
			if (this._activeView === view) {
				this._activeView = undefined;
			}
		});
	}

}
