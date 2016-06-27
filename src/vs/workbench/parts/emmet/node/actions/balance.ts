/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

class BalanceInwardAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.balanceInward';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'balance_inward');
	}
}

class BalanceOutwardAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.balanceOutward';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'balance_outward');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(BalanceInwardAction,
	BalanceInwardAction.ID,
	nls.localize('balanceInward', "Emmet: Balance (inward)"), void 0, 'Emmet: Balance (inward)'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(BalanceOutwardAction,
	BalanceOutwardAction.ID,
	nls.localize('balanceOutward', "Emmet: Balance (outward)"), void 0, 'Emmet: Balance (outward)'));
