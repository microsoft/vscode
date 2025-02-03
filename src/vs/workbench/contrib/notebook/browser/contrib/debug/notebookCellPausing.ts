/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../../../common/contributions.js';
import { IDebugService } from '../../../../debug/common/debug.js';
import { Thread } from '../../../../debug/common/debugModel.js';
import { CellUri } from '../../../common/notebookCommon.js';
import { CellExecutionUpdateType } from '../../../common/notebookExecutionService.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';

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
