/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions, WrappingIndent } from '../../common/config/editorOptions.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { InjectedTextOptions, TextDirection } from '../../common/model.js';
import { ILineBreaksComputer, ILineBreaksComputerContext, ILineBreaksComputerFactory, ModelLineProjectionData } from '../../common/modelLineProjectionData.js';
import { IEditorConfiguration } from '../../common/config/editorConfiguration.js';
import { CharacterMapping, RenderLineInput, RenderLineOutput, renderViewLine } from '../../common/viewLayout/viewLineRenderer.js';
import { LineDecoration } from '../../common/viewLayout/lineDecorations.js';
import { LineInjectedText } from '../../common/textModelEvents.js';

const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });

const LINE_BREAK_LINE_HEIGHT = 300;
const DOM_LINE_BREAKS_COMPUTER_CLASS_NAME = 'dom-line-breaks-computer';

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	public static create(targetWindow: Window): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory(new WeakRef(targetWindow));
	}

	// TODO: Remove this later
	private _containerDomNode: HTMLDivElement | null = null;

	constructor(private targetWindow: WeakRef<Window>) {
	}

	public createLineBreaksComputer(context: ILineBreaksComputerContext, config: IEditorConfiguration, tabSize: number): ILineBreaksComputer {
		const lineNumbers: number[] = [];
		return {
			addRequest: (lineNumber: number, previousLineBreakData: ModelLineProjectionData | null) => {
				lineNumbers.push(lineNumber);
			},
			finalize: () => {
				const res = createLineBreaks(assertReturnsDefined(this.targetWindow.deref()), context, lineNumbers, config, tabSize);
				this._containerDomNode?.remove();
				this._containerDomNode = res.domNode;
				return res.data;
			}
		};
	}
}

function createLineBreaks(targetWindow: Window, context: ILineBreaksComputerContext, lineNumbers: number[], config: IEditorConfiguration, tabSize: number): { data: (ModelLineProjectionData | null)[]; domNode: HTMLDivElement | null } {
	function createEmptyLineBreakWithPossiblyInjectedText(lineNumber: number): ModelLineProjectionData | null {
		const injectedTexts = context.getLineInjectedText(lineNumber);
		if (injectedTexts) {
			const lineContent = context.getLineContent(lineNumber);
			const lineText = LineInjectedText.applyInjectedText(lineContent, injectedTexts);

			const injectionOptions = injectedTexts.map(t => t.options);
			const injectionOffsets = injectedTexts.map(text => text.column - 1);

			// creating a `LineBreakData` with an invalid `breakOffsetsVisibleColumn` is OK
			// because `breakOffsetsVisibleColumn` will never be used because it contains injected text
			return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
		} else {
			return null;
		}
	}
	const options = config.options;
	const fontInfo = options.get(EditorOption.fontInfo);
	const wrappingIndent = options.get(EditorOption.wrappingIndent);
	const firstLineBreakColumn = options.get(EditorOption.wrappingInfo).wrappingColumn;
	const wordBreak = options.get(EditorOption.wordBreak);

	if (firstLineBreakColumn === -1) {
		const result: (ModelLineProjectionData | null)[] = [];
		for (let i = 0, len = lineNumbers.length; i < len; i++) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(lineNumbers[i]);
		}
		return { data: result, domNode: null };
	}

	const overallWidth = Math.round(firstLineBreakColumn * fontInfo.typicalHalfwidthCharacterWidth);
	const additionalIndent = (wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0);
	const additionalIndentSize = Math.round(tabSize * additionalIndent);
	const additionalIndentLength = Math.ceil(fontInfo.spaceWidth * additionalIndentSize);

	const containerDomNode = document.createElement('div');
	containerDomNode.classList.add(DOM_LINE_BREAKS_COMPUTER_CLASS_NAME);
	applyFontInfo(containerDomNode, fontInfo);

	const sb = new StringBuilder(10000);
	// TODO: do we need the first non white-space indices
	const wrappedTextIndentLengths: number[] = [];
	const renderLineContents: string[] = [];
	const characterMappings: CharacterMapping[] = [];
	for (let i = 0; i < lineNumbers.length; i++) {
		const lineNumber = lineNumbers[i];
		const lineContent = LineInjectedText.applyInjectedText(context.getLineContent(lineNumber), context.getLineInjectedText(lineNumber));

		renderLineContents[i] = lineContent;
		let wrappedTextIndentLength = 0;
		let width = overallWidth;

		if (wrappingIndent !== WrappingIndent.None) {
			const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
			if (firstNonWhitespaceIndex !== -1) {
				for (let i = 0; i < firstNonWhitespaceIndex; i++) {
					const charWidth = (
						lineContent.charCodeAt(i) === CharCode.Tab
							? (tabSize - (wrappedTextIndentLength % tabSize))
							: 1
					);
					wrappedTextIndentLength += charWidth;
				}

				const indentWidth = Math.ceil(fontInfo.spaceWidth * wrappedTextIndentLength);

				// Force sticking to beginning of line if no character would fit except for the indentation
				if (indentWidth + fontInfo.typicalFullwidthCharacterWidth > overallWidth) {
					wrappedTextIndentLength = 0;
				} else {
					width = overallWidth - indentWidth;
				}
			}
		}

		const renderedLineOutput = renderLine(context, lineNumber, tabSize, width, options, sb, additionalIndentLength);
		wrappedTextIndentLengths[i] = wrappedTextIndentLength;
		characterMappings[i] = renderedLineOutput.characterMapping;
		// TODO, should we store the cropped rendered line content?
	}
	const html = sb.build();
	const trustedhtml = ttPolicy?.createHTML(html) ?? html;
	containerDomNode.innerHTML = trustedhtml as string;

	containerDomNode.style.position = 'absolute';
	containerDomNode.style.top = '300px';
	containerDomNode.style.background = 'white';
	containerDomNode.style.zIndex = '20';
	if (wordBreak === 'keepAll') {
		// word-break: keep-all; overflow-wrap: anywhere
		containerDomNode.style.wordBreak = 'keep-all';
		containerDomNode.style.overflowWrap = 'anywhere';
	} else {
		// overflow-wrap: break-word
		containerDomNode.style.wordBreak = 'inherit';
		containerDomNode.style.overflowWrap = 'break-word';
	}
	targetWindow.document.body.appendChild(containerDomNode);

	const range = document.createRange();
	const lineDomNodes = Array.prototype.slice.call(containerDomNode.children, 0);

	const result: (ModelLineProjectionData | null)[] = [];
	for (let i = 0; i < lineNumbers.length; i++) {
		const lineDomNode = lineDomNodes[i];
		const characterMapping = characterMappings[i];
		const breakOffsets: number[] | null = readLineBreaks(range, lineDomNode, renderLineContents[i], characterMapping);
		if (breakOffsets === null) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(lineNumbers[i]);
			continue;
		}

		const wrappedTextIndentLength = wrappedTextIndentLengths[i] + additionalIndentSize;

		const breakOffsetsVisibleColumn: number[] = [];
		for (let j = 0, len = breakOffsets.length; j < len; j++) {
			breakOffsetsVisibleColumn[j] = characterMapping.getHorizontalOffset(breakOffsets[j] + 1) + 1;
		}

		let injectionOptions: InjectedTextOptions[] | null;
		let injectionOffsets: number[] | null;
		const curInjectedTexts = context.getLineInjectedText(lineNumbers[i]);
		if (curInjectedTexts) {
			injectionOptions = curInjectedTexts.map(t => t.options);
			injectionOffsets = curInjectedTexts.map(text => text.column - 1);
		} else {
			injectionOptions = null;
			injectionOffsets = null;
		}

		result[i] = new ModelLineProjectionData(injectionOffsets, injectionOptions, breakOffsets, breakOffsetsVisibleColumn, wrappedTextIndentLength);
	}

	// containerDomNode.remove();
	return { data: result, domNode: containerDomNode };
}

// TODO: Am I able to apply the wrapping indent length along with the full line content?
// How to correctly apply the inline decorations, they need to be shifted by the offset that is removed in the beginning?
// Need to compare with the current behavior and how it works with different settings values
// May have to shift the inline decorations so they are correct when whitespaces are removed in the beginning
function renderLine(context: ILineBreaksComputerContext, lineNumber: number, tabSize: number, width: number, options: IComputedEditorOptions, sb: StringBuilder, wrappingIndentLength: number): RenderLineOutput {
	sb.appendString('<div style="height:');
	sb.appendString(String(LINE_BREAK_LINE_HEIGHT));
	sb.appendString('px;line-height:');
	sb.appendString(String(LINE_BREAK_LINE_HEIGHT));
	sb.appendString('px;');
	if (wrappingIndentLength !== 0) {
		const hangingOffset = String(wrappingIndentLength);
		sb.appendString('text-indent: -');
		sb.appendString(hangingOffset);
		sb.appendString('px; padding-left: ');
		sb.appendString(hangingOffset);
		sb.appendString('px; box-sizing: border-box;');
	}
	sb.appendString('width:');
	sb.appendString(String(width));
	sb.appendString('px;">');

	const stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
	const renderControlCharacters = options.get(EditorOption.renderControlCharacters);
	const fontLigatures = options.get(EditorOption.fontLigatures);
	const fontLigaturesEnabled = fontLigatures !== EditorFontLigatures.OFF;
	const fontInfo = options.get(EditorOption.fontInfo);
	const useMonospaceOptimizations = fontInfo.isMonospace && !options.get(EditorOption.disableMonospaceOptimizations);

	const tokens = context.getLineTokens(lineNumber);
	const inlineDecorations = context.getLineInlineDecorations(lineNumber);
	const lineDecorations = LineDecoration.filter(inlineDecorations, lineNumber, 1, context.getLineMaxColumn(lineNumber));
	const lineContent = LineInjectedText.applyInjectedText(context.getLineContent(lineNumber), context.getLineInjectedText(lineNumber));
	const isBasicASCII = strings.isBasicASCII(lineContent);

	const hasVariableFonts = context.hasVariableFonts(lineNumber);
	let renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	if (hasVariableFonts || options.get(EditorOption.experimentalWhitespaceRendering) === 'off') {
		renderWhitespace = options.get(EditorOption.renderWhitespace);
	} else {
		renderWhitespace = 'none';
	}

	const renderLineInput = new RenderLineInput(
		useMonospaceOptimizations,
		fontInfo.canUseHalfwidthRightwardsArrow,
		lineContent,
		false,
		isBasicASCII,
		false,
		0,
		tokens,
		lineDecorations,
		tabSize,
		0,
		fontInfo.spaceWidth,
		fontInfo.middotWidth,
		fontInfo.wsmiddotWidth,
		stopRenderingLineAfter,
		renderWhitespace,
		renderControlCharacters,
		fontLigaturesEnabled,
		null,
		TextDirection.LTR,
		10
	);
	const renderedLineOutput = renderViewLine(renderLineInput, sb);
	sb.appendString('</div>');

	return renderedLineOutput;
}

function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string, characterMapping: CharacterMapping): number[] | null {
	if (lineContent.length <= 1) {
		return null;
	}
	const span = <HTMLSpanElement>Array.prototype.slice.call(lineDomNode.children, 0)[0];

	const breakOffsets: number[] = [];
	try {
		discoverBreaks(characterMapping, range, span, 0, null, lineContent.length - 1, null, breakOffsets);
	} catch (err) {
		console.log(err);
		return null;
	}

	if (breakOffsets.length === 0) {
		return null;
	}

	breakOffsets.push(lineContent.length);
	return breakOffsets;
}

function discoverBreaks(characterMapping: CharacterMapping, range: Range, span: HTMLSpanElement, low: number, lowRects: DOMRectList | null, high: number, highRects: DOMRectList | null, result: number[]): void {
	if (low === high) {
		return;
	}

	const lowDomPosition1 = characterMapping.getDomPosition(low);
	const lowDomPosition2 = characterMapping.getDomPosition(low + 1);
	lowRects = lowRects || readClientRect(range, span, lowDomPosition1.charIndex, lowDomPosition1.partIndex, lowDomPosition2.charIndex, lowDomPosition2.partIndex);
	const highDomPosition1 = characterMapping.getDomPosition(high);
	const highDomPosition2 = characterMapping.getDomPosition(high + 1);
	highRects = highRects || readClientRect(range, span, highDomPosition1.charIndex, highDomPosition1.partIndex, highDomPosition2.charIndex, highDomPosition2.partIndex);

	if (Math.abs(lowRects[0].top - highRects[0].top) <= LINE_BREAK_LINE_HEIGHT / 2) {
		// same line
		return;
	}

	// there is at least one line break between these two offsets
	if (low + 1 === high) {
		// the two characters are adjacent, so the line break must be exactly between them
		result.push(high);
		return;
	}

	const mid = low + ((high - low) / 2) | 0;
	const midDomPosition1 = characterMapping.getDomPosition(mid);
	const midDomPosition2 = characterMapping.getDomPosition(mid + 1);
	const midRects = readClientRect(range, span, midDomPosition1.charIndex, midDomPosition1.partIndex, midDomPosition2.charIndex, midDomPosition2.partIndex);
	discoverBreaks(characterMapping, range, span, low, lowRects, mid, midRects, result);
	discoverBreaks(characterMapping, range, span, mid, midRects, high, highRects, result);
}

function readClientRect(range: Range, span: HTMLSpanElement, startCharacterOffset: number, startSpanOffset: number, endCharacterOffset: number, endSpanOffset: number): DOMRectList {
	const spans = <HTMLSpanElement[]>Array.prototype.slice.call(span.children, 0);
	range.setStart(spans[startSpanOffset].firstChild!, startCharacterOffset);
	range.setEnd(spans[endSpanOffset].firstChild!, endCharacterOffset);
	return range.getClientRects();
}
