/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {ICommand, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {EditorKbExpr, EditorAction2, CommonEditorRegistry, ServicesAccessor} from 'vs/editor/common/editorCommonExtensions';
import {BlockCommentCommand} from './blockCommentCommand';
import {LineCommentCommand, Type} from './lineCommentCommand';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';

abstract class CommentLineAction extends EditorAction2 {

	private _type: Type;

	constructor(id:string, label:string, alias:string, type:Type) {
		super(id, label, alias, true);
		this._type = type;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}

		var commands: ICommand[] = [];
		var selections = editor.getSelections();
		var opts = model.getOptions();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new LineCommentCommand(selections[i], opts.tabSize, this._type));
		}

		editor.executeCommands(this.id, commands);
	}

}

class ToggleCommentLineAction extends CommentLineAction {

	constructor() {
		super(
			'editor.action.commentLine',
			nls.localize('comment.line', "Toggle Line Comment"),
			'Toggle Line Comment',
			Type.Toggle
		);

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorKbExpr.TextFocus, EditorKbExpr.Writable),
			primary: KeyMod.CtrlCmd | KeyCode.US_SLASH
		};
	}
}

class AddLineCommentAction extends CommentLineAction {

	constructor() {
		super(
			'editor.action.addCommentLine',
			nls.localize('comment.line.add', "Add Line Comment"),
			'Add Line Comment',
			Type.ForceAdd
		);

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorKbExpr.TextFocus, EditorKbExpr.Writable),
			primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)
		};
	}
}

class RemoveLineCommentAction extends CommentLineAction {

	constructor() {
		super(
			'editor.action.removeCommentLine',
			nls.localize('comment.line.remove', "Remove Line Comment"),
			'Remove Line Comment',
			Type.ForceRemove
		);

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorKbExpr.TextFocus, EditorKbExpr.Writable),
			primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)
		};
	}
}

class BlockCommentAction extends EditorAction2 {

	constructor() {
		super(
			'editor.action.blockComment',
			nls.localize('comment.block', "Toggle Block Comment"),
			'Toggle Block Comment',
			true
		);

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorKbExpr.TextFocus, EditorKbExpr.Writable),
			primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A }
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		var commands: ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new BlockCommentCommand(selections[i]));
		}

		editor.executeCommands(this.id, commands);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction2(new ToggleCommentLineAction());
CommonEditorRegistry.registerEditorAction2(new AddLineCommentAction());
CommonEditorRegistry.registerEditorAction2(new RemoveLineCommentAction());
CommonEditorRegistry.registerEditorAction2(new BlockCommentAction());
