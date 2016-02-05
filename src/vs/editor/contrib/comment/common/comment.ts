/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import LineCommentCommand = require('./lineCommentCommand');
import BlockCommentCommand = require('./blockCommentCommand');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class CommentLineAction extends EditorAction {

	static ID = 'editor.action.commentLine';

	private _type: LineCommentCommand.Type;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, type: LineCommentCommand.Type, @INullService ns) {
		super(descriptor, editor);
		this._type = type;
	}

	public run(): TPromise<void> {

		var commands: EditorCommon.ICommand[] = [];
		var selections = this.editor.getSelections();
		var opts = this.editor.getIndentationOptions();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new LineCommentCommand.LineCommentCommand(selections[i], opts.tabSize, this._type));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(null);
	}
}

class ToggleCommentLineAction extends CommentLineAction {

	static ID = 'editor.action.commentLine';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, LineCommentCommand.Type.Toggle, ns);
	}
}

class AddLineCommentAction extends CommentLineAction {

	static ID = 'editor.action.addCommentLine';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, LineCommentCommand.Type.ForceAdd, ns);
	}

}

class RemoveLineCommentAction extends CommentLineAction {

	static ID = 'editor.action.removeCommentLine';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, LineCommentCommand.Type.ForceRemove, ns);
	}

}

class BlockCommentAction extends EditorAction {

	static ID = 'editor.action.blockComment';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public run(): TPromise<boolean> {

		var commands: EditorCommon.ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new BlockCommentCommand.BlockCommentCommand(selections[i]));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(null);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleCommentLineAction, ToggleCommentLineAction.ID, nls.localize('comment.line', "Toggle Line Comment"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.US_SLASH
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(AddLineCommentAction, AddLineCommentAction.ID, nls.localize('comment.line.add', "Add Line Comment"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(RemoveLineCommentAction, RemoveLineCommentAction.ID, nls.localize('comment.line.remove', "Remove Line Comment"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(BlockCommentAction, BlockCommentAction.ID, nls.localize('comment.block', "Toggle Block Comment"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A }
}));
