/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Model} from 'vs/editor/common/model/model';

export function withEditorModel(text:string[], callback:(model:Model) => void): void {
	var model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
	callback(model);
	model.dispose();
}
