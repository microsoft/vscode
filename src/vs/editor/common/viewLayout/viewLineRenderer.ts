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

export class RenderLineOutput {
	_renderLineOutputBrand: void;

	readonly charOffsetInPart: number[];
	readonly lastRenderedPartIndex: number;
	readonly output: string;
	readonly isWhitespaceOnly: boolean;

	constructor(charOffsetInPart: number[], lastRenderedPartIndex: number, output: string, isWhitespaceOnly: boolean) {
		this.charOffsetInPart = charOffsetInPart;
		this.lastRenderedPartIndex = lastRenderedPartIndex;
		this.output = output;
		this.isWhitespaceOnly = isWhitespaceOnly;
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
			[],
			0,
			// This is basically for IE's hit test to work
			'<span><span>&nbsp;</span></span>',
			true
		);
	}

	if (actualLineParts.length === 0) {
		throw new Error('Cannot render non empty line without line parts!');
	}

	return renderLineActual(lineText, lineTextLength, tabSize, spaceWidth, actualLineParts, renderWhitespace, renderControlCharacters, charBreakIndex);
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

function renderLineActual(lineText: string, lineTextLength: number, tabSize: number, spaceWidth: number, actualLineParts: ViewLineToken[], renderWhitespace: 'none' | 'boundary' | 'all', renderControlCharacters: boolean, charBreakIndex: number): RenderLineOutput {
	lineTextLength = +lineTextLength;
	tabSize = +tabSize;
	charBreakIndex = +charBreakIndex;

	let charIndex = 0;
	let out = '';
	let charOffsetInPartArr: number[] = [];
	let charOffsetInPart = 0;
	let tabsCharDelta = 0;
	let isWhitespaceOnly = /^\s*$/.test(lineText);

	out += '<span>';
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
				charOffsetInPartArr[charIndex] = charOffsetInPart;
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
					out += '<span class="token ' + part.type + '" style="width:' + (spaceWidth * partContentCnt) + 'px">';
					out += partContent;
					out += '&hellip;</span></span>';
					charOffsetInPartArr[charIndex] = charOffsetInPart;
					return new RenderLineOutput(
						charOffsetInPartArr,
						partIndex,
						out,
						isWhitespaceOnly
					);
				}
			}
			out += '<span class="token ' + part.type + '" style="width:' + (spaceWidth * partContentCnt) + 'px">';
			out += partContent;
			out += '</span>';
		} else {
			out += '<span class="token ';
			out += part.type;
			out += '">';

			for (; charIndex < toCharIndex; charIndex++) {
				charOffsetInPartArr[charIndex] = charOffsetInPart;
				let charCode = lineText.charCodeAt(charIndex);

				switch (charCode) {
					case CharCode.Tab:
						let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
						tabsCharDelta += insertSpacesCount - 1;
						charOffsetInPart += insertSpacesCount - 1;
						while (insertSpacesCount > 0) {
							out += '&nbsp;';
							insertSpacesCount--;
						}
						break;

					case CharCode.Space:
						out += '&nbsp;';
						break;

					case CharCode.LessThan:
						out += '&lt;';
						break;

					case CharCode.GreaterThan:
						out += '&gt;';
						break;

					case CharCode.Ampersand:
						out += '&amp;';
						break;

					case CharCode.Null:
						out += '&#00;';
						break;

					case CharCode.UTF8_BOM:
					case CharCode.LINE_SEPARATOR_2028:
						out += '\ufffd';
						break;

					case CharCode.CarriageReturn:
						// zero width space, because carriage return would introduce a line break
						out += '&#8203';
						break;

					default:
						if (renderControlCharacters && isControlCharacter(charCode)) {
							out += controlCharacterToPrintable(charCode);
						} else {
							out += lineText.charAt(charIndex);
						}
				}

				charOffsetInPart++;

				if (charIndex >= charBreakIndex) {
					out += '&hellip;</span></span>';
					charOffsetInPartArr[charIndex] = charOffsetInPart;
					return new RenderLineOutput(
						charOffsetInPartArr,
						partIndex,
						out,
						isWhitespaceOnly
					);
				}
			}

			out += '</span>';
		}

	}
	out += '</span>';

	// When getting client rects for the last character, we will position the
	// text range at the end of the span, insteaf of at the beginning of next span
	charOffsetInPartArr.push(charOffsetInPart);

	return new RenderLineOutput(
		charOffsetInPartArr,
		actualLineParts.length - 1,
		out,
		isWhitespaceOnly
	);
}
