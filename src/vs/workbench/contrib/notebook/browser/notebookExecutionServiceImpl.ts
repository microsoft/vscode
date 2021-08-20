/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
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

	createNotebookCellExecution(notebook: URI, cellHandle: number): INotebookCellExecution {
		return new CellExecution(notebook, cellHandle, this._notebookService);
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

class CellExecution implements INotebookCellExecution, IDisposable {
	private readonly _notebookModel: NotebookTextModel;

	private _isDisposed = false;

	constructor(
		readonly notebook: URI,
		readonly cellHandle: number,
		private readonly _notebookService: INotebookService,
	) {
		const notebookModel = this._notebookService.getNotebookTextModel(notebook);
		if (!notebookModel) {
			throw new Error('Notebook not found: ' + notebook);
		}

		this._notebookModel = notebookModel;

		const startExecuteEdit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: cellHandle,
			internalMetadata: {
				runState: NotebookCellExecutionState.Pending,
				executionOrder: null
			}
		};
		this._applyExecutionEdits([startExecuteEdit]);
	}

	update(updates: ICellExecuteUpdate[]): void {
		if (this._isDisposed) {
			throw new Error('Cannot update disposed execution');
		}

		const edits = updates.map(update => updateToEdit(update, this.cellHandle));
		this._applyExecutionEdits(edits);

		if (updates.some(u => u.editType === CellExecutionUpdateType.Complete)) {
			this.dispose();
		}
	}

	dispose(): void {
		this._isDisposed = true;
	}

	private _applyExecutionEdits(edits: ICellEditOperation[]): void {
		this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
}
