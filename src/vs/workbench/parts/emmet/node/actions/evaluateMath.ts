/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class EvaluateMathAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.evaluateMath',
			nls.localize('evaluateMathExpression', "Emmet: Evaluate Math Expression"),
			'Emmet: Evaluate Math Expression',
			'evaluate_math_expression'
		);
	}
}

CommonEditorRegistry.registerEditorAction(new EvaluateMathAction());
