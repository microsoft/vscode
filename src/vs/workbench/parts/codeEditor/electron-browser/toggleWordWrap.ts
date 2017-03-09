/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
class ToggleWordWrapAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleWordWrap',
			label: nls.localize('toggle.wordwrap', "View: Toggle Word Wrap"),
			alias: 'View: Toggle Word Wrap',
			precondition: null,
			kbOpts: {
				kbExpr: null,
				primary: KeyMod.Alt | KeyCode.KEY_Z
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let wrappingInfo = editor.getConfiguration().wrappingInfo;
		let newWordWrap: 'on' | 'off';
		let newWordWrapMinified: boolean;
		if (!wrappingInfo.isViewportWrapping) {
			newWordWrap = 'on';
			newWordWrapMinified = true;
		} else {
			newWordWrap = 'off';
			newWordWrapMinified = false;
		}

		editor.updateOptions({
			wordWrap: newWordWrap,
			wordWrapMinified: newWordWrapMinified
		});
	}
}
