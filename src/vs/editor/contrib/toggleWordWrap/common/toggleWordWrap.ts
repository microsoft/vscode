/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';

class ToggleWordWrapAction extends EditorAction {

	static ID = 'editor.action.toggleWordWrap';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run():TPromise<boolean> {

		let wrappingInfo = this.editor.getConfiguration().wrappingInfo;

		if (!wrappingInfo.isViewportWrapping) {
			wrappingInfo.wrappingColumn = 0;
		} else {
			wrappingInfo.wrappingColumn = DefaultConfig.editor.wrappingColumn;
		}
		this.editor.updateOptions(wrappingInfo);

		return TPromise.as(true);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleWordWrapAction, ToggleWordWrapAction.ID, nls.localize('toggle.wordwrap', "View: Toggle Word Wrap"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.KEY_Z,
	mac: { primary: KeyMod.Alt |  KeyCode.KEY_Z },
	linux: { primary: KeyMod.Alt | KeyCode.KEY_Z }
}));
