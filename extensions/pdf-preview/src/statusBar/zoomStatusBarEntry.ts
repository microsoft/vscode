/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';

export type Scale = number | 'fit' | 'fitWidth';

export class ZoomStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private _showingOwner: unknown | undefined;

	private readonly _onDidChangeScale = this._register(new vscode.EventEmitter<{ scale: Scale }>());
	public readonly onDidChangeScale = this._onDidChangeScale.event;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem(
			'pdfPreview.zoomIndicator',
			vscode.StatusBarAlignment.Right,
			102
		));
		this._entry.name = vscode.l10n.t('PDF Zoom');
		this._entry.command = 'pdfPreview.selectZoom';
	}

	public show(owner: unknown, scale: Scale): void {
		this._showingOwner = owner;
		if (scale === 'fit') {
			this._entry.text = vscode.l10n.t('Fit');
		} else if (scale === 'fitWidth') {
			this._entry.text = vscode.l10n.t('Fit Width');
		} else {
			this._entry.text = `${Math.round(scale * 100)}%`;
		}
		this._entry.show();
	}

	public hide(owner: unknown): void {
		if (owner === this._showingOwner) {
			this._entry.hide();
			this._showingOwner = undefined;
		}
	}

	public setScale(scale: Scale): void {
		this._onDidChangeScale.fire({ scale });
	}
}
