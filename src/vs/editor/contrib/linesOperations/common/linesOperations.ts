/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {SortLinesCommand} from 'vs/editor/contrib/linesOperations/common/sortLinesCommand';
import {TrimTrailingWhitespaceCommand} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {EditorContextKeys, Handler, ICommand, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, HandlerEditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CopyLinesCommand} from './copyLinesCommand';
import {DeleteLinesCommand} from './deleteLinesCommand';
import {MoveLinesCommand} from './moveLinesCommand';

// copy lines

abstract class AbstractCopyLinesAction extends EditorAction {

	private down:boolean;

	constructor(id:string, label:string, alias:string, down:boolean) {
		super(id, label, alias, true);
		this.down = down;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		var commands:ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new CopyLinesCommand(selections[i], this.down));
		}

		editor.executeCommands(this.id, commands);
	}
}

class CopyLinesUpAction extends AbstractCopyLinesAction {
	constructor() {
		super(
			'editor.action.copyLinesUpAction',
			nls.localize('lines.copyUp', "Copy Line Up"),
			'Copy Line Up',
			false
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow }
		};
	}
}

class CopyLinesDownAction extends AbstractCopyLinesAction {
	constructor() {
		super(
			'editor.action.copyLinesDownAction',
			nls.localize('lines.copyDown', "Copy Line Down"),
			'Copy Line Down',
			true
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow }
		};
	}
}

// move lines

abstract class AbstractMoveLinesAction extends EditorAction {

	private down:boolean;

	constructor(id:string, label:string, alias:string, down:boolean) {
		super(id, label, alias, true);
		this.down = down;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		var commands:ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveLinesCommand(selections[i], this.down));
		}

		editor.executeCommands(this.id, commands);
	}
}

class MoveLinesUpAction extends AbstractMoveLinesAction {
	constructor() {
		super(
			'editor.action.moveLinesUpAction',
			nls.localize('lines.moveUp', "Move Line Up"),
			'Move Line Up',
			false
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.Alt | KeyCode.UpArrow,
			linux: { primary: KeyMod.Alt | KeyCode.UpArrow }
		};
	}
}

class MoveLinesDownAction extends AbstractMoveLinesAction {
	constructor() {
		super(
			'editor.action.moveLinesDownAction',
			nls.localize('lines.moveDown', "Move Line Down"),
			'Move Line Down',
			true
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.Alt | KeyCode.DownArrow,
			linux: { primary: KeyMod.Alt | KeyCode.DownArrow }
		};
	}
}

abstract class AbstractSortLinesAction extends EditorAction {
	private descending:boolean;

	constructor(id:string, label:string, alias:string, descending:boolean) {
		super(id, label, alias, true);
		this.descending = descending;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		if (!SortLinesCommand.canRun(editor.getModel(), editor.getSelection(), this.descending)) {
			return;
		}

		var command = new SortLinesCommand(editor.getSelection(), this.descending);

		editor.executeCommands(this.id, [command]);
	}
}

class SortLinesAscendingAction extends AbstractSortLinesAction {
	constructor() {
		super(
			'editor.action.sortLinesAscending',
			nls.localize('lines.sortAscending', "Sort Lines Ascending"),
			'Sort Lines Ascending',
			false
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_2
		};
	}
}

class SortLinesDescendingAction extends AbstractSortLinesAction {
	constructor() {
		super(
			'editor.action.sortLinesDescending',
			nls.localize('lines.sortDescending', "Sort Lines Descending"),
			'Sort Lines Descending',
			true
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_3
		};
	}
}

export class TrimTrailingWhitespaceAction extends EditorAction {

	static ID = 'editor.action.trimTrailingWhitespace';

	constructor() {
		super(
			TrimTrailingWhitespaceAction.ID,
			nls.localize('lines.trimTrailingWhitespace', "Trim Trailing Whitespace"),
			'Trim Trailing Whitespace',
			true
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_X)
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		var command = new TrimTrailingWhitespaceCommand(editor.getSelection());

		editor.executeCommands(this.id, [command]);
	}
}

// delete lines

interface IDeleteLinesOperation {
	startLineNumber:number;
	endLineNumber:number;
	positionColumn:number;
}

abstract class AbstractRemoveLinesAction extends EditorAction {

	constructor(id:string, label:string, alias:string) {
		super(id, label, alias, true);
	}

	_getLinesToRemove(editor:ICommonCodeEditor): IDeleteLinesOperation[] {
		// Construct delete operations
		var operations:IDeleteLinesOperation[] = editor.getSelections().map((s) => {

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

	constructor() {
		super(
			'editor.action.deleteLines',
			nls.localize('lines.delete', "Delete Line"),
			'Delete Line'
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_K
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		var ops = this._getLinesToRemove(editor);

		// Finally, construct the delete lines commands
		var commands:ICommand[] = ops.map((op) => {
			return new DeleteLinesCommand(op.startLineNumber, op.endLineNumber, op.positionColumn);
		});

		editor.executeCommands(this.id, commands);
	}
}

class IndentLinesAction extends HandlerEditorAction {
	constructor() {
		super(
			'editor.action.indentLines',
			nls.localize('lines.indent', "Indent Line"),
			'Indent Line',
			true,
			Handler.Indent
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET
		};
	}
}

class OutdentLinesAction extends HandlerEditorAction {
	constructor() {
		super(
			'editor.action.outdentLines',
			nls.localize('lines.outdent', "Outdent Line"),
			'Outdent Line',
			true,
			Handler.Outdent
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.US_OPEN_SQUARE_BRACKET
		};
	}
}

class InsertLineBeforeAction extends HandlerEditorAction {
	constructor() {
		super(
			'editor.action.insertLineBefore',
			nls.localize('lines.insertBefore', "Insert Line Above"),
			'Insert Line Above',
			true,
			Handler.LineInsertBefore
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter
		};
	}
}

class InsertLineAfterAction extends HandlerEditorAction {
	constructor() {
		super(
			'editor.action.insertLineAfter',
			nls.localize('lines.insertAfter', "Insert Line Below"),
			'Insert Line Below',
			true,
			Handler.LineInsertAfter
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.Enter
		};
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new DeleteLinesAction());
CommonEditorRegistry.registerEditorAction(new SortLinesAscendingAction());
CommonEditorRegistry.registerEditorAction(new SortLinesDescendingAction());
CommonEditorRegistry.registerEditorAction(new TrimTrailingWhitespaceAction());
CommonEditorRegistry.registerEditorAction(new MoveLinesDownAction());
CommonEditorRegistry.registerEditorAction(new MoveLinesUpAction());
CommonEditorRegistry.registerEditorAction(new CopyLinesDownAction());
CommonEditorRegistry.registerEditorAction(new CopyLinesUpAction());
CommonEditorRegistry.registerEditorAction(new IndentLinesAction());
CommonEditorRegistry.registerEditorAction(new OutdentLinesAction());
CommonEditorRegistry.registerEditorAction(new InsertLineBeforeAction());
CommonEditorRegistry.registerEditorAction(new InsertLineAfterAction());
