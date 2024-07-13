/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Constants } from 'vs/base/common/uint';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationOptions, IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { debugStackframe, debugStackframeFocused } from 'vs/workbench/contrib/debug/browser/debugIcons';
import { IDebugService, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import 'vs/css!./media/callStackEditorContribution';

export const topStackFrameColor = registerColor('editor.stackFrameHighlightBackground', { dark: '#ffff0033', light: '#ffff6673', hcDark: '#ffff0033', hcLight: '#ffff6673' }, localize('topStackFrameLineHighlight', 'Background color for the highlight of line at the top stack frame position.'));
export const focusedStackFrameColor = registerColor('editor.focusedStackFrameHighlightBackground', { dark: '#7abd7a4d', light: '#cee7ce73', hcDark: '#7abd7a4d', hcLight: '#cee7ce73' }, localize('focusedStackFrameLineHighlight', 'Background color for the highlight of line at focused stack frame position.'));
const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
const TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
	description: 'top-stack-frame-margin',
	glyphMarginClassName: ThemeIcon.asClassName(debugStackframe),
	glyphMargin: { position: GlyphMarginLane.Right },
	zIndex: 9999,
	stickiness,
	overviewRuler: {
		position: OverviewRulerLane.Full,
		color: themeColorFromId(topStackFrameColor)
	}
};
const FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
	description: 'focused-stack-frame-margin',
	glyphMarginClassName: ThemeIcon.asClassName(debugStackframeFocused),
	glyphMargin: { position: GlyphMarginLane.Right },
	zIndex: 9999,
	stickiness,
	overviewRuler: {
		position: OverviewRulerLane.Full,
		color: themeColorFromId(focusedStackFrameColor)
	}
};
export const TOP_STACK_FRAME_DECORATION: IModelDecorationOptions = {
	description: 'top-stack-frame-decoration',
	isWholeLine: true,
	className: 'debug-top-stack-frame-line',
	stickiness
};
export const FOCUSED_STACK_FRAME_DECORATION: IModelDecorationOptions = {
	description: 'focused-stack-frame-decoration',
	isWholeLine: true,
	className: 'debug-focused-stack-frame-line',
	stickiness
};

export const makeStackFrameColumnDecoration = (noCharactersBefore: boolean): IModelDecorationOptions => ({
	description: 'top-stack-frame-inline-decoration',
	before: {
		content: '\uEB8B',
		inlineClassName: noCharactersBefore ? 'debug-top-stack-frame-column start-of-line' : 'debug-top-stack-frame-column',
		inlineClassNameAffectsLetterSpacing: true
	},
});

export function createDecorationsForStackFrame(stackFrame: IStackFrame, isFocusedSession: boolean, noCharactersBefore: boolean): IModelDeltaDecoration[] {
	// only show decorations for the currently focused thread.
	const result: IModelDeltaDecoration[] = [];
	const columnUntilEOLRange = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
	const range = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1);

	// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focused stack frame,
	// an exception or a stack frame that did not change the line number (we only decorate the columns, not the whole line).
	const topStackFrame = stackFrame.thread.getTopStackFrame();
	if (stackFrame.getId() === topStackFrame?.getId()) {
		if (isFocusedSession) {
			result.push({
				options: TOP_STACK_FRAME_MARGIN,
				range
			});
		}

		result.push({
			options: TOP_STACK_FRAME_DECORATION,
			range: columnUntilEOLRange
		});

		if (stackFrame.range.startColumn > 1) {
			result.push({
				options: makeStackFrameColumnDecoration(noCharactersBefore),
				range: columnUntilEOLRange
			});
		}
	} else {
		if (isFocusedSession) {
			result.push({
				options: FOCUSED_STACK_FRAME_MARGIN,
				range
			});
		}

		result.push({
			options: FOCUSED_STACK_FRAME_DECORATION,
			range: columnUntilEOLRange
		});
	}

	return result;
}

export class CallStackEditorContribution extends Disposable implements IEditorContribution {
	private decorations = this.editor.createDecorationsCollection();

	constructor(
		private readonly editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const setDecorations = () => this.decorations.set(this.createCallStackDecorations());
		this._register(Event.any(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getModel().onDidChangeCallStack)(() => {
			setDecorations();
		}));
		this._register(this.editor.onDidChangeModel(e => {
			if (e.newModelUrl) {
				setDecorations();
			}
		}));
		setDecorations();
	}

	private createCallStackDecorations(): IModelDeltaDecoration[] {
		const editor = this.editor;
		if (!editor.hasModel()) {
			return [];
		}

		const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
		const decorations: IModelDeltaDecoration[] = [];
		this.debugService.getModel().getSessions().forEach(s => {
			const isSessionFocused = s === focusedStackFrame?.thread.session;
			s.getAllThreads().forEach(t => {
				if (t.stopped) {
					const callStack = t.getCallStack();
					const stackFrames: IStackFrame[] = [];
					if (callStack.length > 0) {
						// Always decorate top stack frame, and decorate focused stack frame if it is not the top stack frame
						if (focusedStackFrame && !focusedStackFrame.equals(callStack[0])) {
							stackFrames.push(focusedStackFrame);
						}
						stackFrames.push(callStack[0]);
					}

					stackFrames.forEach(candidateStackFrame => {
						if (candidateStackFrame && this.uriIdentityService.extUri.isEqual(candidateStackFrame.source.uri, editor.getModel()?.uri)) {
							if (candidateStackFrame.range.startLineNumber > editor.getModel()?.getLineCount() || candidateStackFrame.range.startLineNumber < 1) {
								this.logService.warn(`CallStackEditorContribution: invalid stack frame line number: ${candidateStackFrame.range.startLineNumber}`);
								return;
							}

							const noCharactersBefore = editor.getModel().getLineFirstNonWhitespaceColumn(candidateStackFrame.range.startLineNumber) >= candidateStackFrame.range.startColumn;
							decorations.push(...createDecorationsForStackFrame(candidateStackFrame, isSessionFocused, noCharactersBefore));
						}
					});
				}
			});
		});

		// Deduplicate same decorations so colors do not stack #109045
		return distinct(decorations, d => `${d.options.className} ${d.options.glyphMarginClassName} ${d.range.startLineNumber} ${d.range.startColumn}`);
	}

	override dispose(): void {
		super.dispose();
		this.decorations.clear();
	}
}

