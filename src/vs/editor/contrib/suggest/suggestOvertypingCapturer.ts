/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { SuggestModel } from 'vs/editor/contrib/suggest/suggestModel';

export class OvertypingCapturer implements IDisposable {

	private static readonly _maxSelectionLength = 51200;
	private readonly _disposables = new DisposableStore();

	private _lastOvertyped: { value: string; multiline: boolean }[] = [];
	private _empty: boolean = true;

	constructor(editor: ICodeEditor, suggestModel: SuggestModel) {

		this._disposables.add(editor.onWillType(() => {
			if (!this._empty) {
				return;
			}
			if (!editor.hasModel()) {
				return;
			}

			const selections = editor.getSelections();
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

			this._lastOvertyped = [];
			const model = editor.getModel();
			for (let i = 0; i < selectionsLength; i++) {
				const selection = selections[i];
				// Check for overtyping capturer restrictions
				if (model.getValueLengthInRange(selection) > OvertypingCapturer._maxSelectionLength) {
					return;
				}
				this._lastOvertyped[i] = { value: model.getValueInRange(selection), multiline: selection.startLineNumber !== selection.endLineNumber };
			}
			this._empty = false;
		}));

		this._disposables.add(suggestModel.onDidCancel(e => {
			if (!this._empty && !e.retrigger) {
				this._empty = true;
			}
		}));
	}

	getLastOvertypedInfo(idx: number): { value: string; multiline: boolean } | undefined {
		if (!this._empty && idx >= 0 && idx < this._lastOvertyped.length) {
			return this._lastOvertyped[idx];
		}
		return undefined;
	}

	dispose() {
		this._disposables.dispose();
	}
}
