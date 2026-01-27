/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { WrappingIndent } from '../../common/config/editorOptions.js';
import { FontInfo } from '../../common/config/fontInfo.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { InjectedTextOptions } from '../../common/model.js';
import { ILineBreaksComputer, ILineBreaksComputerFactory, ModelLineProjectionData } from '../../common/modelLineProjectionData.js';
import { InlineClassName, LineInjectedText } from '../../common/textModelEvents.js';

const ttPolicy = createTrustedTypesPolicy('domLineBreaksComputer', { createHTML: value => value });

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	public static create(targetWindow: Window): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory(new WeakRef(targetWindow));
	}

	constructor(private targetWindow: WeakRef<Window>) {
	}

	public createLineBreaksComputer(fontInfo: FontInfo, tabSize: number, wrappingColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll', wrapOnEscapedLineFeeds: boolean): ILineBreaksComputer {
		const requests: string[] = [];
		const injectedTexts: (LineInjectedText[] | null)[] = [];
		const inlineClassNames: (InlineClassName[] | null)[] = [];
		return {
			addRequest: (lineText: string, injectedText: LineInjectedText[] | null, inlineClassName: InlineClassName[] | null, previousLineBreakData: ModelLineProjectionData | null) => {
				requests.push(lineText);
				injectedTexts.push(injectedText);
				inlineClassNames.push(inlineClassName);
			},
			finalize: () => {
				return createLineBreaks(assertReturnsDefined(this.targetWindow.deref()), requests, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak, injectedTexts, inlineClassNames);
			}
		};
	}
}

function createLineBreaks(targetWindow: Window, requests: string[], fontInfo: FontInfo, tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll', injectedTextsPerLine: (LineInjectedText[] | null)[], inlineClassNamesPerLine: (InlineClassName[] | null)[]): (ModelLineProjectionData | null)[] {
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
	const allVisibleColumns: number[][] = [];

	for (let i = 0; i < requests.length; i++) {
		const lineContent = requests[i];

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
		allVisibleColumns[i] = renderLine(renderLineContent, wrappedTextIndentLength, tabSize, width, sb, additionalIndentLength, injectedTextsPerLine[i], inlineClassNamesPerLine[i]);
		firstNonWhitespaceIndices[i] = firstNonWhitespaceIndex;
		wrappedTextIndentLengths[i] = wrappedTextIndentLength;
		renderLineContents[i] = renderLineContent;
	}
	const html = sb.build();
	const trustedhtml = ttPolicy?.createHTML(html) ?? html;
	containerDomNode.innerHTML = trustedhtml as string;

	containerDomNode.style.position = 'absolute';
	containerDomNode.style.top = '10000px';
	containerDomNode.style.whiteSpace = 'pre-wrap';
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
		const breakOffsets: number[] | null = readLineBreaks(range, lineDomNode, renderLineContents[i]);
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

	containerDomNode.remove();
	return result;
}

const enum Constants {
	SPAN_MODULO_LIMIT = 16384
}

function renderLine(lineContent: string, initialVisibleColumn: number, tabSize: number, width: number, sb: StringBuilder, wrappingIndentLength: number, lineInjectedText: LineInjectedText[] | null, inlineClassNames: InlineClassName[] | null): number[] {
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
	const visibleColumns: number[] = [];
	let nextCharCode = (0 < len ? lineContent.charCodeAt(0) : CharCode.Null);

	const classNames = new Array<string>(len).fill('');
	if (inlineClassNames) {
		const inlineClassNamesLength = inlineClassNames.length;
		for (let i = 0; i < inlineClassNamesLength; i++) {
			const inlineClassName = inlineClassNames[i];
			const isWholeLine = inlineClassName.isWholeLine;
			const className = inlineClassName.className;
			const charStart = isWholeLine ? 0 : inlineClassName.startColumn - 1;
			const charEnd = isWholeLine ? inlineClassName.endColumn - 1 : Math.min(inlineClassName.endColumn - 1, len);

			for (let charIndex = charStart; charIndex < charEnd; charIndex++) {
				classNames[charIndex] = classNames[charIndex] += ' ' + className;
			}
		}
	}

	// Forxe the text to be aligned vertically. We use the middle alignment to
	// calculate whether or not a line is wrapped.
	const style = '<span style="vertical-align:middle !important"';
	sb.appendString('<span>');
	sb.appendString(style);
	sb.appendString('>');
	let previousClassName: string | undefined;
	for (let charIndex = 0; charIndex < len; charIndex++) {
		const className = classNames[charIndex];
		if (className !== previousClassName) {
			sb.appendString('</span>');
			sb.appendString(style);
			if (className) {
				sb.appendString(' class="');
				sb.appendString(className);
				sb.appendString('"');
			}
			sb.appendString('>');
			previousClassName = className;
		}
		if (charIndex !== 0 && charIndex % Constants.SPAN_MODULO_LIMIT === 0) {
			sb.appendString('</span></span><span><span>');
		}
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
	sb.appendString('</span></span>');

	visibleColumns[lineContent.length] = visibleColumn;

	sb.appendString('</div>');

	return visibleColumns;
}

function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string): number[] | null {
	if (lineContent.length <= 1) {
		return null;
	}

	const breakOffsets: number[] = [];
	let lineOffset = 0;
	let previousMiddle: number | undefined;

	try {
		for (const wrapper of lineDomNode.children) {
			for (const child of wrapper.children) {
				const textNode = child.firstChild;
				const length = textNode?.textContent?.length;
				if (length) {
					discoverBreaks(textNode, 0, length);
				}
			}
		}
	} catch (err) {
		console.log(err);
		return null;
	}

	if (breakOffsets.length === 0) {
		return null;
	}

	breakOffsets.push(lineContent.length);
	return breakOffsets;

	function discoverBreaks(node: ChildNode, low: number, high: number) {
		if (low === high) {
			return;
		}

		range.setStart(node, low);
		range.setEnd(node, high);

		const chunkSize = high - low;
		const rects = range.getClientRects();
		if (rects.length === 0) {
			lineOffset += chunkSize;
		} else if (rects.length === 1) {
			const rect = rects[0];
			const middle = (rect.top + rect.bottom) / 2;

			if (previousMiddle !== undefined && Math.abs(previousMiddle - middle) > 0.5) {
				breakOffsets.push(lineOffset);
			}

			previousMiddle = middle;
			lineOffset += chunkSize;
		} else {
			const middle = low + ((chunkSize / 2) | 0);

			discoverBreaks(node, low, middle);
			discoverBreaks(node, middle, high);
		}
	}
}
