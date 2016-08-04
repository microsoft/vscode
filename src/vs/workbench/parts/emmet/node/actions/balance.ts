/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

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

CommonEditorRegistry.registerEditorAction(new BalanceInwardAction());
CommonEditorRegistry.registerEditorAction(new BalanceOutwardAction());
