/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Delayer } from '../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { debugIconBreakpointForeground } from '../../../../debug/browser/breakpointEditorContribution.js';
import { focusedStackFrameColor, topStackFrameColor } from '../../../../debug/browser/callStackEditorContribution.js';
import { IDebugService } from '../../../../debug/common/debug.js';
import { NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { runningCellRulerDecorationColor } from '../../notebookEditorWidget.js';
import { CellUri, NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
let PausedCellDecorationContribution = class PausedCellDecorationContribution extends Disposable {
    static { this.id = 'workbench.notebook.debug.pausedCellDecorations'; }
    constructor(_notebookEditor, _debugService, _notebookExecutionStateService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._debugService = _debugService;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this._currentTopDecorations = [];
        this._currentOtherDecorations = [];
        this._executingCellDecorations = [];
        const delayer = this._register(new Delayer(200));
        this._register(_debugService.getModel().onDidChangeCallStack(() => this.updateExecutionDecorations()));
        this._register(_debugService.getViewModel().onDidFocusStackFrame(() => this.updateExecutionDecorations()));
        this._register(_notebookExecutionStateService.onDidChangeExecution(e => {
            if (e.type === NotebookExecutionType.cell && this._notebookEditor.textModel && e.affectsNotebook(this._notebookEditor.textModel.uri)) {
                delayer.trigger(() => this.updateExecutionDecorations());
            }
        }));
    }
    updateExecutionDecorations() {
        const exes = this._notebookEditor.textModel ?
            this._notebookExecutionStateService.getCellExecutionsByHandleForNotebook(this._notebookEditor.textModel.uri)
            : undefined;
        const topFrameCellsAndRanges = [];
        let focusedFrameCellAndRange = undefined;
        const getNotebookCellAndRange = (sf) => {
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
    setTopFrameDecoration(handlesAndRanges) {
        const newDecorations = handlesAndRanges.map(({ handle, range }) => {
            const options = {
                overviewRuler: {
                    color: topStackFrameColor,
                    includeOutput: false,
                    modelRanges: [range],
                    position: NotebookOverviewRulerLane.Full
                }
            };
            return {
                handle,
                options
            };
        });
        this._currentTopDecorations = this._notebookEditor.deltaCellDecorations(this._currentTopDecorations, newDecorations);
    }
    setFocusedFrameDecoration(focusedFrameCellAndRange) {
        let newDecorations = [];
        if (focusedFrameCellAndRange) {
            const options = {
                overviewRuler: {
                    color: focusedStackFrameColor,
                    includeOutput: false,
                    modelRanges: [focusedFrameCellAndRange.range],
                    position: NotebookOverviewRulerLane.Full
                }
            };
            newDecorations = [{
                    handle: focusedFrameCellAndRange.handle,
                    options
                }];
        }
        this._currentOtherDecorations = this._notebookEditor.deltaCellDecorations(this._currentOtherDecorations, newDecorations);
    }
    setExecutingCellDecorations(handles) {
        const newDecorations = handles.map(handle => {
            const options = {
                overviewRuler: {
                    color: runningCellRulerDecorationColor,
                    includeOutput: false,
                    modelRanges: [new Range(0, 0, 0, 0)],
                    position: NotebookOverviewRulerLane.Left
                }
            };
            return {
                handle,
                options
            };
        });
        this._executingCellDecorations = this._notebookEditor.deltaCellDecorations(this._executingCellDecorations, newDecorations);
    }
};
PausedCellDecorationContribution = __decorate([
    __param(1, IDebugService),
    __param(2, INotebookExecutionStateService)
], PausedCellDecorationContribution);
export { PausedCellDecorationContribution };
registerNotebookContribution(PausedCellDecorationContribution.id, PausedCellDecorationContribution);
let NotebookBreakpointDecorations = class NotebookBreakpointDecorations extends Disposable {
    static { this.id = 'workbench.notebook.debug.notebookBreakpointDecorations'; }
    constructor(_notebookEditor, _debugService, _configService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._debugService = _debugService;
        this._configService = _configService;
        this._currentDecorations = [];
        this._register(_debugService.getModel().onDidChangeBreakpoints(() => this.updateDecorations()));
        this._register(_configService.onDidChangeConfiguration(e => e.affectsConfiguration('debug.showBreakpointsInOverviewRuler') && this.updateDecorations()));
    }
    updateDecorations() {
        const enabled = this._configService.getValue('debug.showBreakpointsInOverviewRuler');
        const newDecorations = enabled ?
            this._debugService.getModel().getBreakpoints().map(breakpoint => {
                const parsed = CellUri.parse(breakpoint.uri);
                if (!parsed || parsed.notebook.toString() !== this._notebookEditor.textModel.uri.toString()) {
                    return null;
                }
                const options = {
                    overviewRuler: {
                        color: debugIconBreakpointForeground,
                        includeOutput: false,
                        modelRanges: [new Range(breakpoint.lineNumber, 0, breakpoint.lineNumber, 0)],
                        position: NotebookOverviewRulerLane.Left
                    }
                };
                return { handle: parsed.handle, options };
            }).filter(x => !!x)
            : [];
        this._currentDecorations = this._notebookEditor.deltaCellDecorations(this._currentDecorations, newDecorations);
    }
};
NotebookBreakpointDecorations = __decorate([
    __param(1, IDebugService),
    __param(2, IConfigurationService)
], NotebookBreakpointDecorations);
export { NotebookBreakpointDecorations };
registerNotebookContribution(NotebookBreakpointDecorations.id, NotebookBreakpointDecorations);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEZWJ1Z0RlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2RlYnVnL25vdGVib29rRGVidWdEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsYUFBYSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxFQUE4Ryx5QkFBeUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2pMLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsOEJBQThCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQU9sSCxJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFpQyxTQUFRLFVBQVU7YUFDeEQsT0FBRSxHQUFXLGdEQUFnRCxBQUEzRCxDQUE0RDtJQU1yRSxZ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