/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { ICommand } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, IActionOptions, EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { BlockCommentCommand } from './blockCommentCommand';
import { LineCommentCommand, Type } from './lineCommentCommand';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

abstract class CommentLineAction extends EditorAction {

	private _type: Type;

	constructor(type: Type, opts: IActionOptions) {
		super(opts);
		this._type = type;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}

}

class ToggleCommentLineAction extends CommentLineAction {
	constructor() {
		super(Type.Toggle, {
			id: 'editor.action.commentLine',
			label: nls.localize('comment.line', "Toggle Line Comment"),
			alias: 'Toggle Line Comment',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.US_SLASH
			}
		});
	}
}

class AddLineCommentAction extends CommentLineAction {
	constructor() {
		super(Type.ForceAdd, {
			id: 'editor.action.addCommentLine',
			label: nls.localize('comment.line.add', "Add Line Comment"),
			alias: 'Add Line Comment',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C)
			}
		});
	}
}

class RemoveLineCommentAction extends CommentLineAction {
	constructor() {
		super(Type.ForceRemove, {
			id: 'editor.action.removeCommentLine',
			label: nls.localize('comment.line.remove', "Remove Line Comment"),
			alias: 'Remove Line Comment',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_U)
			}
		});
	}
}

class BlockCommentAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.blockComment',
			label: nls.localize('comment.block', "Toggle Block Comment"),
			alias: 'Toggle Block Comment',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A }
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		var commands: ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new BlockCommentCommand(selections[i]));
		}

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}
}

registerEditorAction(ToggleCommentLineAction);
registerEditorAction(AddLineCommentAction);
registerEditorAction(RemoveLineCommentAction);
registerEditorAction(BlockCommentAction);
