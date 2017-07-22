/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
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
