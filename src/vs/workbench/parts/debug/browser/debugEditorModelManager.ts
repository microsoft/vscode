/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import editorcommon = require('vs/editor/common/editorCommon');
import wbext = require('vs/workbench/common/contributions');
import { IDebugService, ModelEvents, ViewModelEvents, IBreakpoint } from 'vs/workbench/parts/debug/common/debug';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';

function toMap(arr: string[]): { [key: string]: boolean; } {
	var r: { [key: string]: boolean; } = {};
	for (var i = 0, len = arr.length; i < len; i++) {
		r[arr[i]] = true;
	}
	return r;
}

interface IDebugEditorModelData {
	model: editorcommon.IModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorationIds: string[];
	breakpointLines: number[];
	breakpointDecorationsAsMap: { [decorationId: string]: boolean; };
	currentStackDecorations: string[];
	topStackFrameRange: editorcommon.IRange;
}

export class DebugEditorModelManager implements wbext.IWorkbenchContribution {
	static ID = 'breakpointManager';

	private modelData: {
		[modelUrl: string]: IDebugEditorModelData;
	};
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IModelService private modelService: IModelService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IDebugService private debugService: IDebugService
	) {
		this.modelData = {};
		this.toDispose = [];
		this.registerListeners();
	}

	public getId(): string {
		return DebugEditorModelManager.ID;
	}

	public dispose(): void {
		this.modelService.onModelAdded.remove(this.onModelAdded, this);
		this.modelService.onModelAdded.remove(this.onModelRemoved, this);

		var modelUrlStr: string;
		for (modelUrlStr in this.modelData) {
			if (this.modelData.hasOwnProperty(modelUrlStr)) {
				var modelData = this.modelData[modelUrlStr];
				lifecycle.disposeAll(modelData.toDispose);
				modelData.model.deltaDecorations(modelData.breakpointDecorationIds, []);
				modelData.model.deltaDecorations(modelData.currentStackDecorations, []);
			}
		}
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		this.modelData = null;
	}

	private registerListeners(): void {
		this.modelService.onModelAdded.add(this.onModelAdded, this);
		this.modelService.onModelRemoved.add(this.onModelRemoved, this);
		this.toDispose.push(this.debugService.getModel().addListener2(ModelEvents.BREAKPOINTS_UPDATED, () => this.onBreakpointChanged()));
		this.toDispose.push(this.debugService.getViewModel().addListener2(ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED, () => this.updateCallStack()));

		var allModels = this.modelService.getModels();
		for (var i = 0, len = allModels.length; i < len; i++) {
			this.onModelAdded(allModels[i]);
		}
	}

	private onModelAdded(model: editorcommon.IModel): void {
		var modelUrl = model.getAssociatedResource();
		var modelUrlStr = modelUrl.toString();

		var breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp.source.uri.toString() === modelUrl.toString());

		var currentStackDecorations = model.deltaDecorations([], this.createCallStackDecorations(modelUrlStr));
		var breakPointDecorations = model.deltaDecorations([], this.createBreakpointDecorations(breakpoints));

		var toDispose: lifecycle.IDisposable[] = [];

		toDispose.push(model.addListener2(editorcommon.EventType.ModelDecorationsChanged, (e: editorcommon.IModelDecorationsChangedEvent) => {
			this.onModelDecorationsChanged(modelUrlStr, e);
		}));

		var modelData: IDebugEditorModelData = {
			model: model,
			toDispose: toDispose,
			breakpointDecorationIds: breakPointDecorations,
			breakpointLines: breakpoints.map(bp => bp.lineNumber),
			breakpointDecorationsAsMap: toMap(breakPointDecorations),
			currentStackDecorations: currentStackDecorations,
			topStackFrameRange: null
		};
		this.modelData[modelUrlStr] = modelData;
	}

	private createBreakpointDecorations(breakpoints: IBreakpoint[]): editorcommon.IModelDeltaDecoration[] {
		// Add decorations for the breakpoints
		var breakpointsActivated = this.debugService.getModel().areBreakpointsActivated();
		return breakpoints.map((breakpoint) => {
			return {
				options: breakpoint.enabled && breakpointsActivated ? DebugEditorModelManager.BREAKPOINT_DECORATION : DebugEditorModelManager.BREAKPOINT_DISABLED_DECORATION,
				range: DebugEditorModelManager.createRange(breakpoint.lineNumber, 1, breakpoint.lineNumber, 2)
			};
		});
	}

	private createCallStackDecorations(modelUrlStr: string): editorcommon.IModelDeltaDecoration[] {
		var result: editorcommon.IModelDeltaDecoration[] = [];
		var focusedStackFrame = this.debugService.getViewModel().getFocusedStackFrame();
		var threads = this.debugService.getModel().getThreads();
		if (!focusedStackFrame || !threads[focusedStackFrame.threadId] || !threads[focusedStackFrame.threadId].callStack) {
			return result;
		}

		const threadId = focusedStackFrame.threadId;
		var topStackFrame = threads[threadId].callStack.length > 0 ? threads[threadId].callStack[0] : null;
		var modelCallStack = threads[threadId].callStack.filter(sf => sf.source.uri.toString() === modelUrlStr);

		for (var i = 0, len = modelCallStack.length; i < len; i++) {
			var el = modelCallStack[i];
			var wholeLineRange = DebugEditorModelManager.createRange(el.lineNumber, el.column, el.lineNumber, Number.MAX_VALUE);

			if (el === topStackFrame) {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_MARGIN,
					range: DebugEditorModelManager.createRange(el.lineNumber, el.column, el.lineNumber, el.column + 1)
				});

				if (threads[threadId].exception) {
					result.push({
						options: DebugEditorModelManager.TOP_STACK_FRAME_EXCEPTION_DECORATION,
						range: wholeLineRange
					});
				} else {
					result.push({
						options: DebugEditorModelManager.TOP_STACK_FRAME_DECORATION,
						range: wholeLineRange
					});
					if (this.modelData[modelUrlStr]) {
						if (this.modelData[modelUrlStr].topStackFrameRange && this.modelData[modelUrlStr].topStackFrameRange.startLineNumber === wholeLineRange.startLineNumber &&
							this.modelData[modelUrlStr].topStackFrameRange.startColumn !== wholeLineRange.startColumn) {
							result.push({
								options: DebugEditorModelManager.TOP_STACK_FRAME_COLUMN_DECORATION,
								range: wholeLineRange
							});
						}
						this.modelData[modelUrlStr].topStackFrameRange = wholeLineRange;
					}
				}
			} else if (el === focusedStackFrame) {
				result.push({
					options: DebugEditorModelManager.FOCUSED_STACK_FRAME_MARGIN,
					range: DebugEditorModelManager.createRange(el.lineNumber, el.column, el.lineNumber, el.column + 1)
				});

				result.push({
					options: DebugEditorModelManager.FOCUSED_STACK_FRAME_DECORATION,
					range: wholeLineRange
				});
			}
		}

		return result;
	}

	private onModelDecorationsChanged(modelUrlStr: string, e: editorcommon.IModelDecorationsChangedEvent): void {
		var modelData = this.modelData[modelUrlStr];
		var myDecorationsAsMap = modelData.breakpointDecorationsAsMap;
		var mineWereChanged: boolean;

		for (var i = 0, len = e.addedOrChangedDecorations.length; i < len; i++) {
			var d = e.addedOrChangedDecorations[i];
			if (myDecorationsAsMap.hasOwnProperty(d.id)) {
				// One of my decorations
				mineWereChanged = true;
				break;
			}
		}

		if (!mineWereChanged) {
			// Nothing to do, my decorations had no changes...
			return;
		}

		var model = modelData.model,
			modelUrl = model.getAssociatedResource(),
			data: { lineNumber: number; enabled: boolean; }[] = [];

		var breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp.source.uri.toString() === modelUrlStr);
		var enabled: { [key: number]: boolean } = {};
		for (var i = 0; i < breakpoints.length; i++) {
			enabled[breakpoints[i].lineNumber] = breakpoints[i].enabled;
		}

		for (var i = 0, len = modelData.breakpointDecorationIds.length; i < len; i++) {
			var decorationRange = model.getDecorationRange(modelData.breakpointDecorationIds[i]);
			// Check if the line got deleted.
			if (decorationRange.endColumn - decorationRange.startColumn > 0) {
				// Since we know it is collapsed, it cannot grow to multiple lines
				data.push({ lineNumber: decorationRange.startLineNumber, enabled: enabled[modelData.breakpointLines[i]] });
			}
		}

		this.debugService.setBreakpointsForModel(modelUrl, data);
	}

	private onModelRemoved(model: editorcommon.IModel): void {
		var modelUrl = model.getAssociatedResource();
		if (!this.modelData.hasOwnProperty(modelUrl.toString())) {
			// Nothing to clean up
			return;
		}

		var modelData = this.modelData[modelUrl.toString()];
		delete this.modelData[modelUrl.toString()];

		lifecycle.disposeAll(modelData.toDispose);
	}

	private updateBreakpoints(modelData: IDebugEditorModelData, newBreakpoints: IBreakpoint[]): void {
		var model = modelData.model;
		modelData.breakpointDecorationIds = model.deltaDecorations(modelData.breakpointDecorationIds, this.createBreakpointDecorations(newBreakpoints));
		modelData.breakpointDecorationsAsMap = toMap(modelData.breakpointDecorationIds);
		modelData.breakpointLines = newBreakpoints.map(bp => bp.lineNumber);
	}

	private updateCallStack(): void {
		var modelUrlStr: string;
		for (modelUrlStr in this.modelData) {
			if (this.modelData.hasOwnProperty(modelUrlStr)) {
				var modelData = this.modelData[modelUrlStr];
				var model = modelData.model;
				modelData.currentStackDecorations = model.deltaDecorations(modelData.currentStackDecorations, this.createCallStackDecorations(modelUrlStr));
			}
		}
	}

	private onBreakpointChanged(): void {
		var breakpoints = this.debugService.getModel().getBreakpoints();
		var breakpointsMap: { [key: string]: IBreakpoint[] } = {};
		for (var i = 0; i < breakpoints.length; i++) {
			var uriStr = breakpoints[i].source.uri.toString();
			if (breakpointsMap[uriStr]) {
				breakpointsMap[uriStr].push(breakpoints[i]);
			} else {
				breakpointsMap[uriStr] = [breakpoints[i]];
			}
		}

		for (var modelUriStr in breakpointsMap) {
			if (breakpointsMap.hasOwnProperty(modelUriStr)) {
				if (this.modelData.hasOwnProperty(modelUriStr)) {
					this.updateBreakpoints(this.modelData[modelUriStr], breakpointsMap[modelUriStr]);
				}
			}
		}
		for (var modelUriStr in this.modelData) {
			if (this.modelData.hasOwnProperty(modelUriStr) && !breakpointsMap.hasOwnProperty(modelUriStr)) {
				this.updateBreakpoints(this.modelData[modelUriStr], []);
			}
		}
	}

	private static createRange(startLineNUmber: number, startColumn: number, endLineNumber: number, endColumn: number): editorcommon.IRange {
		return {
			startLineNumber: startLineNUmber,
			startColumn: startColumn,
			endLineNumber: endLineNumber,
			endColumn: endColumn
		};
	}

	private static BREAKPOINT_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static BREAKPOINT_DISABLED_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph-disabled',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	// We need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame-glyph',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	}

	private static FOCUSED_STACK_FRAME_MARGIN: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame-glyph',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	}

	private static TOP_STACK_FRAME_DECORATION: editorcommon.IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-line',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static TOP_STACK_FRAME_EXCEPTION_DECORATION: editorcommon.IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-exception-line',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static TOP_STACK_FRAME_COLUMN_DECORATION: editorcommon.IModelDecorationOptions = {
		isWholeLine: false,
		className: 'debug-top-stack-frame-column',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static FOCUSED_STACK_FRAME_DECORATION: editorcommon.IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-focused-stack-frame-line',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};
}
