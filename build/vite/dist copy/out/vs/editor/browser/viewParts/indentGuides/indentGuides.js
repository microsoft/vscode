/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './indentGuides.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { editorBracketHighlightingForeground1, editorBracketHighlightingForeground2, editorBracketHighlightingForeground3, editorBracketHighlightingForeground4, editorBracketHighlightingForeground5, editorBracketHighlightingForeground6, editorBracketPairGuideActiveBackground1, editorBracketPairGuideActiveBackground2, editorBracketPairGuideActiveBackground3, editorBracketPairGuideActiveBackground4, editorBracketPairGuideActiveBackground5, editorBracketPairGuideActiveBackground6, editorBracketPairGuideBackground1, editorBracketPairGuideBackground2, editorBracketPairGuideBackground3, editorBracketPairGuideBackground4, editorBracketPairGuideBackground5, editorBracketPairGuideBackground6, editorIndentGuide1, editorIndentGuide2, editorIndentGuide3, editorIndentGuide4, editorIndentGuide5, editorIndentGuide6, editorActiveIndentGuide1, editorActiveIndentGuide2, editorActiveIndentGuide3, editorActiveIndentGuide4, editorActiveIndentGuide5, editorActiveIndentGuide6 } from '../../../common/core/editorColorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { Position } from '../../../common/core/position.js';
import { ArrayQueue } from '../../../../base/common/arrays.js';
import { isDefined } from '../../../../base/common/types.js';
import { BracketPairGuidesClassNames } from '../../../common/model/guidesTextModelPart.js';
import { IndentGuide, HorizontalGuidesState } from '../../../common/textModelGuides.js';
/**
 * Indent guides are vertical lines that help identify the indentation level of
 * the code.
 */
export class IndentGuidesOverlay extends DynamicViewOverlay {
    constructor(context) {
        super();
        this._context = context;
        this._primaryPosition = null;
        const options = this._context.configuration.options;
        const wrappingInfo = options.get(166 /* EditorOption.wrappingInfo */);
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        this._spaceWidth = fontInfo.spaceWidth;
        this._maxIndentLeft = wrappingInfo.wrappingColumn === -1 ? -1 : (wrappingInfo.wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
        this._bracketPairGuideOptions = options.get(22 /* EditorOption.guides */);
        this._renderResult = null;
        this._context.addEventHandler(this);
    }
    dispose() {
        this._context.removeEventHandler(this);
        this._renderResult = null;
        super.dispose();
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        const wrappingInfo = options.get(166 /* EditorOption.wrappingInfo */);
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        this._spaceWidth = fontInfo.spaceWidth;
        this._maxIndentLeft = wrappingInfo.wrappingColumn === -1 ? -1 : (wrappingInfo.wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
        this._bracketPairGuideOptions = options.get(22 /* EditorOption.guides */);
        return true;
    }
    onCursorStateChanged(e) {
        const selection = e.selections[0];
        const newPosition = selection.getPosition();
        if (!this._primaryPosition?.equals(newPosition)) {
            this._primaryPosition = newPosition;
            return true;
        }
        return false;
    }
    onDecorationsChanged(e) {
        // true for inline decorations
        return true;
    }
    onFlushed(e) {
        return true;
    }
    onLinesChanged(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onScrollChanged(e) {
        return e.scrollTopChanged; // || e.scrollWidthChanged;
    }
    onZonesChanged(e) {
        return true;
    }
    onLanguageConfigurationChanged(e) {
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        if (!this._bracketPairGuideOptions.indentation && this._bracketPairGuideOptions.bracketPairs === false) {
            this._renderResult = null;
            return;
        }
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
        const scrollWidth = ctx.scrollWidth;
        const activeCursorPosition = this._primaryPosition;
        const indents = this.getGuidesByLine(visibleStartLineNumber, Math.min(visibleEndLineNumber + 1, this._context.viewModel.getLineCount()), activeCursorPosition);
        const output = [];
        for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
            const lineIndex = lineNumber - visibleStartLineNumber;
            const indent = indents[lineIndex];
            let result = '';
            const leftOffset = ctx.visibleRangeForPosition(new Position(lineNumber, 1))?.left ?? 0;
            for (const guide of indent) {
                const left = guide.column === -1
                    ? leftOffset + (guide.visibleColumn - 1) * this._spaceWidth
                    : ctx.visibleRangeForPosition(new Position(lineNumber, guide.column)).left;
                if (left > scrollWidth || (this._maxIndentLeft > 0 && left > this._maxIndentLeft)) {
                    break;
                }
                const className = guide.horizontalLine ? (guide.horizontalLine.top ? 'horizontal-top' : 'horizontal-bottom') : 'vertical';
                const width = guide.horizontalLine
                    ? (ctx.visibleRangeForPosition(new Position(lineNumber, guide.horizontalLine.endColumn))?.left ?? (left + this._spaceWidth)) - left
                    : this._spaceWidth;
                result += `<div class="core-guide ${guide.className} ${className}" style="left:${left}px;width:${width}px"></div>`;
            }
            output[lineIndex] = result;
        }
        this._renderResult = output;
    }
    getGuidesByLine(visibleStartLineNumber, visibleEndLineNumber, activeCursorPosition) {
        const bracketGuides = this._bracketPairGuideOptions.bracketPairs !== false
            ? this._context.viewModel.getBracketGuidesInRangeByLine(visibleStartLineNumber, visibleEndLineNumber, activeCursorPosition, {
                highlightActive: this._bracketPairGuideOptions.highlightActiveBracketPair,
                horizontalGuides: this._bracketPairGuideOptions.bracketPairsHorizontal === true
                    ? HorizontalGuidesState.Enabled
                    : this._bracketPairGuideOptions.bracketPairsHorizontal === 'active'
                        ? HorizontalGuidesState.EnabledForActive
                        : HorizontalGuidesState.Disabled,
                includeInactive: this._bracketPairGuideOptions.bracketPairs === true,
            })
            : null;
        const indentGuides = this._bracketPairGuideOptions.indentation
            ? this._context.viewModel.getLinesIndentGuides(visibleStartLineNumber, visibleEndLineNumber)
            : null;
        let activeIndentStartLineNumber = 0;
        let activeIndentEndLineNumber = 0;
        let activeIndentLevel = 0;
        if (this._bracketPairGuideOptions.highlightActiveIndentation !== false && activeCursorPosition) {
            const activeIndentInfo = this._context.viewModel.getActiveIndentGuide(activeCursorPosition.lineNumber, visibleStartLineNumber, visibleEndLineNumber);
            activeIndentStartLineNumber = activeIndentInfo.startLineNumber;
            activeIndentEndLineNumber = activeIndentInfo.endLineNumber;
            activeIndentLevel = activeIndentInfo.indent;
        }
        const { indentSize } = this._context.viewModel.model.getOptions();
        const result = [];
        for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
            const lineGuides = new Array();
            result.push(lineGuides);
            const bracketGuidesInLine = bracketGuides ? bracketGuides[lineNumber - visibleStartLineNumber] : [];
            const bracketGuidesInLineQueue = new ArrayQueue(bracketGuidesInLine);
            const indentGuidesInLine = indentGuides ? indentGuides[lineNumber - visibleStartLineNumber] : 0;
            for (let indentLvl = 1; indentLvl <= indentGuidesInLine; indentLvl++) {
                const indentGuide = (indentLvl - 1) * indentSize + 1;
                const isActive = 
                // Disable active indent guide if there are bracket guides.
                (this._bracketPairGuideOptions.highlightActiveIndentation === 'always' || bracketGuidesInLine.length === 0) &&
                    activeIndentStartLineNumber <= lineNumber &&
                    lineNumber <= activeIndentEndLineNumber &&
                    indentLvl === activeIndentLevel;
                lineGuides.push(...bracketGuidesInLineQueue.takeWhile(g => g.visibleColumn < indentGuide) || []);
                const peeked = bracketGuidesInLineQueue.peek();
                if (!peeked || peeked.visibleColumn !== indentGuide || peeked.horizontalLine) {
                    lineGuides.push(new IndentGuide(indentGuide, -1, `core-guide-indent lvl-${(indentLvl - 1) % 30}` + (isActive ? ' indent-active' : ''), null, -1, -1));
                }
            }
            lineGuides.push(...bracketGuidesInLineQueue.takeWhile(g => true) || []);
        }
        return result;
    }
    render(startLineNumber, lineNumber) {
        if (!this._renderResult) {
            return '';
        }
        const lineIndex = lineNumber - startLineNumber;
        if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
            return '';
        }
        return this._renderResult[lineIndex];
    }
}
function transparentToUndefined(color) {
    if (color && color.isTransparent()) {
        return undefined;
    }
    return color;
}
registerThemingParticipant((theme, collector) => {
    const colors = [
        { bracketColor: editorBracketHighlightingForeground1, guideColor: editorBracketPairGuideBackground1, guideColorActive: editorBracketPairGuideActiveBackground1 },
        { bracketColor: editorBracketHighlightingForeground2, guideColor: editorBracketPairGuideBackground2, guideColorActive: editorBracketPairGuideActiveBackground2 },
        { bracketColor: editorBracketHighlightingForeground3, guideColor: editorBracketPairGuideBackground3, guideColorActive: editorBracketPairGuideActiveBackground3 },
        { bracketColor: editorBracketHighlightingForeground4, guideColor: editorBracketPairGuideBackground4, guideColorActive: editorBracketPairGuideActiveBackground4 },
        { bracketColor: editorBracketHighlightingForeground5, guideColor: editorBracketPairGuideBackground5, guideColorActive: editorBracketPairGuideActiveBackground5 },
        { bracketColor: editorBracketHighlightingForeground6, guideColor: editorBracketPairGuideBackground6, guideColorActive: editorBracketPairGuideActiveBackground6 }
    ];
    const colorProvider = new BracketPairGuidesClassNames();
    const indentColors = [
        { indentColor: editorIndentGuide1, indentColorActive: editorActiveIndentGuide1 },
        { indentColor: editorIndentGuide2, indentColorActive: editorActiveIndentGuide2 },
        { indentColor: editorIndentGuide3, indentColorActive: editorActiveIndentGuide3 },
        { indentColor: editorIndentGuide4, indentColorActive: editorActiveIndentGuide4 },
        { indentColor: editorIndentGuide5, indentColorActive: editorActiveIndentGuide5 },
        { indentColor: editorIndentGuide6, indentColorActive: editorActiveIndentGuide6 },
    ];
    const colorValues = colors
        .map(c => {
        const bracketColor = theme.getColor(c.bracketColor);
        const guideColor = theme.getColor(c.guideColor);
        const guideColorActive = theme.getColor(c.guideColorActive);
        const effectiveGuideColor = transparentToUndefined(transparentToUndefined(guideColor) ?? bracketColor?.transparent(0.3));
        const effectiveGuideColorActive = transparentToUndefined(transparentToUndefined(guideColorActive) ?? bracketColor);
        if (!effectiveGuideColor || !effectiveGuideColorActive) {
            return undefined;
        }
        return {
            guideColor: effectiveGuideColor,
            guideColorActive: effectiveGuideColorActive,
        };
    })
        .filter(isDefined);
    const indentColorValues = indentColors
        .map(c => {
        const indentColor = theme.getColor(c.indentColor);
        const indentColorActive = theme.getColor(c.indentColorActive);
        const effectiveIndentColor = transparentToUndefined(indentColor);
        const effectiveIndentColorActive = transparentToUndefined(indentColorActive);
        if (!effectiveIndentColor || !effectiveIndentColorActive) {
            return undefined;
        }
        return {
            indentColor: effectiveIndentColor,
            indentColorActive: effectiveIndentColorActive,
        };
    })
        .filter(isDefined);
    if (colorValues.length > 0) {
        for (let level = 0; level < 30; level++) {
            const colors = colorValues[level % colorValues.length];
            collector.addRule(`.monaco-editor .${colorProvider.getInlineClassNameOfLevel(level).replace(/ /g, '.')} { --guide-color: ${colors.guideColor}; --guide-color-active: ${colors.guideColorActive}; }`);
        }
        collector.addRule(`.monaco-editor .vertical { box-shadow: 1px 0 0 0 var(--guide-color) inset; }`);
        collector.addRule(`.monaco-editor .horizontal-top { border-top: 1px solid var(--guide-color); }`);
        collector.addRule(`.monaco-editor .horizontal-bottom { border-bottom: 1px solid var(--guide-color); }`);
        collector.addRule(`.monaco-editor .vertical.${colorProvider.activeClassName} { box-shadow: 1px 0 0 0 var(--guide-color-active) inset; }`);
        collector.addRule(`.monaco-editor .horizontal-top.${colorProvider.activeClassName} { border-top: 1px solid var(--guide-color-active); }`);
        collector.addRule(`.monaco-editor .horizontal-bottom.${colorProvider.activeClassName} { border-bottom: 1px solid var(--guide-color-active); }`);
    }
    if (indentColorValues.length > 0) {
        for (let level = 0; level < 30; level++) {
            const colors = indentColorValues[level % indentColorValues.length];
            collector.addRule(`.monaco-editor .lines-content .core-guide-indent.lvl-${level} { --indent-color: ${colors.indentColor}; --indent-color-active: ${colors.indentColorActive}; }`);
        }
        collector.addRule(`.monaco-editor .lines-content .core-guide-indent { box-shadow: 1px 0 0 0 var(--indent-color) inset; }`);
        collector.addRule(`.monaco-editor .lines-content .core-guide-indent.indent-active { box-shadow: 1px 0 0 0 var(--indent-color-active) inset; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50R3VpZGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL2luZGVudEd1aWRlcy9pbmRlbnRHdWlkZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLEVBQUUsb0NBQW9DLEVBQUUsdUNBQXVDLEVBQUUsdUNBQXVDLEVBQUUsdUNBQXVDLEVBQUUsdUNBQXVDLEVBQUUsdUNBQXVDLEVBQUUsdUNBQXVDLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUk3L0IsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFL0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLFdB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