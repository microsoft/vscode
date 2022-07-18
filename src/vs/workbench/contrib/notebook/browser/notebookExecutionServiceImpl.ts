/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, INotebookTextModel, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookCellExecution, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export class NotebookExecutionService implements INotebookExecutionService, IDisposable {
	declare _serviceBrand: undefined;
	private _activeProxyKernelExecutionToken: CancellationTokenSource | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ILogService private readonly _logService: ILogService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
	}

	async executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`NotebookExecutionService#executeNotebookCells ${JSON.stringify(cellsArr.map(c => c.handle))}`);
		const message = nls.localize('notebookRunTrust', "Executing a notebook cell will run code from this workspace.");
		const trust = await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
		if (!trust) {
			return;
		}

		// create cell executions
		const cellExecutions: [NotebookCellTextModel, INotebookCellExecution][] = [];
		for (const cell of cellsArr) {
			const cellExe = this._notebookExecutionStateService.getCellExecution(cell.uri);
			if (cell.cellKind !== CellKind.Code || !!cellExe) {
				continue;
			}
			cellExecutions.push([cell, this._notebookExecutionStateService.createCellExecution(notebook.uri, cell.handle)]);
		}

		let kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		if (!kernel) {
			kernel = await this.resolveSourceActions(notebook);
		}

		if (!kernel) {
			await this._commandService.executeCommand(SELECT_KERNEL_ID);
			kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		}

		if (!kernel) {
			// clear all pending cell executions
			cellExecutions.forEach(cellExe => cellExe[1].complete({}));
			return;
		}

		// filter cell executions based on selected kernel
		const validCellExecutions: INotebookCellExecution[] = [];
		for (const [cell, cellExecution] of cellExecutions) {
			if (!kernel.supportedLanguages.includes(cell.language)) {
				cellExecution.complete({});
			} else {
				validCellExecutions.push(cellExecution);
			}
		}

		// request execution
		if (validCellExecutions.length > 0) {
			this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
			await kernel.executeNotebookCellsRequest(notebook.uri, validCellExecutions.map(c => c.cellHandle));
			// the connecting state can change before the kernel resolves executeNotebookCellsRequest
			const unconfirmed = validCellExecutions.filter(exe => exe.state === NotebookCellExecutionState.Unconfirmed);
			if (unconfirmed.length) {
				this._logService.debug(`NotebookExecutionService#executeNotebookCells completing unconfirmed executions ${JSON.stringify(unconfirmed.map(exe => exe.cellHandle))}`);
				unconfirmed.forEach(exe => exe.complete({}));
			}
		}
	}

	private async resolveSourceActions(notebook: INotebookTextModel) {
		let kernel: INotebookKernel | undefined;
		const info = this._notebookKernelService.getMatchingKernel(notebook);
		if (info.all.length === 0) {
			// no kernel at all
			const sourceActions = this._notebookKernelService.getSourceActions();
			if (sourceActions.length === 1) {
				await sourceActions[0].runAction();
				kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
			}
		}

		return kernel;
	}

	async cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`NotebookExecutionService#cancelNotebookCellHandles ${JSON.stringify(cellsArr)}`);
		const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		if (kernel) {
			await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);

		}
	}

	async cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void> {
		this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
	}

	dispose() {
		this._activeProxyKernelExecutionToken?.dispose(true);
	}
}
