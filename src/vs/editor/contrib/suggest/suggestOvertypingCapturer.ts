/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { SuggestWidget } from './suggestWidget';

export class OvertypingCapturer implements IDisposable {

	private readonly _maxSelectionLength = 1000000;
	private readonly _disposables = new DisposableStore();
	private readonly _editor: ICodeEditor;

	private _lastOvertyped: string[];
	private _holdCurrent: boolean;

	constructor(editor: ICodeEditor, widget: SuggestWidget) {
		this._editor = editor;
		this._lastOvertyped = new Array<string>(0);
		this._holdCurrent = false;

		this._disposables.add(this._editor.onWillType(text => {
			if (this._holdCurrent) {
				return;
			}
			const selections = this._editor.getSelections();
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

			const model = this._editor.getModel();
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
		}));

		this._disposables.add(widget.onDidShow(() => {
			this._holdCurrent = true;
		}));

		this._disposables.add(widget.onDidHide(() => {
			if (this._lastOvertyped.length > 0) {
				this._lastOvertyped = new Array<string>(0);
			}
			this._holdCurrent = false;
		}));
	}

	getLastOvertypedText(idx: number): string | undefined {
		if (idx < this._lastOvertyped.length && this._lastOvertyped[idx].length > 0) {
			return this._lastOvertyped[idx];
		}
		return undefined;
	}

	dispose() {
		this._disposables.dispose();
	}
}
