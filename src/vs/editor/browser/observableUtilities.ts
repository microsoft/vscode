/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { autorunOpts, derivedOpts, IObservable, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { IModelDeltaDecoration } from 'vs/editor/common/model';

/**
 * Returns a facade for the code editor that provides observables for various states/events.
*/
export function obsCodeEditor(editor: ICodeEditor): ObservableCodeEditor {
	return ObservableCodeEditor.get(editor);
}

class ObservableCodeEditor {
	private static _map = new Map<ICodeEditor, ObservableCodeEditor>();

	/**
	 * Make sure that editor is not disposed yet!
	*/
	public static get(editor: ICodeEditor): ObservableCodeEditor {
		let result = ObservableCodeEditor._map.get(editor);
		if (!result) {
			result = new ObservableCodeEditor(editor);
			ObservableCodeEditor._map.set(editor, result);
			const d = editor.onDidDispose(() => {
				ObservableCodeEditor._map.delete(editor);
				d.dispose();
			});
		}
		return result;
	}

	private constructor(public readonly editor: ICodeEditor) {
	}

	public readonly model = observableFromEvent(this.editor.onDidChangeModel, () => this.editor.getModel());
	public readonly value = observableFromEvent(this.editor.onDidChangeModelContent, () => this.editor.getValue());
	public readonly valueIsEmpty = observableFromEvent(this.editor.onDidChangeModelContent, () => this.editor.getModel()?.getValueLength() === 0);
	public readonly selections = observableFromEvent(this.editor.onDidChangeCursorSelection, () => this.editor.getSelections());
	public readonly cursorPosition = derivedOpts({ owner: this, equalsFn: Position.equals }, reader => this.selections.read(reader)?.[0]?.getPosition() ?? null);
	public readonly isFocused = observableFromEvent(e => {
		const d1 = this.editor.onDidFocusEditorWidget(e);
		const d2 = this.editor.onDidBlurEditorWidget(e);
		return {
			dispose() {
				d1.dispose();
				d2.dispose();
			}
		};
	}, () => this.editor.hasWidgetFocus());

	public setDecorations(decorations: IObservable<IModelDeltaDecoration[]>): IDisposable {
		const d = new DisposableStore();
		const decorationsCollection = this.editor.createDecorationsCollection();
		d.add(autorunOpts({ owner: this, debugName: () => `Apply decorations from ${decorations.debugName}` }, reader => {
			const d = decorations.read(reader);
			decorationsCollection.set(d);
		}));
		d.add({
			dispose: () => {
				decorationsCollection.clear();
			}
		});
		return d;
	}
}
