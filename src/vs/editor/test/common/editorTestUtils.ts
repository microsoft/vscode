/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextModel } from 'vs/editor/common/model/textModel';

export function withEditorModel(text: string[], callback: (model: TextModel) => void): void {
	var model = TextModel.createFromString(text.join('\n'));
	callback(model);
	model.dispose();
}
