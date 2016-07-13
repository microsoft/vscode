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

class ReflectCSSValueAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.reflectCSSValue';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'reflect_css_value');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ReflectCSSValueAction,
	ReflectCSSValueAction.ID,
	nls.localize('reflectCSSValue', "Emmet: Reflect CSS Value"), void 0, 'Emmet: Reflect CSS Value'));
