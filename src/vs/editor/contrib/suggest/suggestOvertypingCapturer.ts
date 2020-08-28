/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { SuggestModel } from 'vs/editor/contrib/suggest/suggestModel';

export class OvertypingCapturer implements IDisposable {

	private readonly _maxSelectionLength = 51200;
	private readonly _disposables = new DisposableStore();

	private _lastOvertyped: string[];
	private _empty: boolean;

	constructor(editor: ICodeEditor, suggestModel: SuggestModel) {
		this._lastOvertyped = new Array<string>(0);
		this._empty = true;

		this._disposables.add(editor.onWillType(text => {
			if (!this._empty) {
				return;
			}
			const selections = editor.getSelections();
			if (!selections) {
				return;
			}

			const selectionsLength = selections.length;

			// Check if it will overtype any selections
			let willOvertype = false;
			for (let i = 0; i < selectionsLength; i++) {
				if (!selections[i].isEmpty()) {
					willOvertype = true;
					break;
				}
			}
			if (!willOvertype) {
				return;
			}

			const model = editor.getModel();
			if (!model) {
				return;
			}

			// Check for overtyping capturer restrictions
			for (let i = 0; i < selectionsLength; i++) {
				if (model.getValueLengthInRange(selections[i]) > this._maxSelectionLength) {
					return;
				}
			}

			this._lastOvertyped = new Array<string>(selectionsLength);
			for (let i = 0; i < selectionsLength; i++) {
				this._lastOvertyped[i] = model.getValueInRange(selections[i]);
			}
			this._empty = false;
		}));

		this._disposables.add(suggestModel.onDidCancel(e => {
			if (!this._empty) {
				this._empty = true;
			}
		}));
	}

	getLastOvertypedText(idx: number): string | undefined {
		if (!this._empty && idx >= 0 && idx < this._lastOvertyped.length) {
			return this._lastOvertyped[idx];
		}
		return undefined;
	}

	dispose() {
		this._disposables.dispose();
	}
}
