/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { CharCode } from 'vs/base/common/charCode';
import { LineParts } from 'vs/editor/common/core/lineParts';

export class RenderLineInput {
	_renderLineInputBrand: void;

	lineContent: string;
	tabSize: number;
	spaceWidth: number;
	stopRenderingLineAfter: number;
	renderWhitespace: 'none' | 'boundary' | 'all';
	renderControlCharacters: boolean;
	lineParts: LineParts;

	constructor(
		lineContent: string,
		tabSize: number,
		spaceWidth: number,
		stopRenderingLineAfter: number,
		renderWhitespace: 'none' | 'boundary' | 'all',
		renderControlCharacters: boolean,
		lineParts: LineParts
	) {
		this.lineContent = lineContent;
		this.tabSize = tabSize;
		this.spaceWidth = spaceWidth;
		this.stopRenderingLineAfter = stopRenderingLineAfter;
		this.renderWhitespace = renderWhitespace;
		this.renderControlCharacters = renderControlCharacters;
		this.lineParts = lineParts;
	}

	public equals(other: RenderLineInput): boolean {
		return (
			this.lineContent === other.lineContent
			&& this.tabSize === other.tabSize
			&& this.spaceWidth === other.spaceWidth
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.lineParts.equals(other.lineParts)
		);
	}
}

export const enum CharacterMappingConstants {
	PART_INDEX_MASK = 0b11111111111111110000000000000000,
	CHAR_INDEX_MASK = 0b00000000000000001111111111111111,

	CHAR_INDEX_OFFSET = 0,
	PART_INDEX_OFFSET = 16
}

/**
 * Provides a both direction mapping between a line's character and its rendered position.
 */
export class CharacterMapping {

	public static getPartIndex(partData: number): number {
		return (partData & CharacterMappingConstants.PART_INDEX_MASK) >>> CharacterMappingConstants.PART_INDEX_OFFSET;
	}

	public static getCharIndex(partData: number): number {
		return (partData & CharacterMappingConstants.CHAR_INDEX_MASK) >>> CharacterMappingConstants.CHAR_INDEX_OFFSET;
	}

	private readonly _data: Uint32Array;
	public readonly length: number;

	constructor(length: number) {
		this.length = length;
		this._data = new Uint32Array(this.length);
	}

	public setPartData(charOffset: number, partIndex: number, charIndex: number): void {
		let partData = (
			(partIndex << CharacterMappingConstants.PART_INDEX_OFFSET)
			| (charIndex << CharacterMappingConstants.CHAR_INDEX_OFFSET)
		) >>> 0;
		this._data[charOffset] = partData;
	}

	public charOffsetToPartData(charOffset: number): number {
		if (this.length === 0) {
			return 0;
		}
		if (charOffset < 0) {
			return this._data[0];
		}
		if (charOffset >= this.length) {
			return this._data[this.length - 1];
		}
		return this._data[charOffset];
	}

	public partDataToCharOffset(partIndex: number, partLength: number, charIndex: number): number {
		if (this.length === 0) {
			return 0;
		}

		let searchEntry = (
			(partIndex << CharacterMappingConstants.PART_INDEX_OFFSET)
			| (charIndex << CharacterMappingConstants.CHAR_INDEX_OFFSET)
		) >>> 0;

		let min = 0;
		let max = this.length - 1;
		while (min + 1 < max) {
			let mid = ((min + max) >>> 1);
			let midEntry = this._data[mid];
			if (midEntry === searchEntry) {
				return mid;
			} else if (midEntry > searchEntry) {
				max = mid;
			} else {
				min = mid;
			}
		}

		if (min === max) {
			return min;
		}

		let minEntry = this._data[min];
		let maxEntry = this._data[max];

		if (minEntry === searchEntry) {
			return min;
		}
		if (maxEntry === searchEntry) {
			return max;
		}

		let minPartIndex = CharacterMapping.getPartIndex(minEntry);
		let minCharIndex = CharacterMapping.getCharIndex(minEntry);

		let maxPartIndex = CharacterMapping.getPartIndex(maxEntry);
		let maxCharIndex: number;

		if (minPartIndex !== maxPartIndex) {
			// sitting between parts
			maxCharIndex = partLength;
		} else {
			maxCharIndex = CharacterMapping.getCharIndex(maxEntry);
		}

		let minEntryDistance = charIndex - minCharIndex;
		let maxEntryDistance = maxCharIndex - charIndex;

		if (minEntryDistance <= maxEntryDistance) {
			return min;
		}
		return max;
	}
}

export class RenderLineOutput {
	_renderLineOutputBrand: void;

	readonly characterMapping: CharacterMapping;
	readonly output: string;

	constructor(characterMapping: CharacterMapping, output: string) {
		this.characterMapping = characterMapping;
		this.output = output;
	}
}

export function renderLine(input: RenderLineInput): RenderLineOutput {
	const lineText = input.lineContent;
	const lineTextLength = lineText.length;
	const tabSize = input.tabSize;
	const spaceWidth = input.spaceWidth;
	const actualLineParts = input.lineParts.parts;
	const renderWhitespace = input.renderWhitespace;
	const renderControlCharacters = input.renderControlCharacters;
	const charBreakIndex = (input.stopRenderingLineAfter === -1 ? lineTextLength : input.stopRenderingLineAfter - 1);

	if (lineTextLength === 0) {
		return new RenderLineOutput(
			new CharacterMapping(0),
			// This is basically for IE's hit test to work
			'<span><span>&nbsp;</span></span>'
		);
	}

	if (actualLineParts.length === 0) {
		throw new Error('Cannot render non empty line without line parts!');
	}

	let viewParts = toViewParts(lineText, lineTextLength, tabSize, spaceWidth, actualLineParts, renderWhitespace, renderControlCharacters, charBreakIndex);
	return renderViewParts(viewParts);

	// return renderLineActual(lineText, lineTextLength, tabSize, spaceWidth, actualLineParts, renderWhitespace, renderControlCharacters, charBreakIndex);
}

function isWhitespace(type: string): boolean {
	return (type.indexOf('vs-whitespace') >= 0);
}

function isControlCharacter(characterCode: number): boolean {
	return characterCode < 32;
}

const _controlCharacterSequenceConversionStart = 9216;
function controlCharacterToPrintable(characterCode: number): string {
	return String.fromCharCode(_controlCharacterSequenceConversionStart + characterCode);
}

class ViewPart2 {
	public readonly className: string;
	public readonly htmlContent: string;
	public readonly forceWidth: number;

	constructor(className: string, htmlContent: string, forceWidth: number) {
		this.className = className;
		this.htmlContent = htmlContent;
		this.forceWidth = forceWidth;
	}
}

class ViewParts2 {
	public readonly parts: ViewPart2[];
	public readonly characterMapping: CharacterMapping;

	constructor(parts: ViewPart2[], characterMapping: CharacterMapping) {
		this.parts = parts;
		this.characterMapping = characterMapping;
	}
}

function toViewParts(lineText: string, lineTextLength: number, tabSize: number, spaceWidth: number, actualLineParts: ViewLineToken[], renderWhitespace: 'none' | 'boundary' | 'all', renderControlCharacters: boolean, charBreakIndex: number): ViewParts2 {
	lineTextLength = +lineTextLength;
	tabSize = +tabSize;
	charBreakIndex = +charBreakIndex;

	let charIndex = 0;
	let charOffsetInPart = 0;
	let tabsCharDelta = 0;

	let characterMapping = new CharacterMapping(Math.min(lineTextLength, charBreakIndex) + 1);

	let result: ViewPart2[] = [], resultLen = 0;
	for (let partIndex = 0, partIndexLen = actualLineParts.length; partIndex < partIndexLen; partIndex++) {
		let part = actualLineParts[partIndex];

		let parsRendersWhitespace = (renderWhitespace !== 'none' && isWhitespace(part.type));

		let toCharIndex = lineTextLength;
		if (partIndex + 1 < partIndexLen) {
			let nextPart = actualLineParts[partIndex + 1];
			toCharIndex = Math.min(lineTextLength, nextPart.startIndex);
		}

		charOffsetInPart = 0;
		if (parsRendersWhitespace) {

			let partContentCnt = 0;
			let partContent = '';
			for (; charIndex < toCharIndex; charIndex++) {
				characterMapping.setPartData(charIndex, partIndex, charOffsetInPart);
				let charCode = lineText.charCodeAt(charIndex);

				if (charCode === CharCode.Tab) {
					let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					charOffsetInPart += insertSpacesCount - 1;
					if (insertSpacesCount > 0) {
						partContent += '&rarr;';
						partContentCnt++;
						insertSpacesCount--;
					}
					while (insertSpacesCount > 0) {
						partContent += '&nbsp;';
						partContentCnt++;
						insertSpacesCount--;
					}
				} else {
					// must be CharCode.Space
					partContent += '&middot;';
					partContentCnt++;
				}

				charOffsetInPart++;

				if (charIndex >= charBreakIndex) {
					result[resultLen++] = new ViewPart2(part.type, partContent + '&hellip;', 0);
					characterMapping.setPartData(charIndex, partIndex, charOffsetInPart);
					return new ViewParts2(result, characterMapping);
				}
			}
			result[resultLen++] = new ViewPart2(part.type, partContent, (spaceWidth * partContentCnt));
		} else {
			let partContent = '';

			for (; charIndex < toCharIndex; charIndex++) {
				characterMapping.setPartData(charIndex, partIndex, charOffsetInPart);
				let charCode = lineText.charCodeAt(charIndex);

				switch (charCode) {
					case CharCode.Tab:
						let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
						tabsCharDelta += insertSpacesCount - 1;
						charOffsetInPart += insertSpacesCount - 1;
						while (insertSpacesCount > 0) {
							partContent += '&nbsp;';
							insertSpacesCount--;
						}
						break;

					case CharCode.Space:
						partContent += '&nbsp;';
						break;

					case CharCode.LessThan:
						partContent += '&lt;';
						break;

					case CharCode.GreaterThan:
						partContent += '&gt;';
						break;

					case CharCode.Ampersand:
						partContent += '&amp;';
						break;

					case CharCode.Null:
						partContent += '&#00;';
						break;

					case CharCode.UTF8_BOM:
					case CharCode.LINE_SEPARATOR_2028:
						partContent += '\ufffd';
						break;

					case CharCode.CarriageReturn:
						// zero width space, because carriage return would introduce a line break
						partContent += '&#8203';
						break;

					default:
						if (renderControlCharacters && isControlCharacter(charCode)) {
							partContent += controlCharacterToPrintable(charCode);
						} else {
							partContent += lineText.charAt(charIndex);
						}
				}

				charOffsetInPart++;

				if (charIndex >= charBreakIndex) {
					result[resultLen++] = new ViewPart2(part.type, partContent + '&hellip;', 0);
					characterMapping.setPartData(charIndex, partIndex, charOffsetInPart);
					return new ViewParts2(result, characterMapping);
				}
			}
			result[resultLen++] = new ViewPart2(part.type, partContent, 0);
		}
	}

	// When getting client rects for the last character, we will position the
	// text range at the end of the span, insteaf of at the beginning of next span
	characterMapping.setPartData(lineTextLength, actualLineParts.length - 1, charOffsetInPart);

	return new ViewParts2(result, characterMapping);
}

function renderViewParts(viewParts: ViewParts2): RenderLineOutput {
	const parts = viewParts.parts;

	let out = '<span>';
	for (let i = 0, len = parts.length; i < len; i++) {
		let part = parts[i];
		if (part.forceWidth) {
			out += `<span class="${part.className}" style="width:${part.forceWidth}px">${part.htmlContent}</span>`;
		} else {
			out += `<span class="${part.className}">${part.htmlContent}</span>`;
		}
	}
	out += '</span>';

	return new RenderLineOutput(viewParts.characterMapping, out);
}
