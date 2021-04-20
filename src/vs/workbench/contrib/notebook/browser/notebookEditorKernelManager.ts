/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellViewModel, getRanges } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { cellIndexesToRanges, CellKind, INotebookKernel, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICommandService } from 'vs/platform/commands/common/commands';


export interface IKernelManagerDelegate {
	activeKernel: INotebookKernel | undefined;
	viewModel: NotebookViewModel | undefined;
}

export class NotebookEditorKernelManager extends Disposable {

	constructor(
		private readonly _delegate: IKernelManagerDelegate,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
	}

	private async _ensureActiveKernel(): Promise<void> {
		if (!this._delegate.activeKernel) {
			await this._commandService.executeCommand('notebook.selectKernel');
		}
	}

	async cancelNotebookExecution(): Promise<void> {
		if (!this._delegate.viewModel) {
			return;
		}
		await this._ensureActiveKernel();
		await this._delegate.activeKernel?.cancelNotebookCellExecution!(this._delegate.viewModel.uri, [{ start: 0, end: this._delegate.viewModel.length }]);
	}

	async executeNotebook(): Promise<void> {
		if (!this._delegate.viewModel) {
			return;
		}
		await this._ensureActiveKernel();
		if (!this.canExecuteNotebook()) {
			return;
		}
		const codeCellRanges = getRanges(this._delegate.viewModel.viewCells, cell => this.canExecuteCell(cell));
		if (codeCellRanges.length > 0) {
			await this._delegate.activeKernel?.executeNotebookCellsRequest(this._delegate.viewModel.uri, codeCellRanges);
		}
	}

	async cancelNotebookCellExecution(cell: ICellViewModel): Promise<void> {
		if (!this._delegate.viewModel) {
			return;
		}

		if (cell.cellKind !== CellKind.Code) {
			return;
		}

		const metadata = cell.getEvaluatedMetadata(this._delegate.viewModel.metadata);
		if (metadata.runState === NotebookCellExecutionState.Idle) {
			return;
		}

		await this._ensureActiveKernel();

		const idx = this._delegate.viewModel.getCellIndex(cell);
		const ranges = cellIndexesToRanges([idx]);
		await this._delegate.activeKernel?.cancelNotebookCellExecution!(this._delegate.viewModel.uri, ranges);
	}

	async executeNotebookCell(cell: ICellViewModel): Promise<void> {
		if (!this._delegate.viewModel) {
			return;
		}
		await this._ensureActiveKernel();
		if (!this.canExecuteCell(cell)) {
			throw new Error('Cell is not executable: ' + cell.uri);
		}
		const idx = this._delegate.viewModel.getCellIndex(cell);
		const range = cellIndexesToRanges([idx]);
		await this._delegate.activeKernel?.executeNotebookCellsRequest(this._delegate.viewModel.uri, range);
	}

	private canExecuteNotebook(): boolean {
		if (!this._delegate.activeKernel) {
			return false;
		}
		if (!this._delegate.viewModel?.trusted) {
			return false;
		}
		return true;
	}

	private canExecuteCell(cell: ICellViewModel): boolean {
		if (!this._delegate.viewModel?.trusted) {
			return false;
		}
		if (!this._delegate.activeKernel) {
			return false;
		}
		if (cell.cellKind !== CellKind.Code) {
			return false;
		}
		if (!this._delegate.activeKernel.supportedLanguages) {
			return true;
		}
		if (this._delegate.activeKernel.supportedLanguages.includes(cell.language)) {
			return true;
		}
		return false;
	}
}
