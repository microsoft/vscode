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
class WrapWithAbbreviationAction extends EmmetEditorAction {

	constructor() {
		super({
			id: 'editor.emmet.action.wrapWithAbbreviation',
			label: nls.localize('wrapWithAbbreviationAction', "Emmet: Wrap with Abbreviation"),
			alias: 'Emmet: Wrap with Abbreviation',
			precondition: EditorContextKeys.Writable
		});
	}

	public runEmmetAction(accessor: ServicesAccessor, ctx: EmmetActionContext) {
		const quickOpenService = accessor.get(IQuickOpenService);

		let options: IInputOptions = {
			prompt: nls.localize('enterAbbreviation', "Enter Abbreviation"),
			placeHolder: nls.localize('abbreviation', "Abbreviation")
		};
		quickOpenService.input(options).then(abbreviation => {
			this.wrapAbbreviation(ctx, abbreviation);
		});
	}

	private wrapAbbreviation(ctx: EmmetActionContext, abbreviation: string) {
		if (abbreviation && !ctx.emmet.run('wrap_with_abbreviation', ctx.editorAccessor, abbreviation)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}
}
