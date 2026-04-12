/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExecutionStateCellStatusBarItem_1, TimerCellStatusBarItem_1;
import { disposableTimeout, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable, dispose, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { language } from '../../../../../../base/common/platform.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { themeColorFromId } from '../../../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { NotebookVisibleCellObserver } from './notebookVisibleCellObserver.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { cellStatusIconError, cellStatusIconSuccess } from '../../notebookEditorWidget.js';
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from '../../notebookIcons.js';
import { NotebookCellExecutionState, NotebookSetting } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { INotebookService } from '../../../common/notebookService.js';
export function formatCellDuration(duration, showMilliseconds = true) {
    if (showMilliseconds && duration < 1000) {
        return `${duration}ms`;
    }
    const minutes = Math.floor(duration / 1000 / 60);
    const seconds = Math.floor(duration / 1000) % 60;
    const tenths = Math.floor((duration % 1000) / 100);
    if (minutes > 0) {
        return `${minutes}m ${seconds}.${tenths}s`;
    }
    else {
        return `${seconds}.${tenths}s`;
    }
}
export class NotebookStatusBarController extends Disposable {
    constructor(_notebookEditor, _itemFactory) {
        super();
        this._notebookEditor = _notebookEditor;
        this._itemFactory = _itemFactory;
        this._visibleCells = new Map();
        this._observer = this._register(new NotebookVisibleCellObserver(this._notebookEditor));
        this._register(this._observer.onDidChangeVisibleCells(this._updateVisibleCells, this));
        this._updateEverything();
    }
    _updateEverything() {
        this._visibleCells.forEach(dispose);
        this._visibleCells.clear();
        this._updateVisibleCells({ added: this._observer.visibleCells, removed: [] });
    }
    _updateVisibleCells(e) {
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
    dispose() {
        super.dispose();
        this._visibleCells.forEach(dispose);
        this._visibleCells.clear();
    }
}
let ExecutionStateCellStatusBarContrib = class ExecutionStateCellStatusBarContrib extends Disposable {
    static { this.id = 'workbench.notebook.statusBar.execState'; }
    constructor(notebookEditor, instantiationService) {
        super();
        this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(ExecutionStateCellStatusBarItem, vm, cell)));
    }
};
ExecutionStateCellStatusBarContrib = __decorate([
    __param(1, IInstantiationService)
], ExecutionStateCellStatusBarContrib);
export { ExecutionStateCellStatusBarContrib };
registerNotebookContribution(ExecutionStateCellStatusBarContrib.id, ExecutionStateCellStatusBarContrib);
/**
 * Shows the cell's execution state in the cell status bar. When the "executing" state is shown, it will be shown for a minimum brief time.
 */
let ExecutionStateCellStatusBarItem = class ExecutionStateCellStatusBarItem extends Disposable {
    static { ExecutionStateCellStatusBarItem_1 = this; }
    static { this.MIN_SPINNER_TIME = 500; }
    constructor(_notebookViewModel, _cell, _executionStateService) {
        super();
        this._notebookViewModel = _notebookViewModel;
        this._cell = _cell;
        this._executionStateService = _executionStateService;
        this._currentItemIds = [];
        this._clearExecutingStateTimer = this._register(new MutableDisposable());
        this._update();
        this._register(this._executionStateService.onDidChangeExecution(e => {
            if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
                this._update();
            }
        }));
        this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
    }
    async _update() {
        const items = this._getItemsForCell();
        if (Array.isArray(items)) {
            this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
        }
    }
    /**
     *	Returns undefined if there should be no change, and an empty array if all items should be removed.
     */
    _getItemsForCell() {
        const runState = this._executionStateService.getCellExecution(this._cell.uri);
        // Show the execution spinner for a minimum time
        if (runState?.state === NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime !== 'number') {
            this._showedExecutingStateTime = Date.now();
        }
        else if (runState?.state !== NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime === 'number') {
            const timeUntilMin = ExecutionStateCellStatusBarItem_1.MIN_SPINNER_TIME - (Date.now() - this._showedExecutingStateTime);
            if (timeUntilMin > 0) {
                if (!this._clearExecutingStateTimer.value) {
                    this._clearExecutingStateTimer.value = disposableTimeout(() => {
                        this._showedExecutingStateTime = undefined;
                        this._clearExecutingStateTimer.clear();
                        this._update();
                    }, timeUntilMin);
                }
                return undefined;
            }
            else {
                this._showedExecutingStateTime = undefined;
            }
        }
        const items = this._getItemForState(runState, this._cell.internalMetadata);
        return items;
    }
    _getItemForState(runState, internalMetadata) {
        const state = runState?.state;
        const { lastRunSuccess } = internalMetadata;
        if (!state && lastRunSuccess) {
            return [{
                    text: `$(${successStateIcon.id})`,
                    color: themeColorFromId(cellStatusIconSuccess),
                    tooltip: localize('notebook.cell.status.success', "Success"),
                    alignment: 1 /* CellStatusbarAlignment.Left */,
                    priority: Number.MAX_SAFE_INTEGER
                }];
        }
        else if (!state && lastRunSuccess === false) {
            return [{
                    text: `$(${errorStateIcon.id})`,
                    color: themeColorFromId(cellStatusIconError),
                    tooltip: localize('notebook.cell.status.failed', "Failed"),
                    alignment: 1 /* CellStatusbarAlignment.Left */,
                    priority: Number.MAX_SAFE_INTEGER
                }];
        }
        else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
            return [{
                    text: `$(${pendingStateIcon.id})`,
                    tooltip: localize('notebook.cell.status.pending', "Pending"),
                    alignment: 1 /* CellStatusbarAlignment.Left */,
                    priority: Number.MAX_SAFE_INTEGER
                }];
        }
        else if (state === NotebookCellExecutionState.Executing) {
            const icon = runState?.didPause ?
                executingStateIcon :
                ThemeIcon.modify(executingStateIcon, 'spin');
            return [{
                    text: `$(${icon.id})`,
                    tooltip: localize('notebook.cell.status.executing', "Executing"),
                    alignment: 1 /* CellStatusbarAlignment.Left */,
                    priority: Number.MAX_SAFE_INTEGER
                }];
        }
        return [];
    }
    dispose() {
        super.dispose();
        this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
    }
};
ExecutionStateCellStatusBarItem = ExecutionStateCellStatusBarItem_1 = __decorate([
    __param(2, INotebookExecutionStateService)
], ExecutionStateCellStatusBarItem);
let TimerCellStatusBarContrib = class TimerCellStatusBarContrib extends Disposable {
    static { this.id = 'workbench.notebook.statusBar.execTimer'; }
    constructor(notebookEditor, instantiationService) {
        super();
        this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(TimerCellStatusBarItem, vm, cell)));
    }
};
TimerCellStatusBarContrib = __decorate([
    __param(1, IInstantiationService)
], TimerCellStatusBarContrib);
export { TimerCellStatusBarContrib };
registerNotebookContribution(TimerCellStatusBarContrib.id, TimerCellStatusBarContrib);
const UPDATE_TIMER_GRACE_PERIOD = 200;
let TimerCellStatusBarItem = class TimerCellStatusBarItem extends Disposable {
    static { TimerCellStatusBarItem_1 = this; }
    static { this.UPDATE_INTERVAL = 100; }
    constructor(_notebookViewModel, _cell, _executionStateService, _notebookService, _configurationService) {
        super();
        this._notebookViewModel = _notebookViewModel;
        this._cell = _cell;
        this._executionStateService = _executionStateService;
        this._notebookService = _notebookService;
        this._configurationService = _configurationService;
        this._currentItemIds = [];
        this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === 'verbose';
        this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarItem_1.UPDATE_INTERVAL));
        this._update();
        this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(NotebookSetting.cellExecutionTimeVerbosity)) {
                this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === 'verbose';
                this._update();
            }
        }));
    }
    async _update() {
        let timerItem;
        const runState = this._executionStateService.getCellExecution(this._cell.uri);
        const state = runState?.state;
        const startTime = this._cell.internalMetadata.runStartTime;
        const adjustment = this._cell.internalMetadata.runStartTimeAdjustment ?? 0;
        const endTime = this._cell.internalMetadata.runEndTime;
        if (runState?.didPause) {
            timerItem = undefined;
        }
        else if (state === NotebookCellExecutionState.Executing) {
            if (typeof startTime === 'number') {
                timerItem = this._getTimeItem(startTime, Date.now(), adjustment);
                this._scheduler.schedule();
            }
        }
        else if (!state) {
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
                }, UPDATE_TIMER_GRACE_PERIOD, this._store);
            }
        }
        else {
            this._deferredUpdate?.dispose();
            this._deferredUpdate = undefined;
            this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
        }
    }
    _getTimeItem(startTime, endTime, adjustment = 0, runtimeInformation) {
        const duration = endTime - startTime + adjustment;
        let tooltip;
        const lastExecution = new Date(endTime).toLocaleTimeString(language);
        if (runtimeInformation) {
            const { renderDuration, executionDuration, timerDuration } = runtimeInformation;
            let renderTimes = '';
            for (const key in renderDuration) {
                const rendererInfo = this._notebookService.getRendererInfo(key);
                const args = encodeURIComponent(JSON.stringify({
                    extensionId: rendererInfo?.extensionId.value ?? '',
                    issueBody: `Auto-generated text from notebook cell performance - Please add an explanation for the performance issue, including cell content if possible.\n` +
                        `The duration for the renderer, ${rendererInfo?.displayName ?? key}, is slower than expected.\n` +
                        `Execution Time: ${formatCellDuration(executionDuration)}\n` +
                        `Renderer Duration: ${formatCellDuration(renderDuration[key])}\n`
                }));
                // Show a link to create an issue if the renderer was slow compared to the execution duration, or just exceptionally slow on its own
                const renderIssueLink = (renderDuration[key] > 200 && executionDuration < 2000) || renderDuration[key] > 1000;
                const linkText = rendererInfo?.displayName ?? key;
                const rendererTitle = renderIssueLink ? `[${linkText}](command:workbench.action.openIssueReporter?${args})` : `**${linkText}**`;
                renderTimes += `- ${rendererTitle} ${formatCellDuration(renderDuration[key])}\n`;
            }
            renderTimes += `\n*${localize('notebook.cell.statusBar.timerTooltip.reportIssueFootnote', "Use the links above to file an issue using the issue reporter.")}*\n`;
            tooltip = {
                value: localize('notebook.cell.statusBar.timerTooltip', "**Last Execution** {0}\n\n**Execution Time** {1}\n\n**Overhead Time** {2}\n\n**Render Times**\n\n{3}", lastExecution, formatCellDuration(executionDuration), formatCellDuration(timerDuration - executionDuration), renderTimes),
                isTrusted: true
            };
        }
        const executionText = this._isVerbose ?
            localize('notebook.cell.statusBar.timerVerbose', "Last Execution: {0}, Duration: {1}", lastExecution, formatCellDuration(duration, false)) :
            formatCellDuration(duration, false);
        return {
            text: executionText,
            alignment: 1 /* CellStatusbarAlignment.Left */,
            priority: Number.MAX_SAFE_INTEGER - 5,
            tooltip
        };
    }
    dispose() {
        super.dispose();
        this._deferredUpdate?.dispose();
        this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
    }
};
TimerCellStatusBarItem = TimerCellStatusBarItem_1 = __decorate([
    __param(2, INotebookExecutionStateService),
    __param(3, INotebookService),
    __param(4, IConfigurationService)
], TimerCellStatusBarItem);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlY3V0aW9uU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvY2VsbFN0YXR1c0Jhci9leGVjdXRpb25TdGF0dXNCYXJJdGVtQ29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQThCLDJCQUEyQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0csT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2hILE9BQU8sRUFBc0Qs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