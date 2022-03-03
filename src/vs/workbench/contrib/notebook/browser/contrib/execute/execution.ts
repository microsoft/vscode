/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export class ExecutionContrib extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.executionContrib';

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@INotebookExecutionService private readonly _notebookExecutionService: INotebookExecutionService,
		@ILogService private readonly _logService: ILogService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		super();

		this._register(this._notebookKernelService.onDidChangeSelectedNotebooks(e => {
			if (e.newKernel && this._notebookEditor.textModel?.uri.toString() === e.notebook.toString()) {
				this.cancelAll();
				this._notebookExecutionStateService.forceCancelNotebookExecutions(e.notebook);
			}
		}));
	}

	private cancelAll(): void {
		this._logService.debug(`ExecutionContrib#cancelAll`);
		const exes = this._notebookExecutionStateService.getCellExecutionStatesForNotebook(this._notebookEditor.textModel!.uri);
		this._notebookExecutionService.cancelNotebookCellHandles(this._notebookEditor.textModel!, exes.map(exe => exe.cellHandle));
	}
}


registerNotebookContribution(ExecutionContrib.id, ExecutionContrib);
