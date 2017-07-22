/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { editorCommand, ServicesAccessor, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';

class CursorState {
	readonly selections: Selection[];

	constructor(selections: Selection[]) {
		this.selections = selections;
	}

	public equals(other: CursorState): boolean {
		const thisLen = this.selections.length;
		const otherLen = other.selections.length;
		if (thisLen !== otherLen) {
			return false;
		}
		for (let i = 0; i < thisLen; i++) {
			if (!this.selections[i].equalsSelection(other.selections[i])) {
				return false;
			}
		}
		return true;
	}
}

@editorContribution
export class CursorUndoController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.cursorUndoController';

	public static get(editor: ICommonCodeEditor): CursorUndoController {
		return editor.getContribution<CursorUndoController>(CursorUndoController.ID);
	}

	private readonly _editor: ICodeEditor;
	private _isCursorUndo: boolean;

	private _undoStack: CursorState[];
	private _prevState: CursorState;

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._isCursorUndo = false;

		this._undoStack = [];
		this._prevState = this._readState();

		this._register(editor.onDidChangeModel((e) => {
			this._undoStack = [];
			this._prevState = null;
		}));
		this._register(editor.onDidChangeModelContent((e) => {
			this._undoStack = [];
			this._prevState = null;
		}));
		this._register(editor.onDidChangeCursorSelection((e) => {

			if (!this._isCursorUndo && this._prevState) {
				this._undoStack.push(this._prevState);
				if (this._undoStack.length > 50) {
					// keep the cursor undo stack bounded
					this._undoStack = this._undoStack.splice(0, this._undoStack.length - 50);
				}
			}

			this._prevState = this._readState();
		}));
	}

	private _readState(): CursorState {
		if (!this._editor.getModel()) {
			// no model => no state
			return null;
		}

		return new CursorState(this._editor.getSelections());
	}

	public getId(): string {
		return CursorUndoController.ID;
	}

	public cursorUndo(): void {
		const currState = new CursorState(this._editor.getSelections());

		while (this._undoStack.length > 0) {
			const prevState = this._undoStack.pop();

			if (!prevState.equals(currState)) {
				this._isCursorUndo = true;
				this._editor.setSelections(prevState.selections);
				this._isCursorUndo = false;
				return;
			}
		}
	}
}

@editorCommand
export class CursorUndo extends EditorCommand {
	constructor() {
		super({
			id: 'cursorUndo',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_U
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		CursorUndoController.get(editor).cursorUndo();
	}
}
