/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellUri, ICellEditOperation, NotebookCellExecutionState, NotebookCellInternalMetadata, NotebookTextModelWillAddRemoveEvent } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { ICellExecuteUpdate, ICellExecutionComplete, ICellExecutionEntry, ICellExecutionStateChangedEvent, ICellExecutionStateUpdate, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class NotebookExecutionStateService extends Disposable implements INotebookExecutionStateService {
	declare _serviceBrand: undefined;

	private readonly _executions = new ResourceMap<NotebookExecution>();

	private readonly _onDidChangeCellExecution = new Emitter<ICellExecutionStateChangedEvent>();
	onDidChangeCellExecution = this._onDidChangeCellExecution.event;

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

	getCellExecutionState(cellUri: URI): ICellExecutionEntry | undefined {
		const parsed = CellUri.parse(cellUri);
		if (!parsed) {
			throw new Error(`Not a cell URI: ${cellUri}`);
		}

		const exe = this._executions.get(parsed.notebook);
		if (exe) {
			return exe.getCellExecution(parsed.handle);
		}

		return undefined;
	}

	getCellExecutionStatesForNotebook(notebook: URI): ICellExecutionEntry[] {
		const exe = this._executions.get(notebook);
		return (exe?.getCellExecutions() ?? []);
	}

	createNotebookCellExecution(notebook: URI, cellHandle: number): void {
		let notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			notebookExecution = this._instantiationService.createInstance(NotebookExecution, notebook);
			this._executions.set(notebook, notebookExecution);
		}

		const exe = notebookExecution.addExecution(cellHandle);
		this._onDidChangeCellExecution.fire(new NotebookExecutionEvent(notebook, cellHandle, exe));
	}

	updateNotebookCellExecution(notebook: URI, cellHandle: number, updates: ICellExecuteUpdate[]): void {
		const notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			this._logService.error(`notebook execution not found for ${notebook}`);
			return;
		}

		const exe = notebookExecution.updateExecution(cellHandle, updates);
		if (exe) {
			this._onDidChangeCellExecution.fire(new NotebookExecutionEvent(notebook, cellHandle, exe));
		}
	}

	completeNotebookCellExecution(notebook: URI, cellHandle: number, complete: ICellExecutionComplete): void {
		const notebookExecution = this._executions.get(notebook);
		if (!notebookExecution) {
			this._logService.error(`notebook execution not found for ${notebook}`);
			return;
		}

		const exe = notebookExecution.completeExecution(cellHandle, complete);
		if (exe) {
			this.checkNotebookExecutionEmpty(notebook);
			this._onDidChangeCellExecution.fire(new NotebookExecutionEvent(notebook, cellHandle));
		}
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

class NotebookExecutionEvent implements ICellExecutionStateChangedEvent {
	constructor(
		readonly notebook: URI,
		readonly cellHandle: number,
		readonly changed?: CellExecution
	) { }

	affectsCell(cell: URI): boolean {
		const parsedUri = CellUri.parse(cell);
		return !!parsedUri && isEqual(this.notebook, parsedUri.notebook) && this.cellHandle === parsedUri.handle;
	}

	affectsNotebook(notebook: URI): boolean {
		return isEqual(this.notebook, notebook);
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

	getCellExecution(cellHandle: number): CellExecution | undefined {
		return this._cellExecutions.get(cellHandle);
	}

	getCellExecutions(): CellExecution[] {
		return Array.from(this._cellExecutions.values());
	}

	private getCellLog(cellHandle: number): string {
		return `${this._notebookModel.uri.toString()}, ${cellHandle}`;
	}

	isEmpty(): boolean {
		return this._cellExecutions.size === 0;
	}

	cancelAll(): void {
		this._logService.debug(`NotebookExecution#cancelAll`);
		this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, this._cellExecutions.keys());
	}

	addExecution(cellHandle: number): CellExecution {
		this._logService.debug(`NotebookExecution#addExecution ${this.getCellLog(cellHandle)}`);
		const execution = this._instantiationService.createInstance(CellExecution, cellHandle, this._notebookModel);
		this._cellExecutions.set(cellHandle, execution);
		return execution;
	}

	updateExecution(cellHandle: number, updates: ICellExecuteUpdate[]): CellExecution | undefined {
		this.logUpdates(cellHandle, updates);
		const execution = this._cellExecutions.get(cellHandle);
		if (!execution) {
			this._logService.error(`no execution for cell ${cellHandle}`);
			return;
		}

		execution.update(updates);
		return execution;
	}

	private logUpdates(cellHandle: number, updates: ICellExecuteUpdate[]): void {
		const updateTypes = updates.map(u => CellExecutionUpdateType[u.editType]).join(', ');
		this._logService.debug(`NotebookExecution#updateExecution ${this.getCellLog(cellHandle)}, [${updateTypes}]`);
	}

	completeExecution(cellHandle: number, complete: ICellExecutionComplete): CellExecution | undefined {
		this._logService.debug(`NotebookExecution#completeExecution ${this.getCellLog(cellHandle)}`);

		const execution = this._cellExecutions.get(cellHandle);
		if (!execution) {
			this._logService.error(`no execution for cell ${cellHandle}`);
			return;
		}

		try {
			execution.complete(complete);
			return execution;
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
		const newInternalMetadata: Partial<NotebookCellInternalMetadata> = { };
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

class CellExecution implements ICellExecutionEntry {
	private _state: NotebookCellExecutionState = NotebookCellExecutionState.Pending;
	get state() {
		return this._state;
	}

	get notebook(): URI {
		return this._notebookModel.uri;
	}

	private _didPause = false;
	get didPause() {
		return this._didPause;
	}

	private _isPaused = false;
	get isPaused() {
		return this._isPaused;
	}

	constructor(
		readonly cellHandle: number,
		private readonly _notebookModel: NotebookTextModel,
		@ILogService private readonly _logService: ILogService,
	) {
		const startExecuteEdit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: this.cellHandle,
			internalMetadata: {
				runStartTime: null,
				runEndTime: null,
				lastRunSuccess: null,
				executionOrder: null,
			}
		};
		this._applyExecutionEdits([startExecuteEdit]);
	}

	update(updates: ICellExecuteUpdate[]): void {
		if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
			this._state = NotebookCellExecutionState.Executing;
		}

		if (!this._didPause && updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState && u.didPause)) {
			this._didPause = true;
		}

		const lastIsPausedUpdate = [...updates].reverse().find(u => u.editType === CellExecutionUpdateType.ExecutionState && typeof u.isPaused === 'boolean');
		if (lastIsPausedUpdate) {
			this._isPaused = (lastIsPausedUpdate as ICellExecutionStateUpdate).isPaused!;
		}

		const edits = updates.map(update => updateToEdit(update, this.cellHandle));
		this._applyExecutionEdits(edits);
	}

	complete(completionData: ICellExecutionComplete): void {
		const cellModel = this._notebookModel.cells.find(c => c.handle === this.cellHandle);
		if (!cellModel) {
			this._logService.debug(`CellExecution#complete, updating cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
			return;
		}

		const edit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: this.cellHandle,
			internalMetadata: {
				lastRunSuccess: completionData.lastRunSuccess,
				runStartTime: this._didPause ? null : cellModel.internalMetadata.runStartTime,
				runEndTime: this._didPause ? null : completionData.runEndTime,
			}
		};
		this._applyExecutionEdits([edit]);
	}

	private _applyExecutionEdits(edits: ICellEditOperation[]): void {
		this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
}
