/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILineBreaksComputerFactory, LineBreakData, ILineBreaksComputer } from 'vs/editor/common/viewModel/splitLinesCollection';
import { IComputedEditorOptions, EditorOption, WrappingIndent } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { createStringBuilder, IStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { Configuration } from 'vs/editor/browser/config/configuration';

export class DOMLineBreaksComputerFactory implements ILineBreaksComputerFactory {

	public static create(options: IComputedEditorOptions): DOMLineBreaksComputerFactory {
		return new DOMLineBreaksComputerFactory(
			options.get(EditorOption.fontInfo)
		);
	}

	private _fontInfo: FontInfo;

	constructor(fontInfo: FontInfo) {
		this._fontInfo = fontInfo;
	}

	public createLineBreaksComputer(tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent): ILineBreaksComputer {
		tabSize = tabSize | 0; //@perf
		wrappingColumn = +wrappingColumn; //@perf
		columnsForFullWidthChar = +columnsForFullWidthChar; //@perf

		let requests: string[] = [];
		return {
			addRequest: (lineText: string, previousLineBreakData: LineBreakData | null) => {
				requests.push(lineText);
			},
			finalize: () => {
				return createLineBreaks(this._fontInfo, tabSize, wrappingColumn, wrappingIndent, requests);
			}
		};
	}
}

function createLineBreaks(fontInfo: FontInfo, tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent, requests: string[]): (LineBreakData | null)[] {
	const width = Math.round(firstLineBreakColumn * fontInfo.typicalHalfwidthCharacterWidth);

	const containerDomNode = document.createElement('div');
	Configuration.applyFontInfoSlow(containerDomNode, fontInfo);
	containerDomNode.style.width = `${width}px`;

	const sb = createStringBuilder(10000);
	const charOffsets: number[][] = [];
	const visibleColumns: number[][] = [];
	for (let i = 0; i < requests.length; i++) {
		const r = renderLine(i, requests[i], tabSize, sb);
		charOffsets[i] = r[0];
		visibleColumns[i] = r[1];
	}
	containerDomNode.innerHTML = sb.build();

	containerDomNode.style.position = 'absolute';
	containerDomNode.style.right = '0';
	containerDomNode.style.bottom = '0';
	containerDomNode.style.zIndex = '10000';
	document.body.appendChild(containerDomNode);

	let range = document.createRange();
	const lineDomNodes = Array.prototype.slice.call(containerDomNode.children, 0);

	let result: (LineBreakData | null)[] = [];
	for (let i = 0; i < requests.length; i++) {
		const lineDomNode = lineDomNodes[i];
		result[i] = readLineBreaks(range, lineDomNode, requests[i], charOffsets[i], visibleColumns[i]);
	}

	document.body.removeChild(containerDomNode);
	return result;
}

function renderLine(lineIndex: number, lineContent: string, tabSize: number, sb: IStringBuilder): [number[], number[]] {
	sb.appendASCIIString('<div>');
	// if (containsRTL) {
	// 	sb.appendASCIIString('" dir="ltr');
	// }

	const len = lineContent.length;
	let visibleColumn = 0;
	let charOffset = 0;
	let charOffsets: number[] = [];
	let visibleColumns: number[] = [];
	let nextCharCode = (0 < len ? lineContent.charCodeAt(0) : CharCode.Null);

	for (let charIndex = 0; charIndex < len; charIndex++) {
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
						sb.write1(0xA0); // &nbsp;
					} else {
						sb.appendASCII(CharCode.Space);
					}
				}
				break;

			case CharCode.Space:
				if (nextCharCode === CharCode.Space) {
					sb.write1(0xA0); // &nbsp;
				} else {
					sb.appendASCII(CharCode.Space);
				}
				break;

			case CharCode.LessThan:
				sb.appendASCIIString('&lt;');
				break;

			case CharCode.GreaterThan:
				sb.appendASCIIString('&gt;');
				break;

			case CharCode.Ampersand:
				sb.appendASCIIString('&amp;');
				break;

			case CharCode.Null:
				sb.appendASCIIString('&#00;');
				break;

			case CharCode.UTF8_BOM:
			case CharCode.LINE_SEPARATOR_2028:
				sb.write1(0xFFFD);
				break;

			default:
				if (strings.isFullWidthCharacter(charCode)) {
					charWidth++;
				}
				// if (renderControlCharacters && charCode < 32) {
				// 	sb.write1(9216 + charCode);
				// } else {
				sb.write1(charCode);
			// }
		}

		charOffset += producedCharacters;
		visibleColumn += charWidth;
	}

	charOffsets[lineContent.length] = charOffset;
	visibleColumns[lineContent.length] = visibleColumn;

	sb.appendASCIIString('</div>');

	return [charOffsets, visibleColumns];
}

function readLineBreaks(range: Range, lineDomNode: HTMLDivElement, lineContent: string, charOffsets: number[], visibleColumns: number[]): LineBreakData | null {
	if (lineContent.length <= 1) {
		return null;
	}
	const textContentNode = lineDomNode.firstChild!;

	const breakOffsets: number[] = [];
	discoverBreaks(range, textContentNode, charOffsets, 0, null, lineContent.length - 1, null, breakOffsets);

	if (breakOffsets.length === 0) {
		return null;
	}

	breakOffsets.push(lineContent.length);

	const breakOffsetsVisibleColumn = [];
	for (let i = 0, len = breakOffsets.length; i < len; i++) {
		breakOffsetsVisibleColumn[i] = visibleColumns[breakOffsets[i]];
	}

	return new LineBreakData(breakOffsets, breakOffsetsVisibleColumn, 0);
}

type MaybeRects = ClientRectList | DOMRectList | null;

function discoverBreaks(range: Range, textContentNode: Node, charOffsets: number[], low: number, lowRects: MaybeRects, high: number, highRects: MaybeRects, result: number[]): void {
	if (low === high) {
		return;
	}

	lowRects = lowRects || readClientRect(range, textContentNode, charOffsets[low], charOffsets[low + 1]);
	highRects = highRects || readClientRect(range, textContentNode, charOffsets[high], charOffsets[high + 1]);

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
	const midRects = readClientRect(range, textContentNode, charOffsets[mid], charOffsets[mid + 1]);
	discoverBreaks(range, textContentNode, charOffsets, low, lowRects, mid, midRects, result);
	discoverBreaks(range, textContentNode, charOffsets, mid, midRects, high, highRects, result);
}

function readClientRect(range: Range, textContentNode: Node, startOffset: number, endOffset: number): ClientRectList | DOMRectList {
	range.setStart(textContentNode, startOffset);
	range.setEnd(textContentNode, endOffset);
	return range.getClientRects();
}
