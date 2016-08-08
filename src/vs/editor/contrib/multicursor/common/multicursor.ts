/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {Handler, ICommonCodeEditor, EditorContextKeys, ISelection} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, HandlerEditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class InsertCursorAbove extends HandlerEditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorAbove',
			label: nls.localize('mutlicursor.insertAbove', "Add Cursor Above"),
			alias: 'Add Cursor Above',
			precondition: null,
			handlerId: Handler.AddCursorUp,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
				}
			}
		});
	}
}

class InsertCursorBelow extends HandlerEditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorBelow',
			label: nls.localize('mutlicursor.insertBelow', "Add Cursor Below"),
			alias: 'Add Cursor Below',
			precondition: null,
			handlerId: Handler.AddCursorDown,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
				}
			}
		});
	}
}

class InsertCursorAtEndOfEachLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			label: nls.localize('mutlicursor.insertAtEndOfEachLineSelected', "Create Multiple Cursors from Selected Lines"),
			alias: 'Create Multiple Cursors from Selected Lines',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_I
			}
		});
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let selection = editor.getSelection();
		if (selection.isEmpty()) {
			return;
		}

		let model = editor.getModel();
		let newSelections = new Array<ISelection>();
		let selectionStart = selection.getStartPosition();
		let selectionEnd = selection.getEndPosition();
		for (var i = selectionStart.lineNumber; i <= selectionEnd.lineNumber; i++) {
			if(i !== selectionEnd.lineNumber) {
				let currentLineMaxColumn = model.getLineMaxColumn(i);
				newSelections.push({
					selectionStartLineNumber: i,
					selectionStartColumn: currentLineMaxColumn,
					positionLineNumber: i,
					positionColumn: currentLineMaxColumn
				});
			} else if( selectionEnd.column > 0 ) {
				newSelections.push({
					selectionStartLineNumber: selectionEnd.lineNumber,
					selectionStartColumn: selectionEnd.column,
					positionLineNumber: selectionEnd.lineNumber,
					positionColumn: selectionEnd.column
				});
			}
		}
		editor.setSelections(newSelections);
	}
}


// register actions
CommonEditorRegistry.registerEditorAction(new InsertCursorAbove());
CommonEditorRegistry.registerEditorAction(new InsertCursorBelow());
CommonEditorRegistry.registerEditorAction(new InsertCursorAtEndOfEachLineSelected());
