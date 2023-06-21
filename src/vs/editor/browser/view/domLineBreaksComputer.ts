/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { WrappingIndent } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { InjectedTextOptions } from 'vs/editor/common/model';
import { ILineBreaksComputer, ILineBreaksComputerFactory, ModelLineProjectionData } from 'vs/editor/common/modelLineProjectionData';
import { LineInjectedText } from 'vs/editor/common/textModelEvents';

const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	public static create(): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory();
	}

	constructor() {
	}

	public createLineBreaksComputer(fontInfo: FontInfo, tabSize: number, wrappingColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll'): ILineBreaksComputer {
		const requests: string[] = [];
		const injectedTexts: (LineInjectedText[] | null)[] = [];
		return {
			addRequest: (lineText: string, injectedText: LineInjectedText[] | null, previousLineBreakData: ModelLineProjectionData | null) => {
				requests.push(lineText);
				injectedTexts.push(injectedText);
			},
			finalize: () => {
				return createLineBreaks(requests, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak, injectedTexts);
			}
		};
	}
}

function createLineBreaks(requests: string[], fontInfo: FontInfo, tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll', injectedTextsPerLine: (LineInjectedText[] | null)[]): (ModelLineProjectionData | null)[] {
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

	if (firstLineBreakColumn === -1) {
		const result: (ModelLineProjectionData | null)[] = [];
		for (let i = 0, len = requests.length; i < len; i++) {
			result[i] = createEmptyLineBreakWithPossiblyInjectedText(i);
		}
		return result;
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
		const tmp = renderLine(renderLineContent, wrappedTextIndentLength, tabSize, width, sb, additionalIndentLength);
		firstNonWhitespaceIndices[i] = firstNonWhitespaceIndex;
		wrappedTextIndentLengths[i] = wrappedTextIndentLength;
		renderLineContents[i] = renderLineContent;
		allCharOffsets[i] = tmp[0];
		allVisibleColumns[i] = tmp[1];
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
	document.body.appendChild(containerDomNode);

	const range = document.createRange();
	const lineDomNodes = Array.prototype.slice.call(containerDomNode.children, 0);

	const result: (ModelLineProjectionData | null)[] = [];
	for (let i = 0; i < requests.length; i++) {
		const lineDomNode = lineDomNodes[i];
		const breakOffsets: number[] | null = readLineBreaks(range, lineDomNode, renderLineContents[i], allCharOffsets[i]);
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

	document.body.removeChild(containerDomNode);
	return result;
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

function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string, charOffsets: number[]): number[] | null {
	if (lineContent.length <= 1) {
		return null;
	}
	const spans = <HTMLSpanElement[]>Array.prototype.slice.call(lineDomNode.children, 0);

	const breakOffsets: number[] = [];
	try {
		discoverBreaks(range, spans, charOffsets, 0, null, lineContent.length - 1, null, breakOffsets);
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

function discoverBreaks(range: Range, spans: HTMLSpanElement[], charOffsets: number[], low: number, lowRects: DOMRectList | null, high: number, highRects: DOMRectList | null, result: number[]): void {
	if (low === high) {
		return;
	}

	lowRects = lowRects || readClientRect(range, spans, charOffsets[low], charOffsets[low + 1]);
	highRects = highRects || readClientRect(range, spans, charOffsets[high], charOffsets[high + 1]);

	if (Math.abs(lowRects[0].top - highRects[0].top) <= 0.1) {
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
	const midRects = readClientRect(range, spans, charOffsets[mid], charOffsets[mid + 1]);
	discoverBreaks(range, spans, charOffsets, low, lowRects, mid, midRects, result);
	discoverBreaks(range, spans, charOffsets, mid, midRects, high, highRects, result);
}

function readClientRect(range: Range, spans: HTMLSpanElement[], startOffset: number, endOffset: number): DOMRectList {
	range.setStart(spans[(startOffset / Constants.SPAN_MODULO_LIMIT) | 0].firstChild!, startOffset % Constants.SPAN_MODULO_LIMIT);
	range.setEnd(spans[(endOffset / Constants.SPAN_MODULO_LIMIT) | 0].firstChild!, endOffset % Constants.SPAN_MODULO_LIMIT);
	return range.getClientRects();
}
