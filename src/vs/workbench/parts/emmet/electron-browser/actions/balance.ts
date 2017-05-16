/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
class BalanceInwardAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.balanceInward',
			nls.localize('balanceInward', "Emmet: Balance (inward)"),
			'Emmet: Balance (inward)',
			'balance_inward'
		);
	}
}

@editorAction
class BalanceOutwardAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.balanceOutward',
			nls.localize('balanceOutward', "Emmet: Balance (outward)"),
			'Emmet: Balance (outward)',
			'balance_outward'
		);
	}
}
