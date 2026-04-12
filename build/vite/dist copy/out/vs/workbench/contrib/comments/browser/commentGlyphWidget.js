/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Color } from '../../../../base/common/color.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { darken, editorBackground, editorForeground, listInactiveSelectionBackground, opaque, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { CommentThreadState } from '../../../../editor/common/languages.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
export const overviewRulerCommentingRangeForeground = registerColor('editorGutter.commentRangeForeground', { dark: opaque(listInactiveSelectionBackground, editorBackground), light: darken(opaque(listInactiveSelectionBackground, editorBackground), .05), hcDark: Color.white, hcLight: Color.black }, nls.localize('editorGutterCommentRangeForeground', 'Editor gutter decoration color for commenting ranges. This color should be opaque.'));
const overviewRulerCommentForeground = registerColor('editorOverviewRuler.commentForeground', overviewRulerCommentingRangeForeground, nls.localize('editorOverviewRuler.commentForeground', 'Editor overview ruler decoration color for resolved comments. This color should be opaque.'));
const overviewRulerCommentUnresolvedForeground = registerColor('editorOverviewRuler.commentUnresolvedForeground', overviewRulerCommentForeground, nls.localize('editorOverviewRuler.commentUnresolvedForeground', 'Editor overview ruler decoration color for unresolved comments. This color should be opaque.'));
const overviewRulerCommentDraftForeground = registerColor('editorOverviewRuler.commentDraftForeground', overviewRulerCommentUnresolvedForeground, nls.localize('editorOverviewRuler.commentDraftForeground', 'Editor overview ruler decoration color for comment threads with draft comments. This color should be opaque.'));
const editorGutterCommentGlyphForeground = registerColor('editorGutter.commentGlyphForeground', { dark: editorForeground, light: editorForeground, hcDark: Color.black, hcLight: Color.white }, nls.localize('editorGutterCommentGlyphForeground', 'Editor gutter decoration color for commenting glyphs.'));
registerColor('editorGutter.commentUnresolvedGlyphForeground', editorGutterCommentGlyphForeground, nls.localize('editorGutterCommentUnresolvedGlyphForeground', 'Editor gutter decoration color for commenting glyphs for unresolved comment threads.'));
registerColor('editorGutter.commentDraftGlyphForeground', editorGutterCommentGlyphForeground, nls.localize('editorGutterCommentDraftGlyphForeground', 'Editor gutter decoration color for commenting glyphs for comment threads with draft comments.'));
export class CommentGlyphWidget extends Disposable {
    static { this.description = 'comment-glyph-widget'; }
    constructor(editor, lineNumber) {
        super();
        this._threadHasDraft = false;
        this._onDidChangeLineNumber = this._register(new Emitter());
        this.onDidChangeLineNumber = this._onDidChangeLineNumber.event;
        this._commentsOptions = this.createDecorationOptions();
        this._editor = editor;
        this._commentsDecorations = this._editor.createDecorationsCollection();
        this._register(this._commentsDecorations.onDidChange(e => {
            const range = (this._commentsDecorations.length > 0 ? this._commentsDecorations.getRange(0) : null);
            if (range && range.endLineNumber !== this._lineNumber) {
                this._lineNumber = range.endLineNumber;
                this._onDidChangeLineNumber.fire(this._lineNumber);
            }
        }));
        this._register(toDisposable(() => this._commentsDecorations.clear()));
        this.setLineNumber(lineNumber);
    }
    createDecorationOptions() {
        // Priority: draft > unresolved > resolved
        let className;
        if (this._threadHasDraft) {
            className = 'comment-range-glyph comment-thread-draft';
        }
        else {
            const unresolved = this._threadState === CommentThreadState.Unresolved;
            className = `comment-range-glyph comment-thread${unresolved ? '-unresolved' : ''}`;
        }
        const decorationOptions = {
            description: CommentGlyphWidget.description,
            isWholeLine: true,
            overviewRuler: {
                color: themeColorFromId(this._threadHasDraft ? overviewRulerCommentDraftForeground :
                    (this._threadState === CommentThreadState.Unresolved ? overviewRulerCommentUnresolvedForeground : overviewRulerCommentForeground)),
                position: OverviewRulerLane.Center
            },
            collapseOnReplaceEdit: true,
            linesDecorationsClassName: className
        };
        return ModelDecorationOptions.createDynamic(decorationOptions);
    }
    setThreadState(state, hasDraft = false) {
        if (this._threadState !== state || this._threadHasDraft !== hasDraft) {
            this._threadState = state;
            this._threadHasDraft = hasDraft;
            this._commentsOptions = this.createDecorationOptions();
            this._updateDecorations();
        }
    }
    _updateDecorations() {
        const commentsDecorations = [{
                range: {
                    startLineNumber: this._lineNumber, startColumn: 1,
                    endLineNumber: this._lineNumber, endColumn: 1
                },
                options: this._commentsOptions
            }];
        this._commentsDecorations.set(commentsDecorations);
    }
    setLineNumber(lineNumber) {
        this._lineNumber = lineNumber;
        this._updateDecorations();
    }
    getPosition() {
        const range = (this._commentsDecorations.length > 0 ? this._commentsDecorations.getRange(0) : null);
        return {
            position: {
                lineNumber: range ? range.endLineNumber : this._lineNumber,
                column: 1
            },
            preference: [0 /* ContentWidgetPositionPreference.EXACT */]
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudEdseXBoV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50R2x5cGhXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUEyQixpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3hLLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNELE1BQU0sQ0FBQyxNQUFNLHNDQUFzQyxHQUFHLGFBQWEsQ0FBQyxxQ0FBcUMsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsK0JBQStCLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQywrQkFBK0IsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMs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