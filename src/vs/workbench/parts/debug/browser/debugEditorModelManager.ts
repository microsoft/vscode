/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lifecycle from 'vs/base/common/lifecycle';
import { Constants } from 'vs/editor/common/core/uint';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions } from 'vs/editor/common/model';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IBreakpoint, State } from 'vs/workbench/parts/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { getBreakpointMessageAndClassName } from 'vs/workbench/parts/debug/browser/breakpointsView';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

interface IBreakpointDecoration {
	decorationId: string;
	modelId: string;
	range: Range;
}

interface IDebugEditorModelData {
	model: ITextModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorations: IBreakpointDecoration[];
	currentStackDecorations: string[];
	topStackFrameRange: Range;
}

export class DebugEditorModelManager implements IWorkbenchContribution {
	static readonly ID = 'breakpointManager';
	static readonly STICKINESS = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
	private modelDataMap: Map<string, IDebugEditorModelData>;
	private toDispose: lifecycle.IDisposable[];
	private ignoreDecorationsChangedEvent: boolean;

	constructor(
		@IModelService private modelService: IModelService,
		@IDebugService private debugService: IDebugService,
		@ITextFileService private textFileService: ITextFileService
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
					modelData.topStackFrameRange = undefined;
				});
			}
		}));
	}

	private onModelAdded(model: ITextModel): void {
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
			topStackFrameRange: undefined
		});
	}

	private onModelRemoved(model: ITextModel): void {
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

		this.debugService.updateBreakpoints(modelUri, data, true);
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

	private createBreakpointDecorations(model: ITextModel, breakpoints: IBreakpoint[]): { range: Range; options: IModelDecorationOptions; }[] {
		const result: { range: Range; options: IModelDecorationOptions; }[] = [];
		breakpoints.forEach((breakpoint) => {
			if (breakpoint.lineNumber <= model.getLineCount()) {
				const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
				const range = model.validateRange(
					breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1)
						: new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1) // Decoration has to have a width #20688
				);

				result.push({
					options: this.getBreakpointDecorationOptions(breakpoint),
					range
				});
			}
		});

		return result;
	}

	private getBreakpointDecorationOptions(breakpoint: IBreakpoint): IModelDecorationOptions {
		const { className, message } = getBreakpointMessageAndClassName(this.debugService, this.textFileService, breakpoint);
		let glyphMarginHoverMessage: MarkdownString;

		if (message) {
			if (breakpoint.condition || breakpoint.hitCondition) {
				const modelData = this.modelDataMap.get(breakpoint.uri.toString());
				const modeId = modelData ? modelData.model.getLanguageIdentifier().language : '';
				glyphMarginHoverMessage = new MarkdownString().appendCodeblock(modeId, message);
			} else {
				glyphMarginHoverMessage = new MarkdownString().appendText(message);
			}
		}

		return {
			glyphMarginClassName: className,
			glyphMarginHoverMessage,
			stickiness: DebugEditorModelManager.STICKINESS,
			beforeContentClassName: breakpoint.column ? `debug-breakpoint-column ${className}-column` : undefined
		};
	}

	// editor decorations

	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame-glyph',
		stickiness: DebugEditorModelManager.STICKINESS
	};

	private static FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame-glyph',
		stickiness: DebugEditorModelManager.STICKINESS
	};

	private static TOP_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-top-stack-frame-line',
		stickiness: DebugEditorModelManager.STICKINESS
	};

	private static TOP_STACK_FRAME_EXCEPTION_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-top-stack-frame-exception-line',
		stickiness: DebugEditorModelManager.STICKINESS
	};

	private static TOP_STACK_FRAME_INLINE_DECORATION: IModelDecorationOptions = {
		beforeContentClassName: 'debug-top-stack-frame-column'
	};

	private static FOCUSED_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-focused-stack-frame-line',
		stickiness: DebugEditorModelManager.STICKINESS
	};
}
