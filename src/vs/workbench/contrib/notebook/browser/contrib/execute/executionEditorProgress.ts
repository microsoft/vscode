/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { throttle } from 'vs/base/common/decorators';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookCellExecution, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class ExecutionEditorProgressController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.executionEditorProgress';

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();

		this._register(_notebookEditor.onDidScroll(() => this._update()));

		this._register(_notebookExecutionStateService.onDidChangeCellExecution(e => {
			if (e.notebook.toString() !== this._notebookEditor.textModel?.uri.toString()) {
				return;
			}

			this._update();
		}));

		this._register(_notebookEditor.onDidChangeModel(() => this._update()));
	}

	@throttle(100)
	private _update() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const executing = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookEditor.textModel?.uri)
			.filter(exe => exe.state === NotebookCellExecutionState.Executing);
		const executionIsVisible = (exe: INotebookCellExecution) => {
			for (const range of this._notebookEditor.visibleRanges) {
				for (const cell of this._notebookEditor.getCellsInRange(range)) {
					if (cell.handle === exe.cellHandle) {
						const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
						if (this._notebookEditor.scrollTop < top + 30) {
							return true;
						}
					}
				}
			}

			return false;
		};
		if (!executing.length || executing.some(executionIsVisible) || executing.some(e => e.isPaused)) {
			this._notebookEditor.hideProgress();
		} else {
			this._notebookEditor.showProgress();
		}
	}
}


registerNotebookContribution(ExecutionEditorProgressController.id, ExecutionEditorProgressController);
