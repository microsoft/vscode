/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellKind, ICellEditOperation, INotebookTextModel, NotebookCellExecutionState, NotebookCellInternalMetadata, NotebookTextModelWillAddRemoveEvent } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, ICellExecuteUpdate, ICellExecutionComplete, INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class NotebookExecutionService extends Disposable implements INotebookExecutionService {
	declare _serviceBrand: undefined;

	private readonly _executions = new ResourceMap<NotebookExecution>();

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
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

	getSelectedOrSuggestedKernel(notebook: INotebookTextModel): INotebookKernel | undefined {
		// TODO later can be inlined in notebookEditorWidget
		// returns SELECTED or the ONLY available kernel
		const info = this._notebookKernelService.getMatchingKernel(notebook);
		return info.selected ?? (info.all.length === 1 ? info.all[0] : undefined);
	}

	async executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`NotebookExecutionService#executeNotebookCells ${JSON.stringify(cellsArr.map(c => c.handle))}`);
		const message = nls.localize('notebookRunTrust', "Executing a notebook cell will run code from this workspace.");
		const trust = await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
		if (!trust) {
			return;
		}

		let kernel = this.getSelectedOrSuggestedKernel(notebook);
		if (!kernel) {
			await this._commandService.executeCommand(SELECT_KERNEL_ID);
			kernel = this.getSelectedOrSuggestedKernel(notebook);
		}

		if (!kernel) {
			return;
		}

		const cellHandles: number[] = [];
		for (const cell of cellsArr) {
			if (cell.cellKind !== CellKind.Code || cell.internalMetadata.runState === NotebookCellExecutionState.Pending || cell.internalMetadata.runState === NotebookCellExecutionState.Executing) {
				continue;
			}
			if (!kernel.supportedLanguages.includes(cell.language)) {
				continue;
			}
			cellHandles.push(cell.handle);
		}

		if (cellHandles.length > 0) {
			this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
			await kernel.executeNotebookCellsRequest(notebook.uri, cellHandles);
		}
	}

	async cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`NotebookExecutionService#cancelNotebookCellHandles ${JSON.stringify(cellsArr)}`);
		const kernel = this.getSelectedOrSuggestedKernel(notebook);
		if (kernel) {
			await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);
		}
	}

	async cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void> {
		this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
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
