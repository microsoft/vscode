/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorKbExpr, EditorAction2, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class ToggleWordWrapAction extends EditorAction2 {

	constructor() {
		super(
			'editor.action.toggleWordWrap',
			nls.localize('toggle.wordwrap', "View: Toggle Word Wrap"),
			'View: Toggle Word Wrap',
			false
		);

		this.kbOpts = {
			kbExpr: EditorKbExpr.TextFocus,
			primary: KeyMod.Alt | KeyCode.KEY_Z
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {

		let wrappingInfo = editor.getConfiguration().wrappingInfo;

		let newWrappingColumn: number;
		if (!wrappingInfo.isViewportWrapping) {
			newWrappingColumn = 0;
		} else {
			newWrappingColumn = -1;
		}

		editor.updateOptions({
			wrappingColumn: newWrappingColumn
		});
	}
}

// register actions
CommonEditorRegistry.registerEditorAction2(new ToggleWordWrapAction());
