/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';

class ToggleWordWrapAction extends EditorAction {

	static ID = 'editor.action.toggleWordWrap';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
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
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleWordWrapAction, ToggleWordWrapAction.ID, nls.localize('toggle.wordwrap', "ww: Toggle Word Wrap"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.KEY_Z,
	mac: { primary: KeyMod.Alt |  KeyCode.KEY_Z },
	linux: { primary: KeyMod.Alt | KeyCode.KEY_Z }
}));
