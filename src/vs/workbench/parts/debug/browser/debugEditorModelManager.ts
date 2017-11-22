/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import * as lifecycle from 'vs/base/common/lifecycle';
import { Constants } from 'vs/editor/common/core/uint';
import { Range } from 'vs/editor/common/core/range';
import { IModel, TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IBreakpoint, State } from 'vs/workbench/parts/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MarkdownString } from 'vs/base/common/htmlContent';

interface IBreakpointDecoration {
	decorationId: string;
	modelId: string;
	range: Range;
}

interface IDebugEditorModelData {
	model: IModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorations: IBreakpointDecoration[];
	currentStackDecorations: string[];
	dirty: boolean;
	topStackFrameRange: Range;
}

const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

export class DebugEditorModelManager implements IWorkbenchContribution {
	static ID = 'breakpointManager';

	private modelDataMap: Map<string, IDebugEditorModelData>;
	private toDispose: lifecycle.IDisposable[];
	private ignoreDecorationsChangedEvent: boolean;

	constructor(
		@IModelService private modelService: IModelService,
		@IDebugService private debugService: IDebugService
	) {
		this.modelDataMap = new Map<string, IDebugEditorModelData>();
		this.toDispose = [];
		this.registerListeners();
	}

	public dispose(): void {
		this.modelDataMap.forEach(modelData => {
			lifecycle.dispose(modelData.toDispose);
			modelData.model.deltaDecorations(modelData.breakpointDecorations.map(bpd => bpd.decorationId), []);
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
		const desiredDecorations = this.createBreakpointDecorations(model, breakpoints);
		const breakpointDecorationIds = model.deltaDecorations([], desiredDecorations);
		const toDispose: lifecycle.IDisposable[] = [model.onDidChangeDecorations((e) => this.onModelDecorationsChanged(modelUrlStr))];

		this.modelDataMap.set(modelUrlStr, {
			model: model,
			toDispose: toDispose,
			breakpointDecorations: breakpointDecorationIds.map((decorationId, index) => ({ decorationId, modelId: breakpoints[index].getId(), range: desiredDecorations[index].range })),
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

		// only show decorations for the currently focused thread.
		const columnUntilEOLRange = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
		const range = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1);

		// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focused stack frame,
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
				if (stackFrame.range.endLineNumber && stackFrame.range.endColumn) {
					result.push({
						options: { className: 'debug-top-stack-frame-range' },
						range: stackFrame.range
					});
				}

				if (this.modelDataMap.has(modelUriStr)) {
					const modelData = this.modelDataMap.get(modelUriStr);
					if (modelData.topStackFrameRange && modelData.topStackFrameRange.startLineNumber === stackFrame.range.startLineNumber && modelData.topStackFrameRange.startColumn !== stackFrame.range.startColumn) {
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
			if (stackFrame.range.endLineNumber && stackFrame.range.endColumn) {
				result.push({
					options: { className: 'debug-focused-stack-frame-range' },
					range: stackFrame.range
				});
			}

			result.push({
				options: DebugEditorModelManager.FOCUSED_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});
		}

		return result;
	}

	// breakpoints management. Represent data coming from the debug service and also send data back.
	private onModelDecorationsChanged(modelUrlStr: string): void {
		const modelData = this.modelDataMap.get(modelUrlStr);
		if (modelData.breakpointDecorations.length === 0 || this.ignoreDecorationsChangedEvent) {
			// I have no decorations
			return;
		}
		let somethingChanged = false;
		modelData.breakpointDecorations.forEach(breakpointDecoration => {
			if (somethingChanged) {
				return;
			}
			const newBreakpointRange = modelData.model.getDecorationRange(breakpointDecoration.decorationId);
			if (newBreakpointRange && (!breakpointDecoration.range.equalsRange(newBreakpointRange))) {
				somethingChanged = true;
			}
		});
		if (!somethingChanged) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data: { [id: string]: DebugProtocol.Breakpoint } = Object.create(null);
		const breakpoints = this.debugService.getModel().getBreakpoints();
		const modelUri = modelData.model.uri;
		for (let i = 0, len = modelData.breakpointDecorations.length; i < len; i++) {
			const breakpointDecoration = modelData.breakpointDecorations[i];
			const decorationRange = modelData.model.getDecorationRange(breakpointDecoration.decorationId);
			// check if the line got deleted.
			if (decorationRange) {
				const breakpoint = breakpoints.filter(bp => bp.getId() === breakpointDecoration.modelId).pop();
				// since we know it is collapsed, it cannot grow to multiple lines
				if (breakpoint) {
					data[breakpoint.getId()] = {
						line: decorationRange.startLineNumber,
						column: breakpoint.column ? decorationRange.startColumn : undefined,
						verified: breakpoint.verified
					};
				}
			}
		}
		modelData.dirty = this.debugService.state !== State.Inactive;

		this.debugService.updateBreakpoints(modelUri, data);
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
		const desiredDecorations = this.createBreakpointDecorations(modelData.model, newBreakpoints);
		let breakpointDecorationIds: string[];
		try {
			this.ignoreDecorationsChangedEvent = true;
			breakpointDecorationIds = modelData.model.deltaDecorations(modelData.breakpointDecorations.map(bpd => bpd.decorationId), desiredDecorations);
		} finally {
			this.ignoreDecorationsChangedEvent = false;
		}

		modelData.breakpointDecorations = breakpointDecorationIds.map((decorationId, index) =>
			({ decorationId, modelId: newBreakpoints[index].getId(), range: desiredDecorations[index].range }));
	}

	private createBreakpointDecorations(model: IModel, breakpoints: IBreakpoint[]): { range: Range; options: IModelDecorationOptions; }[] {
		return breakpoints.map((breakpoint) => {
			const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
			const range = model.validateRange(
				breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1)
					: new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1) // Decoration has to have a width #20688
			);
			return {
				options: this.getBreakpointDecorationOptions(breakpoint),
				range
			};
		});
	}

	private getBreakpointDecorationOptions(breakpoint: IBreakpoint): IModelDecorationOptions {
		const activated = this.debugService.getModel().areBreakpointsActivated();
		const state = this.debugService.state;
		const debugActive = state === State.Running || state === State.Stopped;
		const modelData = this.modelDataMap.get(breakpoint.uri.toString());

		let result = (!breakpoint.enabled || !activated) ? DebugEditorModelManager.BREAKPOINT_DISABLED_DECORATION :
			debugActive && modelData && modelData.dirty && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_DIRTY_DECORATION :
				debugActive && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_UNVERIFIED_DECORATION :
					!breakpoint.condition && !breakpoint.hitCondition ? DebugEditorModelManager.BREAKPOINT_DECORATION : null;

		if (result) {
			result = objects.deepClone(result);
			if (breakpoint.message) {
				result.glyphMarginHoverMessage = new MarkdownString().appendText(breakpoint.message);
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
		const glyphMarginHoverMessage = new MarkdownString().appendCodeblock(modeId, condition);
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
		glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize('breakpointDisabledHover', "Disabled Breakpoint")),
		stickiness
	};

	private static BREAKPOINT_UNVERIFIED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize('breakpointUnverifieddHover', "Unverified Breakpoint")),
		stickiness
	};

	private static BREAKPOINT_DIRTY_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session.")),
		stickiness
	};

	private static BREAKPOINT_UNSUPPORTED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unsupported-glyph',
		glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize('breakpointUnsupported', "Conditional breakpoints not supported by this debug type")),
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
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-top-stack-frame-line',
		stickiness
	};

	private static TOP_STACK_FRAME_EXCEPTION_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-top-stack-frame-exception-line',
		stickiness
	};

	private static TOP_STACK_FRAME_INLINE_DECORATION: IModelDecorationOptions = {
		beforeContentClassName: 'debug-top-stack-frame-column'
	};

	private static FOCUSED_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-focused-stack-frame-line',
		stickiness
	};
}
