/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

export class CellDiffViewModel {
	constructor(
		readonly original: NotebookCellTextModel | undefined,
		readonly modified: NotebookCellTextModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified'
	) {
	}
}
