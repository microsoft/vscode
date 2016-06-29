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

class WrapWithAbbreviationAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.wrapWithAbbreviation';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_emmet) {
		let options: IInputOptions = {
			prompt: nls.localize('enterAbbreviation', "Enter Abbreviation"),
			placeHolder: nls.localize('abbreviation', "Abbreviation")
		};
		this.quickOpenService.input(options).then(abbreviation => {
			this.wrapAbbreviation(_emmet, abbreviation);
		});
	}

	private wrapAbbreviation(_emmet: any, abbreviation) {
		if (abbreviation && !_emmet.run('wrap_with_abbreviation', this.editorAccessor, abbreviation)) {
			this.noExpansionOccurred();
		}
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(WrapWithAbbreviationAction,
	WrapWithAbbreviationAction.ID,
	nls.localize('wrapWithAbbreviationAction', "Emmet: Wrap with Abbreviation"), void 0, 'Emmet: Wrap with Abbreviation'));
