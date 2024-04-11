/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, dispose, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICellVisibilityChangeEvent, NotebookVisibleCellObserver } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/notebookVisibleCellObserver';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution, INotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { cellStatusIconError, cellStatusIconSuccess } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellStatusbarAlignment, INotebookCellStatusBarItem, NotebookCellExecutionState, NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookCellExecution, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID } from 'vs/workbench/contrib/notebook/browser/contrib/cellCommands/cellCommands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export function formatCellDuration(duration: number, showMilliseconds: boolean = true): string {
	if (showMilliseconds && duration < 1000) {
		return `${duration}ms`;
	}

	const minutes = Math.floor(duration / 1000 / 60);
	const seconds = Math.floor(duration / 1000) % 60;
	const tenths = Math.floor((duration % 1000) / 100);

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
		const vm = this._notebookEditor.getViewModel();
		if (!vm) {
			return;
		}

		for (const oldCell of e.removed) {
			this._visibleCells.get(oldCell.handle)?.dispose();
			this._visibleCells.delete(oldCell.handle);
		}

		for (const newCell of e.added) {
			this._visibleCells.set(newCell.handle, this._itemFactory(vm, newCell));
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

	private _showedExecutingStateTime: number | undefined;
	private readonly _clearExecutingStateTimer = this._register(new MutableDisposable());

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly _cell: ICellViewModel,
		@INotebookExecutionStateService private readonly _executionStateService: INotebookExecutionStateService
	) {
		super();

		this._update();
		this._register(this._executionStateService.onDidChangeExecution(e => {
			if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
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

		// Show the execution spinner for a minimum time
		if (runState?.state === NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime !== 'number') {
			this._showedExecutingStateTime = Date.now();
		} else if (runState?.state !== NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime === 'number') {
			const timeUntilMin = ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME - (Date.now() - this._showedExecutingStateTime);
			if (timeUntilMin > 0) {
				if (!this._clearExecutingStateTimer.value) {
					this._clearExecutingStateTimer.value = disposableTimeout(() => {
						this._showedExecutingStateTime = undefined;
						this._clearExecutingStateTimer.clear();
						this._update();
					}, timeUntilMin);
				}

				return undefined;
			} else {
				this._showedExecutingStateTime = undefined;
			}
		}

		const items = this._getItemForState(runState, this._cell.internalMetadata);
		return items;
	}

	private _getItemForState(runState: INotebookCellExecution | undefined, internalMetadata: NotebookCellInternalMetadata): INotebookCellStatusBarItem[] {
		const state = runState?.state;
		const { lastRunSuccess } = internalMetadata;
		if (!state && lastRunSuccess) {
			return [<INotebookCellStatusBarItem>{
				text: `$(${successStateIcon.id})`,
				color: themeColorFromId(cellStatusIconSuccess),
				tooltip: localize('notebook.cell.status.success', "Success"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			}];
		} else if (!state && lastRunSuccess === false) {
			return [{
				text: `$(${errorStateIcon.id})`,
				color: themeColorFromId(cellStatusIconError),
				tooltip: localize('notebook.cell.status.failed', "Failed"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			}];
		} else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
			return [<INotebookCellStatusBarItem>{
				text: `$(${pendingStateIcon.id})`,
				tooltip: localize('notebook.cell.status.pending', "Pending"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			}];
		} else if (state === NotebookCellExecutionState.Executing) {
			const icon = runState?.didPause ?
				executingStateIcon :
				ThemeIcon.modify(executingStateIcon, 'spin');
			return [<INotebookCellStatusBarItem>{
				text: `$(${icon.id})`,
				tooltip: localize('notebook.cell.status.executing', "Executing"),
				alignment: CellStatusbarAlignment.Left,
				priority: Number.MAX_SAFE_INTEGER
			}];
		}

		return [];
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

const UPDATE_TIMER_GRACE_PERIOD = 200;

class TimerCellStatusBarItem extends Disposable {
	private static UPDATE_INTERVAL = 100;
	private _currentItemIds: string[] = [];

	private _scheduler: RunOnceScheduler;

	private _deferredUpdate: IDisposable | undefined;

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly _cell: ICellViewModel,
		@INotebookExecutionStateService private readonly _executionStateService: INotebookExecutionStateService,
		@INotebookService private readonly _notebookService: INotebookService,
	) {
		super();

		this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarItem.UPDATE_INTERVAL));
		this._update();
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
	}

	private async _update() {
		let timerItem: INotebookCellStatusBarItem | undefined;
		const runState = this._executionStateService.getCellExecution(this._cell.uri);
		const state = runState?.state;
		const startTime = this._cell.internalMetadata.runStartTime;
		const adjustment = this._cell.internalMetadata.runStartTimeAdjustment ?? 0;
		const endTime = this._cell.internalMetadata.runEndTime;

		if (runState?.didPause) {
			timerItem = undefined;
		} else if (state === NotebookCellExecutionState.Executing) {
			if (typeof startTime === 'number') {
				timerItem = this._getTimeItem(startTime, Date.now(), adjustment);
				this._scheduler.schedule();
			}
		} else if (!state) {
			if (typeof startTime === 'number' && typeof endTime === 'number') {
				const timerDuration = Date.now() - startTime + adjustment;
				const executionDuration = endTime - startTime;
				const renderDuration = this._cell.internalMetadata.renderDuration ?? {};

				timerItem = this._getTimeItem(startTime, endTime, undefined, {
					timerDuration,
					executionDuration,
					renderDuration
				});
			}
		}

		const items = timerItem ? [timerItem] : [];

		if (!items.length && !!runState) {
			if (!this._deferredUpdate) {
				this._deferredUpdate = disposableTimeout(() => {
					this._deferredUpdate = undefined;
					this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
				}, UPDATE_TIMER_GRACE_PERIOD);
			}
		} else {
			this._deferredUpdate?.dispose();
			this._deferredUpdate = undefined;
			this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
		}
	}

	private _getTimeItem(startTime: number, endTime: number, adjustment: number = 0, runtimeInformation?: { renderDuration: { [key: string]: number }; executionDuration: number; timerDuration: number }): INotebookCellStatusBarItem {
		const duration = endTime - startTime + adjustment;

		let tooltip: IMarkdownString | undefined;

		if (runtimeInformation) {
			const lastExecution = new Date(endTime).toLocaleTimeString(language);
			const { renderDuration, executionDuration, timerDuration } = runtimeInformation;

			let renderTimes = '';
			for (const key in renderDuration) {
				const rendererInfo = this._notebookService.getRendererInfo(key);

				const args = encodeURIComponent(JSON.stringify({
					extensionId: rendererInfo?.extensionId.value ?? '',
					issueBody:
						`Auto-generated text from notebook cell performance. The duration for the renderer, ${rendererInfo?.displayName ?? key}, is slower than expected.\n` +
						`Execution Time: ${formatCellDuration(executionDuration)}\n` +
						`Renderer Duration: ${formatCellDuration(renderDuration[key])}\n`
				}));

				renderTimes += `- [${rendererInfo?.displayName ?? key}](command:workbench.action.openIssueReporter?${args}) ${formatCellDuration(renderDuration[key])}\n`;
			}

			renderTimes += `\n*${localize('notebook.cell.statusBar.timerTooltip.reportIssueFootnote', "Use the links above to file an issue using the issue reporter.")}*\n`;

			tooltip = {
				value: localize('notebook.cell.statusBar.timerTooltip', "**Last Execution** {0}\n\n**Execution Time** {1}\n\n**Overhead Time** {2}\n\n**Render Times**\n\n{3}", lastExecution, formatCellDuration(executionDuration), formatCellDuration(timerDuration - executionDuration), renderTimes),
				isTrusted: true
			};

		}

		return <INotebookCellStatusBarItem>{
			text: formatCellDuration(duration, false),
			alignment: CellStatusbarAlignment.Left,
			priority: Number.MAX_SAFE_INTEGER - 5,
			tooltip
		};
	}

	override dispose() {
		super.dispose();

		this._deferredUpdate?.dispose();
		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
	}
}

export class DiagnosticCellStatusBarContrib extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar.diagtnostic';

	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) =>
			cell instanceof CodeCellViewModel ?
				instantiationService.createInstance(DiagnosticCellStatusBarItem, vm, cell) :
				Disposable.None
		));
	}
}
registerNotebookContribution(DiagnosticCellStatusBarContrib.id, DiagnosticCellStatusBarContrib);


class DiagnosticCellStatusBarItem extends Disposable {
	private _currentItemIds: string[] = [];

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly cell: CodeCellViewModel,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
		this._update();
		this._register(this.cell.cellDiagnostics.onDidDiagnosticsChange(() => this._update()));
	}

	private async _update() {
		let item: INotebookCellStatusBarItem | undefined;

		if (!!this.cell.cellDiagnostics.ErrorDetails) {
			const keybinding = this.keybindingService.lookupKeybinding(OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID)?.getLabel();
			const tooltip = localize('notebook.cell.status.diagnostic', "Quick Actions {0}", `(${keybinding})`);

			item = {
				text: `$(sparkle)`,
				tooltip,
				alignment: CellStatusbarAlignment.Left,
				command: OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID,
				priority: Number.MAX_SAFE_INTEGER - 1
			};
		}

		const items = item ? [item] : [];
		this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items }]);
	}

	override dispose() {
		super.dispose();
		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items: [] }]);
	}
}
