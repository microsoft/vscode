/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import * as nls from '../../../../nls.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

class CursorState {
	readonly selections: readonly Selection[];

	constructor(selections: readonly Selection[]) {
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

class StackElement {
	constructor(
		public readonly cursorState: CursorState,
		public readonly scrollTop: number,
		public readonly scrollLeft: number
	) { }
}

export class CursorUndoRedoController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.cursorUndoRedoController';

	public static get(editor: ICodeEditor): CursorUndoRedoController | null {
		return editor.getContribution<CursorUndoRedoController>(CursorUndoRedoController.ID);
	}

	private readonly _editor: ICodeEditor;
	private _isCursorUndoRedo: boolean;

	private _undoStack: StackElement[];
	private _redoStack: StackElement[];

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._isCursorUndoRedo = false;

		this._undoStack = [];
		this._redoStack = [];

		this._register(editor.onDidChangeModel((e) => {
			this._undoStack = [];
			this._redoStack = [];
		}));
		this._register(editor.onDidChangeModelContent((e) => {
			this._undoStack = [];
			this._redoStack = [];
		}));
		this._register(editor.onDidChangeCursorSelection((e) => {
			if (this._isCursorUndoRedo) {
				return;
			}
			if (!e.oldSelections) {
				return;
			}
			if (e.oldModelVersionId !== e.modelVersionId) {
				return;
			}
			const prevState = new CursorState(e.oldSelections);
			const isEqualToLastUndoStack = (this._undoStack.length > 0 && this._undoStack[this._undoStack.length - 1].cursorState.equals(prevState));
			if (!isEqualToLastUndoStack) {
				this._undoStack.push(new StackElement(prevState, editor.getScrollTop(), editor.getScrollLeft()));
				this._redoStack = [];
				if (this._undoStack.length > 50) {
					// keep the cursor undo stack bounded
					this._undoStack.shift();
				}
			}
		}));
	}

	public cursorUndo(): void {
		if (!this._editor.hasModel() || this._undoStack.length === 0) {
			return;
		}

		this._redoStack.push(new StackElement(new CursorState(this._editor.getSelections()), this._editor.getScrollTop(), this._editor.getScrollLeft()));
		this._applyState(this._undoStack.pop()!);
	}

	public cursorRedo(): void {
		if (!this._editor.hasModel() || this._redoStack.length === 0) {
			return;
		}

		this._undoStack.push(new StackElement(new CursorState(this._editor.getSelections()), this._editor.getScrollTop(), this._editor.getScrollLeft()));
		this._applyState(this._redoStack.pop()!);
	}

	private _applyState(stackElement: StackElement): void {
		this._isCursorUndoRedo = true;
		this._editor.setSelections(stackElement.cursorState.selections);
		this._editor.setScrollPosition({
			scrollTop: stackElement.scrollTop,
			scrollLeft: stackElement.scrollLeft
		});
		this._isCursorUndoRedo = false;
	}
}

export class CursorUndo extends EditorAction {
	constructor() {
		super({
			id: 'cursorUndo',
			label: nls.localize2('cursor.undo', "Cursor Undo"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyU,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
		CursorUndoRedoController.get(editor)?.cursorUndo();
	}
}

export class CursorRedo extends EditorAction {
	constructor() {
		super({
			id: 'cursorRedo',
			label: nls.localize2('cursor.redo', "Cursor Redo"),
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
		CursorUndoRedoController.get(editor)?.cursorRedo();
	}
}

registerEditorContribution(CursorUndoRedoController.ID, CursorUndoRedoController, EditorContributionInstantiation.Eager); // eager because it needs to listen to record cursor state ASAP
registerEditorAction(CursorUndo);
registerEditorAction(CursorRedo);
