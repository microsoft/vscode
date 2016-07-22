/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorAction } from 'vs/editor/common/editorAction';
import { ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry, ContextKey, EditorActionDescriptor } from 'vs/editor/common/editorCommonExtensions';
import {SuggestRegistry} from 'vs/editor/common/modes';
import {SuggestController} from 'vs/editor/contrib/suggest/browser/suggestController';

class TriggerSuggestAction extends EditorAction {

	static ID: string = 'editor.action.triggerSuggest';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor) {
		super(descriptor, editor);
	}

	isSupported(): boolean {
		return SuggestRegistry.has(this.editor.getModel()) && !this.editor.getConfiguration().readOnly;
	}

	run(): TPromise<boolean> {
		return SuggestController.getController(this.editor).trigger(false);
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(
	TriggerSuggestAction,
	TriggerSuggestAction.ID,
	nls.localize('suggest.trigger.label', "Trigger Suggest"),
	{
		context: ContextKey.EditorTextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
	},
	'Trigger Suggest'
));


