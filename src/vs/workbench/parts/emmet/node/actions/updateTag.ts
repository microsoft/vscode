/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction, EmmetActionContext} from 'vs/workbench/parts/emmet/node/emmetActions';

import {ServicesAccessor, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';

class UpdateTagAction extends EmmetEditorAction {

	constructor() {
		super(
			'editor.emmet.action.updateTag',
			nls.localize('updateTag', "Emmet: Update Tag"),
			'Emmet: Update Tag'
		);
	}

	public runEmmetAction(accessor:ServicesAccessor, ctx: EmmetActionContext) {
		const quickOpenService = accessor.get(IQuickOpenService);

		let options: IInputOptions = {
			prompt: nls.localize('enterTag', 'Enter Tag'),
			placeHolder: nls.localize('tag', 'Tag')
		};

		quickOpenService.input(options).then(tag => {
			this.wrapAbbreviation(ctx, tag);
		});
	}

	private wrapAbbreviation(ctx: EmmetActionContext, tag:string) {
		if (tag && !ctx.emmet.run('update_tag', ctx.editorAccessor, tag)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}
}

CommonEditorRegistry.registerEditorAction(new UpdateTagAction());
