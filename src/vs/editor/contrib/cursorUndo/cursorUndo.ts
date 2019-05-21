/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

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

export class CursorUndoController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.cursorUndoController';

	public static get(editor: ICodeEditor): CursorUndoController {
		return editor.getContribution<CursorUndoController>(CursorUndoController.ID);
	}

	private readonly _editor: ICodeEditor;
	private _isCursorUndo: boolean;

	private _undoStack: CursorState[];
	private _prevState: CursorState | null;

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
					this._undoStack.shift();
				}
			}

			this._prevState = this._readState();
		}));
	}

	private _readState(): CursorState | null {
		if (!this._editor.hasModel()) {
			// no model => no state
			return null;
		}

		return new CursorState(this._editor.getSelections());
	}

	public getId(): string {
		return CursorUndoController.ID;
	}

	public cursorUndo(): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const currState = new CursorState(this._editor.getSelections());

		while (this._undoStack.length > 0) {
			const prevState = this._undoStack.pop()!;

			if (!prevState.equals(currState)) {
				this._isCursorUndo = true;
				this._editor.setSelections(prevState.selections);
				this._editor.revealRangeInCenterIfOutsideViewport(prevState.selections[0], ScrollType.Smooth);
				this._isCursorUndo = false;
				return;
			}
		}
	}
}

export class CursorUndo extends EditorAction {
	constructor() {
		super({
			id: 'cursorUndo',
			label: nls.localize('cursor.undo', "Soft Undo"),
			alias: 'Soft Undo',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_U,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		CursorUndoController.get(editor).cursorUndo();
	}
}

registerEditorContribution(CursorUndoController);
registerEditorAction(CursorUndo);
