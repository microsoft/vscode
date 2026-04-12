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
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { KernelPickerMRUStrategy } from '../viewParts/notebookKernelQuickPickStrategy.js';
import { CellKind, NotebookCellExecutionState } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
let NotebookExecutionService = class NotebookExecutionService {
    constructor(_commandService, _notebookKernelService, _notebookKernelHistoryService, _workspaceTrustRequestService, _logService, _notebookExecutionStateService) {
        this._commandService = _commandService;
        this._notebookKernelService = _notebookKernelService;
        this._notebookKernelHistoryService = _notebookKernelHistoryService;
        this._workspaceTrustRequestService = _workspaceTrustRequestService;
        this._logService = _logService;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this.cellExecutionParticipants = new Set;
    }
    async executeNotebookCells(notebook, cells, contextKeyService) {
        const cellsArr = Array.from(cells)
            .filter(c => c.cellKind === CellKind.Code);
        if (!cellsArr.length) {
            return;
        }
        this._logService.debug(`Execution`, `${JSON.stringify(cellsArr.map(c => c.handle))}`);
        const message = nls.localize('notebookRunTrust', "Executing a notebook cell will run code from this workspace.");
        const trust = await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
        if (!trust) {
            return;
        }
        // create cell executions
        const cellExecutions = [];
        for (const cell of cellsArr) {
            const cellExe = this._notebookExecutionStateService.getCellExecution(cell.uri);
            if (!!cellExe) {
                continue;
            }
            cellExecutions.push([cell, this._notebookExecutionStateService.createCellExecution(notebook.uri, cell.handle)]);
        }
        const kernel = await KernelPickerMRUStrategy.resolveKernel(notebook, this._notebookKernelService, this._notebookKernelHistoryService, this._commandService);
        if (!kernel) {
            // clear all pending cell executions
            cellExecutions.forEach(cellExe => cellExe[1].complete({}));
            return;
        }
        this._notebookKernelHistoryService.addMostRecentKernel(kernel);
        // filter cell executions based on selected kernel
        const validCellExecutions = [];
        for (const [cell, cellExecution] of cellExecutions) {
            if (!kernel.supportedLanguages.includes(cell.language)) {
                cellExecution.complete({});
            }
            else {
                validCellExecutions.push(cellExecution);
            }
        }
        // request execution
        if (validCellExecutions.length > 0) {
            await this.runExecutionParticipants(validCellExecutions);
            this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
            await kernel.executeNotebookCellsRequest(notebook.uri, validCellExecutions.map(c => c.cellHandle));
            // the connecting state can change before the kernel resolves executeNotebookCellsRequest
            const unconfirmed = validCellExecutions.filter(exe => exe.state === NotebookCellExecutionState.Unconfirmed);
            if (unconfirmed.length) {
                this._logService.debug(`Execution`, `Completing unconfirmed executions ${JSON.stringify(unconfirmed.map(exe => exe.cellHandle))}`);
                unconfirmed.forEach(exe => exe.complete({}));
            }
            this._logService.debug(`Execution`, `Completed executions ${JSON.stringify(validCellExecutions.map(exe => exe.cellHandle))}`);
        }
    }
    async cancelNotebookCellHandles(notebook, cells) {
        const cellsArr = Array.from(cells);
        this._logService.debug(`Execution`, `CancelNotebookCellHandles ${JSON.stringify(cellsArr)}`);
        const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
        if (kernel) {
            await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);
        }
    }
    async cancelNotebookCells(notebook, cells) {
        this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
    }
    registerExecutionParticipant(participant) {
        this.cellExecutionParticipants.add(participant);
        return toDisposable(() => this.cellExecutionParticipants.delete(participant));
    }
    async runExecutionParticipants(executions) {
        for (const participant of this.cellExecutionParticipants) {
            await participant.onWillExecuteCell(executions);
        }
        return;
    }
    dispose() {
        this._activeProxyKernelExecutionToken?.dispose(true);
    }
};
NotebookExecutionService = __decorate([
    __param(0, ICommandService),
    __param(1, INotebookKernelService),
    __param(2, INotebookKernelHistoryService),
    __param(3, IWorkspaceTrustRequestService),
    __param(4, INotebookLoggingService),
    __param(5, INotebookExecutionStateService)
], NotebookExecutionService);
export { NotebookExecutionService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFdEYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDM0csT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFMUYsT0FBTyxFQUFFLFFBQVEsRUFBc0IsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRyxPQUFPLEVBQTBCLDhCQUE4QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDdkgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHMUUsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBd0I7SUFJcEMsWUFDa0IsZUFBaUQsRUFDMUMsc0JBQStELEVBQ3hELDZCQUE2RSxFQUM3RSw2QkFBNkUsRUFDbkYsV0FBcUQsRUFDOUMsOEJBQStFO1FBTDdFLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUN6QiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQ3ZDLGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBK0I7UUFDNUQsa0NBQTZCLEdBQTdCLDZCQUE2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