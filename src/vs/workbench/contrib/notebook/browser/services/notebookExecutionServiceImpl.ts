/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { KernelPickerMRUStrategy } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookKernelQuickPickStrategy';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, INotebookTextModel, NotebookCellExecutionState, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookCellExecution, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelHistoryService, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { getDocumentFormattingEditsUntilResult } from 'vs/editor/contrib/format/browser/format';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';


export class NotebookExecutionService implements INotebookExecutionService, IDisposable {
	declare _serviceBrand: undefined;
	private _activeProxyKernelExecutionToken: CancellationTokenSource | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookKernelHistoryService private readonly _notebookKernelHistoryService: INotebookKernelHistoryService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ILogService private readonly _logService: ILogService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	async executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>, contextKeyService: IContextKeyService): Promise<void> {
		const cellsArr = Array.from(cells)
			.filter(c => c.cellKind === CellKind.Code);
		if (!cellsArr.length) {
			return;
		}

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
			await this.formatNotebookCells(validCellExecutions, notebook);

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

	async formatNotebookCells(cellExecutions: INotebookCellExecution[], notebookModel: INotebookTextModel): Promise<void> {
		const enabled = this.configurationService.getValue<boolean>(NotebookSetting.formatOnCellExecution);
		if (!enabled) {
			return;
		}

		const disposable = new DisposableStore();
		try {
			const allCellEdits = await Promise.all(cellExecutions.map(async cellExecution => {
				const cell = notebookModel.cells[cellExecution.cellHandle];
				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);

				const model = ref.object.textEditorModel;

				const formatEdits = await getDocumentFormattingEditsUntilResult(
					this.editorWorkerService,
					this.languageFeaturesService,
					model,
					model.getOptions(),
					this._activeProxyKernelExecutionToken?.token ?? CancellationToken.None
				);

				const edits: ResourceTextEdit[] = [];

				if (formatEdits) {
					edits.push(...formatEdits.map(edit => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
					return edits;
				}

				return [];
			}));

			await this.bulkEditService.apply(/* edit */allCellEdits.flat(), { label: nls.localize('label', "Format Cells"), code: 'undoredo.formatCells', });

		} finally {
			disposable.dispose();
		}
	}

	dispose() {
		this._activeProxyKernelExecutionToken?.dispose(true);
	}
}
