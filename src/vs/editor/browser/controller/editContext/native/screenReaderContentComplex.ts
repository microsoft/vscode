/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { EditorFontLigatures, EditorOption, FindComputedEditorOptionValueById, IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
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

const ttPolicy = createTrustedTypesPolicy('screenReaderSupport', { createHTML: value => value });

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
	private _contentState: ComplexScreenReaderContentState | undefined;
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
			this._contentState = this._getScreenReaderContentState(primarySelection);
			this._renderedLines = this._renderScreenReaderContent(this._contentState);
			if (this._renderedSelection.equalsSelection(primarySelection)) {
				return;
			}
			this._renderedSelection = primarySelection;
			this._setSelectionOfScreenReaderContent(this._context, this._renderedLines, this._renderedSelection);
		} else {
			this._contentState = undefined;
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
			// TODO: is focused?
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

	private _renderScreenReaderContent(screenReaderContentState: ComplexScreenReaderContentState): Map<number, RenderedScreenReaderLine> {
		const preStartOffsetRange = screenReaderContentState.preStartOffsetRange;
		const postStartOffsetRange = screenReaderContentState.postStartOffsetRange;
		const postEndOffsetRange = screenReaderContentState.postEndOffsetRange;
		const preEndOffsetRange = screenReaderContentState.preEndOffsetRange;
		const startSelectionLineNumber = screenReaderContentState.startSelectionLineNumber;
		const endSelectionLineNumber = screenReaderContentState.endSelectionLineNumber;

		const renderedLines = new Map<number, RenderedScreenReaderLine>();
		const nodes: HTMLDivElement[] = [];
		if (preStartOffsetRange) {
			for (let lineNumber = preStartOffsetRange.start; lineNumber <= preStartOffsetRange.endExclusive; lineNumber++) {
				const renderedLine = this._renderLine(lineNumber);
				renderedLines.set(lineNumber, renderedLine);
				nodes.push(renderedLine.domNode);
			}
		}
		const startRenderedLine = this._renderLine(startSelectionLineNumber);
		renderedLines.set(startSelectionLineNumber, startRenderedLine);
		nodes.push(startRenderedLine.domNode);
		if (postStartOffsetRange) {
			for (let lineNumber = postStartOffsetRange.start; lineNumber <= postStartOffsetRange.endExclusive; lineNumber++) {
				const renderedLine = this._renderLine(lineNumber);
				renderedLines.set(lineNumber, renderedLine);
				nodes.push(renderedLine.domNode);
			}
		}
		if (preEndOffsetRange) {
			for (let lineNumber = preEndOffsetRange.start; lineNumber <= preEndOffsetRange.endExclusive; lineNumber++) {
				const renderedLine = this._renderLine(lineNumber);
				renderedLines.set(lineNumber, renderedLine);
				nodes.push(renderedLine.domNode);
			}
		}
		if (endSelectionLineNumber !== undefined) {
			const endRenderedLine = this._renderLine(endSelectionLineNumber);
			renderedLines.set(endSelectionLineNumber, endRenderedLine);
			nodes.push(endRenderedLine.domNode);
		}
		if (postEndOffsetRange) {
			for (let lineNumber = postEndOffsetRange.start; lineNumber <= postEndOffsetRange.endExclusive; lineNumber++) {
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

	private _getScreenReaderContentState(primarySelection: Selection): ComplexScreenReaderContentState {
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
		if (!this._contentState) {
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
		// const range = activeDocumentSelection.getRangeAt(0);
		// const viewModel = this._context.viewModel;
		// const model = viewModel.model;
		// const coordinatesConverter = viewModel.coordinatesConverter;
		// const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(this._screenReaderContentState.startPositionWithinEditor);
		// const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
		// let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
		// let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
		// const modelUsesCRLF = model.getEndOfLineSequence() === EndOfLineSequence.CRLF;
		// if (modelUsesCRLF) {
		// 	const screenReaderContentText = this._screenReaderContentState.value;
		// 	const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
		// 	const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
		// 	const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
		// 	offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
		// 	offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
		// }
		// const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
		// const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
		// return Selection.fromPositions(positionOfSelectionStart, positionOfSelectionEnd);
	}
}

export class ComplexScreenReaderContentState {

	constructor(
		readonly startSelectionLineNumber: number,
		readonly endSelectionLineNumber: number | undefined,
		readonly preStartOffsetRange: OffsetRange | undefined,
		readonly postEndOffsetRange: OffsetRange | undefined,
		readonly postStartOffsetRange: OffsetRange | undefined,
		readonly preEndOffsetRange: OffsetRange | undefined,
	) { }

	equals(other: ComplexScreenReaderContentState): boolean {
		const coalesceOffsetRanges = this.coalesceOffsetRanges();
		const otherCoalesceOffsetRanges = other.coalesceOffsetRanges();
		if (coalesceOffsetRanges instanceof OffsetRange && otherCoalesceOffsetRanges instanceof OffsetRange) {
			return coalesceOffsetRanges.equals(otherCoalesceOffsetRanges);
		}
		if (Array.isArray(coalesceOffsetRanges) && Array.isArray(otherCoalesceOffsetRanges)) {
			return coalesceOffsetRanges[0].equals(otherCoalesceOffsetRanges[0]) && coalesceOffsetRanges[1].equals(otherCoalesceOffsetRanges[1]);
		}
		return false;
	}

	coalesceOffsetRanges(): OffsetRange | [OffsetRange, OffsetRange] {
		if (this.postStartOffsetRange && this.preEndOffsetRange) {
			if (this.postStartOffsetRange.start !== this.preEndOffsetRange.endExclusive - 1) {
				const startLineNumber1 = this.preStartOffsetRange ? this.preStartOffsetRange.start : this.startSelectionLineNumber;
				const startLineNumber2 = this.postStartOffsetRange ? this.postStartOffsetRange.endExclusive : this.startSelectionLineNumber;
				const startOffsetRange = new OffsetRange(startLineNumber1, startLineNumber2);
				const endLineNumber1 = this.preEndOffsetRange ? this.preEndOffsetRange.endExclusive : (this.endSelectionLineNumber ?? this.startSelectionLineNumber);
				const endLineNumber2 = this.postEndOffsetRange ? this.postEndOffsetRange.endExclusive : (this.endSelectionLineNumber ?? this.startSelectionLineNumber);
				const endOffsetRange = new OffsetRange(endLineNumber1, endLineNumber2);
				return [startOffsetRange, endOffsetRange];
			}
		}
		const startLineNumber = this.preStartOffsetRange ? this.preStartOffsetRange.start : this.startSelectionLineNumber;
		const endLineNumber = this.postEndOffsetRange ? this.postEndOffsetRange.endExclusive : (this.endSelectionLineNumber ?? this.startSelectionLineNumber);
		return new OffsetRange(startLineNumber, endLineNumber);
	}
}

export class ComplexPagedScreenReaderStrategy implements IPagedScreenReaderStrategy<ComplexScreenReaderContentState> {

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

	public fromEditorSelection(context: ISimpleModel, viewSelection: Selection, linesPerPage: number): ComplexScreenReaderContentState {

		const selectionStartPage = this._getPageOfLine(viewSelection.startLineNumber, linesPerPage);
		const selectionStartPageRange = this._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = this._getPageOfLine(viewSelection.endLineNumber, linesPerPage);
		const selectionEndPageRange = this._getRangeForPage(selectionEndPage, linesPerPage);

		const lineCount = context.getLineCount();

		const startSelectionLineNumber = viewSelection.startLineNumber;
		const endSelectionLineNumber = viewSelection.endLineNumber;

		let preStartOffsetRange: OffsetRange | undefined = undefined;
		if (startSelectionLineNumber > 1) {
			const preStartRange = selectionStartPageRange.intersectRanges(new Range(1, 1, startSelectionLineNumber - 1, context.getLineMaxColumn(startSelectionLineNumber - 1)));
			if (preStartRange) {
				preStartOffsetRange = new OffsetRange(preStartRange.startLineNumber, preStartRange.endLineNumber);
			}
		}

		let postEndOffsetRange: OffsetRange | undefined = undefined;
		if (endSelectionLineNumber < lineCount) {
			const postEndRange = selectionEndPageRange.intersectRanges(new Range(endSelectionLineNumber + 1, 1, lineCount, context.getLineMaxColumn(lineCount)));
			if (postEndRange) {
				postEndOffsetRange = new OffsetRange(postEndRange.startLineNumber, postEndRange.endLineNumber);
			}
		}

		let postStartOffsetRange: OffsetRange | undefined = undefined;
		let preEndOffsetRange: OffsetRange | undefined = undefined;
		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			if (startSelectionLineNumber + 1 < endSelectionLineNumber) {
				postStartOffsetRange = new OffsetRange(startSelectionLineNumber + 1, endSelectionLineNumber - 1);
			}
		} else {
			const postStartRange = selectionStartPageRange.intersectRanges(new Range(startSelectionLineNumber + 1, 1, Infinity, Infinity));
			if (postStartRange) {
				postStartOffsetRange = new OffsetRange(postStartRange.startLineNumber, postStartRange.endLineNumber);
			}
			const preEndRange = selectionEndPageRange.intersectRanges(new Range(1, 1, endSelectionLineNumber - 1, context.getLineMaxColumn(endSelectionLineNumber - 1)));
			if (preEndRange) {
				preEndOffsetRange = new OffsetRange(preEndRange.startLineNumber, preEndRange.endLineNumber);
			}
		}

		const resolvedEndSelectionLineNumber = viewSelection.startLineNumber !== viewSelection.endLineNumber ? viewSelection.endLineNumber : undefined;
		return new ComplexScreenReaderContentState(
			startSelectionLineNumber,
			resolvedEndSelectionLineNumber,
			preStartOffsetRange,
			postEndOffsetRange,
			postStartOffsetRange,
			preEndOffsetRange
		);
	}
}
