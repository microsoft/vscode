/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellEditType, CellUri, ICellEditOperation, NotebookCellExecutionState, NotebookCellInternalMetadata, NotebookExecutionState, NotebookTextModelWillAddRemoveEvent } from '../../common/notebookCommon.js';
import { CellExecutionUpdateType, INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { ICellExecuteUpdate, ICellExecutionComplete, ICellExecutionStateChangedEvent, ICellExecutionStateUpdate, IExecutionStateChangedEvent, IFailedCellInfo, INotebookCellExecution, INotebookExecution, INotebookExecutionStateService, INotebookFailStateChangedEvent, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookService } from '../../common/notebookService.js';

export class NotebookExecutionStateService extends Disposable implements INotebookExecutionStateService {
	declare _serviceBrand: undefined;

	private readonly _executions = new ResourceMap<Map<number, CellExecution>>();
	private readonly _notebookExecutions = new ResourceMap<[NotebookExecution, IDisposable]>();
	private readonly _notebookListeners = new ResourceMap<NotebookExecutionListeners>();
	private readonly _cellListeners = new ResourceMap<IDisposable>();
	private readonly _lastFailedCells = new ResourceMap<IFailedCellInfo>();

	private readonly _onDidChangeExecution = this._register(new Emitter<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>());
	onDidChangeExecution = this._onDidChangeExecution.event;

	private readonly _onDidChangeLastRunFailState = this._register(new Emitter<INotebookFailStateChangedEvent>());
	onDidChangeLastRunFailState = this._onDidChangeLastRunFailState.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService
	) {
		super();
	}

	getLastFailedCellForNotebook(notebook: URI): number | undefined {
		const failedCell = this._lastFailedCells.get(notebook);
		return failedCell?.visible ? failedCell.cellHandle : undefined;
	}

	forceCancelNotebookExecutions(notebookUri: URI): void {
		const notebookCellExecutions = this._executions.get(notebookUri);
		if (notebookCellExecutions) {
			for (const exe of notebookCellExecutions.values()) {
				this._onCellExecutionDidComplete(notebookUri, exe.cellHandle, exe);
			}
		}
		if (this._notebookExecutions.has(notebookUri)) {
			this._onExecutionDidComplete(notebookUri);
		}
	}

	getCellExecution(cellUri: URI): INotebookCellExecution | undefined {
		const parsed = CellUri.parse(cellUri);
		if (!parsed) {
			throw new Error(`Not a cell URI: ${cellUri}`);
		}

		const exeMap = this._executions.get(parsed.notebook);
		if (exeMap) {
			return exeMap.get(parsed.handle);
		}

		return undefined;
	}
	getExecution(notebook: URI): INotebookExecution | undefined {
		return this._notebookExecutions.get(notebook)?.[0];
	}

	getCellExecutionsForNotebook(notebook: URI): INotebookCellExecution[] {
		const exeMap = this._executions.get(notebook);
		return exeMap ? Array.from(exeMap.values()) : [];
	}

	getCellExecutionsByHandleForNotebook(notebook: URI): Map<number, INotebookCellExecution> | undefined {
		const exeMap = this._executions.get(notebook);
		return exeMap ? new Map(exeMap.entries()) : undefined;
	}

	private _onCellExecutionDidChange(notebookUri: URI, cellHandle: number, exe: CellExecution): void {
		this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle, exe));
	}

	private _onCellExecutionDidComplete(notebookUri: URI, cellHandle: number, exe: CellExecution, lastRunSuccess?: boolean): void {
		const notebookExecutions = this._executions.get(notebookUri);
		if (!notebookExecutions) {
			this._logService.debug(`NotebookExecutionStateService#_onCellExecutionDidComplete - unknown notebook ${notebookUri.toString()}`);
			return;
		}

		exe.dispose();
		const cellUri = CellUri.generate(notebookUri, cellHandle);
		this._cellListeners.get(cellUri)?.dispose();
		this._cellListeners.delete(cellUri);
		notebookExecutions.delete(cellHandle);
		if (notebookExecutions.size === 0) {
			this._executions.delete(notebookUri);
			this._notebookListeners.get(notebookUri)?.dispose();
			this._notebookListeners.delete(notebookUri);
		}

		if (lastRunSuccess !== undefined) {
			if (lastRunSuccess) {
				if (this._executions.size === 0) {
					this._accessibilitySignalService.playSignal(AccessibilitySignal.notebookCellCompleted);
				}
				this._clearLastFailedCell(notebookUri);
			} else {
				this._accessibilitySignalService.playSignal(AccessibilitySignal.notebookCellFailed);
				this._setLastFailedCell(notebookUri, cellHandle);
			}
		}

		this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle));
	}

	private _onExecutionDidChange(notebookUri: URI, exe: NotebookExecution): void {
		this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri, exe));
	}

	private _onExecutionDidComplete(notebookUri: URI): void {
		const disposables = this._notebookExecutions.get(notebookUri);
		if (!Array.isArray(disposables)) {
			this._logService.debug(`NotebookExecutionStateService#_onCellExecutionDidComplete - unknown notebook ${notebookUri.toString()}`);
			return;
		}

		this._notebookExecutions.delete(notebookUri);
		this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri));
		disposables.forEach(d => d.dispose());
	}

	createCellExecution(notebookUri: URI, cellHandle: number): INotebookCellExecution {
		const notebook = this._notebookService.getNotebookTextModel(notebookUri);
		if (!notebook) {
			throw new Error(`Notebook not found: ${notebookUri.toString()}`);
		}

		let notebookExecutionMap = this._executions.get(notebookUri);
		if (!notebookExecutionMap) {
			const listeners = this._instantiationService.createInstance(NotebookExecutionListeners, notebookUri);
			this._notebookListeners.set(notebookUri, listeners);

			notebookExecutionMap = new Map<number, CellExecution>();
			this._executions.set(notebookUri, notebookExecutionMap);
		}

		let exe = notebookExecutionMap.get(cellHandle);
		if (!exe) {
			exe = this._createNotebookCellExecution(notebook, cellHandle);
			notebookExecutionMap.set(cellHandle, exe);
			exe.initialize();
			this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle, exe));
		}

		return exe;
	}
	createExecution(notebookUri: URI): INotebookExecution {
		const notebook = this._notebookService.getNotebookTextModel(notebookUri);
		if (!notebook) {
			throw new Error(`Notebook not found: ${notebookUri.toString()}`);
		}

		if (!this._notebookListeners.has(notebookUri)) {
			const listeners = this._instantiationService.createInstance(NotebookExecutionListeners, notebookUri);
			this._notebookListeners.set(notebookUri, listeners);
		}

		let info = this._notebookExecutions.get(notebookUri);
		if (!info) {
			info = this._createNotebookExecution(notebook);
			this._notebookExecutions.set(notebookUri, info);
			this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri, info[0]));
		}

		return info[0];
	}

	private _createNotebookCellExecution(notebook: NotebookTextModel, cellHandle: number): CellExecution {
		const notebookUri = notebook.uri;
		const exe: CellExecution = this._instantiationService.createInstance(CellExecution, cellHandle, notebook);
		const disposable = combinedDisposable(
			exe.onDidUpdate(() => this._onCellExecutionDidChange(notebookUri, cellHandle, exe)),
			exe.onDidComplete(lastRunSuccess => this._onCellExecutionDidComplete(notebookUri, cellHandle, exe, lastRunSuccess)));
		this._cellListeners.set(CellUri.generate(notebookUri, cellHandle), disposable);

		return exe;
	}

	private _createNotebookExecution(notebook: NotebookTextModel): [NotebookExecution, IDisposable] {
		const notebookUri = notebook.uri;
		const exe: NotebookExecution = this._instantiationService.createInstance(NotebookExecution, notebook);
		const disposable = combinedDisposable(
			exe.onDidUpdate(() => this._onExecutionDidChange(notebookUri, exe)),
			exe.onDidComplete(() => this._onExecutionDidComplete(notebookUri)));
		return [exe, disposable];
	}

	private _setLastFailedCell(notebookURI: URI, cellHandle: number): void {
		const prevLastFailedCellInfo = this._lastFailedCells.get(notebookURI);
		const notebook = this._notebookService.getNotebookTextModel(notebookURI);
		if (!notebook) {
			return;
		}

		const newLastFailedCellInfo: IFailedCellInfo = {
			cellHandle: cellHandle,
			disposable: prevLastFailedCellInfo ? prevLastFailedCellInfo.disposable : this._getFailedCellListener(notebook),
			visible: true
		};

		this._lastFailedCells.set(notebookURI, newLastFailedCellInfo);

		this._onDidChangeLastRunFailState.fire({ visible: true, notebook: notebookURI });
	}

	private _setLastFailedCellVisibility(notebookURI: URI, visible: boolean): void {
		const lastFailedCellInfo = this._lastFailedCells.get(notebookURI);

		if (lastFailedCellInfo) {
			this._lastFailedCells.set(notebookURI, {
				cellHandle: lastFailedCellInfo.cellHandle,
				disposable: lastFailedCellInfo.disposable,
				visible: visible,
			});
		}

		this._onDidChangeLastRunFailState.fire({ visible: visible, notebook: notebookURI });
	}

	private _clearLastFailedCell(notebookURI: URI): void {
		const lastFailedCellInfo = this._lastFailedCells.get(notebookURI);

		if (lastFailedCellInfo) {
			lastFailedCellInfo.disposable?.dispose();
			this._lastFailedCells.delete(notebookURI);
		}

		this._onDidChangeLastRunFailState.fire({ visible: false, notebook: notebookURI });
	}

	private _getFailedCellListener(notebook: NotebookTextModel): IDisposable {
		return notebook.onWillAddRemoveCells((e: NotebookTextModelWillAddRemoveEvent) => {
			const lastFailedCell = this._lastFailedCells.get(notebook.uri)?.cellHandle;
			if (lastFailedCell !== undefined) {
				const lastFailedCellPos = notebook.cells.findIndex(c => c.handle === lastFailedCell);
				e.rawEvent.changes.forEach(([start, deleteCount, addedCells]) => {
					if (deleteCount) {
						if (lastFailedCellPos >= start && lastFailedCellPos < start + deleteCount) {
							this._setLastFailedCellVisibility(notebook.uri, false);
						}
					}

					if (addedCells.some(cell => cell.handle === lastFailedCell)) {
						this._setLastFailedCellVisibility(notebook.uri, true);
					}

				});
			}
		});
	}

	override dispose(): void {
		super.dispose();
		this._executions.forEach(executionMap => {
			executionMap.forEach(execution => execution.dispose());
			executionMap.clear();
		});
		this._executions.clear();
		this._notebookExecutions.forEach(disposables => {
			disposables.forEach(d => d.dispose());
		});
		this._notebookExecutions.clear();

		this._cellListeners.forEach(disposable => disposable.dispose());
		this._notebookListeners.forEach(disposable => disposable.dispose());
		this._lastFailedCells.forEach(elem => elem.disposable.dispose());
	}
}

class NotebookCellExecutionEvent implements ICellExecutionStateChangedEvent {
	readonly type = NotebookExecutionType.cell;
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

class NotebookExecutionEvent implements IExecutionStateChangedEvent {
	readonly type = NotebookExecutionType.notebook;
	constructor(
		readonly notebook: URI,
		readonly changed?: NotebookExecution
	) { }

	affectsNotebook(notebook: URI): boolean {
		return isEqual(this.notebook, notebook);
	}
}

class NotebookExecutionListeners extends Disposable {
	private readonly _notebookModel: NotebookTextModel;

	constructor(
		notebook: URI,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookExecutionService private readonly _notebookExecutionService: INotebookExecutionService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
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

	private cancelAll(): void {
		this._logService.debug(`NotebookExecutionListeners#cancelAll`);
		const exes = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookModel.uri);
		this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, exes.map(exe => exe.cellHandle));
	}

	private onWillDisposeDocument(): void {
		this._logService.debug(`NotebookExecution#onWillDisposeDocument`);
		this.cancelAll();
	}

	private onWillAddRemoveCells(e: NotebookTextModelWillAddRemoveEvent): void {
		const notebookExes = this._notebookExecutionStateService.getCellExecutionsByHandleForNotebook(this._notebookModel.uri);

		const executingDeletedHandles = new Set<number>();
		const pendingDeletedHandles = new Set<number>();
		if (notebookExes) {
			e.rawEvent.changes.forEach(([start, deleteCount]) => {
				if (deleteCount) {
					const deletedHandles = this._notebookModel.cells.slice(start, start + deleteCount).map(c => c.handle);
					deletedHandles.forEach(h => {
						const exe = notebookExes.get(h);
						if (exe?.state === NotebookCellExecutionState.Executing) {
							executingDeletedHandles.add(h);
						} else if (exe) {
							pendingDeletedHandles.add(h);
						}
					});
				}
			});
		}

		if (executingDeletedHandles.size || pendingDeletedHandles.size) {
			const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(this._notebookModel);
			if (kernel) {
				const implementsInterrupt = kernel.implementsInterrupt;
				const handlesToCancel = implementsInterrupt ? [...executingDeletedHandles] : [...executingDeletedHandles, ...pendingDeletedHandles];
				this._logService.debug(`NotebookExecution#onWillAddRemoveCells, ${JSON.stringify([...handlesToCancel])}`);
				if (handlesToCancel.length) {
					kernel.cancelNotebookCellExecution(this._notebookModel.uri, handlesToCancel);
				}
			}
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
		const newInternalMetadata: Partial<NotebookCellInternalMetadata> = {};
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

class CellExecution extends Disposable implements INotebookCellExecution {
	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate = this._onDidUpdate.event;

	private readonly _onDidComplete = this._register(new Emitter<boolean | undefined>());
	readonly onDidComplete = this._onDidComplete.event;

	private _state: NotebookCellExecutionState = NotebookCellExecutionState.Unconfirmed;
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
		super();
		this._logService.debug(`CellExecution#ctor ${this.getCellLog()}`);
	}

	initialize() {
		const startExecuteEdit: ICellEditOperation = {
			editType: CellEditType.PartialInternalMetadata,
			handle: this.cellHandle,
			internalMetadata: {
				executionId: generateUuid(),
				runStartTime: null,
				runEndTime: null,
				lastRunSuccess: null,
				executionOrder: null,
				renderDuration: null,
			}
		};
		this._applyExecutionEdits([startExecuteEdit]);
	}

	private getCellLog(): string {
		return `${this._notebookModel.uri.toString()}, ${this.cellHandle}`;
	}

	private logUpdates(updates: ICellExecuteUpdate[]): void {
		const updateTypes = updates.map(u => CellExecutionUpdateType[u.editType]).join(', ');
		this._logService.debug(`CellExecution#updateExecution ${this.getCellLog()}, [${updateTypes}]`);
	}

	confirm() {
		this._logService.debug(`CellExecution#confirm ${this.getCellLog()}`);
		this._state = NotebookCellExecutionState.Pending;
		this._onDidUpdate.fire();
	}

	update(updates: ICellExecuteUpdate[]): void {
		this.logUpdates(updates);
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

		const cellModel = this._notebookModel.cells.find(c => c.handle === this.cellHandle);
		if (!cellModel) {
			this._logService.debug(`CellExecution#update, updating cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
		} else {
			const edits = updates.map(update => updateToEdit(update, this.cellHandle));
			this._applyExecutionEdits(edits);
		}

		if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
			this._onDidUpdate.fire();
		}
	}

	complete(completionData: ICellExecutionComplete): void {
		const cellModel = this._notebookModel.cells.find(c => c.handle === this.cellHandle);
		if (!cellModel) {
			this._logService.debug(`CellExecution#complete, completing cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
		} else {
			const edit: ICellEditOperation = {
				editType: CellEditType.PartialInternalMetadata,
				handle: this.cellHandle,
				internalMetadata: {
					lastRunSuccess: completionData.lastRunSuccess,
					runStartTime: this._didPause ? null : cellModel.internalMetadata.runStartTime,
					runEndTime: this._didPause ? null : completionData.runEndTime,
					error: completionData.error
				}
			};
			this._applyExecutionEdits([edit]);
		}

		this._onDidComplete.fire(completionData.lastRunSuccess);
	}

	private _applyExecutionEdits(edits: ICellEditOperation[]): void {
		this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
}

class NotebookExecution extends Disposable implements INotebookExecution {
	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate = this._onDidUpdate.event;

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete = this._onDidComplete.event;

	private _state: NotebookExecutionState = NotebookExecutionState.Unconfirmed;
	get state() {
		return this._state;
	}

	get notebook(): URI {
		return this._notebookModel.uri;
	}

	constructor(
		private readonly _notebookModel: NotebookTextModel,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._logService.debug(`NotebookExecution#ctor`);
	}
	private debug(message: string) {
		this._logService.debug(`${message} ${this._notebookModel.uri.toString()}`);
	}

	confirm() {
		this.debug(`Execution#confirm`);
		this._state = NotebookExecutionState.Pending;
		this._onDidUpdate.fire();
	}

	begin(): void {
		this.debug(`Execution#begin`);
		this._state = NotebookExecutionState.Executing;
		this._onDidUpdate.fire();
	}

	complete(): void {
		this.debug(`Execution#begin`);
		this._state = NotebookExecutionState.Unconfirmed;
		this._onDidComplete.fire();
	}
}
