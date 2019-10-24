/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Disposable } from './dispose';

const localize = nls.loadMessageBundle();

const selectZoomLevelCommandId = '_imagePreview.selectZoomLevel';

export type Scale = number | 'fit';

export class ZoomStatusBarEntry extends Disposable {
	private readonly _entry: vscode.StatusBarItem;

	private readonly _onDidChangeScale = this._register(new vscode.EventEmitter<{ scale: Scale }>());
	public readonly onDidChangeScale = this._onDidChangeScale.event;

	private _showOwner: string | undefined;

	constructor() {
		super();
		this._entry = this._register(vscode.window.createStatusBarItem({
			id: 'imagePreview.zoom',
			name: localize('zoomStatusBar.name', "Image Zoom"),
			alignment: vscode.StatusBarAlignment.Right,
			priority: 102 /* to the left of editor size entry (101) */,
		}));

		this._register(vscode.commands.registerCommand(selectZoomLevelCommandId, async () => {
			type MyPickItem = vscode.QuickPickItem & { scale: Scale };

			const scales: Scale[] = [10, 5, 2, 1, 0.5, 0.2, 'fit'];
			const options = scales.map((scale): MyPickItem => ({
				label: this.zoomLabel(scale),
				scale
			}));

			const pick = await vscode.window.showQuickPick(options, {
				placeHolder: localize('zoomStatusBar.placeholder', "Select zoom level")
			});
			if (pick) {
				this._onDidChangeScale.fire({ scale: pick.scale });
			}
		}));

		this._entry.command = selectZoomLevelCommandId;
	}

	public show(owner: string, scale: Scale) {
		this._showOwner = owner;
		this._entry.text = this.zoomLabel(scale);
		this._entry.show();
	}

	public hide(owner: string) {
		if (owner === this._showOwner) {
			this._entry.hide();
			this._showOwner = undefined;
		}
	}

	private zoomLabel(scale: Scale): string {
		return scale === 'fit'
			? localize('zoomStatusBar.wholeImageLabel', "Whole Image")
			: `${Math.round(scale * 100)}%`;
	}
}
