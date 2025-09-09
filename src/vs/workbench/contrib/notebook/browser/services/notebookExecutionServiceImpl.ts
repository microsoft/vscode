/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { KernelPickerMRUStrategy } from '../viewParts/notebookKernelQuickPickStrategy.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { CellKind, INotebookTextModel, NotebookCellExecutionState } from '../../common/notebookCommon.js';
import { INotebookExecutionService, ICellExecutionParticipant, IDidStartNotebookCellsExecutionEvent, IDidEndNotebookCellsExecutionEvent } from '../../common/notebookExecutionService.js';
import { INotebookCellExecution, INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
// --- Start Erdos ---
// Add start/end execution events.
import { Emitter } from '../../../../../base/common/event.js';
// --- End Erdos ---


export class NotebookExecutionService implements INotebookExecutionService, IDisposable {
	declare _serviceBrand: undefined;
	private _activeProxyKernelExecutionToken: CancellationTokenSource | undefined;
	// --- Start Erdos ---
	// Add new start/end execution events.

	private readonly _onDidStartNotebookCellsExecution = new Emitter<IDidStartNotebookCellsExecutionEvent>();
	private readonly _onDidEndNotebookCellsExecution = new Emitter<IDidEndNotebookCellsExecutionEvent>();

	public readonly onDidStartNotebookCellsExecution = this._onDidStartNotebookCellsExecution.event;
	public readonly onDidEndNotebookCellsExecution = this._onDidEndNotebookCellsExecution.event;
	// --- End Erdos ---

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookKernelHistoryService private readonly _notebookKernelHistoryService: INotebookKernelHistoryService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@INotebookLoggingService private readonly _logService: INotebookLoggingService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
	}

	async executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>, contextKeyService: IContextKeyService): Promise<void> {
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
		const cellExecutions: [NotebookCellTextModel, INotebookCellExecution][] = [];
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
			await this.runExecutionParticipants(validCellExecutions);

			this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
			// --- Start Erdos ---
			// Wrap executeNotebookCellsRequest in a try-finally, and fire the new start/end execution events.
			const startTime = Date.now();
			const cellHandles = validCellExecutions.map(c => c.cellHandle);
			this._onDidStartNotebookCellsExecution.fire({ cellHandles });
			try {
				await kernel.executeNotebookCellsRequest(notebook.uri, cellHandles);
			} finally {
				const duration = Date.now() - startTime;
				this._onDidEndNotebookCellsExecution.fire({ cellHandles, duration });
			}
			// --- End Erdos ---
			// the connecting state can change before the kernel resolves executeNotebookCellsRequest
			const unconfirmed = validCellExecutions.filter(exe => exe.state === NotebookCellExecutionState.Unconfirmed);
			if (unconfirmed.length) {
				this._logService.debug(`Execution`, `Completing unconfirmed executions ${JSON.stringify(unconfirmed.map(exe => exe.cellHandle))}`);
				unconfirmed.forEach(exe => exe.complete({}));
			}
			this._logService.debug(`Execution`, `Completed executions ${JSON.stringify(validCellExecutions.map(exe => exe.cellHandle))}`);
		}
	}

	async cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void> {
		const cellsArr = Array.from(cells);
		this._logService.debug(`Execution`, `CancelNotebookCellHandles ${JSON.stringify(cellsArr)}`);
		const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(notebook);
		if (kernel) {
			await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);

		}
	}

	async cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void> {
		this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
	}

	private readonly cellExecutionParticipants = new Set<ICellExecutionParticipant>;

	registerExecutionParticipant(participant: ICellExecutionParticipant) {
		this.cellExecutionParticipants.add(participant);
		return toDisposable(() => this.cellExecutionParticipants.delete(participant));
	}

	private async runExecutionParticipants(executions: INotebookCellExecution[]): Promise<void> {
		for (const participant of this.cellExecutionParticipants) {
			await participant.onWillExecuteCell(executions);
		}
		return;
	}

	dispose() {
		this._activeProxyKernelExecutionToken?.dispose(true);
		// --- Start Erdos ---
		// Dispose event emitters.
		this._onDidStartNotebookCellsExecution.dispose();
		this._onDidEndNotebookCellsExecution.dispose();
		// --- End Erdos ---
	}
}
