/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { EmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

@editorAction
class WrapWithAbbreviationAction extends EmmetEditorAction {

	constructor() {
		super({
			id: 'editor.emmet.action.wrapWithAbbreviation',
			label: nls.localize('wrapWithAbbreviationAction', "Emmet: Wrap with Abbreviation"),
			alias: 'Emmet: Wrap with Abbreviation',
			precondition: EditorContextKeys.writable,
			actionName: 'wrap_with_abbreviation'
		});
	}

}
