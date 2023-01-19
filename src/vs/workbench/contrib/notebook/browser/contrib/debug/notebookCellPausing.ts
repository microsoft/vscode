/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { focusedStackFrameColor, topStackFrameColor } from 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import { IDebugService, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import { INotebookCellDecorationOptions, INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, NotebookOverviewRulerLane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

interface ICellAndRange {
	handle: number;
	range: IRange;
}

export class PausedCellDecorationContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.debug.pausedCellDecorations';

	private _currentTopDecorations: string[] = [];
	private _currentOtherDecorations: string[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IDebugService private readonly _debugService: IDebugService,
	) {
		super();

		this._register(_debugService.getModel().onDidChangeCallStack(() => this.onDidChangeCallStack()));
		this._register(_debugService.getViewModel().onDidFocusStackFrame(() => this.onDidChangeCallStack()));
	}

	private async onDidChangeCallStack(): Promise<void> {
		const topFrameCellsAndRanges: ICellAndRange[] = [];
		let focusedFrameCellAndRange: ICellAndRange | undefined = undefined;

		const getNotebookCellAndRange = (sf: IStackFrame): ICellAndRange | undefined => {
			const parsed = CellUri.parse(sf.source.uri);
			if (parsed && parsed.notebook.toString() === this._notebookEditor.textModel?.uri.toString()) {
				return { handle: parsed.handle, range: sf.range };
			}
			return undefined;
		};

		for (const session of this._debugService.getModel().getSessions()) {
			for (const thread of session.getAllThreads()) {
				const topFrame = thread.getTopStackFrame();
				if (topFrame) {
					const notebookCellAndRange = getNotebookCellAndRange(topFrame);
					if (notebookCellAndRange) {
						topFrameCellsAndRanges.push(notebookCellAndRange);
					}
				}
			}
		}

		const focusedFrame = this._debugService.getViewModel().focusedStackFrame;
		if (focusedFrame && focusedFrame.thread.stopped) {
			const thisFocusedFrameCellAndRange = getNotebookCellAndRange(focusedFrame);
			if (thisFocusedFrameCellAndRange &&
				!topFrameCellsAndRanges.some(topFrame => topFrame.handle === thisFocusedFrameCellAndRange?.handle && Range.equalsRange(topFrame.range, thisFocusedFrameCellAndRange?.range))) {
				focusedFrameCellAndRange = thisFocusedFrameCellAndRange;
			}
		}

		this.setTopFrameDecoration(topFrameCellsAndRanges);
		this.setFocusedFrameDecoration(focusedFrameCellAndRange);
	}


	private setTopFrameDecoration(handlesAndRanges: ICellAndRange[]): void {
		const newDecorations = handlesAndRanges.map(({ handle, range }) => {
			const options: INotebookCellDecorationOptions = {
				overviewRuler: {
					color: topStackFrameColor,
					includeOutput: false,
					modelRanges: [range],
					position: NotebookOverviewRulerLane.Full
				}
			};
			return { handle, options };
		});

		this._currentTopDecorations = this._notebookEditor.deltaCellDecorations(this._currentTopDecorations, newDecorations);
	}

	private setFocusedFrameDecoration(focusedFrameCellAndRange: ICellAndRange | undefined): void {
		let newDecorations: INotebookDeltaDecoration[] = [];
		if (focusedFrameCellAndRange) {
			const options: INotebookCellDecorationOptions = {
				overviewRuler: {
					color: focusedStackFrameColor,
					includeOutput: false,
					modelRanges: [focusedFrameCellAndRange.range],
					position: NotebookOverviewRulerLane.Full
				}
			};
			newDecorations = [{ handle: focusedFrameCellAndRange.handle, options }];
		}

		this._currentOtherDecorations = this._notebookEditor.deltaCellDecorations(this._currentOtherDecorations, newDecorations);
	}
}

registerNotebookContribution(PausedCellDecorationContribution.id, PausedCellDecorationContribution);

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
