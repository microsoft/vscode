/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {SortLinesCommand} from 'vs/editor/contrib/linesOperations/common/sortLinesCommand';
import {TrimTrailingWhitespaceCommand} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {EditorAction, HandlerEditorAction} from 'vs/editor/common/editorAction';
import {Handler, ICommand, ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {CopyLinesCommand} from './copyLinesCommand';
import {DeleteLinesCommand} from './deleteLinesCommand';
import {MoveLinesCommand} from './moveLinesCommand';

// copy lines

class CopyLinesAction extends EditorAction {

	private down:boolean;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, down:boolean) {
		super(descriptor, editor);
		this.down = down;
	}

	public run():TPromise<boolean> {

		var commands:ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new CopyLinesCommand(selections[i], this.down));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class CopyLinesUpAction extends CopyLinesAction {
	static ID = 'editor.action.copyLinesUpAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, false);
	}

}

class CopyLinesDownAction extends CopyLinesAction {
	static ID = 'editor.action.copyLinesDownAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, true);
	}
}

// move lines

class MoveLinesAction extends EditorAction {

	private down:boolean;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, down:boolean) {
		super(descriptor, editor);
		this.down = down;
	}

	public run():TPromise<boolean> {

		var commands:ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveLinesCommand(selections[i], this.down));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class MoveLinesUpAction extends MoveLinesAction {
	static ID = 'editor.action.moveLinesUpAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, false);
	}
}

class MoveLinesDownAction extends MoveLinesAction {
	static ID = 'editor.action.moveLinesDownAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, true);
	}
}

class SortLinesAction extends EditorAction {
	private descending:boolean;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, descending:boolean) {
		super(descriptor, editor);
		this.descending = descending;
	}

	public run():TPromise<boolean> {

		var command = new SortLinesCommand(this.editor.getSelection(), this.descending);

		this.editor.executeCommands(this.id, [command]);

		return TPromise.as(true);
	}
}

class SortLinesAscendingAction extends SortLinesAction {
	static ID ='editor.action.sortLinesAscending';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, false);
	}
}

class SortLinesDescendingAction extends SortLinesAction {
	static ID ='editor.action.sortLinesDescending';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, true);
	}
}

export class TrimTrailingWhitespaceAction extends EditorAction {

	static ID = 'editor.action.trimTrailingWhitespace';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor);
	}

	public run():TPromise<boolean> {

		var command = new TrimTrailingWhitespaceCommand(this.editor.getSelection());

		this.editor.executeCommands(this.id, [command]);

		return TPromise.as(true);
	}
}

// delete lines

interface IDeleteLinesOperation {
	startLineNumber:number;
	endLineNumber:number;
	positionColumn:number;
}

class AbstractRemoveLinesAction extends EditorAction {

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor);
	}

	_getLinesToRemove(): IDeleteLinesOperation[] {
		// Construct delete operations
		var operations:IDeleteLinesOperation[] = this.editor.getSelections().map((s) => {

			var endLineNumber = s.endLineNumber;
			if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
				endLineNumber -= 1;
			}

			return {
				startLineNumber: s.startLineNumber,
				endLineNumber: endLineNumber,
				positionColumn: s.positionColumn
			};
		});

		// Sort delete operations
		operations.sort((a, b) => {
			return a.startLineNumber - b.startLineNumber;
		});

		// Merge delete operations on consecutive lines
		var mergedOperations:IDeleteLinesOperation[] = [];
		var previousOperation = operations[0];
		for (var i = 1; i < operations.length; i++) {
			if (previousOperation.endLineNumber + 1 === operations[i].startLineNumber) {
				// Merge current operations into the previous one
				previousOperation.endLineNumber = operations[i].endLineNumber;
			} else {
				// Push previous operation
				mergedOperations.push(previousOperation);
				previousOperation = operations[i];
			}
		}
		// Push the last operation
		mergedOperations.push(previousOperation);

		return mergedOperations;
	}

}

class DeleteLinesAction extends AbstractRemoveLinesAction {

	static ID = 'editor.action.deleteLines';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor);
	}

	public run():TPromise<boolean> {

		var ops = this._getLinesToRemove();

		// Finally, construct the delete lines commands
		var commands:ICommand[] = ops.map((op) => {
			return new DeleteLinesCommand(op.startLineNumber, op.endLineNumber, op.positionColumn);
		});

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class IndentLinesAction extends HandlerEditorAction {
	static ID = 'editor.action.indentLines';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Handler.Indent);
	}
}

class OutdentLinesAction extends HandlerEditorAction {
	static ID = 'editor.action.outdentLines';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Handler.Outdent);
	}
}

class InsertLineBeforeAction extends HandlerEditorAction {
	static ID = 'editor.action.insertLineBefore';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Handler.LineInsertBefore);
	}
}

class InsertLineAfterAction extends HandlerEditorAction {
	static ID = 'editor.action.insertLineAfter';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Handler.LineInsertAfter);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DeleteLinesAction, DeleteLinesAction.ID, nls.localize('lines.delete', "Delete Line"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_K
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SortLinesAscendingAction, SortLinesAscendingAction.ID, nls.localize('lines.sortAscending', "Sort Lines Ascending"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_2
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SortLinesDescendingAction, SortLinesDescendingAction.ID, nls.localize('lines.sortDescending', "Sort Lines Descending"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_3
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(TrimTrailingWhitespaceAction, TrimTrailingWhitespaceAction.ID, nls.localize('lines.trimTrailingWhitespace', "Trim Trailing Whitespace"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_X
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveLinesDownAction, MoveLinesDownAction.ID, nls.localize('lines.moveDown', "Move Line Down"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.DownArrow,
	linux: { primary: KeyMod.Alt | KeyCode.DownArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveLinesUpAction, MoveLinesUpAction.ID, nls.localize('lines.moveUp', "Move Line Up"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.UpArrow,
	linux: { primary: KeyMod.Alt | KeyCode.UpArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(CopyLinesDownAction, CopyLinesDownAction.ID, nls.localize('lines.copyDown', "Copy Line Down"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(CopyLinesUpAction, CopyLinesUpAction.ID, nls.localize('lines.copyUp', "Copy Line Up"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(IndentLinesAction, IndentLinesAction.ID, nls.localize('lines.indent', "Indent Line"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(OutdentLinesAction, OutdentLinesAction.ID, nls.localize('lines.outdent', "Outdent Line"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.US_OPEN_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(InsertLineBeforeAction, InsertLineBeforeAction.ID, nls.localize('lines.insertBefore', "Insert Line Above"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(InsertLineAfterAction, InsertLineAfterAction.ID, nls.localize('lines.insertAfter', "Insert Line Below"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.Enter
}));
