/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import * as lifecycle from 'vs/base/common/lifecycle';
import { Constants } from 'vs/editor/common/core/uint';
import { Range } from 'vs/editor/common/core/range';
import { IModel, TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationsChangedEvent, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IBreakpoint, IRawBreakpoint, State } from 'vs/workbench/parts/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';

interface IDebugEditorModelData {
	model: IModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorationIds: string[];
	breakpointLines: number[];
	breakpointDecorationsAsMap: Map<string, boolean>;
	currentStackDecorations: string[];
	dirty: boolean;
	topStackFrameRange: Range;
}

const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

export class DebugEditorModelManager implements IWorkbenchContribution {
	static ID = 'breakpointManager';

	private modelDataMap: Map<string, IDebugEditorModelData>;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IModelService private modelService: IModelService,
		@IDebugService private debugService: IDebugService
	) {
		this.modelDataMap = new Map<string, IDebugEditorModelData>();
		this.toDispose = [];
		this.registerListeners();
	}

	public getId(): string {
		return DebugEditorModelManager.ID;
	}

	public dispose(): void {
		this.modelDataMap.forEach(modelData => {
			lifecycle.dispose(modelData.toDispose);
			modelData.model.deltaDecorations(modelData.breakpointDecorationIds, []);
			modelData.model.deltaDecorations(modelData.currentStackDecorations, []);
		});
		this.toDispose = lifecycle.dispose(this.toDispose);

		this.modelDataMap.clear();
	}

	private registerListeners(): void {
		this.toDispose.push(this.modelService.onModelAdded(this.onModelAdded, this));
		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this.toDispose.push(this.modelService.onModelRemoved(this.onModelRemoved, this));

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() => this.onFocusStackFrame()));
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			if (state === State.Inactive) {
				this.modelDataMap.forEach(modelData => {
					modelData.dirty = false;
					modelData.topStackFrameRange = undefined;
				});
			}
		}));
	}

	private onModelAdded(model: IModel): void {
		const modelUrlStr = model.uri.toString();
		const breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr);

		const currentStackDecorations = model.deltaDecorations([], this.createCallStackDecorations(modelUrlStr));
		const breakPointDecorations = model.deltaDecorations([], this.createBreakpointDecorations(breakpoints));

		const toDispose: lifecycle.IDisposable[] = [model.onDidChangeDecorations((e) => this.onModelDecorationsChanged(modelUrlStr, e))];
		const breakpointDecorationsAsMap = new Map<string, boolean>();
		breakPointDecorations.forEach(bpd => breakpointDecorationsAsMap.set(bpd, true));

		this.modelDataMap.set(modelUrlStr, {
			model: model,
			toDispose: toDispose,
			breakpointDecorationIds: breakPointDecorations,
			breakpointLines: breakpoints.map(bp => bp.lineNumber),
			breakpointDecorationsAsMap,
			currentStackDecorations: currentStackDecorations,
			dirty: false,
			topStackFrameRange: undefined
		});
	}

	private onModelRemoved(model: IModel): void {
		const modelUriStr = model.uri.toString();
		if (this.modelDataMap.has(modelUriStr)) {
			lifecycle.dispose(this.modelDataMap.get(modelUriStr).toDispose);
			this.modelDataMap.delete(modelUriStr);
		}
	}

	// call stack management. Represent data coming from the debug service.

	private onFocusStackFrame(): void {
		this.modelDataMap.forEach((modelData, uri) => {
			modelData.currentStackDecorations = modelData.model.deltaDecorations(modelData.currentStackDecorations, this.createCallStackDecorations(uri));
		});
	}

	private createCallStackDecorations(modelUriStr: string): IModelDeltaDecoration[] {
		const result: IModelDeltaDecoration[] = [];
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		if (!stackFrame || stackFrame.source.uri.toString() !== modelUriStr) {
			return result;
		}

		// only show decorations for the currently focussed thread.
		const columnUntilEOLRange = new Range(stackFrame.lineNumber, stackFrame.column, stackFrame.lineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
		const range = new Range(stackFrame.lineNumber, stackFrame.column, stackFrame.lineNumber, stackFrame.column + 1);

		// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focussed stack frame,
		// an exception or a stack frame that did not change the line number (we only decorate the columns, not the whole line).
		const callStack = stackFrame.thread.getCallStack();
		if (callStack && callStack.length && stackFrame === callStack[0]) {
			result.push({
				options: DebugEditorModelManager.TOP_STACK_FRAME_MARGIN,
				range
			});

			if (stackFrame.thread.stoppedDetails && stackFrame.thread.stoppedDetails.reason === 'exception') {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_EXCEPTION_DECORATION,
					range: columnUntilEOLRange
				});
			} else {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_DECORATION,
					range: columnUntilEOLRange
				});

				if (this.modelDataMap.has(modelUriStr)) {
					const modelData = this.modelDataMap.get(modelUriStr);
					if (modelData.topStackFrameRange && modelData.topStackFrameRange.startLineNumber === stackFrame.lineNumber && modelData.topStackFrameRange.startColumn !== stackFrame.column) {
						result.push({
							options: DebugEditorModelManager.TOP_STACK_FRAME_INLINE_DECORATION,
							range: columnUntilEOLRange
						});
					}
					modelData.topStackFrameRange = columnUntilEOLRange;
				}
			}
		} else {
			result.push({
				options: DebugEditorModelManager.FOCUSED_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: DebugEditorModelManager.FOCUSED_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});
		}

		return result;
	}

	// breakpoints management. Represent data coming from the debug service and also send data back.
	private onModelDecorationsChanged(modelUrlStr: string, e: IModelDecorationsChangedEvent): void {
		const modelData = this.modelDataMap.get(modelUrlStr);
		if (modelData.breakpointDecorationsAsMap.size === 0) {
			// I have no decorations
			return;
		}
		if (!e.changedDecorations.some(decorationId => modelData.breakpointDecorationsAsMap.has(decorationId))) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data: IRawBreakpoint[] = [];

		const lineToBreakpointDataMap = new Map<number, IBreakpoint>();
		this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr).forEach(bp => {
			lineToBreakpointDataMap.set(bp.lineNumber, bp);
		});

		const modelUri = modelData.model.uri;
		for (let i = 0, len = modelData.breakpointDecorationIds.length; i < len; i++) {
			const decorationRange = modelData.model.getDecorationRange(modelData.breakpointDecorationIds[i]);
			const lineNumber = modelData.breakpointLines[i];
			// check if the line got deleted.
			if (decorationRange.endColumn - decorationRange.startColumn > 0) {
				const breakpoint = lineToBreakpointDataMap.get(lineNumber);
				// since we know it is collapsed, it cannot grow to multiple lines
				data.push({
					lineNumber: decorationRange.startLineNumber,
					enabled: breakpoint.enabled,
					condition: breakpoint.condition,
					hitCondition: breakpoint.hitCondition,
					column: breakpoint.column ? decorationRange.startColumn : undefined
				});
			}
		}
		modelData.dirty = this.debugService.state !== State.Inactive;

		const toRemove = this.debugService.getModel().getBreakpoints()
			.filter(bp => bp.uri.toString() === modelUri.toString());

		TPromise.join(toRemove.map(bp => this.debugService.removeBreakpoints(bp.getId()))).then(() => {
			this.debugService.addBreakpoints(modelUri, data);
		});
	}

	private onBreakpointsChange(): void {
		const breakpointsMap = new Map<string, IBreakpoint[]>();
		this.debugService.getModel().getBreakpoints().forEach(bp => {
			const uriStr = bp.uri.toString();
			if (breakpointsMap.has(uriStr)) {
				breakpointsMap.get(uriStr).push(bp);
			} else {
				breakpointsMap.set(uriStr, [bp]);
			}
		});

		breakpointsMap.forEach((bps, uri) => {
			if (this.modelDataMap.has(uri)) {
				this.updateBreakpoints(this.modelDataMap.get(uri), breakpointsMap.get(uri));
			}
		});
		this.modelDataMap.forEach((modelData, uri) => {
			if (!breakpointsMap.has(uri)) {
				this.updateBreakpoints(modelData, []);
			}
		});
	}

	private updateBreakpoints(modelData: IDebugEditorModelData, newBreakpoints: IBreakpoint[]): void {
		modelData.breakpointDecorationIds = modelData.model.deltaDecorations(modelData.breakpointDecorationIds, this.createBreakpointDecorations(newBreakpoints));
		modelData.breakpointDecorationsAsMap.clear();
		modelData.breakpointDecorationIds.forEach(id => modelData.breakpointDecorationsAsMap.set(id, true));
		modelData.breakpointLines = newBreakpoints.map(bp => bp.lineNumber);
	}

	private createBreakpointDecorations(breakpoints: IBreakpoint[]): IModelDeltaDecoration[] {
		return breakpoints.map((breakpoint) => {
			const range = breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1)
				: new Range(breakpoint.lineNumber, 1, breakpoint.lineNumber, Constants.MAX_SAFE_SMALL_INTEGER); // Decoration has to have a width #20688
			return {
				options: this.getBreakpointDecorationOptions(breakpoint),
				range
			};
		});
	}

	private getBreakpointDecorationOptions(breakpoint: IBreakpoint): IModelDecorationOptions {
		const activated = this.debugService.getModel().areBreakpointsActivated();
		const state = this.debugService.state;
		const debugActive = state === State.Running || state === State.Stopped || state === State.Initializing;
		const modelData = this.modelDataMap.get(breakpoint.uri.toString());

		let result = (!breakpoint.enabled || !activated) ? DebugEditorModelManager.BREAKPOINT_DISABLED_DECORATION :
			debugActive && modelData && modelData.dirty && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_DIRTY_DECORATION :
				debugActive && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_UNVERIFIED_DECORATION :
					!breakpoint.condition && !breakpoint.hitCondition ? DebugEditorModelManager.BREAKPOINT_DECORATION : null;

		if (result) {
			result = objects.clone(result);
			if (breakpoint.message) {
				result.glyphMarginHoverMessage = breakpoint.message;
			}
			if (breakpoint.column) {
				result.beforeContentClassName = `debug-breakpoint-column ${result.glyphMarginClassName}-column`;
			}

			return result;
		}

		const process = this.debugService.getViewModel().focusedProcess;
		if (process && !process.session.capabilities.supportsConditionalBreakpoints) {
			return DebugEditorModelManager.BREAKPOINT_UNSUPPORTED_DECORATION;
		}

		const modeId = modelData ? modelData.model.getLanguageIdentifier().language : '';
		let condition: string;
		if (breakpoint.condition && breakpoint.hitCondition) {
			condition = `Expression: ${breakpoint.condition}\nHitCount: ${breakpoint.hitCondition}`;
		} else {
			condition = breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition;
		}
		const glyphMarginHoverMessage = `\`\`\`${modeId}\n${condition}\`\`\``;
		const glyphMarginClassName = 'debug-breakpoint-conditional-glyph';
		const beforeContentClassName = breakpoint.column ? `debug-breakpoint-column ${glyphMarginClassName}-column` : undefined;

		return {
			glyphMarginClassName,
			glyphMarginHoverMessage,
			stickiness,
			beforeContentClassName
		};
	}

	// editor decorations

	private static BREAKPOINT_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph',
		stickiness
	};

	private static BREAKPOINT_DISABLED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-disabled-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDisabledHover', "Disabled Breakpoint"),
		stickiness
	};

	private static BREAKPOINT_UNVERIFIED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnverifieddHover', "Unverified Breakpoint"),
		stickiness
	};

	private static BREAKPOINT_DIRTY_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session."),
		stickiness
	};

	private static BREAKPOINT_UNSUPPORTED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unsupported-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnsupported', "Conditional breakpoints not supported by this debug type"),
		stickiness
	};

	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame-glyph',
		stickiness
	};

	private static FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame-glyph',
		stickiness
	};

	private static TOP_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-line',
		stickiness
	};

	private static TOP_STACK_FRAME_EXCEPTION_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-exception-line',
		stickiness
	};

	private static TOP_STACK_FRAME_INLINE_DECORATION: IModelDecorationOptions = {
		beforeContentClassName: 'debug-top-stack-frame-column'
	};

	private static FOCUSED_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-focused-stack-frame-line',
		stickiness
	};
}
