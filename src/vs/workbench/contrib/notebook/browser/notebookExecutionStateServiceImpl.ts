/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, ICellEditOperation, NotebookCellExecutionState, NotebookCellInternalMetadata, NotebookTextModelWillAddRemoveEvent } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { ICellExecuteUpdate, ICellExecutionComplete, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class NotebookExecutionStateService extends Disposable implements INotebookExecutionStateService {
	declare _serviceBrand: undefined;

	private readonly _executions = new ResourceMap<NotebookExecution>();

	constructor(
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._notebookKernelService.onDidChangeSelectedNotebooks(e => {
			if (e.newKernel) {
				const notebookExecution = this._executions.get(e.notebook);
				if (notebookExecution) {
					notebookExecution.cancelAll();
					this.checkNotebookExecutionEmpty(e.notebook);
				}
			}
		}));
	}

	createNotebookCellExecution(notebook: URI, cellHandle: number): void {
		let notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			notebookExecution = this._instantiationService.createInstance(NotebookExecution, notebook);
			this._executions.set(notebook, notebookExecution);
		}

		notebookExecution.addExecution(cellHandle);
	}

	updateNotebookCellExecution(notebook: URI, cellHandle: number, updates: ICellExecuteUpdate[]): void {
		const notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			this._logService.error(`notebook execution not found for ${notebook}`);
			return;
		}

		notebookExecution.updateExecution(cellHandle, updates);
	}

	completeNotebookCellExecution(notebook: URI, cellHandle: number, complete: ICellExecutionComplete): void {
		const notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			this._logService.error(`notebook execution not found for ${notebook}`);
			return;
		}

		notebookExecution.completeExecution(cellHandle, complete);
		this.checkNotebookExecutionEmpty(notebook);
	}

	private checkNotebookExecutionEmpty(notebook: URI): void {
		const notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			return;
		}

		if (notebookExecution.isEmpty()) {
			this._logService.debug(`NotebookExecution#dispose ${notebook.toString()}`);
			notebookExecution.dispose();
			this._executions.delete(notebook);
		}
	}

	override dispose(): void {
		super.dispose();
		this._executions.forEach(e => e.dispose());
		this._executions.clear();
	}
}

class NotebookExecution extends Disposable {
	private readonly _notebookModel: NotebookTextModel;

	private readonly _cellExecutions = new Map<number, CellExecution>();

	constructor(
		notebook: URI,
		@INotebookService private readonly _notebookService: INotebookService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotebookExecutionService private readonly _notebookExecutionService: INotebookExecutionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._logService.debug(`NotebookExecution#ctor ${notebook.toString()}`);

		const notebookModel = this._notebookService.getNotebookTextModel(notebook);
		if (!notebookModel) {
			throw new Error('Notebook not found: ' + notebook);
		}

		this._notebookModel = notebookModel;
		this._register(this._notebookModel.onWillAddRemoveCells(e => this.onWillAddRemoveCells(e)));
		this._register(this._notebookModel.onWillDispose(() => this.onWillDisposeDocument()));
	}

	private cellLog(cellHandle: number): string {
		return `${this._notebookModel.uri.toString()}, ${cellHandle}`;
	}

	isEmpty(): boolean {
		return this._cellExecutions.size === 0;
	}

	cancelAll(): void {
		this._logService.debug(`NotebookExecution#cancelAll`);
		this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, this._cellExecutions.keys());
	}

	addExecution(cellHandle: number) {
		this._logService.debug(`NotebookExecution#addExecution ${this.cellLog(cellHandle)}`);
		const execution = this._instantiationService.createInstance(CellExecution, cellHandle, this._notebookModel);
		this._cellExecutions.set(cellHandle, execution);
	}

	updateExecution(cellHandle: number, updates: ICellExecuteUpdate[]): void {
		this.logUpdates(cellHandle, updates);
		const execution = this._cellExecutions.get(cellHandle);
		if (!execution) {
			this._logService.error(`no execution for cell ${cellHandle}`);
			return;
		}

		execution.update(updates);
	}

	private logUpdates(cellHandle: number, updates: ICellExecuteUpdate[]): void {
		const updateTypes = updates.map(u => CellExecutionUpdateType[u.editType]).join(', ');
		this._logService.debug(`NotebookExecution#updateExecution ${this.cellLog(cellHandle)}, [${updateTypes}]`);
	}

	completeExecution(cellHandle: number, complete: ICellExecutionComplete): void {
		this._logService.debug(`NotebookExecution#completeExecution ${this.cellLog(cellHandle)}`);

		const execution = this._cellExecutions.get(cellHandle);
		if (!execution) {
			this._logService.error(`no execution for cell ${cellHandle}`);
			return;
		}

		try {
			execution.complete(complete);
		} finally {
			this._cellExecutions.delete(cellHandle);
		}
	}

	private onWillDisposeDocument(): void {
		this._logService.debug(`NotebookExecution#onWillDisposeDocument`);
		this.cancelAll();
	}

	private onWillAddRemoveCells(e: NotebookTextModelWillAddRemoveEvent): void {
		const handles = new Set(this._cellExecutions.keys());
		const myDeletedHandles = new Set<number>();
		e.rawEvent.changes.forEach(([start, deleteCount]) => {
			if (deleteCount) {
				const deletedHandles = this._notebookModel.cells.slice(start, start + deleteCount).map(c => c.handle);
				deletedHandles.forEach(h => {
					if (handles.has(h)) {
						myDeletedHandles.add(h);
					}
				});
			}

			return false;
		});

		if (myDeletedHandles.size) {
			this._logService.debug(`NotebookExecution#onWillAddRemoveCells, ${JSON.stringify([...myDeletedHandles])}`);
			this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, myDeletedHandles);
		}
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

class CellExecution {
	constructor(
		private readonly _cellHandle: number,
		private readonly _notebookModel: NotebookTextModel,
	) {
		const startExecuteEdit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: this._cellHandle,
			internalMetadata: {
				runState: NotebookCellExecutionState.Pending,
				executionOrder: null,
				didPause: false
			}
		};
		this._applyExecutionEdits([startExecuteEdit]);
	}

	update(updates: ICellExecuteUpdate[]): void {
		const edits = updates.map(update => updateToEdit(update, this._cellHandle));
		this._applyExecutionEdits(edits);
	}

	complete(completionData: ICellExecutionComplete): void {
		const cellModel = this._notebookModel.cells.find(c => c.handle === this._cellHandle);
		if (!cellModel) {
			throw new Error('Cell not found: ' + this._cellHandle);
		}

		const edit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: this._cellHandle,
			internalMetadata: {
				runState: null,
				lastRunSuccess: completionData.lastRunSuccess,
				runStartTime: cellModel.internalMetadata.didPause ? null : cellModel.internalMetadata.runStartTime,
				runEndTime: cellModel.internalMetadata.didPause ? null : completionData.runEndTime,
				isPaused: false,
				didPause: false
			}
		};
		this._applyExecutionEdits([edit]);
	}

	private _applyExecutionEdits(edits: ICellEditOperation[]): void {
		this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
}
