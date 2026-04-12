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
import { distinct } from '../../../../base/common/arrays.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { GlyphMarginLane, OverviewRulerLane } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { debugStackframe, debugStackframeFocused } from './debugIcons.js';
import { IDebugService } from '../common/debug.js';
import './media/callStackEditorContribution.css';
export const topStackFrameColor = registerColor('editor.stackFrameHighlightBackground', { dark: '#ffff0033', light: '#ffff6673', hcDark: '#ffff0033', hcLight: '#ffff6673' }, localize('topStackFrameLineHighlight', 'Background color for the highlight of line at the top stack frame position.'));
export const focusedStackFrameColor = registerColor('editor.focusedStackFrameHighlightBackground', { dark: '#7abd7a4d', light: '#cee7ce73', hcDark: '#7abd7a4d', hcLight: '#cee7ce73' }, localize('focusedStackFrameLineHighlight', 'Background color for the highlight of line at focused stack frame position.'));
const stickiness = 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */;
// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
const TOP_STACK_FRAME_MARGIN = {
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
const FOCUSED_STACK_FRAME_MARGIN = {
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
export const TOP_STACK_FRAME_DECORATION = {
    description: 'top-stack-frame-decoration',
    isWholeLine: true,
    className: 'debug-top-stack-frame-line',
    stickiness
};
export const FOCUSED_STACK_FRAME_DECORATION = {
    description: 'focused-stack-frame-decoration',
    isWholeLine: true,
    className: 'debug-focused-stack-frame-line',
    stickiness
};
export const makeStackFrameColumnDecoration = (noCharactersBefore) => ({
    description: 'top-stack-frame-inline-decoration',
    before: {
        content: '\uEB8B',
        inlineClassName: noCharactersBefore ? 'debug-top-stack-frame-column start-of-line' : 'debug-top-stack-frame-column',
        inlineClassNameAffectsLetterSpacing: true
    },
});
export function createDecorationsForStackFrame(stackFrame, isFocusedSession, noCharactersBefore) {
    // only show decorations for the currently focused thread.
    const result = [];
    const columnUntilEOLRange = new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn, stackFrame.range.startLineNumber, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
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
    }
    else {
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
let CallStackEditorContribution = class CallStackEditorContribution extends Disposable {
    constructor(editor, debugService, uriIdentityService, logService) {
        super();
        this.editor = editor;
        this.debugService = debugService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.decorations = this.editor.createDecorationsCollection();
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
    createCallStackDecorations() {
        const editor = this.editor;
        if (!editor.hasModel()) {
            return [];
        }
        const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
        const decorations = [];
        this.debugService.getModel().getSessions().forEach(s => {
            const isSessionFocused = s === focusedStackFrame?.thread.session;
            s.getAllThreads().forEach(t => {
                if (t.stopped) {
                    const callStack = t.getCallStack();
                    const stackFrames = [];
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
    dispose() {
        super.dispose();
        this.decorations.clear();
    }
};
CallStackEditorContribution = __decorate([
    __param(1, IDebugService),
    __param(2, IUriIdentityService),
    __param(3, ILogService)
], CallStackEditorContribution);
export { CallStackEditorContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbFN0YWNrRWRpdG9yQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9jYWxsU3RhY2tFZGl0b3JDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxlQUFlLEVBQWtELGlCQUFpQixFQUEwQixNQUFNLG9DQUFvQyxDQUFDO0FBQ2hLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDMUUsT0FBTyxFQUFFLGFBQWEsRUFBZSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hFLE9BQU8seUNBQXlDLENBQUM7QUFFakQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDLHNDQUFzQyxFQUFF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