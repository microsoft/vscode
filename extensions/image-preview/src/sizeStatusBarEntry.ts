/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class SizeStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private _showingOwner: string | undefined;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem({
			id: 'imagePreview.size',
			name: localize('sizeStatusBar.name', "Image Size"),
			alignment: vscode.StatusBarAlignment.Right,
			priority: 101 /* to the left of editor status (100) */,
		}));
	}

	public show(owner: string, text: string) {
		this._showingOwner = owner;
		this._entry.text = text;
		this._entry.show();
	}

	public hide(owner: string) {
		if (owner === this._showingOwner) {
			this._entry.hide();
			this._showingOwner = undefined;
		}
	}
}
