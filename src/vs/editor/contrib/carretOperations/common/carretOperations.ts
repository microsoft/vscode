/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {ICommand, ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {MoveCarretCommand} from './moveCarretCommand';

class MoveCarretAction extends EditorAction {

	private left:boolean;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, left:boolean) {
		super(descriptor, editor);
		this.left = left;
	}

	public run():TPromise<boolean> {

		var commands:ICommand[] = [];
		var selections = this.editor.getSelections();

		for (var i = 0; i < selections.length; i++) {
			commands.push(new MoveCarretCommand(selections[i], this.left));
		}

		this.editor.executeCommands(this.id, commands);

		return TPromise.as(true);
	}
}

class MoveCarretLeftAction extends MoveCarretAction {
	static ID = 'editor.action.moveCarretLeftAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, true);
	}
}

class MoveCarretRightAction extends MoveCarretAction {
	static ID = 'editor.action.moveCarretRightAction';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, false);
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveCarretLeftAction, MoveCarretLeftAction.ID, nls.localize('carret.moveLeft', "Move Carret Left"), {
	context: ContextKey.EditorTextFocus,
	primary: 0
}, 'Move Carret Left'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveCarretRightAction, MoveCarretRightAction.ID, nls.localize('carret.moveRight', "Move Carret Right"), {
	context: ContextKey.EditorTextFocus,
	primary: 0
}, 'Move Carret Right'));
