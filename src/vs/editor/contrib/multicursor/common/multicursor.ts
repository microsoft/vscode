/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Selection } from 'vs/editor/common/core/selection';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { CursorMoveCommands } from 'vs/editor/common/controller/cursorMoveCommands';
import { CursorState, RevealTarget } from 'vs/editor/common/controller/cursorCommon';

@editorAction
export class InsertCursorAbove extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorAbove',
			label: nls.localize('mutlicursor.insertAbove', "Add Cursor Above"),
			alias: 'Add Cursor Above',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorState.ensureInEditableRange(
				context,
				CursorMoveCommands.addCursorUp(context, cursors.getAll())
			)
		);
		cursors.reveal(true, RevealTarget.TopMost, ScrollType.Smooth);
	}
}

@editorAction
export class InsertCursorBelow extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorBelow',
			label: nls.localize('mutlicursor.insertBelow', "Add Cursor Below"),
			alias: 'Add Cursor Below',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorState.ensureInEditableRange(
				context,
				CursorMoveCommands.addCursorDown(context, cursors.getAll())
			)
		);
		cursors.reveal(true, RevealTarget.BottomMost, ScrollType.Smooth);
	}
}

@editorAction
class InsertCursorAtEndOfEachLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			label: nls.localize('mutlicursor.insertAtEndOfEachLineSelected', "Add Cursors to Line Ends"),
			alias: 'Add Cursors to Line Ends',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_I
			}
		});
	}

	private getCursorsForSelection(selection: Selection, editor: ICommonCodeEditor): Selection[] {
		if (selection.isEmpty()) {
			return [];
		}

		let model = editor.getModel();
		let newSelections: Selection[] = [];
		for (let i = selection.startLineNumber; i < selection.endLineNumber; i++) {
			let currentLineMaxColumn = model.getLineMaxColumn(i);
			newSelections.push(new Selection(i, currentLineMaxColumn, i, currentLineMaxColumn));
		}
		if (selection.endColumn > 1) {
			newSelections.push(new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn));
		}

		return newSelections;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let selections = editor.getSelections();
		let newSelections = selections
			.map((selection) => this.getCursorsForSelection(selection, editor))
			.reduce((prev, curr) => { return prev.concat(curr); });

		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
	}
}
