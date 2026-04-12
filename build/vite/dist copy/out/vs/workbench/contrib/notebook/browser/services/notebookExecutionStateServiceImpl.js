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
import { Emitter } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CellUri, NotebookCellExecutionState, NotebookExecutionState } from '../../common/notebookCommon.js';
import { CellExecutionUpdateType, INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookService } from '../../common/notebookService.js';
let NotebookExecutionStateService = class NotebookExecutionStateService extends Disposable {
    constructor(_instantiationService, _logService, _notebookService, _accessibilitySignalService) {
        super();
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._notebookService = _notebookService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._executions = new ResourceMap();
        this._notebookExecutions = new ResourceMap();
        this._notebookListeners = new ResourceMap();
        this._cellListeners = new ResourceMap();
        this._lastFailedCells = new ResourceMap();
        this._lastCompletedCellHandles = new ResourceMap();
        this._onDidChangeExecution = this._register(new Emitter());
        this.onDidChangeExecution = this._onDidChangeExecution.event;
        this._onDidChangeLastRunFailState = this._register(new Emitter());
        this.onDidChangeLastRunFailState = this._onDidChangeLastRunFailState.event;
    }
    getLastFailedCellForNotebook(notebook) {
        const failedCell = this._lastFailedCells.get(notebook);
        return failedCell?.visible ? failedCell.cellHandle : undefined;
    }
    getLastCompletedCellForNotebook(notebook) {
        return this._lastCompletedCellHandles.get(notebook);
    }
    forceCancelNotebookExecutions(notebookUri) {
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
    getCellExecution(cellUri) {
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
    getExecution(notebook) {
        return this._notebookExecutions.get(notebook)?.[0];
    }
    getCellExecutionsForNotebook(notebook) {
        const exeMap = this._executions.get(notebook);
        return exeMap ? Array.from(exeMap.values()) : [];
    }
    getCellExecutionsByHandleForNotebook(notebook) {
        const exeMap = this._executions.get(notebook);
        return exeMap ? new Map(exeMap.entries()) : undefined;
    }
    _onCellExecutionDidChange(notebookUri, cellHandle, exe) {
        this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle, exe));
    }
    _onCellExecutionDidComplete(notebookUri, cellHandle, exe, lastRunSuccess) {
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
            }
            else {
                this._accessibilitySignalService.playSignal(AccessibilitySignal.notebookCellFailed);
                this._setLastFailedCell(notebookUri, cellHandle);
            }
            this._lastCompletedCellHandles.set(notebookUri, cellHandle);
        }
        this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle));
    }
    _onExecutionDidChange(notebookUri, exe) {
        this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri, exe));
    }
    _onExecutionDidComplete(notebookUri) {
        const disposables = this._notebookExecutions.get(notebookUri);
        if (!Array.isArray(disposables)) {
            this._logService.debug(`NotebookExecutionStateService#_onCellExecutionDidComplete - unknown notebook ${notebookUri.toString()}`);
            return;
        }
        this._notebookExecutions.delete(notebookUri);
        this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri));
        disposables.forEach(d => d.dispose());
    }
    createCellExecution(notebookUri, cellHandle) {
        const notebook = this._notebookService.getNotebookTextModel(notebookUri);
        if (!notebook) {
            throw new Error(`Notebook not found: ${notebookUri.toString()}`);
        }
        let notebookExecutionMap = this._executions.get(notebookUri);
        if (!notebookExecutionMap) {
            const listeners = this._instantiationService.createInstance(NotebookExecutionListeners, notebookUri);
            this._notebookListeners.set(notebookUri, listeners);
            notebookExecutionMap = new Map();
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
    createExecution(notebookUri) {
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
    _createNotebookCellExecution(notebook, cellHandle) {
        const notebookUri = notebook.uri;
        const exe = this._instantiationService.createInstance(CellExecution, cellHandle, notebook);
        const disposable = combinedDisposable(exe.onDidUpdate(() => this._onCellExecutionDidChange(notebookUri, cellHandle, exe)), exe.onDidComplete(lastRunSuccess => this._onCellExecutionDidComplete(notebookUri, cellHandle, exe, lastRunSuccess)));
        this._cellListeners.set(CellUri.generate(notebookUri, cellHandle), disposable);
        return exe;
    }
    _createNotebookExecution(notebook) {
        const notebookUri = notebook.uri;
        const exe = this._instantiationService.createInstance(NotebookExecution, notebook);
        const disposable = combinedDisposable(exe.onDidUpdate(() => this._onExecutionDidChange(notebookUri, exe)), exe.onDidComplete(() => this._onExecutionDidComplete(notebookUri)));
        return [exe, disposable];
    }
    _setLastFailedCell(notebookURI, cellHandle) {
        const prevLastFailedCellInfo = this._lastFailedCells.get(notebookURI);
        const notebook = this._notebookService.getNotebookTextModel(notebookURI);
        if (!notebook) {
            return;
        }
        const newLastFailedCellInfo = {
            cellHandle: cellHandle,
            disposable: prevLastFailedCellInfo ? prevLastFailedCellInfo.disposable : this._getFailedCellListener(notebook),
            visible: true
        };
        this._lastFailedCells.set(notebookURI, newLastFailedCellInfo);
        this._onDidChangeLastRunFailState.fire({ visible: true, notebook: notebookURI });
    }
    _setLastFailedCellVisibility(notebookURI, visible) {
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
    _clearLastFailedCell(notebookURI) {
        const lastFailedCellInfo = this._lastFailedCells.get(notebookURI);
        if (lastFailedCellInfo) {
            lastFailedCellInfo.disposable?.dispose();
            this._lastFailedCells.delete(notebookURI);
        }
        this._onDidChangeLastRunFailState.fire({ visible: false, notebook: notebookURI });
    }
    _getFailedCellListener(notebook) {
        return notebook.onWillAddRemoveCells((e) => {
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
    dispose() {
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
};
NotebookExecutionStateService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILogService),
    __param(2, INotebookService),
    __param(3, IAccessibilitySignalService)
], NotebookExecutionStateService);
export { NotebookExecutionStateService };
class NotebookCellExecutionEvent {
    constructor(notebook, cellHandle, changed) {
        this.notebook = notebook;
        this.cellHandle = cellHandle;
        this.changed = changed;
        this.type = NotebookExecutionType.cell;
    }
    affectsCell(cell) {
        const parsedUri = CellUri.parse(cell);
        return !!parsedUri && isEqual(this.notebook, parsedUri.notebook) && this.cellHandle === parsedUri.handle;
    }
    affectsNotebook(notebook) {
        return isEqual(this.notebook, notebook);
    }
}
class NotebookExecutionEvent {
    constructor(notebook, changed) {
        this.notebook = notebook;
        this.changed = changed;
        this.type = NotebookExecutionType.notebook;
    }
    affectsNotebook(notebook) {
        return isEqual(this.notebook, notebook);
    }
}
let NotebookExecutionListeners = class NotebookExecutionListeners extends Disposable {
    constructor(notebook, _notebookService, _notebookKernelService, _notebookExecutionService, _notebookExecutionStateService, _logService) {
        super();
        this._notebookService = _notebookService;
        this._notebookKernelService = _notebookKernelService;
        this._notebookExecutionService = _notebookExecutionService;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this._logService = _logService;
        this._logService.debug(`NotebookExecution#ctor ${notebook.toString()}`);
        const notebookModel = this._notebookService.getNotebookTextModel(notebook);
        if (!notebookModel) {
            throw new Error('Notebook not found: ' + notebook);
        }
        this._notebookModel = notebookModel;
        this._register(this._notebookModel.onWillAddRemoveCells(e => this.onWillAddRemoveCells(e)));
        this._register(this._notebookModel.onWillDispose(() => this.onWillDisposeDocument()));
    }
    cancelAll() {
        this._logService.debug(`NotebookExecutionListeners#cancelAll`);
        const exes = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookModel.uri);
        this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, exes.map(exe => exe.cellHandle));
    }
    onWillDisposeDocument() {
        this._logService.debug(`NotebookExecution#onWillDisposeDocument`);
        this.cancelAll();
    }
    onWillAddRemoveCells(e) {
        const notebookExes = this._notebookExecutionStateService.getCellExecutionsByHandleForNotebook(this._notebookModel.uri);
        const executingDeletedHandles = new Set();
        const pendingDeletedHandles = new Set();
        if (notebookExes) {
            e.rawEvent.changes.forEach(([start, deleteCount]) => {
                if (deleteCount) {
                    const deletedHandles = this._notebookModel.cells.slice(start, start + deleteCount).map(c => c.handle);
                    deletedHandles.forEach(h => {
                        const exe = notebookExes.get(h);
                        if (exe?.state === NotebookCellExecutionState.Executing) {
                            executingDeletedHandles.add(h);
                        }
                        else if (exe) {
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
};
NotebookExecutionListeners = __decorate([
    __param(1, INotebookService),
    __param(2, INotebookKernelService),
    __param(3, INotebookExecutionService),
    __param(4, INotebookExecutionStateService),
    __param(5, ILogService)
], NotebookExecutionListeners);
function updateToEdit(update, cellHandle) {
    if (update.editType === CellExecutionUpdateType.Output) {
        return {
            editType: 2 /* CellEditType.Output */,
            handle: update.cellHandle,
            append: update.append,
            outputs: update.outputs,
        };
    }
    else if (update.editType === CellExecutionUpdateType.OutputItems) {
        return {
            editType: 7 /* CellEditType.OutputItems */,
            items: update.items,
            append: update.append,
            outputId: update.outputId
        };
    }
    else if (update.editType === CellExecutionUpdateType.ExecutionState) {
        const newInternalMetadata = {};
        if (typeof update.executionOrder !== 'undefined') {
            newInternalMetadata.executionOrder = update.executionOrder;
        }
        if (typeof update.runStartTime !== 'undefined') {
            newInternalMetadata.runStartTime = update.runStartTime;
        }
        return {
            editType: 9 /* CellEditType.PartialInternalMetadata */,
            handle: cellHandle,
            internalMetadata: newInternalMetadata
        };
    }
    throw new Error('Unknown cell update type');
}
let CellExecution = class CellExecution extends Disposable {
    get state() {
        return this._state;
    }
    get notebook() {
        return this._notebookModel.uri;
    }
    get didPause() {
        return this._didPause;
    }
    get isPaused() {
        return this._isPaused;
    }
    constructor(cellHandle, _notebookModel, _logService) {
        super();
        this.cellHandle = cellHandle;
        this._notebookModel = _notebookModel;
        this._logService = _logService;
        this._onDidUpdate = this._register(new Emitter());
        this.onDidUpdate = this._onDidUpdate.event;
        this._onDidComplete = this._register(new Emitter());
        this.onDidComplete = this._onDidComplete.event;
        this._state = NotebookCellExecutionState.Unconfirmed;
        this._didPause = false;
        this._isPaused = false;
        this._logService.debug(`CellExecution#ctor ${this.getCellLog()}`);
    }
    initialize() {
        const startExecuteEdit = {
            editType: 9 /* CellEditType.PartialInternalMetadata */,
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
    getCellLog() {
        return `${this._notebookModel.uri.toString()}, ${this.cellHandle}`;
    }
    logUpdates(updates) {
        const updateTypes = updates.map(u => CellExecutionUpdateType[u.editType]).join(', ');
        this._logService.debug(`CellExecution#updateExecution ${this.getCellLog()}, [${updateTypes}]`);
    }
    confirm() {
        this._logService.debug(`CellExecution#confirm ${this.getCellLog()}`);
        this._state = NotebookCellExecutionState.Pending;
        this._onDidUpdate.fire();
    }
    update(updates) {
        this.logUpdates(updates);
        if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
            this._state = NotebookCellExecutionState.Executing;
        }
        if (!this._didPause && updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState && u.didPause)) {
            this._didPause = true;
        }
        const lastIsPausedUpdate = [...updates].reverse().find(u => u.editType === CellExecutionUpdateType.ExecutionState && typeof u.isPaused === 'boolean');
        if (lastIsPausedUpdate) {
            this._isPaused = lastIsPausedUpdate.isPaused;
        }
        const cellModel = this._notebookModel.cells.find(c => c.handle === this.cellHandle);
        if (!cellModel) {
            this._logService.debug(`CellExecution#update, updating cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
        }
        else {
            const edits = updates.map(update => updateToEdit(update, this.cellHandle));
            this._applyExecutionEdits(edits);
        }
        if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
            this._onDidUpdate.fire();
        }
    }
    complete(completionData) {
        const cellModel = this._notebookModel.cells.find(c => c.handle === this.cellHandle);
        if (!cellModel) {
            this._logService.debug(`CellExecution#complete, completing cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
        }
        else {
            const edit = {
                editType: 9 /* CellEditType.PartialInternalMetadata */,
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
    _applyExecutionEdits(edits) {
        this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
    }
};
CellExecution = __decorate([
    __param(2, ILogService)
], CellExecution);
let NotebookExecution = class NotebookExecution extends Disposable {
    get state() {
        return this._state;
    }
    get notebook() {
        return this._notebookModel.uri;
    }
    constructor(_notebookModel, _logService) {
        super();
        this._notebookModel = _notebookModel;
        this._logService = _logService;
        this._onDidUpdate = this._register(new Emitter());
        this.onDidUpdate = this._onDidUpdate.event;
        this._onDidComplete = this._register(new Emitter());
        this.onDidComplete = this._onDidComplete.event;
        this._state = NotebookExecutionState.Unconfirmed;
        this._logService.debug(`NotebookExecution#ctor`);
    }
    debug(message) {
        this._logService.debug(`${message} ${this._notebookModel.uri.toString()}`);
    }
    confirm() {
        this.debug(`Execution#confirm`);
        this._state = NotebookExecutionState.Pending;
        this._onDidUpdate.fire();
    }
    begin() {
        this.debug(`Execution#begin`);
        this._state = NotebookExecutionState.Executing;
        this._onDidUpdate.fire();
    }
    complete() {
        this.debug(`Execution#begin`);
        this._state = NotebookExecutionState.Unconfirmed;
        this._onDidComplete.fire();
    }
};
NotebookExecution = __decorate([
    __param(1, ILogService)
], NotebookExecution);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2VJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZUltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtRkFBbUYsQ0FBQztBQUNySixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFeEUsT0FBTyxFQUFnQixPQUFPLEVBQXNCLDBCQUEwQixFQUFnQyxzQkFBc0IsRUFBdUMsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsTixPQUFPLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM5RyxPQUFPLEVBQW9NLDhCQUE4QixFQUFrQyxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hWLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFp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