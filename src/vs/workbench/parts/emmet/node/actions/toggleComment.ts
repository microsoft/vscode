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

class ToggleCommentAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.toggleComment';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'toggle_comment');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ToggleCommentAction,
	ToggleCommentAction.ID,
	nls.localize('toggleComment', "Emmet: Toggle Comment"), void 0, 'Emmet: Toggle Comment'));
