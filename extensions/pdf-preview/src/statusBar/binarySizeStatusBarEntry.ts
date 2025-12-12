/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';

function formatSize(size: number): string {
	if (size < 1024) {
		return vscode.l10n.t('{0}B', size);
	}

	if (size < 1024 * 1024) {
		return vscode.l10n.t('{0}KB', (size / 1024).toFixed(2));
	}

	return vscode.l10n.t('{0}MB', (size / 1024 / 1024).toFixed(2));
}

export class BinarySizeStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private _showingOwner: unknown | undefined;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem(
			'pdfPreview.binarySize',
			vscode.StatusBarAlignment.Right,
			100
		));
		this._entry.name = vscode.l10n.t('PDF Binary Size');
	}

	public show(owner: unknown, size: number | undefined): void {
		this._showingOwner = owner;
		if (typeof size === 'number') {
			this._entry.text = formatSize(size);
			this._entry.show();
		} else {
			this._entry.hide();
		}
	}

	public hide(owner: unknown): void {
		if (owner === this._showingOwner) {
			this._entry.hide();
			this._showingOwner = undefined;
		}
	}
}
