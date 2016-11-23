/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import objects = require('vs/base/common/objects');
import lifecycle = require('vs/base/common/lifecycle');
import editorcommon = require('vs/editor/common/editorCommon');
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IBreakpoint, IRawBreakpoint, State } from 'vs/workbench/parts/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';

function toMap(arr: string[]): { [key: string]: boolean; } {
	const result: { [key: string]: boolean; } = {};
	for (let i = 0, len = arr.length; i < len; i++) {
		result[arr[i]] = true;
	}

	return result;
}

function createRange(startLineNUmber: number, startColumn: number, endLineNumber: number, endColumn: number): editorcommon.IRange {
	return {
		startLineNumber: startLineNUmber,
		startColumn: startColumn,
		endLineNumber: endLineNumber,
		endColumn: endColumn
	};
}

interface IDebugEditorModelData {
	model: editorcommon.IModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorationIds: string[];
	breakpointLines: number[];
	breakpointDecorationsAsMap: { [decorationId: string]: boolean; };
	currentStackDecorations: string[];
	topStackFrameRange: editorcommon.IRange;
	dirty: boolean;
}

export class DebugEditorModelManager implements IWorkbenchContribution {
	static ID = 'breakpointManager';

	private modelData: {
		[modelUrl: string]: IDebugEditorModelData;
	};
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IModelService private modelService: IModelService,
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
		for (let modelUrlStr in this.modelData) {
			if (this.modelData.hasOwnProperty(modelUrlStr)) {
				const modelData = this.modelData[modelUrlStr];
				lifecycle.dispose(modelData.toDispose);
				modelData.model.deltaDecorations(modelData.breakpointDecorationIds, []);
				modelData.model.deltaDecorations(modelData.currentStackDecorations, []);
			}
		}
		this.toDispose = lifecycle.dispose(this.toDispose);

		this.modelData = null;
	}

	private registerListeners(): void {
		this.toDispose.push(this.modelService.onModelAdded(this.onModelAdded, this));
		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this.toDispose.push(this.modelService.onModelRemoved(this.onModelRemoved, this));

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() => this.onFocusStackFrame()));
		this.toDispose.push(this.debugService.onDidChangeState(() => {
			if (this.debugService.state === State.Inactive) {
				Object.keys(this.modelData).forEach(key => this.modelData[key].dirty = false);
			}
		}));
	}

	private onModelAdded(model: editorcommon.IModel): void {
		const modelUrlStr = model.uri.toString();
		const breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr);

		const currentStackDecorations = model.deltaDecorations([], this.createCallStackDecorations(modelUrlStr));
		const breakPointDecorations = model.deltaDecorations([], this.createBreakpointDecorations(breakpoints));

		const toDispose: lifecycle.IDisposable[] = [model.onDidChangeDecorations((e) => this.onModelDecorationsChanged(modelUrlStr, e))];

		this.modelData[modelUrlStr] = {
			model: model,
			toDispose: toDispose,
			breakpointDecorationIds: breakPointDecorations,
			breakpointLines: breakpoints.map(bp => bp.lineNumber),
			breakpointDecorationsAsMap: toMap(breakPointDecorations),
			currentStackDecorations: currentStackDecorations,
			topStackFrameRange: null,
			dirty: false
		};
	}

	private onModelRemoved(model: editorcommon.IModel): void {
		const modelUrlStr = model.uri.toString();
		if (this.modelData.hasOwnProperty(modelUrlStr)) {
			const modelData = this.modelData[modelUrlStr];
			delete this.modelData[modelUrlStr];

			lifecycle.dispose(modelData.toDispose);
		}
	}

	// call stack management. Represent data coming from the debug service.

	private onFocusStackFrame(): void {
		Object.keys(this.modelData).forEach(modelUrlStr => {
			const modelData = this.modelData[modelUrlStr];
			modelData.currentStackDecorations = modelData.model.deltaDecorations(modelData.currentStackDecorations, this.createCallStackDecorations(modelUrlStr));
		});
	}

	private createCallStackDecorations(modelUrlStr: string): editorcommon.IModelDeltaDecoration[] {
		const result: editorcommon.IModelDeltaDecoration[] = [];
		const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
		if (!focusedStackFrame || !focusedStackFrame.thread.getCallStack()) {
			return result;
		}

		// only show decorations for the currently focussed thread.
		focusedStackFrame.thread.getCallStack().filter(sf => sf.source.uri.toString() === modelUrlStr).forEach(sf => {
			const wholeLineRange = createRange(sf.lineNumber, sf.column, sf.lineNumber, Number.MAX_VALUE);

			// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focussed stack frame,
			// an exception or a stack frame that did not change the line number (we only decorate the columns, not the whole line).
			if (sf === focusedStackFrame.thread.getCallStack()[0]) {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_MARGIN,
					range: createRange(sf.lineNumber, sf.column, sf.lineNumber, sf.column + 1)
				});

				if (focusedStackFrame.thread.stoppedDetails.reason === 'exception') {
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
			} else if (sf === focusedStackFrame) {
				result.push({
					options: DebugEditorModelManager.FOCUSED_STACK_FRAME_MARGIN,
					range: createRange(sf.lineNumber, sf.column, sf.lineNumber, sf.column + 1)
				});

				result.push({
					options: DebugEditorModelManager.FOCUSED_STACK_FRAME_DECORATION,
					range: wholeLineRange
				});
			}
		});

		return result;
	}

	// breakpoints management. Represent data coming from the debug service and also send data back.
	private onModelDecorationsChanged(modelUrlStr: string, e: editorcommon.IModelDecorationsChangedEvent): void {
		const modelData = this.modelData[modelUrlStr];
		if (!e.addedOrChangedDecorations.some(d => modelData.breakpointDecorationsAsMap.hasOwnProperty(d.id))) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data: IRawBreakpoint[] = [];

		const lineToBreakpointDataMap: { [key: number]: { enabled: boolean, condition: string, hitCondition: string } } = {};
		this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr).forEach(bp => {
			lineToBreakpointDataMap[bp.lineNumber] = {
				enabled: bp.enabled,
				condition: bp.condition,
				hitCondition: bp.hitCondition
			};
		});

		const modelUri = modelData.model.uri;
		for (let i = 0, len = modelData.breakpointDecorationIds.length; i < len; i++) {
			const decorationRange = modelData.model.getDecorationRange(modelData.breakpointDecorationIds[i]);
			// check if the line got deleted.
			if (decorationRange.endColumn - decorationRange.startColumn > 0) {
				// since we know it is collapsed, it cannot grow to multiple lines
				data.push({
					lineNumber: decorationRange.startLineNumber,
					enabled: lineToBreakpointDataMap[modelData.breakpointLines[i]].enabled,
					condition: lineToBreakpointDataMap[modelData.breakpointLines[i]].condition,
					hitCondition: lineToBreakpointDataMap[modelData.breakpointLines[i]].hitCondition
				});
			}
		}
		modelData.dirty = this.debugService.state !== State.Inactive && this.debugService.state !== State.Disabled;

		const toRemove = this.debugService.getModel().getBreakpoints()
			.filter(bp => bp.uri.toString() === modelUri.toString());

		TPromise.join(toRemove.map(bp => this.debugService.removeBreakpoints(bp.getId()))).then(() => {
			this.debugService.addBreakpoints(modelUri, data);
		});
	}

	private onBreakpointsChange(): void {
		const breakpointsMap: { [key: string]: IBreakpoint[] } = {};
		this.debugService.getModel().getBreakpoints().forEach(bp => {
			const uriStr = bp.uri.toString();
			if (breakpointsMap[uriStr]) {
				breakpointsMap[uriStr].push(bp);
			} else {
				breakpointsMap[uriStr] = [bp];
			}
		});

		Object.keys(breakpointsMap).forEach(modelUriStr => {
			if (this.modelData.hasOwnProperty(modelUriStr)) {
				this.updateBreakpoints(this.modelData[modelUriStr], breakpointsMap[modelUriStr]);
			}
		});
		Object.keys(this.modelData).forEach(modelUriStr => {
			if (!breakpointsMap.hasOwnProperty(modelUriStr)) {
				this.updateBreakpoints(this.modelData[modelUriStr], []);
			}
		});
	}

	private updateBreakpoints(modelData: IDebugEditorModelData, newBreakpoints: IBreakpoint[]): void {
		modelData.breakpointDecorationIds = modelData.model.deltaDecorations(modelData.breakpointDecorationIds, this.createBreakpointDecorations(newBreakpoints));
		modelData.breakpointDecorationsAsMap = toMap(modelData.breakpointDecorationIds);
		modelData.breakpointLines = newBreakpoints.map(bp => bp.lineNumber);
	}

	private createBreakpointDecorations(breakpoints: IBreakpoint[]): editorcommon.IModelDeltaDecoration[] {
		return breakpoints.map((breakpoint) => {
			return {
				options: this.getBreakpointDecorationOptions(breakpoint),
				range: createRange(breakpoint.lineNumber, 1, breakpoint.lineNumber, Number.MAX_VALUE)
			};
		});
	}

	private getBreakpointDecorationOptions(breakpoint: IBreakpoint): editorcommon.IModelDecorationOptions {
		const activated = this.debugService.getModel().areBreakpointsActivated();
		const state = this.debugService.state;
		const debugActive = state === State.Running || state === State.Stopped || state === State.Initializing;
		const modelData = this.modelData[breakpoint.uri.toString()];

		let result = (!breakpoint.enabled || !activated) ? DebugEditorModelManager.BREAKPOINT_DISABLED_DECORATION :
			debugActive && modelData && modelData.dirty && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_DIRTY_DECORATION :
				debugActive && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_UNVERIFIED_DECORATION :
					!breakpoint.condition && !breakpoint.hitCondition ? DebugEditorModelManager.BREAKPOINT_DECORATION : null;

		if (result && breakpoint.message) {
			result = objects.clone(result);
			result.glyphMarginHoverMessage = breakpoint.message;
		}

		if (result) {
			return result;
		}

		const process = this.debugService.getViewModel().focusedProcess;
		if (process && !process.session.configuration.capabilities.supportsConditionalBreakpoints) {
			return DebugEditorModelManager.BREAKPOINT_UNSUPPORTED_DECORATION;
		}

		const mode = modelData ? modelData.model.getMode() : null;
		const modeId = mode ? mode.getId() : '';
		let condition: string;
		if (breakpoint.condition && breakpoint.hitCondition) {
			condition = `Expression: ${breakpoint.condition}\nHitCount: ${breakpoint.hitCondition}`;
		} else {
			condition = breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition;
		}
		const glyphMarginHoverMessage = `\`\`\`${modeId}\n${condition}\`\`\``;

		return {
			glyphMarginClassName: 'debug-breakpoint-conditional-glyph',
			glyphMarginHoverMessage,
			stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		};
	}

	// editor decorations

	private static BREAKPOINT_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointHover', "Breakpoint"),
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static BREAKPOINT_DISABLED_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-disabled-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDisabledHover', "Disabled Breakpoint"),
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static BREAKPOINT_UNVERIFIED_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnverifieddHover', "Unverified Breakpoint"),
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static BREAKPOINT_DIRTY_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session."),
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static BREAKPOINT_UNSUPPORTED_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unsupported-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnsupported', "Conditional breakpoints not supported by this debug type"),
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame-glyph',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private static FOCUSED_STACK_FRAME_MARGIN: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame-glyph',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

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
