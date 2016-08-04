/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction, EmmetActionContext} from 'vs/workbench/parts/emmet/node/emmetActions';

import {ServicesAccessor, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';

class WrapWithAbbreviationAction extends EmmetEditorAction {

	constructor() {
		super(
			'editor.emmet.action.wrapWithAbbreviation',
			nls.localize('wrapWithAbbreviationAction', "Emmet: Wrap with Abbreviation"),
			'Emmet: Wrap with Abbreviation'
		);
	}

	public runEmmetAction(accessor:ServicesAccessor, ctx: EmmetActionContext) {
		const quickOpenService = accessor.get(IQuickOpenService);

		let options: IInputOptions = {
			prompt: nls.localize('enterAbbreviation', "Enter Abbreviation"),
			placeHolder: nls.localize('abbreviation', "Abbreviation")
		};
		quickOpenService.input(options).then(abbreviation => {
			this.wrapAbbreviation(ctx, abbreviation);
		});
	}

	private wrapAbbreviation(ctx: EmmetActionContext, abbreviation:string) {
		if (abbreviation && !ctx.emmet.run('wrap_with_abbreviation', ctx.editorAccessor, abbreviation)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}
}

CommonEditorRegistry.registerEditorAction(new WrapWithAbbreviationAction());
