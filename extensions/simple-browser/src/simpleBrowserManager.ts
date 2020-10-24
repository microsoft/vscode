/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SimpleBrowserView } from './simpleBrowserView';

export class SimpleBrowserManager {

	private _activeView?: SimpleBrowserView;

	constructor(
		private readonly extensionUri: vscode.Uri,
	) { }

	dispose() {
		this._activeView?.dispose();
		this._activeView = undefined;
	}

	public show(url: string): void {
		if (this._activeView) {
			this._activeView.show(url);
		} else {
			const view = new SimpleBrowserView(this.extensionUri, url);
			view.onDispose(() => {
				if (this._activeView === view) {
					this._activeView = undefined;
				}
			});

			this._activeView = view;
		}
	}
}


