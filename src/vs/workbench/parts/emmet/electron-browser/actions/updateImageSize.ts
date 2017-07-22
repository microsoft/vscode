/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BasicEmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';

import { editorAction } from 'vs/editor/common/editorCommonExtensions';

@editorAction
class UpdateImageSizeAction extends BasicEmmetEditorAction {
	constructor() {
		super(
			'editor.emmet.action.updateImageSize',
			nls.localize('updateImageSize', "Emmet: Update Image Size"),
			'Emmet: Update Image Size',
			'update_image_size'
		);
	}
}
