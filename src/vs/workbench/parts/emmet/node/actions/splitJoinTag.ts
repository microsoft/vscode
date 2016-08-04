/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {BasicEmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class SplitJoinTagAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.splitJoinTag',
			nls.localize('splitJoinTag', "Emmet: Split/Join Tag"),
			'Emmet: Split/Join Tag',
			'split_join_tag'
		);
	}
}

CommonEditorRegistry.registerEditorAction(new SplitJoinTagAction());
