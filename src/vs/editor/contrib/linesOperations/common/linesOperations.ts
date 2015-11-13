/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, HandlerEditorAction, Behaviour} from 'vs/editor/common/editorAction';
import CopyLinesCommand = require('./copyLinesCommand');
import DeleteLinesCommand = require('./deleteLinesCommand');
import MoveLinesCommand = require('./moveLinesCommand');
import EditorCommon = require('vs/editor/common/editorCommon');
import {TrimTrailingWhitespaceCommand} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

// copy lines

class CopyLinesAction extends EditorAction {

	private down:boolean;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, down:boolean) {
		super(descriptor, editor);
		this.down = down;
	}

	public run():TPromise<boolean> {

		var commands:EditorCommon.ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new CopyLinesCommand.CopyLinesCommand(selections[i], this.down));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class CopyLinesUpAction extends CopyLinesAction {
	static ID = 'editor.action.copyLinesUpAction';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, false);
	}

}

class CopyLinesDownAction extends CopyLinesAction {
	static ID = 'editor.action.copyLinesDownAction';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, true);
	}
}

// move lines

class MoveLinesAction extends EditorAction {

	private down:boolean;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, down:boolean) {
		super(descriptor, editor);
		this.down = down;
	}

	public run():TPromise<boolean> {

		var commands:EditorCommon.ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveLinesCommand.MoveLinesCommand(selections[i], this.down));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class MoveLinesUpAction extends MoveLinesAction {
	static ID = 'editor.action.moveLinesUpAction';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, false);
	}
}

class MoveLinesDownAction extends MoveLinesAction {
	static ID = 'editor.action.moveLinesDownAction';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, true);
	}
}

class TrimTrailingWhitespaceAction extends EditorAction {

	static ID = 'editor.action.trimTrailingWhitespace';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
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

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor) {
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

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public run():TPromise<boolean> {

		var ops = this._getLinesToRemove();

		// Finally, construct the delete lines commands
		var commands:EditorCommon.ICommand[] = ops.map((op) => {
			return new DeleteLinesCommand.DeleteLinesCommand(op.startLineNumber, op.endLineNumber, op.positionColumn);
		});

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class IndentLinesAction extends HandlerEditorAction {
	static ID = 'editor.action.indentLines';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.Indent);
	}
}

class OutdentLinesAction extends HandlerEditorAction {
	static ID = 'editor.action.outdentLines';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.Outdent);
	}
}

class InsertLineBeforeAction extends HandlerEditorAction {
	static ID = 'editor.action.insertLineBefore';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.LineInsertBefore);
	}
}

class InsertLineAfterAction extends HandlerEditorAction {
	static ID = 'editor.action.insertLineAfter';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, EditorCommon.Handler.LineInsertAfter);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DeleteLinesAction, DeleteLinesAction.ID, nls.localize('lines.delete', "Delete Line"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_K
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(TrimTrailingWhitespaceAction, TrimTrailingWhitespaceAction.ID, nls.localize('lines.trimTrailingWhitespace', "Trim Trailing Whitespace"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_X
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveLinesDownAction, MoveLinesDownAction.ID, nls.localize('lines.moveDown', "Move Line Down"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.DownArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveLinesUpAction, MoveLinesUpAction.ID, nls.localize('lines.moveUp', "Move Line Up"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.UpArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
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


