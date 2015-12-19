/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction, HandlerEditorAction} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class InsertCursorAbove extends HandlerEditorAction {
	static ID = 'editor.action.insertCursorAbove';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.AddCursorUp);
	}
}

class InsertCursorBelow extends HandlerEditorAction {
	static ID = 'editor.action.insertCursorBelow';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.AddCursorDown);
	}
}

class InsertCursorsFromLineSelection extends EditorAction {
	static ID = 'editor.action.insertCursorAtEndOfEachLineSelected';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public run(): TPromise<boolean> {
		let sel = this.editor.getSelection();
		if(!sel.isEmpty()) {
			let model = this.editor.getModel();
			let sels = new Array<EditorCommon.ISelection>();
			let sStart = sel.getStartPosition();
			let sEnd = sel.getEndPosition();
			for (var i = sStart.lineNumber; i <= sEnd.lineNumber; i++) {
				if(i !== sEnd.lineNumber) {
					let lEnd = model.getLineMaxColumn(i);
					sels.push({
						selectionStartLineNumber: i,
						selectionStartColumn: lEnd,
						positionLineNumber: i,
						positionColumn: lEnd
					});
				} else if( sEnd.column > 0 ) {
					sels.push({
						selectionStartLineNumber: sEnd.lineNumber,
						selectionStartColumn: sEnd.column,
						positionLineNumber: sEnd.lineNumber,
						positionColumn: sEnd.column
					});
				}
			}
			this.editor.setSelections(sels);
		}
		return TPromise.as(true);
	}
}


// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(InsertCursorAbove, InsertCursorAbove.ID, nls.localize('mutlicursor.insertAbove', "Add Cursor Above"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
	linux: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
	}
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(InsertCursorBelow, InsertCursorBelow.ID, nls.localize('mutlicursor.insertBelow', "Add Cursor Below"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
	linux: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
	}
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(InsertCursorsFromLineSelection, InsertCursorsFromLineSelection.ID, nls.localize('mutlicursor.insertAtEndOfEachLineSelected', "Create multiple cursors from selected lines"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I
}));
