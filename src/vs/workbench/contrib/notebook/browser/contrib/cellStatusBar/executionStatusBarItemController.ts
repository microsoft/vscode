/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { themeColorFromId, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ICellVisibilityChangeEvent, NotebookVisibleCellObserver } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/notebookVisibleCellObserver';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution, INotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { cellStatusIconError, cellStatusIconSuccess } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellStatusbarAlignment, INotebookCellStatusBarItem, NotebookCellExecutionState, NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookCellExecution, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export function formatCellDuration(duration: number): string {
	const minutes = Math.floor(duration / 1000 / 60);
	const seconds = Math.floor(duration / 1000) % 60;
	const tenths = String(duration - minutes * 60 * 1000 - seconds * 1000).charAt(0);

	if (minutes > 0) {
		return `${minutes}m ${seconds}.${tenths}s`;
	} else {
		return `${seconds}.${tenths}s`;
	}
}

export class NotebookStatusBarController extends Disposable {
	private readonly _visibleCells = new Map<number, IDisposable>();
	private readonly _observer: NotebookVisibleCellObserver;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _itemFactory: (vm: INotebookViewModel, cell: ICellViewModel) => IDisposable,
	) {
		super();
		this._observer = this._register(new NotebookVisibleCellObserver(this._notebookEditor));
		this._register(this._observer.onDidChangeVisibleCells(this._updateVisibleCells, this));

		this._updateEverything();
	}

	private _updateEverything(): void {
		this._visibleCells.forEach(dispose);
		this._visibleCells.clear();
		this._updateVisibleCells({ added: this._observer.visibleCells, removed: [] });
	}

	private _updateVisibleCells(e: ICellVisibilityChangeEvent): void {
		const vm = this._notebookEditor._getViewModel();
		if (!vm) {
			return;
		}

		for (const newCell of e.added) {
			this._visibleCells.set(newCell.handle, this._itemFactory(vm, newCell));
		}

		for (const oldCell of e.removed) {
			this._visibleCells.get(oldCell.handle)?.dispose();
			this._visibleCells.delete(oldCell.handle);
		}
	}

	override dispose(): void {
		super.dispose();

		this._visibleCells.forEach(dispose);
		this._visibleCells.clear();
	}
}

export class ExecutionStateCellStatusBarContrib extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar.execState';

	constructor(notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(ExecutionStateCellStatusBarItem, vm, cell)));
	}
}
registerNotebookContribution(ExecutionStateCellStatusBarContrib.id, ExecutionStateCellStatusBarContrib);

/**
 * Shows the cell's execution state in the cell status bar. When the "executing" state is shown, it will be shown for a minimum brief time.
 */
class ExecutionStateCellStatusBarItem extends Disposable {
	private static readonly MIN_SPINNER_TIME = 500;

	private _currentItemIds: string[] = [];

	private _currentExecutingStateTimer: IDisposable | undefined;

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly _cell: ICellViewModel,
		@INotebookExecutionStateService private readonly _executionStateService: INotebookExecutionStateService
	) {
		super();

		this._update();
		this._register(this._executionStateService.onDidChangeCellExecution(e => {
			if (e.affectsCell(this._cell.uri)) {
				this._update();
			}
		}));
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		const items = this._getItemsForCell();
		if (Array.isArray(items)) {
			this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
		}
	}

	/**
	 *	Returns undefined if there should be no change, and an empty array if all items should be removed.
	 */
	private _getItemsForCell(): INotebookCellStatusBarItem[] | undefined {
		const runState = this._executionStateService.getCellExecution(this._cell.uri);
		if (this._currentExecutingStateTimer && !runState?.isPaused) {
			return;
		}

		const item = this._getItemForState(runState, this._cell.internalMetadata);

		// Show the execution spinner for a minimum time
		if (runState?.state === NotebookCellExecutionState.Executing) {
			this._currentExecutingStateTimer = this._register(disposableTimeout(() => {
				const runState = this._executionStateService.getCellExecution(this._cell.uri);
				this._currentExecutingStateTimer = undefined;
				if (runState?.state !== NotebookCellExecutionState.Executing) {
					this._update();
				}
			}, ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME));
		}

		return item ? [item] : [];
	}

	private _getItemForState(runState: INotebookCellExecution | undefined, internalMetadata: NotebookCellInternalMetadata): INotebookCellStatusBarItem | undefined {
		const state = runState?.state;
		const { lastRunSuccess } = internalMetadata;
		if (!state && lastRunSuccess) {
			return <INotebookCellStatusBarItem>{
				text: `$(${successStateIcon.id})`,
				color: themeColorFromId(cellStatusIconSuccess),
				tooltip: localize('notebook.cell.status.success', "Success"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (!state && lastRunSuccess === false) {
			return <INotebookCellStatusBarItem>{
				text: `$(${errorStateIcon.id})`,
				color: themeColorFromId(cellStatusIconError),
				tooltip: localize('notebook.cell.status.failed', "Failed"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
			return <INotebookCellStatusBarItem>{
				text: `$(${pendingStateIcon.id})`,
				tooltip: localize('notebook.cell.status.pending', "Pending"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (state === NotebookCellExecutionState.Executing) {
			const icon = runState?.didPause ?
				executingStateIcon :
				ThemeIcon.modify(executingStateIcon, 'spin');
			return <INotebookCellStatusBarItem>{
				text: `$(${icon.id})`,
				tooltip: localize('notebook.cell.status.executing', "Executing"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		}

		return;
	}

	override dispose() {
		super.dispose();

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
	}
}

export class TimerCellStatusBarContrib extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar.execTimer';

	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(TimerCellStatusBarItem, vm, cell)));
	}
}
registerNotebookContribution(TimerCellStatusBarContrib.id, TimerCellStatusBarContrib);

class TimerCellStatusBarItem extends Disposable {
	private static UPDATE_INTERVAL = 100;
	private _currentItemIds: string[] = [];

	private _scheduler: RunOnceScheduler;

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly _cell: ICellViewModel,
		@INotebookExecutionStateService private readonly _executionStateService: INotebookExecutionStateService
	) {
		super();

		this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarItem.UPDATE_INTERVAL));
		this._update();
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		let item: INotebookCellStatusBarItem | undefined;
		const runState = this._executionStateService.getCellExecution(this._cell.uri);
		const state = runState?.state;
		if (runState?.didPause) {
			item = undefined;
		} else if (state === NotebookCellExecutionState.Executing) {
			const startTime = this._cell.internalMetadata.runStartTime;
			const adjustment = this._cell.internalMetadata.runStartTimeAdjustment;
			if (typeof startTime === 'number') {
				item = this._getTimeItem(startTime, Date.now(), adjustment);
				this._scheduler.schedule();
			}
		} else if (!state) {
			const startTime = this._cell.internalMetadata.runStartTime;
			const endTime = this._cell.internalMetadata.runEndTime;
			if (typeof startTime === 'number' && typeof endTime === 'number') {
				item = this._getTimeItem(startTime, endTime);
			}
		}

		const items = item ? [item] : [];
		this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
	}

	private _getTimeItem(startTime: number, endTime: number, adjustment: number = 0): INotebookCellStatusBarItem {
		const duration = endTime - startTime + adjustment;
		return <INotebookCellStatusBarItem>{
			text: formatCellDuration(duration),
			alignment: CellStatusbarAlignment.Left,
			priority: Number.MAX_SAFE_INTEGER - 1
		};
	}

	override dispose() {
		super.dispose();

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
	}
}
