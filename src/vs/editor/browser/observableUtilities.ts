/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derivedOpts, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';

/**
 * Returns a facade for the code editor that provides observables for various states/events.
*/
export function codeEditorObs(editor: ICodeEditor): CodeEditorObservables {
	return CodeEditorObservables.get(editor);
}

class CodeEditorObservables {
	private static _map = new Map<ICodeEditor, CodeEditorObservables>();

	/**
	 * Make sure that editor is not disposed yet!
	*/
	public static get(editor: ICodeEditor): CodeEditorObservables {
		let result = CodeEditorObservables._map.get(editor);
		if (!result) {
			result = new CodeEditorObservables(editor);
			CodeEditorObservables._map.set(editor, result);
			const d = editor.onDidDispose(() => {
				CodeEditorObservables._map.delete(editor);
				d.dispose();
			});
		}
		return result;
	}

	private constructor(private readonly _editor: ICodeEditor) {
	}

	public readonly model = observableFromEvent(this._editor.onDidChangeModel, () => this._editor.getModel());
	public readonly value = observableFromEvent(this._editor.onDidChangeModelContent, () => this._editor.getValue());
	public readonly valueIsEmpty = observableFromEvent(this._editor.onDidChangeModelContent, () => this._editor.getModel()?.getValueLength() === 0);
	public readonly selections = observableFromEvent(this._editor.onDidChangeCursorSelection, () => this._editor.getSelections());
	public readonly cursorPosition = derivedOpts({ owner: this, equalsFn: Position.equals }, reader => this.selections.read(reader)?.[0]?.getPosition() ?? null);
	public readonly isFocused = observableFromEvent(e => {
		const d1 = this._editor.onDidFocusEditorWidget(e);
		const d2 = this._editor.onDidBlurEditorWidget(e);
		return {
			dispose() {
				d1.dispose();
				d2.dispose();
			}
		};
	}, () => this._editor.hasWidgetFocus());
}
