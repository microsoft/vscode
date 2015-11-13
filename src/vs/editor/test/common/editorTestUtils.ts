/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Model = require('vs/editor/common/model/model');
import {Selection} from 'vs/editor/common/core/selection';

export function pos(lineNumber:number, column:number): EditorCommon.IPosition {
	return {
		lineNumber: lineNumber,
		column: column
	};
}

export function withEditorModel(text:string[], callback:(model:Model.Model) => void): void {
	var model = new Model.Model(text.join('\n'), null);
	callback(model);
	model.dispose();
}
