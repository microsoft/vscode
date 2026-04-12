/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { applyFontInfo } from '../../../../config/domFontInfo.js';
import { EditorFontLigatures } from '../../../../../common/config/editorOptions.js';
import { Position } from '../../../../../common/core/position.js';
import { StringBuilder } from '../../../../../common/core/stringBuilder.js';
import { LineDecoration } from '../../../../../common/viewLayout/lineDecorations.js';
import { RenderLineInput, RenderLineOutput, renderViewLine } from '../../../../../common/viewLayout/viewLineRenderer.js';
import { ViewLineRenderingData } from '../../../../../common/viewModel.js';
import { getColumnOfNodeOffset } from '../../../../viewParts/viewLines/viewLine.js';
const ttPolicy = createTrustedTypesPolicy('diffEditorWidget', { createHTML: value => value });
export function renderLines(source, options, decorations, domNode, noExtra = false) {
    applyFontInfo(domNode, options.fontInfo);
    const hasCharChanges = (decorations.length > 0);
    const sb = new StringBuilder(10000);
    let maxCharsPerLine = 0;
    let renderedLineCount = 0;
    const viewLineCounts = [];
    const renderOutputs = [];
    for (let lineIndex = 0; lineIndex < source.lineTokens.length; lineIndex++) {
        const lineNumber = lineIndex + 1;
        const lineTokens = source.lineTokens[lineIndex];
        const lineBreakData = source.lineBreakData[lineIndex];
        const actualDecorations = LineDecoration.filter(decorations, lineNumber, 1, Number.MAX_SAFE_INTEGER);
        if (lineBreakData) {
            let lastBreakOffset = 0;
            for (const breakOffset of lineBreakData.breakOffsets) {
                const viewLineTokens = lineTokens.sliceAndInflate(lastBreakOffset, breakOffset, 0);
                const result = renderOriginalLine(renderedLineCount, viewLineTokens, LineDecoration.extractWrapped(actualDecorations, lastBreakOffset, breakOffset), hasCharChanges, source.mightContainNonBasicASCII, source.mightContainRTL, options, sb, noExtra);
                maxCharsPerLine = Math.max(maxCharsPerLine, result.maxCharWidth);
                renderOutputs.push(new RenderLineOutputWithOffset(result.output.characterMapping, result.output.containsForeignElements, lastBreakOffset));
                renderedLineCount++;
                lastBreakOffset = breakOffset;
            }
            viewLineCounts.push(lineBreakData.breakOffsets.length);
        }
        else {
            viewLineCounts.push(1);
            const result = renderOriginalLine(renderedLineCount, lineTokens, actualDecorations, hasCharChanges, source.mightContainNonBasicASCII, source.mightContainRTL, options, sb, noExtra);
            maxCharsPerLine = Math.max(maxCharsPerLine, result.maxCharWidth);
            renderOutputs.push(new RenderLineOutputWithOffset(result.output.characterMapping, result.output.containsForeignElements, 0));
            renderedLineCount++;
        }
    }
    maxCharsPerLine += options.scrollBeyondLastColumn;
    const html = sb.build();
    const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
    domNode.innerHTML = trustedhtml;
    const minWidthInPx = (maxCharsPerLine * options.typicalHalfwidthCharacterWidth);
    return new RenderLinesResult(renderedLineCount, minWidthInPx, viewLineCounts, renderOutputs, source);
}
export class LineSource {
    constructor(lineTokens, lineBreakData = lineTokens.map(t => null), mightContainNonBasicASCII = true, mightContainRTL = true) {
        this.lineTokens = lineTokens;
        this.lineBreakData = lineBreakData;
        this.mightContainNonBasicASCII = mightContainNonBasicASCII;
        this.mightContainRTL = mightContainRTL;
    }
}
export class RenderOptions {
    static fromEditor(editor) {
        const modifiedEditorOptions = editor.getOptions();
        const fontInfo = modifiedEditorOptions.get(59 /* EditorOption.fontInfo */);
        const layoutInfo = modifiedEditorOptions.get(165 /* EditorOption.layoutInfo */);
        return new RenderOptions(editor.getModel()?.getOptions().tabSize || 0, fontInfo, modifiedEditorOptions.get(40 /* EditorOption.disableMonospaceOptimizations */), fontInfo.typicalHalfwidthCharacterWidth, modifiedEditorOptions.get(118 /* EditorOption.scrollBeyondLastColumn */), modifiedEditorOptions.get(75 /* EditorOption.lineHeight */), layoutInfo.decorationsWidth, modifiedEditorOptions.get(133 /* EditorOption.stopRenderingLineAfter */), modifiedEditorOptions.get(113 /* EditorOption.renderWhitespace */), modifiedEditorOptions.get(108 /* EditorOption.renderControlCharacters */), modifiedEditorOptions.get(60 /* EditorOption.fontLigatures */), modifiedEditorOptions.get(117 /* EditorOption.scrollbar */).verticalScrollbarSize);
    }
    constructor(tabSize, fontInfo, disableMonospaceOptimizations, typicalHalfwidthCharacterWidth, scrollBeyondLastColumn, lineHeight, lineDecorationsWidth, stopRenderingLineAfter, renderWhitespace, renderControlCharacters, fontLigatures, verticalScrollbarSize, setWidth = true) {
        this.tabSize = tabSize;
        this.fontInfo = fontInfo;
        this.disableMonospaceOptimizations = disableMonospaceOptimizations;
        this.typicalHalfwidthCharacterWidth = typicalHalfwidthCharacterWidth;
        this.scrollBeyondLastColumn = scrollBeyondLastColumn;
        this.lineHeight = lineHeight;
        this.lineDecorationsWidth = lineDecorationsWidth;
        this.stopRenderingLineAfter = stopRenderingLineAfter;
        this.renderWhitespace = renderWhitespace;
        this.renderControlCharacters = renderControlCharacters;
        this.fontLigatures = fontLigatures;
        this.verticalScrollbarSize = verticalScrollbarSize;
        this.setWidth = setWidth;
    }
    withSetWidth(setWidth) {
        return new RenderOptions(this.tabSize, this.fontInfo, this.disableMonospaceOptimizations, this.typicalHalfwidthCharacterWidth, this.scrollBeyondLastColumn, this.lineHeight, this.lineDecorationsWidth, this.stopRenderingLineAfter, this.renderWhitespace, this.renderControlCharacters, this.fontLigatures, this.verticalScrollbarSize, setWidth);
    }
    withScrollBeyondLastColumn(scrollBeyondLastColumn) {
        return new RenderOptions(this.tabSize, this.fontInfo, this.disableMonospaceOptimizations, this.typicalHalfwidthCharacterWidth, scrollBeyondLastColumn, this.lineHeight, this.lineDecorationsWidth, this.stopRenderingLineAfter, this.renderWhitespace, this.renderControlCharacters, this.fontLigatures, this.verticalScrollbarSize, this.setWidth);
    }
}
export class RenderLinesResult {
    constructor(heightInLines, minWidthInPx, viewLineCounts, _renderOutputs, _source) {
        this.heightInLines = heightInLines;
        this.minWidthInPx = minWidthInPx;
        this.viewLineCounts = viewLineCounts;
        this._renderOutputs = _renderOutputs;
        this._source = _source;
    }
    /**
     * Returns the model position for a given DOM node and offset within that node.
     * @param domNode The span node within a view-line where the offset is located
     * @param offset The offset within the span node
     * @returns The Position in the model, or undefined if the position cannot be determined
     */
    getModelPositionAt(domNode, offset) {
        // Find the view-line element that contains this span
        let viewLineElement = domNode;
        while (viewLineElement && !viewLineElement.classList.contains('view-line')) {
            viewLineElement = viewLineElement.parentElement;
        }
        if (!viewLineElement) {
            return undefined;
        }
        // Find the container that has all view lines
        const container = viewLineElement.parentElement;
        if (!container) {
            return undefined;
        }
        // Find the view line index based on the element
        // eslint-disable-next-line no-restricted-syntax
        const viewLines = container.querySelectorAll('.view-line');
        let viewLineIndex = -1;
        for (let i = 0; i < viewLines.length; i++) {
            if (viewLines[i] === viewLineElement) {
                viewLineIndex = i;
                break;
            }
        }
        if (viewLineIndex === -1 || viewLineIndex >= this._renderOutputs.length) {
            return undefined;
        }
        // Map view line index back to model line
        let modelLineNumber = 1;
        let remainingViewLines = viewLineIndex;
        for (let i = 0; i < this.viewLineCounts.length; i++) {
            if (remainingViewLines < this.viewLineCounts[i]) {
                modelLineNumber = i + 1;
                break;
            }
            remainingViewLines -= this.viewLineCounts[i];
        }
        if (modelLineNumber > this._source.lineTokens.length) {
            return undefined;
        }
        const renderOutput = this._renderOutputs[viewLineIndex];
        if (!renderOutput) {
            return undefined;
        }
        const column = getColumnOfNodeOffset(renderOutput.characterMapping, domNode, offset) + renderOutput.offset;
        return new Position(modelLineNumber, column);
    }
}
class RenderLineOutputWithOffset extends RenderLineOutput {
    constructor(characterMapping, containsForeignElements, offset) {
        super(characterMapping, containsForeignElements);
        this.offset = offset;
    }
}
function renderOriginalLine(viewLineIdx, lineTokens, decorations, hasCharChanges, mightContainNonBasicASCII, mightContainRTL, options, sb, noExtra) {
    sb.appendString('<div class="view-line');
    if (!noExtra && !hasCharChanges) {
        // No char changes
        sb.appendString(' char-delete');
    }
    sb.appendString('" style="top:');
    sb.appendString(String(viewLineIdx * options.lineHeight));
    if (options.setWidth) {
        sb.appendString('px;width:1000000px;">');
    }
    else {
        sb.appendString('px;">');
    }
    const lineContent = lineTokens.getLineContent();
    const isBasicASCII = ViewLineRenderingData.isBasicASCII(lineContent, mightContainNonBasicASCII);
    const containsRTL = ViewLineRenderingData.containsRTL(lineContent, isBasicASCII, mightContainRTL);
    const output = renderViewLine(new RenderLineInput((options.fontInfo.isMonospace && !options.disableMonospaceOptimizations), options.fontInfo.canUseHalfwidthRightwardsArrow, lineContent, false, isBasicASCII, containsRTL, 0, lineTokens, decorations, options.tabSize, 0, options.fontInfo.spaceWidth, options.fontInfo.middotWidth, options.fontInfo.wsmiddotWidth, options.stopRenderingLineAfter, options.renderWhitespace, options.renderControlCharacters, options.fontLigatures !== EditorFontLigatures.OFF, null, // Send no selections, original line cannot be selected
    null, options.verticalScrollbarSize), sb);
    sb.appendString('</div>');
    const maxCharWidth = output.characterMapping.getHorizontalOffset(output.characterMapping.length);
    return { output, maxCharWidth };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyTGluZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9jb21wb25lbnRzL2RpZmZFZGl0b3JWaWV3Wm9uZXMvcmVuZGVyTGluZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxtQkFBbUIsRUFBbUQsTUFBTSwrQ0FBK0MsQ0FBQztBQUVySSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQXdDLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvSixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVwRixNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7QUFFOUYsTUFBTSxVQUFVLFdBQVcsQ0FBQyxNQUFrQixFQUFFLE9BQXNCLEVBQUUsV0FBK0IsRUFBRSxPQUFvQixFQUFFLE9BQU8sR0FBRyxLQUFLO0lBQzdJLGFBQWEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXpDLE1BQU0sY0FBYyxHQUFH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