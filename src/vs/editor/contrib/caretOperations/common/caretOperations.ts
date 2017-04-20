/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ICommand, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IActionOptions, editorAction, EditorAction, ServicesAccessor } from 'vs/editor/common/editorCommonExtensions';
import { MoveCaretCommand } from './moveCaretCommand';

class MoveCaretAction extends EditorAction {

	private left: boolean;

	constructor(left: boolean, opts: IActionOptions) {
		super(opts);

		this.left = left;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {

		var commands: ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveCaretCommand(selections[i], this.left));
		}

		editor.executeCommands(this.id, commands);
	}
}

@editorAction
class MoveCaretLeftAction extends MoveCaretAction {
	constructor() {
		super(true, {
			id: 'editor.action.moveCarretLeftAction',
			label: nls.localize('caret.moveLeft', "Move Caret Left"),
			alias: 'Move Caret Left',
			precondition: EditorContextKeys.writable
		});
	}
}

@editorAction
class MoveCaretRightAction extends MoveCaretAction {
	constructor() {
		super(false, {
			id: 'editor.action.moveCarretRightAction',
			label: nls.localize('caret.moveRight', "Move Caret Right"),
			alias: 'Move Caret Right',
			precondition: EditorContextKeys.writable
		});
	}
}
