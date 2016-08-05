/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {ICommand, ICommonCodeEditor, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {EditorAction, CommonEditorRegistry, ServicesAccessor} from 'vs/editor/common/editorCommonExtensions';
import {MoveCarretCommand} from './moveCarretCommand';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';

class MoveCarretAction extends EditorAction {

	private left:boolean;

	constructor(id:string, label:string, alias:string, left:boolean) {
		super(id, label, alias, true);

		this._precondition = KbExpr.and(EditorContextKeys.TextFocus, EditorContextKeys.Writable);

		this.left = left;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		var commands:ICommand[] = [];
		var selections = editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveCarretCommand(selections[i], this.left));
		}

		editor.executeCommands(this.id, commands);
	}
}

class MoveCarretLeftAction extends MoveCarretAction {

	constructor() {
		super(
			'editor.action.moveCarretLeftAction',
			nls.localize('carret.moveLeft', "Move Carret Left"),
			'Move Carret Left',
			true
		);
	}
}

class MoveCarretRightAction extends MoveCarretAction {

	constructor() {
		super(
			'editor.action.moveCarretRightAction',
			nls.localize('carret.moveRight', "Move Carret Right"),
			'Move Carret Right',
			false
		);
	}
}

CommonEditorRegistry.registerEditorAction(new MoveCarretLeftAction());
CommonEditorRegistry.registerEditorAction(new MoveCarretRightAction());
