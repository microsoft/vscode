var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedObservableWithCache, observableValue } from '../../../../../../../base/common/observable.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { InlineCompletionHintStyle } from '../../../../../../common/languages.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { InlineEditClickEvent, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBackgroundColor, getEditorBlendedColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSuccessfulBackground } from '../theme.js';
import { getContentRenderWidth, maxContentWidthInRange, rectToProps } from '../utils/utils.js';
const MIN_END_OF_LINE_PADDING = 14;
const PADDING_VERTICALLY = 0;
const PADDING_HORIZONTALLY = 4;
const HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW = 4;
const VERTICAL_OFFSET_WHEN_ABOVE_BELOW = 2;
// !! minEndOfLinePadding should always be larger than paddingHorizontally + horizontalOffsetWhenAboveBelow
let InlineEditsCustomView = class InlineEditsCustomView extends Disposable {
    constructor(_editor, displayLocation, tabAction, editorType, themeService, _languageService) {
        super();
        this._editor = _editor;
        this._languageService = _languageService;
        this._onDidClick = this._register(new Emitter());
        this.onDidClick = this._onDidClick.event;
        this._isHovered = observableValue(this, false);
        this.isHovered = this._isHovered;
        this._viewRef = n.ref();
        this._editorObs = observableCodeEditor(this._editor);
        const styles = tabAction.map((v, reader) => {
            let border;
            switch (v) {
                case InlineEditTabAction.Inactive:
                    border = inlineEditIndicatorSecondaryBackground;
                    break;
                case InlineEditTabAction.Jump:
                    border = inlineEditIndicatorPrimaryBackground;
                    break;
                case InlineEditTabAction.Accept:
                    border = inlineEditIndicatorSuccessfulBackground;
                    break;
            }
            return {
                border: getEditorBlendedColor(border, themeService).read(reader).toString(),
                background: getEditorBackgroundColor(editorType.read(reader))
            };
        });
        const state = displayLocation.map(dl => dl ? this.getState(dl) : undefined);
        const view = state.map(s => s ? this.getRendering(s, styles) : undefined);
        this.minEditorScrollHeight = derived(this, reader => {
            const s = state.read(reader);
            if (!s) {
                return 0;
            }
            return s.rect.read(reader).bottom + this._editor.getScrollTop();
        });
        const overlay = n.div({
            class: 'inline-edits-custom-view',
            style: {
                position: 'absolute',
                overflow: 'visible',
                top: '0px',
                left: '0px',
                display: 'block',
            },
        }, [view]).keepUpdated(this._store);
        this._register(this._editorObs.createOverlayWidget({
            domNode: overlay.element,
            position: constObservable(null),
            allowEditorOverflow: false,
            minContentWidthInPx: derivedObservableWithCache(this, (reader, prev) => {
                const s = state.read(reader);
                if (!s) {
                    return prev ?? 0;
                }
                const current = s.rect.map(rect => rect.right).read(reader)
                    + this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader)
                    + PADDING_HORIZONTALLY
                    - this._editorObs.layoutInfoContentLeft.read(reader);
                return Math.max(prev ?? 0, current); // will run into infinite loop otherwise TODO: fix this
            }).recomputeInitiallyAndOnChange(this._store),
        }));
        this._register(autorun((reader) => {
            const v = view.read(reader);
            if (!v) {
                this._isHovered.set(false, undefined);
                return;
            }
            this._isHovered.set(overlay.isHovered.read(reader), undefined);
        }));
    }
    // TODO: this is very similar to side by side `fitsInsideViewport`, try to use the same function
    fitsInsideViewport(range, displayLabel, reader) {
        const editorWidth = this._editorObs.layoutInfoWidth.read(reader);
        const editorContentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
        const editorVerticalScrollbar = this._editor.getLayoutInfo().verticalScrollbarWidth;
        const minimapWidth = this._editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? this._editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;
        const maxOriginalContent = maxContentWidthInRange(this._editorObs, range, undefined);
        const maxModifiedContent = getContentRenderWidth(displayLabel, this._editor, this._editor.getModel());
        const padding = PADDING_HORIZONTALLY + MIN_END_OF_LINE_PADDING;
        return maxOriginalContent + maxModifiedContent + padding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
    }
    getState(displayLocation) {
        const contentState = derived(this, (reader) => {
            const startLineNumber = displayLocation.range.startLineNumber;
            const endLineNumber = displayLocation.range.endLineNumber;
            const startColumn = displayLocation.range.startColumn;
            const endColumn = displayLocation.range.endColumn;
            const lineCount = this._editor.getModel()?.getLineCount() ?? 0;
            const lineWidth = maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber, startLineNumber + 1), reader);
            const lineWidthBelow = startLineNumber + 1 <= lineCount ? maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber + 1, startLineNumber + 2), reader) : undefined;
            const lineWidthAbove = startLineNumber - 1 >= 1 ? maxContentWidthInRange(this._editorObs, new LineRange(startLineNumber - 1, startLineNumber), reader) : undefined;
            const startContentLeftOffset = this._editor.getOffsetForColumn(startLineNumber, startColumn);
            const endContentLeftOffset = this._editor.getOffsetForColumn(endLineNumber, endColumn);
            return {
                lineWidth,
                lineWidthBelow,
                lineWidthAbove,
                startContentLeftOffset,
                endContentLeftOffset
            };
        });
        const startLineNumber = displayLocation.range.startLineNumber;
        const endLineNumber = displayLocation.range.endLineNumber;
        // only check viewport once in the beginning when rendering the view
        const fitsInsideViewport = this.fitsInsideViewport(new LineRange(startLineNumber, endLineNumber + 1), displayLocation.content, undefined);
        const rect = derived(this, reader => {
            const w = this._editorObs.getOption(59 /* EditorOption.fontInfo */).read(reader).typicalHalfwidthCharacterWidth;
            const { lineWidth, lineWidthBelow, lineWidthAbove, startContentLeftOffset, endContentLeftOffset } = contentState.read(reader);
            const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
            const lineHeight = this._editorObs.observeLineHeightForLine(startLineNumber).recomputeInitiallyAndOnChange(reader.store).read(reader);
            const scrollTop = this._editorObs.scrollTop.read(reader);
            const scrollLeft = this._editorObs.scrollLeft.read(reader);
            let position;
            if (startLineNumber === endLineNumber && endContentLeftOffset + 5 * w >= lineWidth && fitsInsideViewport) {
                position = 'end'; // Render at the end of the line if the range ends almost at the end of the line
            }
            else if (lineWidthBelow !== undefined && lineWidthBelow + MIN_END_OF_LINE_PADDING - HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW - PADDING_HORIZONTALLY < startContentLeftOffset) {
                position = 'below'; // Render Below if possible
            }
            else if (lineWidthAbove !== undefined && lineWidthAbove + MIN_END_OF_LINE_PADDING - HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW - PADDING_HORIZONTALLY < startContentLeftOffset) {
                position = 'above'; // Render Above if possible
            }
            else {
                position = 'end'; // Render at the end of the line otherwise
            }
            let topOfLine;
            let contentStartOffset;
            let deltaX = 0;
            let deltaY = 0;
            switch (position) {
                case 'end': {
                    topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber);
                    contentStartOffset = lineWidth;
                    deltaX = PADDING_HORIZONTALLY + MIN_END_OF_LINE_PADDING;
                    break;
                }
                case 'below': {
                    topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber + 1);
                    contentStartOffset = startContentLeftOffset;
                    deltaX = PADDING_HORIZONTALLY + HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW;
                    deltaY = PADDING_VERTICALLY + VERTICAL_OFFSET_WHEN_ABOVE_BELOW;
                    break;
                }
                case 'above': {
                    topOfLine = this._editorObs.editor.getTopForLineNumber(startLineNumber - 1);
                    contentStartOffset = startContentLeftOffset;
                    deltaX = PADDING_HORIZONTALLY + HORIZONTAL_OFFSET_WHEN_ABOVE_BELOW;
                    deltaY = -PADDING_VERTICALLY + VERTICAL_OFFSET_WHEN_ABOVE_BELOW;
                    break;
                }
            }
            const textRect = Rect.fromLeftTopWidthHeight(contentLeft + contentStartOffset - scrollLeft, topOfLine - scrollTop, w * displayLocation.content.length, lineHeight);
            return textRect.withMargin(PADDING_VERTICALLY, PADDING_HORIZONTALLY).translateX(deltaX).translateY(deltaY);
        });
        return {
            rect,
            label: displayLocation.content,
            kind: displayLocation.style
        };
    }
    getRendering(state, styles) {
        const line = document.createElement('div');
        const t = this._editor.getModel().tokenization.tokenizeLinesAt(1, [state.label])?.[0];
        let tokens;
        if (t && state.kind === InlineCompletionHintStyle.Code) {
            tokens = TokenArray.fromLineTokens(t).toLineTokens(state.label, this._languageService.languageIdCodec);
        }
        else {
            tokens = LineTokens.createEmpty(state.label, this._languageService.languageIdCodec);
        }
        const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], line, true);
        line.style.width = `${result.minWidthInPx}px`;
        const rect = state.rect.map(r => r.withMargin(0, PADDING_HORIZONTALLY));
        return n.div({
            class: 'collapsedView',
            ref: this._viewRef,
            style: {
                position: 'absolute',
                ...rectToProps(reader => rect.read(reader)),
                overflow: 'hidden',
                boxSizing: 'border-box',
                cursor: 'pointer',
                border: styles.map(s => `1px solid ${s.border}`),
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                backgroundColor: styles.map(s => s.background),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
            },
            onmousedown: e => {
                e.preventDefault(); // This prevents that the editor loses focus
            },
            onclick: (e) => { this._onDidClick.fire(InlineEditClickEvent.create(e)); }
        }, [
            line
        ]);
    }
};
InlineEditsCustomView = __decorate([
    __param(4, IThemeService),
    __param(5, ILanguageService)
], InlineEditsCustomView);
export { InlineEditsCustomView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNDdXN0b21WaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNDdXN0b21WaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBd0IsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdEssT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTNGLE9BQU8sRUFBd0Isb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxhQUFhLEVBQUUsTUFBTSwyRkFBMkYsQ0FBQztBQUVuSixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFHdkYsT0FBTyxFQUFvQixvQkFBb0IsRUFBRSxtQkFBbUIsRUFB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