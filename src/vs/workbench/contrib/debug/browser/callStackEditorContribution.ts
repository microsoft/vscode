/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Constants } from 'vs/base/common/uint';
import { Range } from 'vs/editor/common/core/range';
import { TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions } from 'vs/editor/common/model';
import { IDebugService, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';

const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

class CallStackEditorContribution implements IEditorContribution {
	private toDispose: IDisposable[] = [];
	private decorationIds: string[] = [];
	private topStackFrameRange: Range | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
	) {
		const setDecorations = () => this.decorationIds = this.editor.deltaDecorations(this.decorationIds, this.createCallStackDecorations());
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			setDecorations();
		}));
		this.toDispose.push(this.editor.onDidChangeModel(e => {
			if (e.newModelUrl) {
				setDecorations();
			}
		}));
	}

	private createCallStackDecorations(): IModelDeltaDecoration[] {
		const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
		const decorations: IModelDeltaDecoration[] = [];
		this.debugService.getModel().getSessions().forEach(s => {
			s.getAllThreads().forEach(t => {
				if (t.stopped) {
					let candidateStackFrame = t === focusedStackFrame?.thread ? focusedStackFrame : undefined;
					if (!candidateStackFrame) {
						const callStack = t.getCallStack();
						if (callStack.length) {
							candidateStackFrame = callStack[0];
						}
					}

					if (candidateStackFrame && candidateStackFrame.source.uri.toString() === this.editor.getModel()?.uri.toString()) {
						decorations.push(...this.createDecorationsForStackFrame(candidateStackFrame));
					}
				}
			});
		});

		return decorations;
	}

	private createDecorationsForStackFrame(stackFrame: IStackFrame): IModelDeltaDecoration[] {
		// only show decorations for the currently focused thread.
		const result: IModelDeltaDecoration[] = [];
		const columnUntilEOLRange = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
		const range = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1);

		// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focused stack frame,
		// an exception or a stack frame that did not change the line number (we only decorate the columns, not the whole line).
		const callStack = stackFrame.thread.getCallStack();
		if (callStack && callStack.length && stackFrame === callStack[0]) {
			result.push({
				options: CallStackEditorContribution.TOP_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: CallStackEditorContribution.TOP_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});

			if (this.topStackFrameRange && this.topStackFrameRange.startLineNumber === stackFrame.range.startLineNumber && this.topStackFrameRange.startColumn !== stackFrame.range.startColumn) {
				result.push({
					options: CallStackEditorContribution.TOP_STACK_FRAME_INLINE_DECORATION,
					range: columnUntilEOLRange
				});
			}
			this.topStackFrameRange = columnUntilEOLRange;
		} else {
			result.push({
				options: CallStackEditorContribution.FOCUSED_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: CallStackEditorContribution.FOCUSED_STACK_FRAME_DECORATION,
				range: columnUntilEOLRange
			});
		}

		return result;
	}

	// editor decorations

	static readonly STICKINESS = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'codicon-debug-stackframe',
		stickiness
	};

	private static FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'codicon-debug-stackframe-focused',
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
		this.editor.deltaDecorations(this.decorationIds, []);
		this.toDispose = dispose(this.toDispose);
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

	const debugIconBreakpointColor = theme.getColor(debugIconBreakpointForeground);
	if (debugIconBreakpointColor) {
		collector.addRule(`
		.monaco-workbench .codicon-debug-breakpoint,
		.monaco-workbench .codicon-debug-breakpoint-conditional,
		.monaco-workbench .codicon-debug-breakpoint-log,
		.monaco-workbench .codicon-debug-breakpoint-function,
		.monaco-workbench .codicon-debug-breakpoint-data,
		.monaco-workbench .codicon-debug-breakpoint-unsupported,
		.monaco-workbench .codicon-debug-hint:not([class*='codicon-debug-breakpoint']),
		.monaco-workbench .codicon-debug-breakpoint.codicon-debug-stackframe-focused::after,
		.monaco-workbench .codicon-debug-breakpoint.codicon-debug-stackframe::after {
			color: ${debugIconBreakpointColor} !important;
		}
		`);
	}

	const debugIconBreakpointDisabledColor = theme.getColor(debugIconBreakpointDisabledForeground);
	if (debugIconBreakpointDisabledColor) {
		collector.addRule(`
		.monaco-workbench .codicon[class*='-disabled'] {
			color: ${debugIconBreakpointDisabledColor} !important;
		}
		`);
	}

	const debugIconBreakpointUnverifiedColor = theme.getColor(debugIconBreakpointUnverifiedForeground);
	if (debugIconBreakpointUnverifiedColor) {
		collector.addRule(`
		.monaco-workbench .codicon[class*='-unverified'] {
			color: ${debugIconBreakpointUnverifiedColor} !important;
		}
		`);
	}

	const debugIconBreakpointCurrentStackframeForegroundColor = theme.getColor(debugIconBreakpointCurrentStackframeForeground);
	if (debugIconBreakpointCurrentStackframeForegroundColor) {
		collector.addRule(`
		.monaco-workbench .codicon-debug-stackframe {
			color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
		}
		`);
	}

	const debugIconBreakpointStackframeFocusedColor = theme.getColor(debugIconBreakpointStackframeForeground);
	if (debugIconBreakpointStackframeFocusedColor) {
		collector.addRule(`
		.monaco-workbench .codicon-debug-stackframe-focused {
			color: ${debugIconBreakpointStackframeFocusedColor} !important;
		}
		`);
	}

});

const topStackFrameColor = registerColor('editor.stackFrameHighlightBackground', { dark: '#ffff0033', light: '#ffff6673', hc: '#fff600' }, localize('topStackFrameLineHighlight', 'Background color for the highlight of line at the top stack frame position.'));
const focusedStackFrameColor = registerColor('editor.focusedStackFrameHighlightBackground', { dark: '#7abd7a4d', light: '#cee7ce73', hc: '#cee7ce' }, localize('focusedStackFrameLineHighlight', 'Background color for the highlight of line at focused stack frame position.'));

const debugIconBreakpointForeground = registerColor('debugIcon.breakpointForeground', { dark: '#E51400', light: '#E51400', hc: '#E51400' }, localize('debugIcon.breakpointForeground', 'Icon color for breakpoints.'));
const debugIconBreakpointDisabledForeground = registerColor('debugIcon.breakpointDisabledForeground', { dark: '#848484', light: '#848484', hc: '#848484' }, localize('debugIcon.breakpointDisabledForeground', 'Icon color for disabled breakpoints.'));
const debugIconBreakpointUnverifiedForeground = registerColor('debugIcon.breakpointUnverifiedForeground', { dark: '#848484', light: '#848484', hc: '#848484' }, localize('debugIcon.breakpointUnverifiedForeground', 'Icon color for unverified breakpoints.'));
const debugIconBreakpointCurrentStackframeForeground = registerColor('debugIcon.breakpointCurrentStackframeForeground', { dark: '#FFCC00', light: '#FFCC00', hc: '#FFCC00' }, localize('debugIcon.breakpointCurrentStackframeForeground', 'Icon color for the current breakpoint stack frame.'));
const debugIconBreakpointStackframeForeground = registerColor('debugIcon.breakpointStackframeForeground', { dark: '#89D185', light: '#89D185', hc: '#89D185' }, localize('debugIcon.breakpointStackframeForeground', 'Icon color for all breakpoint stack frames.'));

registerEditorContribution('editor.contrib.callStack', CallStackEditorContribution);
