/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { debugIconBreakpointForeground } from 'vs/workbench/contrib/debug/browser/breakpointEditorContribution';
import { focusedStackFrameColor, topStackFrameColor } from 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import { IDebugService, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { INotebookCellDecorationOptions, INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, NotebookOverviewRulerLane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { runningCellRulerDecorationColor } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { CellUri, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

interface ICellAndRange {
	handle: number;
	range: IRange;
}

export class PausedCellDecorationContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.debug.pausedCellDecorations';

	private _currentTopDecorations: string[] = [];
	private _currentOtherDecorations: string[] = [];
	private _executingCellDecorations: string[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IDebugService private readonly _debugService: IDebugService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
	) {
		super();

		const delayer = this._register(new Delayer(200));
		this._register(_debugService.getModel().onDidChangeCallStack(() => this.updateExecutionDecorations()));
		this._register(_debugService.getViewModel().onDidFocusStackFrame(() => this.updateExecutionDecorations()));
		this._register(_notebookExecutionStateService.onDidChangeExecution(e => {
			if (e.type === NotebookExecutionType.cell && this._notebookEditor.textModel && e.affectsNotebook(this._notebookEditor.textModel.uri)) {
				delayer.trigger(() => this.updateExecutionDecorations());
			}
		}));
	}

	private updateExecutionDecorations(): void {
		const exes = this._notebookEditor.textModel ?
			this._notebookExecutionStateService.getCellExecutionsByHandleForNotebook(this._notebookEditor.textModel.uri)
			: undefined;

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
						exes?.delete(notebookCellAndRange.handle);
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
				exes?.delete(focusedFrameCellAndRange.handle);
			}
		}

		this.setTopFrameDecoration(topFrameCellsAndRanges);
		this.setFocusedFrameDecoration(focusedFrameCellAndRange);

		const exeHandles = exes ?
			Array.from(exes.entries())
				.filter(([_, exe]) => exe.state === NotebookCellExecutionState.Executing)
				.map(([handle]) => handle)
			: [];
		this.setExecutingCellDecorations(exeHandles);
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

	private setExecutingCellDecorations(handles: number[]): void {
		const newDecorations = handles.map(handle => {
			const options: INotebookCellDecorationOptions = {
				overviewRuler: {
					color: runningCellRulerDecorationColor,
					includeOutput: false,
					modelRanges: [new Range(0, 0, 0, 0)],
					position: NotebookOverviewRulerLane.Left
				}
			};
			return { handle, options };
		});

		this._executingCellDecorations = this._notebookEditor.deltaCellDecorations(this._executingCellDecorations, newDecorations);
	}
}

registerNotebookContribution(PausedCellDecorationContribution.id, PausedCellDecorationContribution);

export class NotebookBreakpointDecorations extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.debug.notebookBreakpointDecorations';

	private _currentDecorations: string[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IDebugService private readonly _debugService: IDebugService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		super();
		this._register(_debugService.getModel().onDidChangeBreakpoints(() => this.updateDecorations()));
		this._register(_configService.onDidChangeConfiguration(e => e.affectsConfiguration('debug.showBreakpointsInOverviewRuler') && this.updateDecorations()));
	}

	private updateDecorations(): void {
		const enabled = this._configService.getValue('debug.showBreakpointsInOverviewRuler');
		const newDecorations = enabled ?
			this._debugService.getModel().getBreakpoints().map(breakpoint => {
				const parsed = CellUri.parse(breakpoint.uri);
				if (!parsed || parsed.notebook.toString() !== this._notebookEditor.textModel!.uri.toString()) {
					return null;
				}

				const options: INotebookCellDecorationOptions = {
					overviewRuler: {
						color: debugIconBreakpointForeground,
						includeOutput: false,
						modelRanges: [new Range(breakpoint.lineNumber, 0, breakpoint.lineNumber, 0)],
						position: NotebookOverviewRulerLane.Left
					}
				};
				return { handle: parsed.handle, options };
			}).filter(x => !!x) as INotebookDeltaDecoration[]
			: [];
		this._currentDecorations = this._notebookEditor.deltaCellDecorations(this._currentDecorations, newDecorations);
	}
}

registerNotebookContribution(NotebookBreakpointDecorations.id, NotebookBreakpointDecorations);
