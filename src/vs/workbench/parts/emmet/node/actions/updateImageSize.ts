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

class UpdateImageSizeAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.updateImageSize';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'update_image_size');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UpdateImageSizeAction,
	UpdateImageSizeAction.ID,
	nls.localize('updateImageSize', "Emmet: Update Image Size"), void 0, 'Emmet: Update Image Size'));
