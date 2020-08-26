/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ILineChange } from 'vs/editor/common/editorCommon';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebookDiffResult } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export const ID_NOTEBOOK_EDITOR_WORKER_SERVICE = 'notebookEditorWorkerService';
export const INotebookEditorWorkerService = createDecorator<INotebookEditorWorkerService>(ID_NOTEBOOK_EDITOR_WORKER_SERVICE);

export interface IDiffComputationResult {
	quitEarly: boolean;
	identical: boolean;
	changes: ILineChange[];
}

export interface INotebookEditorWorkerService {
	readonly _serviceBrand: undefined;

	canComputeDiff(original: URI, modified: URI): boolean;
	computeDiff(original: URI, modified: URI): Promise<INotebookDiffResult>;
}
