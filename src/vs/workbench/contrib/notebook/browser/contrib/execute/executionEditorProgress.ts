/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { throttle } from '../../../../../../base/common/decorators.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { INotebookCellExecution, INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { IUserActivityService } from '../../../../../services/userActivity/common/userActivityService.js';

export class ExecutionEditorProgressController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.executionEditorProgress';

	private readonly _activityMutex = this._register(new MutableDisposable());

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@IUserActivityService private readonly _userActivity: IUserActivityService,
	) {
		super();

		this._register(_notebookEditor.onDidScroll(() => this._update()));

		this._register(_notebookExecutionStateService.onDidChangeExecution(e => {
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

		const cellExecutions = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookEditor.textModel?.uri)
			.filter(exe => exe.state === NotebookCellExecutionState.Executing);
		const notebookExecution = this._notebookExecutionStateService.getExecution(this._notebookEditor.textModel?.uri);
		const executionIsVisible = (exe: INotebookCellExecution) => {
			for (const range of this._notebookEditor.visibleRanges) {
				for (const cell of this._notebookEditor.getCellsInRange(range)) {
					if (cell.handle === exe.cellHandle) {
						const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
						if (this._notebookEditor.scrollTop < top + 5) {
							return true;
						}
					}
				}
			}

			return false;
		};

		const hasAnyExecution = cellExecutions.length || notebookExecution;
		if (hasAnyExecution && !this._activityMutex.value) {
			this._activityMutex.value = this._userActivity.markActive();
		} else if (!hasAnyExecution && this._activityMutex.value) {
			this._activityMutex.clear();
		}

		const shouldShowEditorProgressbarForCellExecutions = cellExecutions.length && !cellExecutions.some(executionIsVisible) && !cellExecutions.some(e => e.isPaused);
		const showEditorProgressBar = !!notebookExecution || shouldShowEditorProgressbarForCellExecutions;
		if (showEditorProgressBar) {
			this._notebookEditor.showProgress();
		} else {
			this._notebookEditor.hideProgress();
		}
	}
}


registerNotebookContribution(ExecutionEditorProgressController.id, ExecutionEditorProgressController);
