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
import { addDisposableListener, getActiveWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorFontLigatures } from '../../../../common/config/editorOptions.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { StringBuilder } from '../../../../common/core/stringBuilder.js';
import { LineDecoration } from '../../../../common/viewLayout/lineDecorations.js';
import { RenderLineInput, renderViewLine } from '../../../../common/viewLayout/viewLineRenderer.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IME } from '../../../../../base/common/ime.js';
import { getColumnOfNodeOffset } from '../../../viewParts/viewLines/viewLine.js';
const ttPolicy = createTrustedTypesPolicy('richScreenReaderContent', { createHTML: value => value });
const LINE_NUMBER_ATTRIBUTE = 'data-line-number';
let RichScreenReaderContent = class RichScreenReaderContent extends Disposable {
    constructor(_domNode, _context, _viewController, _accessibilityService) {
        super();
        this._domNode = _domNode;
        this._context = _context;
        this._viewController = _viewController;
        this._accessibilityService = _accessibilityService;
        this._selectionChangeListener = this._register(new MutableDisposable());
        this._accessibilityPageSize = 1;
        this._ignoreSelectionChangeTime = 0;
        this._state = RichScreenReaderState.NULL;
        this._strategy = new RichPagedScreenReaderStrategy();
        this._renderedLines = new Map();
        this._renderedSelection = new Selection(1, 1, 1, 1);
        this.onConfigurationChanged(this._context.configuration.options);
    }
    updateScreenReaderContent(primarySelection) {
        const focusedElement = getActiveWindow().document.activeElement;
        if (!focusedElement || focusedElement !== this._domNode.domNode) {
            return;
        }
        const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
        if (isScreenReaderOptimized) {
            const state = this._getScreenReaderContentLineIntervals(primarySelection);
            if (!this._state.equals(state)) {
                this._state = state;
                this._renderedLines = this._renderScreenReaderContent(state);
            }
            if (!this._renderedSelection.equalsSelection(primarySelection)) {
                this._renderedSelection = primarySelection;
                this._setSelectionOnScreenReaderContent(this._context, this._renderedLines, primarySelection);
            }
        }
        else {
            this._state = RichScreenReaderState.NULL;
            this._setIgnoreSelectionChangeTime('setValue');
            this._domNode.domNode.textContent = '';
        }
    }
    updateScrollTop(primarySelection) {
        const intervals = this._state.intervals;
        if (!intervals.length) {
            return;
        }
        const viewLayout = this._context.viewModel.viewLayout;
        const stateStartLineNumber = intervals[0].startLine;
        const verticalOffsetOfStateStartLineNumber = viewLayout.getVerticalOffsetForLineNumber(stateStartLineNumber);
        const verticalOffsetOfPositionLineNumber = viewLayout.getVerticalOffsetForLineNumber(primarySelection.positionLineNumber);
        this._domNode.domNode.scrollTop = verticalOffsetOfPositionLineNumber - verticalOffsetOfStateStartLineNumber;
    }
    onFocusChange(newFocusValue) {
        if (newFocusValue) {
            this._selectionChangeListener.value = this._setSelectionChangeListener();
        }
        else {
            this._selectionChangeListener.value = undefined;
        }
    }
    onConfigurationChanged(options) {
        this._accessibilityPageSize = options.get(3 /* EditorOption.accessibilityPageSize */);
    }
    onWillCut() {
        this._setIgnoreSelectionChangeTime('onCut');
    }
    onWillPaste() {
        this._setIgnoreSelectionChangeTime('onWillPaste');
    }
    // --- private methods
    _setIgnoreSelectionChangeTime(reason) {
        this._ignoreSelectionChangeTime = Date.now();
    }
    _setSelectionChangeListener() {
        // See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
        // When using a Braille display or NVDA for example, it is possible for users to reposition the
        // system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.
        // `selectionchange` events often come multiple times for a single logical change
        // so throttle multiple `selectionchange` events that burst in a short period of time.
        let previousSelectionChangeEventTime = 0;
        return addDisposableListener(this._domNode.domNode.ownerDocument, 'selectionchange', () => {
            const activeElement = getActiveWindow().document.activeElement;
            const isFocused = activeElement === this._domNode.domNode;
            if (!isFocused) {
                return;
            }
            const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
            if (!isScreenReaderOptimized || !IME.enabled) {
                return;
            }
            const now = Date.now();
            const delta1 = now - previousSelectionChangeEventTime;
            previousSelectionChangeEventTime = now;
            if (delta1 < 5) {
                // received another `selectionchange` event within 5ms of the previous `selectionchange` event
                // => ignore it
                return;
            }
            const delta2 = now - this._ignoreSelectionChangeTime;
            this._ignoreSelectionChangeTime = 0;
            if (delta2 < 100) {
                // received a `selectionchange` event within 100ms since we touched the hidden div
                // => ignore it, since we caused it
                return;
            }
            const selection = this._getEditorSelectionFromDomRange();
            if (!selection) {
                return;
            }
            this._viewController.setSelection(selection);
        });
    }
    _renderScreenReaderContent(state) {
        const nodes = [];
        const renderedLines = new Map();
        for (const interval of state.intervals) {
            for (let lineNumber = interval.startLine; lineNumber <= interval.endLine; lineNumber++) {
                const renderedLine = this._renderLine(lineNumber);
                renderedLines.set(lineNumber, renderedLine);
                nodes.push(renderedLine.domNode);
            }
        }
        this._setIgnoreSelectionChangeTime('setValue');
        this._domNode.domNode.replaceChildren(...nodes);
        return renderedLines;
    }
    _renderLine(viewLineNumber) {
        const viewModel = this._context.viewModel;
        const positionLineData = viewModel.getViewLineRenderingData(viewLineNumber);
        const options = this._context.configuration.options;
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        const stopRenderingLineAfter = options.get(133 /* EditorOption.stopRenderingLineAfter */);
        const renderControlCharacters = options.get(108 /* EditorOption.renderControlCharacters */);
        const fontLigatures = options.get(60 /* EditorOption.fontLigatures */);
        const disableMonospaceOptimizations = options.get(40 /* EditorOption.disableMonospaceOptimizations */);
        const lineDecorations = LineDecoration.filter(positionLineData.inlineDecorations, viewLineNumber, positionLineData.minColumn, positionLineData.maxColumn);
        const useMonospaceOptimizations = fontInfo.isMonospace && !disableMonospaceOptimizations;
        const useFontLigatures = fontLigatures !== EditorFontLigatures.OFF;
        let renderWhitespace;
        const experimentalWhitespaceRendering = options.get(47 /* EditorOption.experimentalWhitespaceRendering */);
        if (experimentalWhitespaceRendering === 'off') {
            renderWhitespace = options.get(113 /* EditorOption.renderWhitespace */);
        }
        else {
            renderWhitespace = 'none';
        }
        const renderLineInput = new RenderLineInput(useMonospaceOptimizations, fontInfo.canUseHalfwidthRightwardsArrow, positionLineData.content, positionLineData.continuesWithWrappedLine, positionLineData.isBasicASCII, positionLineData.containsRTL, positionLineData.minColumn - 1, positionLineData.tokens, lineDecorations, positionLineData.tabSize, positionLineData.startVisibleColumn, fontInfo.spaceWidth, fontInfo.middotWidth, fontInfo.wsmiddotWidth, stopRenderingLineAfter, renderWhitespace, renderControlCharacters, useFontLigatures, null, null, 0, true);
        const htmlBuilder = new StringBuilder(10000);
        const renderOutput = renderViewLine(renderLineInput, htmlBuilder);
        const html = htmlBuilder.build();
        const trustedhtml = ttPolicy?.createHTML(html) ?? html;
        const lineHeight = viewModel.viewLayout.getLineHeightForLineNumber(viewLineNumber) + 'px';
        const domNode = document.createElement('div');
        domNode.innerHTML = trustedhtml;
        domNode.style.lineHeight = lineHeight;
        domNode.style.height = lineHeight;
        domNode.setAttribute(LINE_NUMBER_ATTRIBUTE, viewLineNumber.toString());
        return new RichRenderedScreenReaderLine(domNode, renderOutput.characterMapping);
    }
    _setSelectionOnScreenReaderContent(context, renderedLines, viewSelection) {
        const activeDocument = getActiveWindow().document;
        const activeDocumentSelection = activeDocument.getSelection();
        if (!activeDocumentSelection) {
            return;
        }
        const startLineNumber = viewSelection.startLineNumber;
        const endLineNumber = viewSelection.endLineNumber;
        const startRenderedLine = renderedLines.get(startLineNumber);
        const endRenderedLine = renderedLines.get(endLineNumber);
        if (!startRenderedLine || !endRenderedLine) {
            return;
        }
        const viewModel = context.viewModel;
        const model = viewModel.model;
        const coordinatesConverter = viewModel.coordinatesConverter;
        const startRange = new Range(startLineNumber, 1, startLineNumber, viewSelection.selectionStartColumn);
        const modelStartRange = coordinatesConverter.convertViewRangeToModelRange(startRange);
        const characterCountForStart = model.getCharacterCountInRange(modelStartRange);
        const endRange = new Range(endLineNumber, 1, endLineNumber, viewSelection.positionColumn);
        const modelEndRange = coordinatesConverter.convertViewRangeToModelRange(endRange);
        const characterCountForEnd = model.getCharacterCountInRange(modelEndRange);
        const startDomPosition = startRenderedLine.characterMapping.getDomPosition(characterCountForStart);
        const endDomPosition = endRenderedLine.characterMapping.getDomPosition(characterCountForEnd);
        const startDomNode = startRenderedLine.domNode.firstChild;
        const endDomNode = endRenderedLine.domNode.firstChild;
        const startChildren = startDomNode.childNodes;
        const endChildren = endDomNode.childNodes;
        const startNode = startChildren.item(startDomPosition.partIndex);
        const endNode = endChildren.item(endDomPosition.partIndex);
        if (!startNode.firstChild || !endNode.firstChild) {
            return;
        }
        this._setIgnoreSelectionChangeTime('setRange');
        activeDocumentSelection.setBaseAndExtent(startNode.firstChild, viewSelection.startColumn === 1 ? 0 : startDomPosition.charIndex + 1, endNode.firstChild, viewSelection.endColumn === 1 ? 0 : endDomPosition.charIndex + 1);
    }
    _getScreenReaderContentLineIntervals(primarySelection) {
        return this._strategy.fromEditorSelection(this._context.viewModel, primarySelection, this._accessibilityPageSize);
    }
    _getEditorSelectionFromDomRange() {
        if (!this._renderedLines) {
            return;
        }
        const selection = getActiveWindow().document.getSelection();
        if (!selection) {
            return;
        }
        const rangeCount = selection.rangeCount;
        if (rangeCount === 0) {
            return;
        }
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        const startSpanElement = startContainer.parentElement;
        const endSpanElement = endContainer.parentElement;
        if (!startSpanElement || !isHTMLElement(startSpanElement) || !endSpanElement || !isHTMLElement(endSpanElement)) {
            return;
        }
        const startLineDomNode = startSpanElement.parentElement?.parentElement;
        const endLineDomNode = endSpanElement.parentElement?.parentElement;
        if (!startLineDomNode || !endLineDomNode) {
            return;
        }
        const startLineNumberAttribute = startLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE);
        const endLineNumberAttribute = endLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE);
        if (!startLineNumberAttribute || !endLineNumberAttribute) {
            return;
        }
        const startLineNumber = parseInt(startLineNumberAttribute);
        const endLineNumber = parseInt(endLineNumberAttribute);
        const startMapping = this._renderedLines.get(startLineNumber)?.characterMapping;
        const endMapping = this._renderedLines.get(endLineNumber)?.characterMapping;
        if (!startMapping || !endMapping) {
            return;
        }
        const startColumn = getColumnOfNodeOffset(startMapping, startSpanElement, range.startOffset);
        const endColumn = getColumnOfNodeOffset(endMapping, endSpanElement, range.endOffset);
        if (selection.direction === 'forward') {
            return new Selection(startLineNumber, startColumn, endLineNumber, endColumn);
        }
        else {
            return new Selection(endLineNumber, endColumn, startLineNumber, startColumn);
        }
    }
};
RichScreenReaderContent = __decorate([
    __param(3, IAccessibilityService)
], RichScreenReaderContent);
export { RichScreenReaderContent };
class RichRenderedScreenReaderLine {
    constructor(domNode, characterMapping) {
        this.domNode = domNode;
        this.characterMapping = characterMapping;
    }
}
class LineInterval {
    constructor(startLine, endLine) {
        this.startLine = startLine;
        this.endLine = endLine;
    }
}
class RichScreenReaderState {
    constructor(model, intervals) {
        this.intervals = intervals;
        let value = '';
        for (const interval of intervals) {
            for (let lineNumber = interval.startLine; lineNumber <= interval.endLine; lineNumber++) {
                value += model.getLineContent(lineNumber) + '\n';
            }
        }
        this.value = value;
    }
    equals(other) {
        return this.value === other.value;
    }
    static get NULL() {
        const nullModel = {
            getLineContent: () => '',
            getLineCount: () => 1,
            getLineMaxColumn: () => 1,
            getValueInRange: () => '',
            getValueLengthInRange: () => 0,
            modifyPosition: (position, offset) => position
        };
        return new RichScreenReaderState(nullModel, []);
    }
}
class RichPagedScreenReaderStrategy {
    constructor() { }
    _getPageOfLine(lineNumber, linesPerPage) {
        return Math.floor((lineNumber - 1) / linesPerPage);
    }
    _getRangeForPage(context, page, linesPerPage) {
        const offset = page * linesPerPage;
        const startLineNumber = offset + 1;
        const endLineNumber = Math.min(offset + linesPerPage, context.getLineCount());
        return new LineInterval(startLineNumber, endLineNumber);
    }
    fromEditorSelection(context, viewSelection, linesPerPage) {
        const selectionStartPage = this._getPageOfLine(viewSelection.startLineNumber, linesPerPage);
        const selectionStartPageRange = this._getRangeForPage(context, selectionStartPage, linesPerPage);
        const selectionEndPage = this._getPageOfLine(viewSelection.endLineNumber, linesPerPage);
        const selectionEndPageRange = this._getRangeForPage(context, selectionEndPage, linesPerPage);
        const lineIntervals = [{ startLine: selectionStartPageRange.startLine, endLine: selectionStartPageRange.endLine }];
        if (selectionStartPage + 1 < selectionEndPage) {
            lineIntervals.push({ startLine: selectionEndPageRange.startLine, endLine: selectionEndPageRange.endLine });
        }
        return new RichScreenReaderState(context, lineIntervals);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyZWVuUmVhZGVyQ29udGVudFJpY2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L25hdGl2ZS9zY3JlZW5SZWFkZXJDb250ZW50UmljaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTNHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBMkUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxSixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFvQixlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFJdEgsT0FBTyxFQUFFLFVBQVUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUd4RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVqRixNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxD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