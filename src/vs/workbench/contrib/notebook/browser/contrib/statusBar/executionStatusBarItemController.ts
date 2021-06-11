/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { ICellVisibilityChangeEvent, NotebookVisibleCellObserver } from 'vs/workbench/contrib/notebook/browser/contrib/statusBar/notebookVisibleCellObserver';
import { EXECUTE_CELL_COMMAND_ID, ICellViewModel, INotebookEditor, INotebookEditorContribution, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_FOCUSED, QUIT_EDIT_CELL_COMMAND_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { cellStatusIconError, cellStatusIconSuccess } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellKind, CellStatusbarAlignment, INotebookCellStatusBarItem, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookStatusBarController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar.exec';

	private readonly _visibleCells = new Map<number, IDisposable[]>();

	private readonly _observer: NotebookVisibleCellObserver;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
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
		const vm = this._notebookEditor.viewModel;
		if (!vm) {
			return;
		}

		for (let newCell of e.added) {
			const helpers = [
				this._instantiationService.createInstance(ExecutionStateCellStatusBarHelper, vm, newCell),
				this._instantiationService.createInstance(TimerCellStatusBarHelper, vm, newCell),
				this._instantiationService.createInstance(KeybindingPlaceholderStatusBarHelper, vm, newCell),
			];
			this._visibleCells.set(newCell.handle, helpers);
		}

		for (let oldCell of e.removed) {
			this._visibleCells.get(oldCell.handle)?.forEach(dispose);
			this._visibleCells.delete(oldCell.handle);
		}
	}

	override dispose(): void {
		super.dispose();

		this._visibleCells.forEach(dispose);
		this._visibleCells.clear();
	}
}

/**
 * Shows the cell's execution state in the cell status bar. When the "executing" state is shown, it will be shown for a minimum brief time.
 */
class ExecutionStateCellStatusBarHelper extends Disposable {
	private static readonly MIN_SPINNER_TIME = 500;

	private _currentItemIds: string[] = [];

	private _currentExecutingStateTimer: any;

	constructor(
		private readonly _notebookViewModel: NotebookViewModel,
		private readonly _cell: ICellViewModel,
	) {
		super();

		this._update();
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		const items = this._getItemsForCell(this._cell);
		if (Array.isArray(items)) {
			this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
		}
	}

	/**
	 *	Returns undefined if there should be no change, and an empty array if all items should be removed.
	 */
	private _getItemsForCell(cell: ICellViewModel): INotebookCellStatusBarItem[] | undefined {
		if (this._currentExecutingStateTimer) {
			return;
		}

		const item = this._getItemForState(cell.internalMetadata.runState, cell.internalMetadata.lastRunSuccess);

		// Show the execution spinner for a minimum time
		if (cell.internalMetadata.runState === NotebookCellExecutionState.Executing) {
			this._currentExecutingStateTimer = setTimeout(() => {
				this._currentExecutingStateTimer = undefined;
				if (cell.internalMetadata.runState !== NotebookCellExecutionState.Executing) {
					this._update();
				}
			}, ExecutionStateCellStatusBarHelper.MIN_SPINNER_TIME);
		}

		return item ? [item] : [];
	}

	private _getItemForState(runState: NotebookCellExecutionState | undefined, lastRunSuccess: boolean | undefined): INotebookCellStatusBarItem | undefined {
		if (!runState && lastRunSuccess) {
			return <INotebookCellStatusBarItem>{
				text: '$(notebook-state-success)',
				color: themeColorFromId(cellStatusIconSuccess),
				tooltip: localize('notebook.cell.status.success', "Success"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (!runState && lastRunSuccess === false) {
			return <INotebookCellStatusBarItem>{
				text: '$(notebook-state-error)',
				color: themeColorFromId(cellStatusIconError),
				tooltip: localize('notebook.cell.status.failed', "Failed"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (runState === NotebookCellExecutionState.Pending) {
			return <INotebookCellStatusBarItem>{
				text: '$(notebook-state-pending)',
				tooltip: localize('notebook.cell.status.pending', "Pending"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			};
		} else if (runState === NotebookCellExecutionState.Executing) {
			return <INotebookCellStatusBarItem>{
				text: '$(notebook-state-executing~spin)',
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

class TimerCellStatusBarHelper extends Disposable {
	private static UPDATE_INTERVAL = 100;
	private _currentItemIds: string[] = [];

	private _scheduler: RunOnceScheduler;

	constructor(
		private readonly _notebookViewModel: NotebookViewModel,
		private readonly _cell: ICellViewModel,
	) {
		super();

		this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarHelper.UPDATE_INTERVAL));
		this._update();
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		let item: INotebookCellStatusBarItem | undefined;
		const state = this._cell.internalMetadata.runState;
		if (state === NotebookCellExecutionState.Executing) {
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
			text: this._formatDuration(duration),
			alignment: CellStatusbarAlignment.Left,
			priority: Number.MAX_SAFE_INTEGER - 1
		};
	}

	private _formatDuration(duration: number) {
		const seconds = Math.floor(duration / 1000);
		const tenths = String(duration - seconds * 1000).charAt(0);

		return `${seconds}.${tenths}s`;
	}

	override dispose() {
		super.dispose();

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
	}
}

/**
 * Shows a keybinding hint for the execute command
 */
class KeybindingPlaceholderStatusBarHelper extends Disposable {
	private _currentItemIds: string[] = [];
	private readonly _codeContextKeyService: IContextKeyService;
	private readonly _markupContextKeyService: IContextKeyService;

	constructor(
		private readonly _notebookViewModel: NotebookViewModel,
		private readonly _cell: ICellViewModel,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService _contextKeyService: IContextKeyService,
	) {
		super();

		// Create a fake ContextKeyService, and look up the keybindings within this context.
		const commonContextKeyService = this._register(_contextKeyService.createScoped(document.createElement('div')));
		InputFocusedContext.bindTo(commonContextKeyService).set(true);
		EditorContextKeys.editorTextFocus.bindTo(commonContextKeyService).set(true);
		EditorContextKeys.focus.bindTo(commonContextKeyService).set(true);
		EditorContextKeys.textInputFocus.bindTo(commonContextKeyService).set(true);
		NOTEBOOK_CELL_EXECUTION_STATE.bindTo(commonContextKeyService).set('idle');
		NOTEBOOK_CELL_LIST_FOCUSED.bindTo(commonContextKeyService).set(true);
		NOTEBOOK_EDITOR_FOCUSED.bindTo(commonContextKeyService).set(true);

		this._codeContextKeyService = this._register(commonContextKeyService.createScoped(document.createElement('div')));
		NOTEBOOK_CELL_TYPE.bindTo(this._codeContextKeyService).set('code');

		this._markupContextKeyService = this._register(commonContextKeyService.createScoped(document.createElement('div')));
		NOTEBOOK_CELL_TYPE.bindTo(this._markupContextKeyService).set('markup');

		this._update();
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		const items = this._getItemsForCell(this._cell);
		if (Array.isArray(items)) {
			this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
		}
	}

	private _getItemsForCell(cell: ICellViewModel): INotebookCellStatusBarItem[] {
		if (typeof cell.internalMetadata.runState !== 'undefined' || typeof cell.internalMetadata.lastRunSuccess !== 'undefined') {
			return [];
		}

		let text: string;
		if (cell.cellKind === CellKind.Code) {
			const keybinding = this._keybindingService.lookupKeybinding(EXECUTE_CELL_COMMAND_ID, this._codeContextKeyService)?.getLabel();
			if (!keybinding) {
				return [];
			}

			text = localize('notebook.cell.status.codeExecuteTip', "Press {0} to execute cell", keybinding);
		} else {
			const keybinding = this._keybindingService.lookupKeybinding(QUIT_EDIT_CELL_COMMAND_ID, this._markupContextKeyService)?.getLabel();
			if (!keybinding) {
				return [];
			}

			text = localize('notebook.cell.status.markdownExecuteTip', "Press {0} to stop editing", keybinding);
		}

		const item = <INotebookCellStatusBarItem>{
			text,
			tooltip: text,
			alignment: CellStatusbarAlignment.Left,
			opacity: '0.7',
			onlyShowWhenActive: true,
			priority: 100
		};

		return [item];
	}


	override dispose() {
		super.dispose();

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
	}
}

registerNotebookContribution(NotebookStatusBarController.id, NotebookStatusBarController);
