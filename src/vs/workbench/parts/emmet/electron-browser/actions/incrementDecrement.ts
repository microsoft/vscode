/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
class IncrementNumberByOneTenthAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.incrementNumberByOneTenth',
			nls.localize('incrementNumberByOneTenth', "Emmet: Increment by 0.1"),
			'Emmet: Increment by 0.1',
			'increment_number_by_01'
		);
	}
}

@editorAction
class IncrementNumberByOneAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.incrementNumberByOne',
			nls.localize('incrementNumberByOne', "Emmet: Increment by 1"),
			'Emmet: Increment by 1',
			'increment_number_by_1'
		);
	}
}

@editorAction
class IncrementNumberByTenAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.incrementNumberByTen',
			nls.localize('incrementNumberByTen', "Emmet: Increment by 10"),
			'Emmet: Increment by 10',
			'increment_number_by_10'
		);
	}
}

@editorAction
class DecrementNumberByOneTenthAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.decrementNumberByOneTenth',
			nls.localize('decrementNumberByOneTenth', "Emmet: Decrement by 0.1"),
			'Emmet: Decrement by 0.1',
			'decrement_number_by_01'
		);
	}
}

@editorAction
class DecrementNumberByOneAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.decrementNumberByOne',
			nls.localize('decrementNumberByOne', "Emmet: Decrement by 1"),
			'Emmet: Decrement by 1',
			'decrement_number_by_1'
		);
	}
}

@editorAction
class DecrementNumberByTenAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.decrementNumberByTen',
			nls.localize('decrementNumberByTen', "Emmet: Decrement by 10"),
			'Emmet: Decrement by 10',
			'decrement_number_by_10'
		);
	}
}
