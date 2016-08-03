/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class ReflectCSSValueAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.reflectCSSValue',
			nls.localize('reflectCSSValue', "Emmet: Reflect CSS Value"),
			'Emmet: Reflect CSS Value',
			'reflect_css_value'
		);
	}
}

CommonEditorRegistry.registerEditorAction2(new ReflectCSSValueAction());
