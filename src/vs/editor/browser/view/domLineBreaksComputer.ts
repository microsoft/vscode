/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { EditorFontLigatures, EditorOption, WrappingIndent } from '../../common/config/editorOptions.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { InjectedTextOptions, ITextModel } from '../../common/model.js';
import { ILineBreaksComputer, ILineBreaksComputerFactory, ModelLineProjectionData } from '../../common/modelLineProjectionData.js';
import { LineInjectedText } from '../../common/textModelEvents.js';
import { IEditorConfiguration } from '../../common/config/editorConfiguration.js';
import { CharacterMapping, RenderLineInput, renderViewLine } from '../../common/viewLayout/viewLineRenderer.js';
import { LineDecoration } from '../../common/viewLayout/lineDecorations.js';
import { InlineDecoration } from '../../common/viewModel.js';
import { assertIsDefined } from '../../../base/common/types.js';

const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	private container: HTMLElement | undefined;

	public static create(targetWindow: Window, model: ITextModel): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory(new WeakRef(targetWindow), model);
	}

	constructor(private targetWindow: WeakRef<Window>, private model: ITextModel) { }

	public createLineBreaksComputer(config: IEditorConfiguration, tabSize: number): ILineBreaksComputer {
		const requests: string[] = [];
		const injectedTexts: (LineInjectedText[] | null)[] = [];
		const linesInlineDecorations: InlineDecoration[][] = [];
		const lineNumbers: number[] = [];
		const lineHeights: number[] = [];
		return {
			addRequest: (lineNumber: number, lineText: string, lineHeight: number, injectedText: LineInjectedText[] | null, inlineDecorations: InlineDecoration[], previousLineBreakData: ModelLineProjectionData | null) => {
				requests.push(lineText);
				injectedTexts.push(injectedText);
				linesInlineDecorations.push(inlineDecorations);
				lineNumbers.push(lineNumber);
				lineHeights.push(lineHeight);
			},
			finalize: () => {
				this.container?.remove();
				const res = createLineBreaks(config, assertIsDefined(this.targetWindow.deref()), this.model, lineNumbers, lineHeights, requests, tabSize, injectedTexts, linesInlineDecorations);
				this.container = res.containerDomNode;
				return res.data;
			}
		};
	}
}

function createLineBreaks(config: IEditorConfiguration, targetWindow: Window, model: ITextModel, lineNumbers: number[], lineHeights: number[], requests: string[], tabSize: number, injectedTextsPerLine: (LineInjectedText[] | null)[], linesInlineDecorations: InlineDecoration[][]): { data: (ModelLineProjectionData | null)[]; containerDomNode: HTMLElement | undefined } {
	function createEmptyLineBreakWithPossiblyInjectedText(requestIdx: number): ModelLineProjectionData | null {
		const injectedTexts = injectedTextsPerLine[requestIdx];
		if (injectedTexts) {
			const lineText = LineInjectedText.applyInjectedText(requests[requestIdx], injectedTexts);

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
		for (let i = 0, len = requests.length; i < len; i++) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(i);
		}
		return { data: result, containerDomNode: undefined };
	}

	const overallWidth = Math.round(firstLineBreakColumn * fontInfo.typicalHalfwidthCharacterWidth);
	const additionalIndent = (wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0);
	const additionalIndentSize = Math.round(tabSize * additionalIndent);

	const containerDomNode = document.createElement('div');
	containerDomNode.classList.add('dom-line-breaks-computer');
	applyFontInfo(containerDomNode, fontInfo);

	const sb = new StringBuilder(10000);
	const firstNonWhitespaceIndices: number[] = [];
	const wrappedTextIndentLengths: number[] = [];
	const renderLineContents: string[] = [];
	const characterMappings: CharacterMapping[] = [];
	for (let i = 0; i < requests.length; i++) {
		const lineContent = LineInjectedText.applyInjectedText(requests[i], injectedTextsPerLine[i]);

		let firstNonWhitespaceIndex = 0;
		let wrappedTextIndentLength = 0;
		let width = overallWidth;

		if (wrappingIndent !== WrappingIndent.None) {
			firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
			if (firstNonWhitespaceIndex === -1) {
				// all whitespace line
				firstNonWhitespaceIndex = 0;

			} else {
				// Track existing indent

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
					firstNonWhitespaceIndex = 0;
					wrappedTextIndentLength = 0;
				} else {
					width = overallWidth - indentWidth;
				}
			}
		}

		const renderLineContent = lineContent.substr(firstNonWhitespaceIndex);
		const stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		let renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
		const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		if (experimentalWhitespaceRendering === 'off') {
			renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			renderWhitespace = 'none';
		}
		const renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		const fontLigatures = options.get(EditorOption.fontLigatures);
		const useMonospaceOptimizations = fontInfo.isMonospace && !options.get(EditorOption.disableMonospaceOptimizations);
		const lineNumber = lineNumbers[i];
		const inlineDecorations = linesInlineDecorations[i];
		const lineDecorations = LineDecoration.filter(inlineDecorations, lineNumber, 0, Infinity);
		const tokens = model.tokenization.getLineTokens(lineNumber);
		const isBasicASCII = strings.isBasicASCII(renderLineContent);
		const containsRTL = strings.containsRTL(renderLineContent);
		const renderLineInput = new RenderLineInput(
			useMonospaceOptimizations,
			fontInfo.canUseHalfwidthRightwardsArrow,
			renderLineContent,
			false,
			isBasicASCII,
			containsRTL,
			0,
			tokens,
			lineDecorations,
			tabSize,
			firstLineBreakColumn,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopRenderingLineAfter,
			renderWhitespace,
			renderControlCharacters,
			fontLigatures !== EditorFontLigatures.OFF,
			null
		);
		const lineHeight = lineHeights[i];
		sb.appendString('<div style="height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;line-height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;width:');
		sb.appendString(String(width));
		sb.appendString('px;">');
		const renderedLineOutput = renderViewLine(renderLineInput, sb);
		sb.appendString('</div>');
		firstNonWhitespaceIndices[i] = firstNonWhitespaceIndex;
		wrappedTextIndentLengths[i] = wrappedTextIndentLength;
		renderLineContents[i] = renderLineContent;
		characterMappings[i] = renderedLineOutput.characterMapping;
	}
	const html = sb.build();
	const trustedhtml = ttPolicy?.createHTML(html) ?? html;
	containerDomNode.innerHTML = trustedhtml as string;

	containerDomNode.style.position = 'absolute';
	containerDomNode.style.top = '10000';
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
	for (let i = 0; i < requests.length; i++) {
		const lineDomNode = lineDomNodes[i];
		const lineHeight = lineHeights[i];
		const characterMapping = characterMappings[i];
		const breakOffsets: number[] | null = readLineBreaks(range, lineDomNode, renderLineContents[i], lineHeight, characterMapping);
		if (breakOffsets === null) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(i);
			continue;
		}

		const firstNonWhitespaceIndex = firstNonWhitespaceIndices[i];
		const wrappedTextIndentLength = wrappedTextIndentLengths[i] + additionalIndentSize;

		const breakOffsetsVisibleColumn: number[] = [];
		for (let j = 0, len = breakOffsets.length; j < len; j++) {
			breakOffsetsVisibleColumn[j] = characterMapping.getHorizontalOffset(breakOffsets[j] + 1);
		}

		if (firstNonWhitespaceIndex !== 0) {
			// All break offsets are relative to the renderLineContent, make them absolute again
			for (let j = 0, len = breakOffsets.length; j < len; j++) {
				breakOffsets[j] += firstNonWhitespaceIndex;
			}
		}

		let injectionOptions: InjectedTextOptions[] | null;
		let injectionOffsets: number[] | null;
		const curInjectedTexts = injectedTextsPerLine[i];
		if (curInjectedTexts) {
			injectionOptions = curInjectedTexts.map(t => t.options);
			injectionOffsets = curInjectedTexts.map(text => text.column - 1);
		} else {
			injectionOptions = null;
			injectionOffsets = null;
		}

		result[i] = new ModelLineProjectionData(injectionOffsets, injectionOptions, breakOffsets, breakOffsetsVisibleColumn, wrappedTextIndentLength);
	}

	return { data: result, containerDomNode };
}
function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string, lineHeight: number, characterMapping: CharacterMapping): number[] | null {
	if (lineContent.length <= 1) {
		return null;
	}
	const outerSpans = <HTMLSpanElement>Array.prototype.slice.call(lineDomNode.children, 0)[0];
	const spans = <HTMLSpanElement[]>Array.prototype.slice.call(outerSpans.children, 0);

	const breakOffsets: number[] = [];
	try {
		discoverBreaks(range, spans, lineHeight, characterMapping, 0, null, lineContent.length - 1, null, breakOffsets);
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

function discoverBreaks(range: Range, spans: HTMLSpanElement[], lineHeight: number, characterMapping: CharacterMapping, low: number, lowRects: DOMRectList | null, high: number, highRects: DOMRectList | null, result: number[]): void {
	if (low === high) {
		return;
	}

	const lowDomPosition1 = characterMapping.getDomPosition(low);
	const lowDomPosition2 = characterMapping.getDomPosition(low + 1);
	lowRects = lowRects || readClientRect(range, spans, lowDomPosition1.charIndex, lowDomPosition1.partIndex, lowDomPosition2.charIndex, lowDomPosition2.partIndex);
	const highDomPosition1 = characterMapping.getDomPosition(high);
	const highDomPosition2 = characterMapping.getDomPosition(high + 1);
	highRects = highRects || readClientRect(range, spans, highDomPosition1.charIndex, highDomPosition1.partIndex, highDomPosition2.charIndex, highDomPosition2.partIndex);

	if (Math.abs(lowRects[0].top - highRects[0].top) <= lineHeight / 2) {
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
	const midRects = readClientRect(range, spans, midDomPosition1.charIndex, midDomPosition1.partIndex, midDomPosition2.charIndex, midDomPosition2.partIndex);
	discoverBreaks(range, spans, lineHeight, characterMapping, low, lowRects, mid, midRects, result);
	discoverBreaks(range, spans, lineHeight, characterMapping, mid, midRects, high, highRects, result);
}

function readClientRect(range: Range, spans: HTMLSpanElement[], startCharacterOffset: number, startSpanOffset: number, endCharacterOffset: number, endSpanOffset: number): DOMRectList {
	// console.log('startSpanOffset : ', startSpanOffset);
	// console.log('endSpanOffset : ', endSpanOffset);
	// console.log('spans : ', spans);
	// console.log('spans[startSpanOffset] : ', spans[startSpanOffset]);
	// console.log('spans[endSpanOffset] : ', spans[endSpanOffset]);
	range.setStart(spans[startSpanOffset].firstChild!, startCharacterOffset);
	range.setEnd(spans[endSpanOffset].firstChild!, endCharacterOffset);
	return range.getClientRects();
}
