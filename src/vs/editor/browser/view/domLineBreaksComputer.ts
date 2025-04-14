/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { assertIsDefined } from '../../../base/common/types.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { EditorFontLigatures, EditorOption, WrappingIndent } from '../../common/config/editorOptions.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { InjectedTextOptions, ITextModel } from '../../common/model.js';
import { ILineBreaksComputer, ILineBreaksComputerFactory, ModelLineProjectionData } from '../../common/modelLineProjectionData.js';
import { LineInjectedText } from '../../common/textModelEvents.js';
import { IEditorConfiguration } from '../../common/config/editorConfiguration.js';
import { RenderLineInput, renderViewLine } from '../../common/viewLayout/viewLineRenderer.js';
import { LineDecoration } from '../../common/viewLayout/lineDecorations.js';
import { InlineDecoration } from '../../common/viewModel.js';

const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	private _container: HTMLElement | undefined = undefined;

	public static create(targetWindow: Window, model: ITextModel): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory(new WeakRef(targetWindow), model);
	}

	constructor(private targetWindow: WeakRef<Window>, private model: ITextModel) { }

	public createLineBreaksComputer(config: IEditorConfiguration, tabSize: number): ILineBreaksComputer {
		const requests: string[] = [];
		const injectedTexts: (LineInjectedText[] | null)[] = [];
		const allInlineDecorations: InlineDecoration[][] = [];
		const lineNumbers: number[] = [];
		const lineHeights: number[] = [];
		return {
			addRequest: (lineNumber: number, lineText: string, lineHeight: number, injectedText: LineInjectedText[] | null, inlineDecorations: InlineDecoration[], previousLineBreakData: ModelLineProjectionData | null) => {
				requests.push(lineText);
				injectedTexts.push(injectedText);
				allInlineDecorations.push(inlineDecorations);
				lineNumbers.push(lineNumber);
				lineHeights.push(lineHeight);
			},
			finalize: () => {
				this._container?.remove();
				const res = createLineBreaks(config, assertIsDefined(this.targetWindow.deref()), this.model, lineNumbers, lineHeights, requests, tabSize, injectedTexts, allInlineDecorations);
				this._container = res.containerDomNode;
				return res.data;
			}
		};
	}
}

function createLineBreaks(config: IEditorConfiguration, targetWindow: Window, model: ITextModel, lineNumbers: number[], lineHeights: number[], requests: string[], tabSize: number, injectedTextsPerLine: (LineInjectedText[] | null)[], inlineDecorations: InlineDecoration[][]): { data: (ModelLineProjectionData | null)[]; containerDomNode: HTMLElement | undefined } {
	console.log('createLineBreaks', lineNumbers, requests, tabSize, injectedTextsPerLine, inlineDecorations);
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
	const fontInfo = config.options.get(EditorOption.fontInfo);
	const wrappingIndent = options.get(EditorOption.wrappingIndent);
	const firstLineBreakColumn = options.get(EditorOption.wrappingInfo).wrappingColumn;
	const wordBreak = options.get(EditorOption.wordBreak);

	if (firstLineBreakColumn === -1) {
		const result: (ModelLineProjectionData | null)[] = [];
		for (let i = 0, len = requests.length; i < len; i++) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(i);
		}
		console.log('early return 1');
		return { data: result, containerDomNode: undefined };
	}

	const overallWidth = Math.round(firstLineBreakColumn * fontInfo.typicalHalfwidthCharacterWidth);
	const additionalIndent = (wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0);
	const additionalIndentSize = Math.round(tabSize * additionalIndent);
	const additionalIndentLength = Math.ceil(fontInfo.spaceWidth * additionalIndentSize);

	const containerDomNode = document.createElement('div');
	applyFontInfo(containerDomNode, fontInfo);

	const sb = new StringBuilder(10000);
	const firstNonWhitespaceIndices: number[] = [];
	const wrappedTextIndentLengths: number[] = [];
	const renderLineContents: string[] = [];
	const allCharOffsets: number[][] = [];
	const allSpanOffsets: number[][] = [];
	const allVisibleColumns: number[][] = [];
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
		const actualInlineDecorations = LineDecoration.filter(inlineDecorations[i], lineNumber, 0, Infinity);
		const tokens = model.tokenization.getLineTokens(lineNumber);
		const renderLineInput = new RenderLineInput(
			useMonospaceOptimizations,
			fontInfo.canUseHalfwidthRightwardsArrow,
			renderLineContent,
			false,
			false,
			false,
			0,
			tokens,
			actualInlineDecorations,
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
		sb.appendString('px;">');
		const tmp = renderViewLine(renderLineInput, sb);
		sb.appendString('</div>');

		// const tmp = renderLine(renderLineContent, wrappedTextIndentLength, tabSize, width, sb, additionalIndentLength);
		firstNonWhitespaceIndices[i] = firstNonWhitespaceIndex;
		wrappedTextIndentLengths[i] = wrappedTextIndentLength;
		renderLineContents[i] = renderLineContent;
		allCharOffsets[i] = ('rawCharacterOffsets' in tmp ? tmp.rawCharacterOffsets : tmp[0]) as any;
		allSpanOffsets[i] = ('rawSpanOffsets' in tmp ? tmp.rawSpanOffsets : []) as any;
		allVisibleColumns[i] = ('rawVisibleColumns' in tmp ? tmp.rawVisibleColumns : tmp[1]) as any;
	}
	const html = sb.build();
	console.log('createLineBreaks html', html);
	const trustedhtml = ttPolicy?.createHTML(html) ?? html;
	containerDomNode.innerHTML = trustedhtml as string;
	containerDomNode.classList.add('monaco-editor');
	//containerDomNode.style.position = 'absolute';
	//containerDomNode.style.top = '100';
	console.log('wordBreak : ', wordBreak);
	if (wordBreak === 'keepAll') {
		// word-break: keep-all; overflow-wrap: anywhere
		containerDomNode.style.wordBreak = 'keep-all';
		containerDomNode.style.overflowWrap = 'anywhere';
	} else {
		// overflow-wrap: break-word
		containerDomNode.style.wordBreak = 'inherit';
		containerDomNode.style.overflowWrap = 'break-word';
	}
	console.log('containerDomNode', containerDomNode);
	targetWindow.document.body.prepend(containerDomNode);

	const range = document.createRange();
	const lineDomNodes = Array.prototype.slice.call(containerDomNode.children, 0);

	const result: (ModelLineProjectionData | null)[] = [];
	for (let i = 0; i < requests.length; i++) {
		const lineDomNode = lineDomNodes[i];
		const lineHeight = lineHeights[i];
		const breakOffsets: number[] | null = readLineBreaks(range, lineDomNode, renderLineContents[i], lineHeight, allCharOffsets[i], allSpanOffsets[i]);
		console.log('breakOffsets : ', breakOffsets);
		if (breakOffsets === null) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(i);
			continue;
		}

		const firstNonWhitespaceIndex = firstNonWhitespaceIndices[i];
		const wrappedTextIndentLength = wrappedTextIndentLengths[i] + additionalIndentSize;
		const visibleColumns = allVisibleColumns[i];

		const breakOffsetsVisibleColumn: number[] = [];
		for (let j = 0, len = breakOffsets.length; j < len; j++) {
			breakOffsetsVisibleColumn[j] = visibleColumns[breakOffsets[j]];
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

	console.log('result : ', result);
	console.log('return 2');
	return { data: result, containerDomNode };
}

const enum Constants {
	SPAN_MODULO_LIMIT = 16384
}

function renderLine(lineContent: string, initialVisibleColumn: number, tabSize: number, width: number, sb: StringBuilder, wrappingIndentLength: number): [number[], number[]] {

	if (wrappingIndentLength !== 0) {
		const hangingOffset = String(wrappingIndentLength);
		sb.appendString('<div style="text-indent: -');
		sb.appendString(hangingOffset);
		sb.appendString('px; padding-left: ');
		sb.appendString(hangingOffset);
		sb.appendString('px; box-sizing: border-box; width:');
	} else {
		sb.appendString('<div style="width:');
	}
	sb.appendString(String(width));
	sb.appendString('px;">');
	// if (containsRTL) {
	// 	sb.appendASCIIString('" dir="ltr');
	// }

	const len = lineContent.length;
	let visibleColumn = initialVisibleColumn;
	let charOffset = 0;
	const charOffsets: number[] = [];
	const visibleColumns: number[] = [];
	let nextCharCode = (0 < len ? lineContent.charCodeAt(0) : CharCode.Null);

	sb.appendString('<span>');
	for (let charIndex = 0; charIndex < len; charIndex++) {
		if (charIndex !== 0 && charIndex % Constants.SPAN_MODULO_LIMIT === 0) {
			sb.appendString('</span><span>');
		}
		charOffsets[charIndex] = charOffset;
		visibleColumns[charIndex] = visibleColumn;
		const charCode = nextCharCode;
		nextCharCode = (charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : CharCode.Null);
		let producedCharacters = 1;
		let charWidth = 1;
		switch (charCode) {
			case CharCode.Tab:
				producedCharacters = (tabSize - (visibleColumn % tabSize));
				charWidth = producedCharacters;
				for (let space = 1; space <= producedCharacters; space++) {
					if (space < producedCharacters) {
						sb.appendCharCode(0xA0); // &nbsp;
					} else {
						sb.appendASCIICharCode(CharCode.Space);
					}
				}
				break;

			case CharCode.Space:
				if (nextCharCode === CharCode.Space) {
					sb.appendCharCode(0xA0); // &nbsp;
				} else {
					sb.appendASCIICharCode(CharCode.Space);
				}
				break;

			case CharCode.LessThan:
				sb.appendString('&lt;');
				break;

			case CharCode.GreaterThan:
				sb.appendString('&gt;');
				break;

			case CharCode.Ampersand:
				sb.appendString('&amp;');
				break;

			case CharCode.Null:
				sb.appendString('&#00;');
				break;

			case CharCode.UTF8_BOM:
			case CharCode.LINE_SEPARATOR:
			case CharCode.PARAGRAPH_SEPARATOR:
			case CharCode.NEXT_LINE:
				sb.appendCharCode(0xFFFD);
				break;

			default:
				if (strings.isFullWidthCharacter(charCode)) {
					charWidth++;
				}
				if (charCode < 32) {
					sb.appendCharCode(9216 + charCode);
				} else {
					sb.appendCharCode(charCode);
				}
		}

		charOffset += producedCharacters;
		visibleColumn += charWidth;
	}
	sb.appendString('</span>');

	charOffsets[lineContent.length] = charOffset;
	visibleColumns[lineContent.length] = visibleColumn;

	sb.appendString('</div>');

	return [charOffsets, visibleColumns];
}

function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string, lineHeight: number, charOffsets: number[], spanOffsets: number[]): number[] | null {
	console.log('readLineBreaks', lineDomNode, lineContent, charOffsets);
	console.log('charOffsets', charOffsets);
	console.log('spanOffsets', spanOffsets);
	if (lineContent.length <= 1) {
		return null;
	}
	const outerSpans = <HTMLSpanElement>Array.prototype.slice.call(lineDomNode.children, 0)[0];
	console.log('outerSpans', outerSpans);
	const spans = <HTMLSpanElement[]>Array.prototype.slice.call(outerSpans.children, 0);
	console.log('spans', spans);

	const breakOffsets: number[] = [];
	try {
		discoverBreaks(range, spans, lineHeight, charOffsets, spanOffsets, 0, null, lineContent.length - 1, null, breakOffsets);
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

function discoverBreaks(range: Range, spans: HTMLSpanElement[], lineHeight: number, charOffsets: number[], spanOffsets: number[], low: number, lowRects: DOMRectList | null, high: number, highRects: DOMRectList | null, result: number[]): void {
	console.log('discoverBreaks', low, high, lowRects, highRects);
	const startSpanOffset = spanOffsets[low];
	const endSpanOffset = spanOffsets[high];
	const startSpan = spans[startSpanOffset];
	const endSpan = spans[endSpanOffset];
	console.log('startSpan', startSpan.firstChild);
	console.log('endSpan', endSpan.firstChild);
	console.log('startSpan.offsetTop : ', startSpan.offsetTop);
	console.log('endSpan.offsetTop : ', endSpan.offsetTop);
	console.log('charOffsets', charOffsets);
	if (low === high) {
		console.log('return 1');
		return;
	}

	lowRects = lowRects || readClientRect(range, spans, charOffsets[low], spanOffsets[low], charOffsets[low + 1], spanOffsets[low + 1]);
	highRects = highRects || readClientRect(range, spans, charOffsets[high], spanOffsets[high], charOffsets[high + 1], spanOffsets[high + 1]);
	console.log('lowRects', lowRects);
	console.log('highRects', highRects);
	console.log('lowRects[0].top ; ', lowRects[0].top);
	console.log('highRects[0].top : ', highRects[0].top);
	const abs = Math.abs(lowRects[0].top - highRects[0].top);
	console.log('abs : ', abs);
	const ceiling = lineHeight / 2;
	console.log('ceiling : ', ceiling);
	if (abs <= ceiling) {
		console.log('return 2');
		// same line
		return;
	}

	// there is at least one line break between these two offsets
	if (low + 1 === high) {
		// the two characters are adjacent, so the line break must be exactly between them
		result.push(high);
		console.log('return 3');
		return;
	}

	const mid = low + ((high - low) / 2) | 0;
	const midRects = readClientRect(range, spans, charOffsets[mid], spanOffsets[mid], charOffsets[mid + 1], spanOffsets[mid + 1]);
	console.log('midRects', midRects);
	discoverBreaks(range, spans, lineHeight, charOffsets, spanOffsets, low, lowRects, mid, midRects, result);
	discoverBreaks(range, spans, lineHeight, charOffsets, spanOffsets, mid, midRects, high, highRects, result);
}

function readClientRect(range: Range, spans: HTMLSpanElement[], startCharacterOffset: number, startSpanOffset: number, endCharacterOffset: number, endSpanOffset: number): DOMRectList {
	console.log('readClientRect', startCharacterOffset, startSpanOffset, endCharacterOffset, endSpanOffset);
	const startNode = spans[startSpanOffset].firstChild!;
	const endNode = spans[endSpanOffset].firstChild!;
	console.log('startNode', startNode);
	console.log('endNode', endNode);
	console.log('_startOffset', startCharacterOffset);
	console.log('_endOffset', endCharacterOffset);
	range.setStart(startNode, startCharacterOffset);
	range.setEnd(endNode, endCharacterOffset);
	return range.getClientRects();
}
