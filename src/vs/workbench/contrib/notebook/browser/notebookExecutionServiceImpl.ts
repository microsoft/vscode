/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, ICellEditOperation, NotebookCellExecutionState, NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, ICellExecuteUpdate, INotebookCellExecution, INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class NotebookExecutionService implements INotebookExecutionService {
	declare _serviceBrand: undefined;

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
	) {
	}

	registerNotebookCellExecution(execution: INotebookCellExecution): void {
		const notebook = this._notebookService.getNotebookTextModel(execution.notebook);
		if (!notebook) {
			return;
		}

		const startExecuteEdit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: execution.cellHandle,
			internalMetadata: {
				runState: NotebookCellExecutionState.Pending
			}
		};
		this._applyExecutionEdits(notebook, [startExecuteEdit]);

		const listener = execution.onDidChange(updates => {
			const edits = updates.map(update => updateToEdit(update, execution.cellHandle));
			if (updates.some(update => update.editType === CellExecutionUpdateType.Complete)) {
				listener.dispose();
			}

			this._applyExecutionEdits(notebook, edits);
		});
	}

	private _applyExecutionEdits(notebook: NotebookTextModel, edits: ICellEditOperation[]): void {
		notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
}

function updateToEdit(update: ICellExecuteUpdate, cellHandle: number): ICellEditOperation {
	if (update.editType === CellExecutionUpdateType.Output) {
		return {
			editType: CellEditType.Output,
			handle: update.cellHandle,
			append: update.append,
			outputs: update.outputs,
		};
	} else if (update.editType === CellExecutionUpdateType.OutputItems) {
		return {
			editType: CellEditType.OutputItems,
			items: update.items,
			append: update.append,
			outputId: update.outputId
		};
	} else if (update.editType === CellExecutionUpdateType.Complete) {
		return {
			editType: CellEditType.PartialInternalMetadata,
			handle: cellHandle,
			internalMetadata: {
				runState: null,
				lastRunSuccess: update.lastRunSuccess,
				runEndTime: update.runEndTime
			}
		};
	} else if (update.editType === CellExecutionUpdateType.ExecutionState) {
		const newInternalMetadata: Partial<NotebookCellInternalMetadata> = {
			runState: NotebookCellExecutionState.Executing,
		};
		if (typeof update.executionOrder !== 'undefined') {
			newInternalMetadata.executionOrder = update.executionOrder;
		}
		if (typeof update.runStartTime !== 'undefined') {
			newInternalMetadata.runStartTime = update.runStartTime;
		}
		return {
			editType: CellEditType.PartialInternalMetadata,
			handle: cellHandle,
			internalMetadata: newInternalMetadata
		};
	}

	throw new Error('Unknown cell update type');
}
