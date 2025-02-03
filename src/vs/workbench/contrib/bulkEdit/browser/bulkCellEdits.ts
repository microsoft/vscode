/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { compare } from '../../../../base/common/strings.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ResourceEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { WorkspaceEditMetadata } from '../../../../editor/common/languages.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { UndoRedoGroup, UndoRedoSource } from '../../../../platform/undoRedo/common/undoRedo.js';
import { getNotebookEditorFromEditorPane } from '../../notebook/browser/notebookBrowser.js';
import { CellUri, ICellPartialMetadataEdit, ICellReplaceEdit, IDocumentMetadataEdit, ISelectionState, IWorkspaceNotebookCellEdit, SelectionStateType } from '../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class ResourceNotebookCellEdit extends ResourceEdit implements IWorkspaceNotebookCellEdit {

	static is(candidate: any): candidate is IWorkspaceNotebookCellEdit {
		if (candidate instanceof ResourceNotebookCellEdit) {
			return true;
		}
		return URI.isUri((<IWorkspaceNotebookCellEdit>candidate).resource)
			&& isObject((<IWorkspaceNotebookCellEdit>candidate).cellEdit);
	}

	static lift(edit: IWorkspaceNotebookCellEdit): ResourceNotebookCellEdit {
		if (edit instanceof ResourceNotebookCellEdit) {
			return edit;
		}
		return new ResourceNotebookCellEdit(edit.resource, edit.cellEdit, edit.notebookVersionId, edit.metadata);
	}

	constructor(
		readonly resource: URI,
		readonly cellEdit: ICellPartialMetadataEdit | IDocumentMetadataEdit | ICellReplaceEdit,
		readonly notebookVersionId: number | undefined = undefined,
		metadata?: WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export class BulkCellEdits {

	constructor(
		private readonly _undoRedoGroup: UndoRedoGroup,
		undoRedoSource: UndoRedoSource | undefined,
		private readonly _progress: IProgress<void>,
		private readonly _token: CancellationToken,
		private readonly _edits: ResourceNotebookCellEdit[],
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorModelResolverService private readonly _notebookModelService: INotebookEditorModelResolverService,
	) {
		this._edits = this._edits.map(e => {
			if (e.resource.scheme === CellUri.scheme) {
				const uri = CellUri.parse(e.resource)?.notebook;
				if (!uri) {
					throw new Error(`Invalid notebook URI: ${e.resource}`);
				}

				return new ResourceNotebookCellEdit(uri, e.cellEdit, e.notebookVersionId, e.metadata);
			} else {
				return e;
			}
		});
	}

	async apply(): Promise<readonly URI[]> {
		const resources: URI[] = [];
		const editsByNotebook = groupBy(this._edits, (a, b) => compare(a.resource.toString(), b.resource.toString()));

		for (const group of editsByNotebook) {
			if (this._token.isCancellationRequested) {
				break;
			}
			const [first] = group;
			const ref = await this._notebookModelService.resolve(first.resource);

			// check state
			if (typeof first.notebookVersionId === 'number' && ref.object.notebook.versionId !== first.notebookVersionId) {
				ref.dispose();
				throw new Error(`Notebook '${first.resource}' has changed in the meantime`);
			}

			// apply edits
			const edits = group.map(entry => entry.cellEdit);
			const computeUndo = !ref.object.isReadonly();
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const initialSelectionState: ISelectionState | undefined = editor?.textModel?.uri.toString() === ref.object.notebook.uri.toString() ? {
				kind: SelectionStateType.Index,
				focus: editor.getFocus(),
				selections: editor.getSelections()
			} : undefined;
			ref.object.notebook.applyEdits(edits, true, initialSelectionState, () => undefined, this._undoRedoGroup, computeUndo);
			ref.dispose();

			this._progress.report(undefined);

			resources.push(first.resource);
		}

		return resources;
	}
}
