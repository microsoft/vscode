/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { EXPLAIN_CELL_ERROR_COMMAND_ID, FIX_CELL_ERROR_COMMAND_ID } from './cellDiagnosticsActions.js';
import { NotebookStatusBarController } from '../cellStatusBar/executionStatusBarItemController.js';
import { INotebookEditor, INotebookEditorContribution, INotebookViewModel } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { INotebookCellStatusBarItem, CellStatusbarAlignment } from '../../../common/notebookCommon.js';
import { ICellExecutionError } from '../../../common/notebookExecutionStateService.js';

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
		private readonly cell: CodeCellViewModel
	) {
		super();
		this._register(autorun((reader) => this.updateQuickActions(reader.readObservable(cell.executionError))));
	}

	private async updateQuickActions(error: ICellExecutionError | undefined) {
		let items: INotebookCellStatusBarItem[] = [];

		if (error?.location) {
			items = [{
				text: `$(sparkle) fix`,
				tooltip: localize('notebook.cell.status.fix', 'Fix With Inline Chat'),
				alignment: CellStatusbarAlignment.Left,
				command: FIX_CELL_ERROR_COMMAND_ID,
				priority: Number.MAX_SAFE_INTEGER - 1
			}, {
				text: `$(sparkle) explain`,
				tooltip: localize('notebook.cell.status.explain', 'Explain With Chat'),
				alignment: CellStatusbarAlignment.Left,
				command: EXPLAIN_CELL_ERROR_COMMAND_ID,
				priority: Number.MAX_SAFE_INTEGER - 1
			}];
		}

		this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items }]);
	}

	override dispose() {
		super.dispose();
		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items: [] }]);
	}
}
