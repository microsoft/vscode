/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorFontLigatures, EditorOption, FindComputedEditorOptionValueById, IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { StringBuilder } from '../../../../common/core/stringBuilder.js';
import { EndOfLinePreference } from '../../../../common/model.js';
import { LineDecoration } from '../../../../common/viewLayout/lineDecorations.js';
import { CharacterMapping, RenderLineInput, renderViewLine } from '../../../../common/viewLayout/viewLineRenderer.js';
import { ViewContext } from '../../../../common/viewModel/viewContext.js';
import { IPagedScreenReaderStrategy, ISimpleModel } from '../screenReaderUtils.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IME } from '../../../../../base/common/ime.js';
import { ViewController } from '../../../view/viewController.js';
import { IScreenReaderContent } from './screenReaderUtils.js';
import { getColumnOfNodeOffset } from '../../../viewParts/viewLines/viewLine.js';

const ttPolicy = createTrustedTypesPolicy('screenReaderSupport', { createHTML: value => value });

const LINE_NUMBER_ATTRIBUTE_NAME = 'data-line-number';

class RenderedScreenReaderLine {
	constructor(
		public readonly domNode: HTMLDivElement,
		public readonly characterMapping: CharacterMapping
	) { }
}

export class ComplexScreenReaderContent extends Disposable implements IScreenReaderContent {

	private readonly _selectionChangeListener = this._register(new MutableDisposable());

	private _accessibilityPageSize: number = 1;
	private _strategy: ComplexPagedScreenReaderStrategy = new ComplexPagedScreenReaderStrategy();
	private _contentLineIntervals: LineInterval[] = [];
	private _renderedLines: Map<number, RenderedScreenReaderLine> | undefined;
	private _renderedSelection: Selection = new Selection(1, 1, 1, 1);
	private _ignoreSelectionChangeTime: number = 0;

	constructor(
		private readonly _domNode: FastDomNode<HTMLElement>,
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
	}

	public setScreenReaderContent(primarySelection: Selection): void {
		const focusedElement = getActiveWindow().document.activeElement;
		if (!focusedElement || focusedElement !== this._domNode.domNode) {
			return;
		}
		const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
		if (isScreenReaderOptimized) {
			this._contentLineIntervals = this._getScreenReaderContentLineIntervals(primarySelection);
			this._renderedLines = this._renderScreenReaderContent(this._contentLineIntervals);
			if (this._renderedSelection.equalsSelection(primarySelection)) {
				return;
			}
			this._renderedSelection = primarySelection;
			this._setSelectionOfScreenReaderContent(this._context, this._renderedLines, this._renderedSelection);
		} else {
			this._contentLineIntervals = [];
			this._setIgnoreSelectionChangeTime('setValue');
			this._domNode.domNode.textContent = '';
		}
	}

	public onFocusChange(newFocusValue: boolean): void {
		if (newFocusValue) {
			this._selectionChangeListener.value = this._setSelectionChangeListener();
		} else {
			this._selectionChangeListener.value = undefined;
		}
	}

	public onConfigurationChanged(options: IComputedEditorOptions): void {
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	public onWillCut(): void {
		this._setIgnoreSelectionChangeTime('onCut');
	}

	public onWillPaste(): void {
		this._setIgnoreSelectionChangeTime('onWillPaste');
	}

	// --- private methods

	private _getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	private _setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	private _resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
	}

	private _setSelectionChangeListener(): IDisposable {
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
			const delta2 = now - this._getIgnoreSelectionChangeTime();
			this._resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the hidden div
				// => ignore it, since we caused it
				return;
			}
			const selection = this._getEditorSelectionFromScreenReaderRange();
			if (!selection) {
				return;
			}
			this._viewController.setSelection(selection);
		});
	}

	private _renderScreenReaderContent(contentState: LineInterval[]): Map<number, RenderedScreenReaderLine> {
		const renderedLines = new Map<number, RenderedScreenReaderLine>();
		const nodes: HTMLDivElement[] = [];
		for (const interval of contentState) {
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

	private _renderLine(viewLineNumber: number): RenderedScreenReaderLine {
		const viewModel = this._context.viewModel;
		const positionLineData = viewModel.getViewLineRenderingData(viewLineNumber);
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		const renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		const fontLigatures = options.get(EditorOption.fontLigatures);
		const disableMonospaceOptimizations = options.get(EditorOption.disableMonospaceOptimizations);
		const lineDecorations = LineDecoration.filter(positionLineData.inlineDecorations, viewLineNumber, positionLineData.minColumn, positionLineData.maxColumn);
		const useMonospaceOptimizations = fontInfo.isMonospace && !disableMonospaceOptimizations;
		const useFontLigatures = fontLigatures !== EditorFontLigatures.OFF;
		let renderWhitespace: FindComputedEditorOptionValueById<EditorOption.renderWhitespace>;
		const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		if (experimentalWhitespaceRendering === 'off') {
			renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			renderWhitespace = 'none';
		}
		const renderLineInput = new RenderLineInput(
			useMonospaceOptimizations,
			fontInfo.canUseHalfwidthRightwardsArrow,
			positionLineData.content,
			positionLineData.continuesWithWrappedLine,
			positionLineData.isBasicASCII,
			positionLineData.containsRTL,
			positionLineData.minColumn - 1,
			positionLineData.tokens,
			lineDecorations,
			positionLineData.tabSize,
			positionLineData.startVisibleColumn,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopRenderingLineAfter,
			renderWhitespace,
			renderControlCharacters,
			useFontLigatures,
			null,
			true
		);
		const stringBuilder = new StringBuilder(10000);
		const renderOutput = renderViewLine(renderLineInput, stringBuilder);
		const html = stringBuilder.build();
		const trustedhtml = ttPolicy?.createHTML(html) ?? html;
		const domNode = document.createElement('div');
		const lineHeight = this._context.viewModel.viewLayout.getLineHeightForLineNumber(viewLineNumber) + 'px';
		domNode.style.lineHeight = lineHeight;
		domNode.style.height = lineHeight;
		domNode.innerHTML = trustedhtml as string;
		domNode.setAttribute(LINE_NUMBER_ATTRIBUTE_NAME, viewLineNumber.toString());
		return new RenderedScreenReaderLine(domNode, renderOutput.characterMapping);
	}

	private _setSelectionOfScreenReaderContent(context: ViewContext, renderedLines: Map<number, RenderedScreenReaderLine>, viewSelection: Selection): void {
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
		const range = new globalThis.Range();
		const viewModel = context.viewModel;
		const model = viewModel.model;
		const startRange = new Range(startLineNumber, 1, startLineNumber, viewSelection.startColumn);
		const modelStartRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(startRange);
		const characterCountForStart = model.getCharacterCountInRange(modelStartRange);
		const endRange = new Range(endLineNumber, 1, endLineNumber, viewSelection.endColumn);
		const modelEndRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(endRange);
		const characterCountForEnd = model.getCharacterCountInRange(modelEndRange);
		const startDomPosition = startRenderedLine.characterMapping.getDomPosition(characterCountForStart);
		const endDomPosition = endRenderedLine.characterMapping.getDomPosition(characterCountForEnd);
		const startDomNode = startRenderedLine.domNode.firstChild!;
		const endDomNode = endRenderedLine.domNode.firstChild!;
		const startChildren = startDomNode.childNodes;
		const endChildren = endDomNode.childNodes;
		const startNode = startChildren.item(startDomPosition.partIndex);
		const endNode = endChildren.item(endDomPosition.partIndex);
		if (!startNode.firstChild || !endNode.firstChild) {
			return;
		}
		range.setStart(startNode.firstChild, viewSelection.startColumn === 1 ? 0 : startDomPosition.charIndex + 1);
		range.setEnd(endNode.firstChild, viewSelection.endColumn === 1 ? 0 : endDomPosition.charIndex + 1);
		this._setIgnoreSelectionChangeTime('setRange');
		activeDocumentSelection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
	}

	private _getScreenReaderContentLineIntervals(primarySelection: Selection): LineInterval[] {
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};
		return this._strategy.fromEditorSelection(simpleModel, primarySelection, this._accessibilityPageSize);
	}


	private _getEditorSelectionFromScreenReaderRange(): Selection | undefined {
		if (!this._renderedLines) {
			return;
		}
		const activeDocument = getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (!activeDocumentSelection) {
			return;
		}
		const rangeCount = activeDocumentSelection.rangeCount;
		if (rangeCount === 0) {
			return;
		}
		const range = activeDocumentSelection.getRangeAt(0);
		const startContainer = range.startContainer;
		const endContainer = range.endContainer;
		if (!isHTMLElement(startContainer) || !isHTMLElement(endContainer)) {
			return;
		}
		const startLineDomNode = startContainer.parentElement?.parentElement;
		const endLineDomNode = endContainer.parentElement?.parentElement;
		if (!startLineDomNode || !endLineDomNode) {
			return;
		}
		const startLineNumberAttribute = startLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE_NAME);
		const endLineNumberAttribute = endLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE_NAME);
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
		const startColumn = getColumnOfNodeOffset(startMapping, startContainer, range.startOffset);
		const endColumn = getColumnOfNodeOffset(endMapping, endContainer, range.endOffset);
		return new Selection(
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn
		);
	}
}

class LineInterval {
	constructor(
		public readonly startLine: number,
		public readonly endLine: number
	) { }
}

export class ComplexPagedScreenReaderStrategy implements IPagedScreenReaderStrategy<LineInterval[]> {

	constructor() { }

	private _getPageOfLine(lineNumber: number, linesPerPage: number): number {
		return Math.floor((lineNumber - 1) / linesPerPage);
	}

	private _getRangeForPage(page: number, linesPerPage: number): Range {
		const offset = page * linesPerPage;
		const startLineNumber = offset + 1;
		const endLineNumber = offset + linesPerPage;
		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	public fromEditorSelection(context: ISimpleModel, viewSelection: Selection, linesPerPage: number): LineInterval[] {

		const selectionStartPage = this._getPageOfLine(viewSelection.startLineNumber, linesPerPage);
		const selectionStartPageRange = this._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = this._getPageOfLine(viewSelection.endLineNumber, linesPerPage);
		const selectionEndPageRange = this._getRangeForPage(selectionEndPage, linesPerPage);

		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			return [{ startLine: selectionStartPageRange.startLineNumber, endLine: selectionEndPageRange.endLineNumber }];
		} else {
			return [
				{ startLine: selectionStartPageRange.startLineNumber, endLine: selectionStartPageRange.endLineNumber },
				{ startLine: selectionEndPageRange.startLineNumber, endLine: selectionEndPageRange.endLineNumber }
			];
		}
	}
}
