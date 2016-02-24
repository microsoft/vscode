/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IPosition} from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';

export function pos(lineNumber:number, column:number): IPosition {
	return {
		lineNumber: lineNumber,
		column: column
	};
}

export function withEditorModel(text:string[], callback:(model:Model) => void): void {
	var model = new Model(text.join('\n'), null);
	callback(model);
	model.dispose();
}
