/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';

export class PageStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private _showingOwner: unknown | undefined;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem(
			'pdfPreview.pageIndicator',
			vscode.StatusBarAlignment.Right,
			101
		));
		this._entry.name = vscode.l10n.t('PDF Page Indicator');
	}

	public show(owner: unknown, page: number, totalPages: number): void {
		this._showingOwner = owner;
		this._entry.text = vscode.l10n.t('{0} of {1}', page, totalPages);
		this._entry.show();
	}

	public hide(owner: unknown): void {
		if (owner === this._showingOwner) {
			this._entry.hide();
			this._showingOwner = undefined;
		}
	}
}
