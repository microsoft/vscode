/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class NotebookCellPausing extends Disposable implements IWorkbenchContribution {
	private readonly _pausedCells = new Set<string>();

	private _scheduler: RunOnceScheduler;

	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
		super();

		this._register(_debugService.getModel().onDidChangeCallStack(() => {
			// First update using the stale callstack if the real callstack is empty, to reduce blinking while stepping.
			// After not pausing for 2s, update again with the latest callstack.
			this.onDidChangeCallStack(true);
			this._scheduler.schedule();
		}));
		this._scheduler = this._register(new RunOnceScheduler(() => this.onDidChangeCallStack(false), 2000));
	}

	private async onDidChangeCallStack(fallBackOnStaleCallstack: boolean): Promise<void> {
		const newPausedCells = new Set<string>();

		for (const session of this._debugService.getModel().getSessions()) {
			for (const thread of session.getAllThreads()) {
				let callStack = thread.getCallStack();
				if (fallBackOnStaleCallstack && !callStack.length) {
					callStack = (thread as Thread).getStaleCallStack();
				}

				callStack.forEach(sf => {
					const parsed = CellUri.parse(sf.source.uri);
					if (parsed) {
						newPausedCells.add(sf.source.uri.toString());
						this.editIsPaused(sf.source.uri, true);
					}
				});
			}
		}

		for (const uri of this._pausedCells) {
			if (!newPausedCells.has(uri)) {
				this.editIsPaused(URI.parse(uri), false);
				this._pausedCells.delete(uri);
			}
		}

		newPausedCells.forEach(cell => this._pausedCells.add(cell));
	}

	private editIsPaused(cellUri: URI, isPaused: boolean) {
		const parsed = CellUri.parse(cellUri);
		if (parsed) {
			const exeState = this._notebookExecutionStateService.getCellExecution(cellUri);
			if (exeState && (exeState.isPaused !== isPaused || !exeState.didPause)) {
				exeState.update([{
					editType: CellExecutionUpdateType.ExecutionState,
					didPause: true,
					isPaused
				}]);
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookCellPausing, LifecyclePhase.Restored);
