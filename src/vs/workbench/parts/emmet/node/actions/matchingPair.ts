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

class GoToMatchingPairAction extends BasicEmmetEditorAction {

	static ID = 'editor.emmet.action.matchingPair';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService, 'matching_pair');
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(GoToMatchingPairAction,
	GoToMatchingPairAction.ID,
	nls.localize('matchingPair', "Emmet: Go to Matching Pair"), void 0, 'Emmet: Go to Matching Pair'));
