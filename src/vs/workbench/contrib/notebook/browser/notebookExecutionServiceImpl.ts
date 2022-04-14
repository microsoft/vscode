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
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService, NotebookKernelType } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

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

		let kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		if (!kernel) {
			await this._commandService.executeCommand(SELECT_KERNEL_ID);
			kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		}

		if (!kernel) {
			return;
		}

		if (kernel.type === NotebookKernelType.Proxy) {
			this._activeProxyKernelExecutionToken?.dispose(true);
			const tokenSource = this._activeProxyKernelExecutionToken = new CancellationTokenSource();
			const resolved = await kernel.resolveKernel(notebook.uri);
			const kernels = this._notebookKernelService.getMatchingKernel(notebook);
			const newlyMatchedKernel = kernels.all.find(k => k.id === resolved);

			if (!newlyMatchedKernel) {
				return;
			}

			kernel = newlyMatchedKernel;
			if (tokenSource.token.isCancellationRequested) {
				// execution was cancelled but we still need to update the active kernel
				this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
				return;
			}
		}

		if (kernel.type === NotebookKernelType.Proxy) {
			return;
		}

		const executeCells: NotebookCellTextModel[] = [];
		for (const cell of cellsArr) {
			const cellExe = this._notebookExecutionStateService.getCellExecution(cell.uri);
			if (cell.cellKind !== CellKind.Code || !!cellExe) {
				continue;
			}
			if (!kernel.supportedLanguages.includes(cell.language)) {
				continue;
			}
			executeCells.push(cell);
		}

		if (executeCells.length > 0) {
			this._notebookKernelService.selectKernelForNotebook(kernel, notebook);

			const exes = executeCells.map(c => this._notebookExecutionStateService.createCellExecution(kernel!.id, notebook.uri, c.handle));
			await kernel.executeNotebookCellsRequest(notebook.uri, executeCells.map(c => c.handle));
			const unconfirmed = exes.filter(exe => exe.state === NotebookCellExecutionState.Unconfirmed);
			if (unconfirmed.length) {
				this._logService.debug(`NotebookExecutionService#executeNotebookCells completing unconfirmed executions ${JSON.stringify(unconfirmed.map(exe => exe.cellHandle))}`);
				unconfirmed.forEach(exe => exe.complete({}));
			}
		}
	}

	async cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`NotebookExecutionService#cancelNotebookCellHandles ${JSON.stringify(cellsArr)}`);
		const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		if (kernel) {
			if (kernel.type === NotebookKernelType.Proxy) {
				this._activeProxyKernelExecutionToken?.dispose(true);
			} else {
				await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);
			}

		}
	}

	async cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void> {
		this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
	}

	dispose() {
		this._activeProxyKernelExecutionToken?.dispose(true);
	}
}
