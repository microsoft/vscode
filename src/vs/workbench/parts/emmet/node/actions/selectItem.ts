/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction} from '../emmetActions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

export class SelectPreviousItemAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.selectPreviousItem';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('select_previous_item', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class SelectNextItemAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.selectNextItem';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('select_next_item', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectPreviousItemAction,
	SelectPreviousItemAction.ID,
	nls.localize('selectPreviousItem', "Emmet: Select Previous Item"), void 0, 'Emmet: Select Previous Item'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectNextItemAction,
	SelectNextItemAction.ID,
	nls.localize('selectNextItem', "Emmet: Select Next Item"), void 0, 'Emmet: Select Next Item'));
