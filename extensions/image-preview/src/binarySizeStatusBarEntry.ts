/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class BinarySize {
	static readonly KB = 1024;
	static readonly MB = BinarySize.KB * BinarySize.KB;
	static readonly GB = BinarySize.MB * BinarySize.KB;
	static readonly TB = BinarySize.GB * BinarySize.KB;

	static formatSize(size: number): string {
		if (size < BinarySize.KB) {
			return localize('sizeB', "{0}B", size);
		}

		if (size < BinarySize.MB) {
			return localize('sizeKB', "{0}KB", (size / BinarySize.KB).toFixed(2));
		}

		if (size < BinarySize.GB) {
			return localize('sizeMB', "{0}MB", (size / BinarySize.MB).toFixed(2));
		}

		if (size < BinarySize.TB) {
			return localize('sizeGB', "{0}GB", (size / BinarySize.GB).toFixed(2));
		}

		return localize('sizeTB', "{0}TB", (size / BinarySize.TB).toFixed(2));
	}
}

export class BinarySizeStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private _showingOwner: string | undefined;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem({
			id: 'imagePreview.binarySize',
			name: localize('sizeStatusBar.name', "Image Binary Size"),
			alignment: vscode.StatusBarAlignment.Right,
			priority: 100,
		}));
	}

	public show(owner: string, size: number | undefined) {
		this._showingOwner = owner;
		if (typeof size === 'number') {
			this._entry.text = BinarySize.formatSize(size);
			this._entry.show();
		} else {
			this.hide(owner);
		}
	}

	public hide(owner: string) {
		if (owner === this._showingOwner) {
			this._entry.hide();
			this._showingOwner = undefined;
		}
	}
}
