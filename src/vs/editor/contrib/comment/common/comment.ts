/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {ICommand, ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {BlockCommentCommand} from './blockCommentCommand';
import {LineCommentCommand, Type} from './lineCommentCommand';

class CommentLineAction extends EditorAction {

	static ID = 'editor.action.commentLine';

	private _type: Type;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, type: Type) {
		super(descriptor, editor);
		this._type = type;
	}

	public run(): TPromise<void> {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}

		var commands: ICommand[] = [];
		var selections = this.editor.getSelections();
		var opts = model.getOptions();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new LineCommentCommand(selections[i], opts.tabSize, this._type));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(null);
	}
}

class ToggleCommentLineAction extends CommentLineAction {

	static ID = 'editor.action.commentLine';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Type.Toggle);
	}
}

class AddLineCommentAction extends CommentLineAction {

	static ID = 'editor.action.addCommentLine';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Type.ForceAdd);
	}

}

class RemoveLineCommentAction extends CommentLineAction {

	static ID = 'editor.action.removeCommentLine';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Type.ForceRemove);
	}

}

class BlockCommentAction extends EditorAction {

	static ID = 'editor.action.blockComment';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor);
	}

	public run(): TPromise<boolean> {

		var commands: ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new BlockCommentCommand(selections[i]));
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
