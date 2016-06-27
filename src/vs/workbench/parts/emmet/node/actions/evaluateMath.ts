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

class EvaluateMathAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.evaluateMath';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'evaluate_math_expression');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(EvaluateMathAction,
	EvaluateMathAction.ID,
	nls.localize('evaluateMathExpression', "Emmet: Evaluate Math Expression"), void 0, 'Emmet: Evaluate Math Expression'));
