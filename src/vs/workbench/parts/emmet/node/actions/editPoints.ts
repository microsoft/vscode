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

class PreviousEditPointAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.previousEditPoint';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'prev_edit_point');
	}
}

class NextEditPointAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.nextEditPoint';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'next_edit_point');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PreviousEditPointAction,
	PreviousEditPointAction.ID,
	nls.localize('previousEditPoint', "Emmet: Previous Edit Point"), void 0, 'Emmet: Previous Edit Point'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(NextEditPointAction,
	NextEditPointAction.ID,
	nls.localize('nextEditPoint', "Emmet: Next Edit Point"), void 0, 'Emmet: Next Edit Point'));
