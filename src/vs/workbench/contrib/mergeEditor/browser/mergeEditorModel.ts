/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from 'vs/editor/common/model';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';

export class MergeEditorModel extends EditorModel {

	constructor(
		readonly anchestor: ITextModel,
		readonly inputOne: ITextModel,
		readonly inputTwo: ITextModel,
		readonly result: ITextModel,
	) {
		super();
	}

}
