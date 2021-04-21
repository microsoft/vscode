/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, INotebookKernel, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export class NotebookEditorKernelManager extends Disposable {

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		super();
	}

	getActiveKernel(notebook: INotebookTextModel): INotebookKernel | undefined {
		const info = this._notebookKernelService.getNotebookKernels(notebook);
		return info.bound ?? info.all[0];
	}

	async executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void> {
		if (!notebook.metadata.trusted) {
			return;
		}

		let kernel = this.getActiveKernel(notebook);
		if (!kernel) {
			await this._commandService.executeCommand('notebook.selectKernel');
			kernel = this.getActiveKernel(notebook);
		}

		if (!kernel) {
			return;
		}

		const cellHandles: number[] = [];
		for (const cell of cells) {
			if (cell.cellKind !== CellKind.Code) {
				continue;
			}
			if (!kernel.supportedLanguages.includes(cell.language)) {
				continue;
			}
			cellHandles.push(cell.handle);
		}

		if (cellHandles.length > 0) {
			this._notebookKernelService.updateNotebookKernelBinding(notebook, kernel);
			await kernel.executeNotebookCellsRequest(notebook.uri, cellHandles);
		}
	}

	async cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void> {
		let kernel = this.getActiveKernel(notebook);
		if (kernel) {
			await kernel.cancelNotebookCellExecution(notebook.uri, Array.from(cells, cell => cell.handle));
		}
	}
}
