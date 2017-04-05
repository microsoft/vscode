/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { EmmetEditorAction, EmmetActionContext } from 'vs/workbench/parts/emmet/node/emmetActions';

import { ServicesAccessor, editorAction } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorCommon';
import { IQuickOpenService, IInputOptions } from 'vs/platform/quickOpen/common/quickOpen';

@editorAction
class UpdateTagAction extends EmmetEditorAction {

	constructor() {
		super({
			id: 'editor.emmet.action.updateTag',
			label: nls.localize('updateTag', "Emmet: Update Tag"),
			alias: 'Emmet: Update Tag',
			precondition: EditorContextKeys.Writable
		});
	}

	public runEmmetAction(accessor: ServicesAccessor, ctx: EmmetActionContext) {
		const quickOpenService = accessor.get(IQuickOpenService);

		let options: IInputOptions = {
			prompt: nls.localize('enterTag', 'Enter Tag'),
			placeHolder: nls.localize('tag', 'Tag')
		};

		quickOpenService.input(options).then(tag => {
			this.wrapAbbreviation(ctx, tag);
		});
	}

	private wrapAbbreviation(ctx: EmmetActionContext, tag: string) {
		if (tag && !ctx.emmet.run('update_tag', ctx.editorAccessor, tag)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}
}
