/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
class SelectPreviousItemAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.selectPreviousItem',
			nls.localize('selectPreviousItem', "Emmet: Select Previous Item"),
			'Emmet: Select Previous Item',
			'select_previous_item'
		);
	}
}

@editorAction
class SelectNextItemAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.selectNextItem',
			nls.localize('selectNextItem', "Emmet: Select Next Item"),
			'Emmet: Select Next Item',
			'select_next_item'
		);
	}
}
