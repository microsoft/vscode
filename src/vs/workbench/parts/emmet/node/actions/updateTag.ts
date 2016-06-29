/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';

class UpdateTagAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.updateTag';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_emmet) {
		let options: IInputOptions = {
			prompt: nls.localize('enterTag', 'Enter Tag'),
			placeHolder: nls.localize('tag', 'Tag')
		};
		this.quickOpenService.input(options).then(tag => {
			this.wrapAbbreviation(_emmet, tag);
		});
	}

	private wrapAbbreviation(_emmet: any, tag) {
		if (tag && !_emmet.run('update_tag', this.editorAccessor, tag)) {
			this.noExpansionOccurred();
		}
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UpdateTagAction,
	UpdateTagAction.ID,
	nls.localize('updateTag', "Emmet: Update Tag"), void 0, 'Emmet: Update Tag'));
