/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceEditMetadata } from 'vs/editor/common/modes';
import { IProgress } from 'vs/platform/progress/common/progress';
import { UndoRedoGroup } from 'vs/platform/undoRedo/common/undoRedo';
import { ICellEditOperation } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class ResourceNotebookCellEdit extends ResourceEdit {

	constructor(
		readonly resource: URI,
		readonly cellEdit: ICellEditOperation,
		readonly versionId?: number,
		readonly metadata?: WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export class BulkCellEdits {

	constructor(
		private _undoRedoGroup: UndoRedoGroup,
		private readonly _progress: IProgress<void>,
		private readonly _edits: ResourceNotebookCellEdit[],
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookEditorModelResolverService private readonly _notebookModelService: INotebookEditorModelResolverService,
	) { }

	async apply(): Promise<void> {

		const editsByNotebook = groupBy(this._edits, (a, b) => compare(a.resource.toString(), b.resource.toString()));

		for (let group of editsByNotebook) {
			const [first] = group;
			const ref = await this._notebookModelService.resolve(first.resource);

			// check state
			// if (typeof first.versionId === 'number' && ref.object.notebook.versionId !== first.versionId) {
			// 	ref.dispose();
			// 	throw new Error(`Notebook '${first.resource}' has changed in the meantime`);
			// }

			// apply edits
			const edits = group.map(entry => entry.cellEdit);
			this._notebookService.transformEditsOutputs(ref.object.notebook, edits);
			ref.object.notebook.applyEdits(ref.object.notebook.versionId, edits, true, undefined, () => undefined, this._undoRedoGroup);
			ref.dispose();

			this._progress.report(undefined);
		}
	}
}
