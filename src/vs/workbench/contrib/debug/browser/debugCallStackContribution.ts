/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Constants } from 'vs/editor/common/core/uint';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions } from 'vs/editor/common/model';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, State } from 'vs/workbench/contrib/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

interface IDebugEditorModelData {
	model: ITextModel;
	currentStackDecorations: string[];
	topStackFrameRange: Range | undefined;
}

const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

export class DebugCallStackContribution implements IWorkbenchContribution {
	private modelDataMap = new Map<string, IDebugEditorModelData>();
	private toDispose: IDisposable[] = [];

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IDebugService private readonly debugService: IDebugService,
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.modelService.onModelAdded(this.onModelAdded, this));
		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this.toDispose.push(this.modelService.onModelRemoved(this.onModelRemoved, this));

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
		const modelUriStr = model.uri.toString();
		const currentStackDecorations = model.deltaDecorations([], this.createCallStackDecorations(modelUriStr));

		this.modelDataMap.set(modelUriStr, {
			model: model,
			currentStackDecorations: currentStackDecorations,
			topStackFrameRange: undefined
		});
	}

	private onModelRemoved(model: ITextModel): void {
		const modelUriStr = model.uri.toString();
		const data = this.modelDataMap.get(modelUriStr);
		if (data) {
			this.modelDataMap.delete(modelUriStr);
		}
	}

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
				options: DebugCallStackContribution.TOP_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: DebugCallStackContribution.TOP_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});

			const modelData = this.modelDataMap.get(modelUriStr);
			if (modelData) {
				if (modelData.topStackFrameRange && modelData.topStackFrameRange.startLineNumber === stackFrame.range.startLineNumber && modelData.topStackFrameRange.startColumn !== stackFrame.range.startColumn) {
					result.push({
						options: DebugCallStackContribution.TOP_STACK_FRAME_INLINE_DECORATION,
						range: columnUntilEOLRange
					});
				}
				modelData.topStackFrameRange = columnUntilEOLRange;
			}
		} else {
			result.push({
				options: DebugCallStackContribution.FOCUSED_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: DebugCallStackContribution.FOCUSED_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});
		}

		return result;
	}

	// editor decorations

	static readonly STICKINESS = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame',
		stickiness
	};

	private static FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame',
		stickiness
	};

	private static TOP_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		inlineClassName: 'debug-remove-token-colors',
		className: 'debug-top-stack-frame-line',
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

	dispose(): void {
		this.modelDataMap.forEach(modelData => {
			modelData.model.deltaDecorations(modelData.currentStackDecorations, []);
		});
		this.toDispose = dispose(this.toDispose);

		this.modelDataMap.clear();
	}
}

registerThemingParticipant((theme, collector) => {
	const topStackFrame = theme.getColor(topStackFrameColor);
	if (topStackFrame) {
		collector.addRule(`.monaco-editor .view-overlays .debug-top-stack-frame-line { background: ${topStackFrame}; }`);
		collector.addRule(`.monaco-editor .view-overlays .debug-top-stack-frame-line { background: ${topStackFrame}; }`);
	}

	const focusedStackFrame = theme.getColor(focusedStackFrameColor);
	if (focusedStackFrame) {
		collector.addRule(`.monaco-editor .view-overlays .debug-focused-stack-frame-line { background: ${focusedStackFrame}; }`);
	}
});

const topStackFrameColor = registerColor('editor.stackFrameHighlightBackground', { dark: '#ffff0033', light: '#ffff6673', hc: '#fff600' }, localize('topStackFrameLineHighlight', 'Background color for the highlight of line at the top stack frame position.'));
const focusedStackFrameColor = registerColor('editor.focusedStackFrameHighlightBackground', { dark: '#7abd7a4d', light: '#cee7ce73', hc: '#cee7ce' }, localize('focusedStackFrameLineHighlight', 'Background color for the highlight of line at focused stack frame position.'));
