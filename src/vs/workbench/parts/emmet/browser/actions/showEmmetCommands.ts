/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, EditorAction, ServicesAccessor } from 'vs/editor/common/editorCommonExtensions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

const EMMET_COMMANDS_PREFIX = '>Emmet: ';

@editorAction
class ShowEmmetCommandsAction extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.showEmmetCommands',
			label: nls.localize('showEmmetCommands', "Show Emmet Commands"),
			alias: 'Show Emmet Commands',
			precondition: EditorContextKeys.writable,
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);
		quickOpenService.show(EMMET_COMMANDS_PREFIX);
		return TPromise.as(null);
	}
}