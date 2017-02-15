/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { CharCode } from 'vs/base/common/charCode';
import { Decoration, LineDecorationsNormalizer } from 'vs/editor/common/viewLayout/viewLineParts';
import * as strings from 'vs/base/common/strings';

export const enum RenderWhitespace {
	None = 0,
	Boundary = 1,
	All = 2
}

export class RenderLineInput {

	public readonly useMonospaceOptimizations: boolean;
	public readonly lineContent: string;
	public readonly mightContainRTL: boolean;
	public readonly fauxIndentLength: number;
	public readonly lineTokens: ViewLineToken[];
	public readonly lineDecorations: Decoration[];
	public readonly tabSize: number;
	public readonly spaceWidth: number;
	public readonly stopRenderingLineAfter: number;
	public readonly renderWhitespace: RenderWhitespace;
	public readonly renderControlCharacters: boolean;

	constructor(
		useMonospaceOptimizations: boolean,
		lineContent: string,
		mightContainRTL: boolean,
		fauxIndentLength: number,
		lineTokens: ViewLineToken[],
		lineDecorations: Decoration[],
		tabSize: number,
		spaceWidth: number,
		stopRenderingLineAfter: number,
		renderWhitespace: 'none' | 'boundary' | 'all',
		renderControlCharacters: boolean,
	) {
		this.useMonospaceOptimizations = useMonospaceOptimizations;
		this.lineContent = lineContent;
		this.mightContainRTL = mightContainRTL;
		this.fauxIndentLength = fauxIndentLength;
		this.lineTokens = lineTokens;
		this.lineDecorations = lineDecorations;
		this.tabSize = tabSize;
		this.spaceWidth = spaceWidth;
		this.stopRenderingLineAfter = stopRenderingLineAfter;
		this.renderWhitespace = (
			renderWhitespace === 'all'
				? RenderWhitespace.All
				: renderWhitespace === 'boundary'
					? RenderWhitespace.Boundary
					: RenderWhitespace.None
		);
		this.renderControlCharacters = renderControlCharacters;
	}

	public equals(other: RenderLineInput): boolean {
		return (
			this.useMonospaceOptimizations === other.useMonospaceOptimizations
			&& this.lineContent === other.lineContent
			&& this.mightContainRTL === other.mightContainRTL
			&& this.fauxIndentLength === other.fauxIndentLength
			&& this.tabSize === other.tabSize
			&& this.spaceWidth === other.spaceWidth
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& Decoration.equalsArr(this.lineDecorations, other.lineDecorations)
			&& ViewLineToken.equalsArr(this.lineTokens, other.lineTokens)
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

	private readonly _partLengths: Uint16Array;

	constructor(length: number, partCount: number) {
		this.length = length;
		this._data = new Uint32Array(this.length);
		this._partLengths = new Uint16Array(partCount);
	}

	public setPartData(charOffset: number, partIndex: number, charIndex: number): void {
		let partData = (
			(partIndex << CharacterMappingConstants.PART_INDEX_OFFSET)
			| (charIndex << CharacterMappingConstants.CHAR_INDEX_OFFSET)
		) >>> 0;
		this._data[charOffset] = partData;
	}

	public setPartLength(partIndex: number, length: number): void {
		this._partLengths[partIndex] = length;
	}

	public getPartLengths(): Uint16Array {
		return this._partLengths;
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
	readonly html: string;
	readonly containsRTL: boolean;
	readonly containsForeignElements: boolean;

	constructor(characterMapping: CharacterMapping, html: string, containsRTL: boolean, containsForeignElements: boolean) {
		this.characterMapping = characterMapping;
		this.html = html;
		this.containsRTL = containsRTL;
		this.containsForeignElements = containsForeignElements;
	}
}

export function renderViewLine(input: RenderLineInput): RenderLineOutput {
	if (input.lineContent.length === 0) {
		return new RenderLineOutput(
			new CharacterMapping(0, 0),
			// This is basically for IE's hit test to work
			'<span><span>&nbsp;</span></span>',
			false,
			false
		);
	}

	return _renderLine(resolveRenderLineInput(input));
}

class ResolvedRenderLineInput {
	constructor(
		public readonly fontIsMonospace: boolean,
		public readonly lineContent: string,
		public readonly len: number,
		public readonly isOverflowing: boolean,
		public readonly tokens: ViewLineToken[],
		public readonly containsForeignElements: boolean,
		public readonly tabSize: number,
		public readonly containsRTL: boolean,
		public readonly spaceWidth: number,
		public readonly renderWhitespace: RenderWhitespace,
		public readonly renderControlCharacters: boolean,
	) {
		//
	}
}

function resolveRenderLineInput(input: RenderLineInput): ResolvedRenderLineInput {
	const useMonospaceOptimizations = input.useMonospaceOptimizations;
	const lineContent = input.lineContent;

	let isOverflowing: boolean;
	let len: number;

	if (input.stopRenderingLineAfter !== -1 && input.stopRenderingLineAfter < lineContent.length) {
		isOverflowing = true;
		len = input.stopRenderingLineAfter;
	} else {
		isOverflowing = false;
		len = lineContent.length;
	}

	let tokens = removeOverflowing(input.lineTokens, len);
	if (input.renderWhitespace === RenderWhitespace.All || input.renderWhitespace === RenderWhitespace.Boundary) {
		tokens = _applyRenderWhitespace(lineContent, len, tokens, input.fauxIndentLength, input.tabSize, useMonospaceOptimizations, input.renderWhitespace === RenderWhitespace.Boundary);
	}
	let containsForeignElements = false;
	if (input.lineDecorations.length > 0) {
		for (let i = 0, len = input.lineDecorations.length; i < len; i++) {
			const lineDecoration = input.lineDecorations[i];
			if (lineDecoration.insertsBeforeOrAfter) {
				containsForeignElements = true;
				break;
			}
		}
		tokens = _applyInlineDecorations(lineContent, len, tokens, input.lineDecorations);
	}
	let containsRTL = false;
	if (input.mightContainRTL) {
		containsRTL = strings.containsRTL(lineContent);
	}
	if (!containsRTL) {
		tokens = splitLargeTokens(tokens);
	}

	return new ResolvedRenderLineInput(
		useMonospaceOptimizations,
		lineContent,
		len,
		isOverflowing,
		tokens,
		containsForeignElements,
		input.tabSize,
		containsRTL,
		input.spaceWidth,
		input.renderWhitespace,
		input.renderControlCharacters
	);
}

/**
 * In the rendering phase, characters are always looped until token.endIndex.
 * Ensure that all tokens end before `len` and the last one ends precisely at `len`.
 */
function removeOverflowing(tokens: ViewLineToken[], len: number): ViewLineToken[] {
	if (tokens.length === 0) {
		return tokens;
	}
	if (tokens[tokens.length - 1].endIndex === len) {
		return tokens;
	}
	let result: ViewLineToken[] = [];
	for (let tokenIndex = 0, tokensLen = tokens.length; tokenIndex < tokensLen; tokenIndex++) {
		const endIndex = tokens[tokenIndex].endIndex;
		if (endIndex === len) {
			result[tokenIndex] = tokens[tokenIndex];
			break;
		}
		if (endIndex > len) {
			result[tokenIndex] = new ViewLineToken(len, tokens[tokenIndex].type);
			break;
		}
		result[tokenIndex] = tokens[tokenIndex];
	}
	return result;
}

/**
 * written as a const enum to get value inlining.
 */
const enum Constants {
	LongToken = 50
}

/**
 * See https://github.com/Microsoft/vscode/issues/6885.
 * It appears that having very large spans causes very slow reading of character positions.
 * So here we try to avoid that.
 */
function splitLargeTokens(tokens: ViewLineToken[]): ViewLineToken[] {
	let lastTokenEndIndex = 0;
	let result: ViewLineToken[] = [], resultLen = 0;
	for (let i = 0, len = tokens.length; i < len; i++) {
		const token = tokens[i];
		const tokenEndIndex = token.endIndex;
		let diff = (tokenEndIndex - lastTokenEndIndex);
		if (diff > Constants.LongToken) {
			const tokenType = token.type;
			const piecesCount = Math.ceil(diff / Constants.LongToken);
			for (let j = 1; j < piecesCount; j++) {
				let pieceEndIndex = lastTokenEndIndex + (j * Constants.LongToken);
				result[resultLen++] = new ViewLineToken(pieceEndIndex, tokenType);
			}
			result[resultLen++] = new ViewLineToken(tokenEndIndex, tokenType);
		} else {
			result[resultLen++] = token;
		}
		lastTokenEndIndex = tokenEndIndex;
	}

	return result;
}

/**
 * Whitespace is rendered by "replacing" tokens with a special-purpose `vs-whitespace` type that is later recognized in the rendering phase.
 * Moreover, a token is created for every visual indent because on some fonts the glyphs used for rendering whitespace (&rarr; or &middot;) do not have the same width as &nbsp;.
 * The rendering phase will generate `style="width:..."` for these tokens.
 */
function _applyRenderWhitespace(lineContent: string, len: number, tokens: ViewLineToken[], fauxIndentLength: number, tabSize: number, useMonospaceOptimizations: boolean, onlyBoundary: boolean): ViewLineToken[] {

	let result: ViewLineToken[] = [], resultLen = 0;
	let tokenIndex = 0;
	let tokenType = tokens[tokenIndex].type;
	let tokenEndIndex = tokens[tokenIndex].endIndex;

	if (fauxIndentLength > 0) {
		result[resultLen++] = new ViewLineToken(fauxIndentLength, '');
	}

	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
	let lastNonWhitespaceIndex: number;
	if (firstNonWhitespaceIndex === -1) {
		// The entire line is whitespace
		firstNonWhitespaceIndex = len;
		lastNonWhitespaceIndex = len;
	} else {
		lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
	}

	let tmpIndent = 0;
	for (let charIndex = 0; charIndex < fauxIndentLength; charIndex++) {
		const chCode = lineContent.charCodeAt(charIndex);
		if (chCode === CharCode.Tab) {
			tmpIndent = tabSize;
		} else {
			tmpIndent++;
		}
	}
	tmpIndent = tmpIndent % tabSize;

	let wasInWhitespace = false;
	for (let charIndex = fauxIndentLength; charIndex < len; charIndex++) {
		const chCode = lineContent.charCodeAt(charIndex);

		let isInWhitespace: boolean;
		if (charIndex < firstNonWhitespaceIndex || charIndex > lastNonWhitespaceIndex) {
			// in leading or trailing whitespace
			isInWhitespace = true;
		} else if (chCode === CharCode.Tab) {
			// a tab character is rendered both in all and boundary cases
			isInWhitespace = true;
		} else if (chCode === CharCode.Space) {
			// hit a space character
			if (onlyBoundary) {
				// rendering only boundary whitespace
				if (wasInWhitespace) {
					isInWhitespace = true;
				} else {
					const nextChCode = (charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : CharCode.Null);
					isInWhitespace = (nextChCode === CharCode.Space || nextChCode === CharCode.Tab);
				}
			} else {
				isInWhitespace = true;
			}
		} else {
			isInWhitespace = false;
		}

		if (wasInWhitespace) {
			// was in whitespace token
			if (!isInWhitespace || (!useMonospaceOptimizations && tmpIndent >= tabSize)) {
				// leaving whitespace token or entering a new indent
				result[resultLen++] = new ViewLineToken(charIndex, 'vs-whitespace');
				tmpIndent = tmpIndent % tabSize;
			}
		} else {
			// was in regular token
			if (charIndex === tokenEndIndex || (isInWhitespace && charIndex > fauxIndentLength)) {
				result[resultLen++] = new ViewLineToken(charIndex, tokenType);
				tmpIndent = tmpIndent % tabSize;
			}
		}

		if (chCode === CharCode.Tab) {
			tmpIndent = tabSize;
		} else {
			tmpIndent++;
		}

		wasInWhitespace = isInWhitespace;

		if (charIndex === tokenEndIndex) {
			tokenIndex++;
			tokenType = tokens[tokenIndex].type;
			tokenEndIndex = tokens[tokenIndex].endIndex;
		}
	}

	if (wasInWhitespace) {
		// was in whitespace token
		result[resultLen++] = new ViewLineToken(len, 'vs-whitespace');
	} else {
		// was in regular token
		result[resultLen++] = new ViewLineToken(len, tokenType);
	}

	return result;
}

/**
 * Inline decorations are "merged" on top of tokens.
 * Special care must be taken when multiple inline decorations are at play and they overlap.
 */
function _applyInlineDecorations(lineContent: string, len: number, tokens: ViewLineToken[], _lineDecorations: Decoration[]): ViewLineToken[] {
	_lineDecorations.sort(Decoration.compare);
	const lineDecorations = LineDecorationsNormalizer.normalize(_lineDecorations);
	const lineDecorationsLen = lineDecorations.length;

	let lineDecorationIndex = 0;
	let result: ViewLineToken[] = [], resultLen = 0, lastResultEndIndex = 0;
	for (let tokenIndex = 0, len = tokens.length; tokenIndex < len; tokenIndex++) {
		const token = tokens[tokenIndex];
		const tokenEndIndex = token.endIndex;
		const tokenType = token.type;

		while (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset < tokenEndIndex) {
			const lineDecoration = lineDecorations[lineDecorationIndex];

			if (lineDecoration.startOffset > lastResultEndIndex) {
				lastResultEndIndex = lineDecoration.startOffset;
				result[resultLen++] = new ViewLineToken(lastResultEndIndex, tokenType);
			}

			if (lineDecoration.endOffset + 1 <= tokenEndIndex) {
				// This line decoration ends before this token ends
				lastResultEndIndex = lineDecoration.endOffset + 1;
				result[resultLen++] = new ViewLineToken(lastResultEndIndex, tokenType + ' ' + lineDecoration.className);
				lineDecorationIndex++;
			} else {
				// This line decoration continues on to the next token
				lastResultEndIndex = tokenEndIndex;
				result[resultLen++] = new ViewLineToken(lastResultEndIndex, tokenType + ' ' + lineDecoration.className);
				break;
			}
		}

		if (tokenEndIndex > lastResultEndIndex) {
			lastResultEndIndex = tokenEndIndex;
			result[resultLen++] = new ViewLineToken(lastResultEndIndex, tokenType);
		}
	}

	return result;
}

/**
 * This function is on purpose not split up into multiple functions to allow runtime type inference (i.e. performance reasons).
 * Notice how all the needed data is fully resolved and passed in (i.e. no other calls).
 */
function _renderLine(input: ResolvedRenderLineInput): RenderLineOutput {
	const fontIsMonospace = input.fontIsMonospace;
	const containsForeignElements = input.containsForeignElements;
	const lineContent = input.lineContent;
	const len = input.len;
	const isOverflowing = input.isOverflowing;
	const tokens = input.tokens;
	const tabSize = input.tabSize;
	const containsRTL = input.containsRTL;
	const spaceWidth = input.spaceWidth;
	const renderWhitespace = input.renderWhitespace;
	const renderControlCharacters = input.renderControlCharacters;

	const characterMapping = new CharacterMapping(len + 1, tokens.length);

	let charIndex = 0;
	let tabsCharDelta = 0;
	let charOffsetInPart = 0;

	let out = '<span>';
	for (let tokenIndex = 0, tokensLen = tokens.length; tokenIndex < tokensLen; tokenIndex++) {
		const token = tokens[tokenIndex];
		const tokenEndIndex = token.endIndex;
		const tokenType = token.type;
		const tokenRendersWhitespace = (renderWhitespace !== RenderWhitespace.None && (tokenType.indexOf('vs-whitespace') >= 0));
		charOffsetInPart = 0;

		if (tokenRendersWhitespace) {

			let partContentCnt = 0;
			let partContent = '';
			for (; charIndex < tokenEndIndex; charIndex++) {
				characterMapping.setPartData(charIndex, tokenIndex, charOffsetInPart);
				const charCode = lineContent.charCodeAt(charIndex);

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
			}

			characterMapping.setPartLength(tokenIndex, partContentCnt);
			if (fontIsMonospace) {
				out += `<span class="${tokenType}">${partContent}</span>`;
			} else {
				out += `<span class="${tokenType}" style="width:${spaceWidth * partContentCnt}px">${partContent}</span>`;
			}

		} else {

			let partContentCnt = 0;
			let partContent = '';

			for (; charIndex < tokenEndIndex; charIndex++) {
				characterMapping.setPartData(charIndex, tokenIndex, charOffsetInPart);
				const charCode = lineContent.charCodeAt(charIndex);

				switch (charCode) {
					case CharCode.Tab:
						let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
						tabsCharDelta += insertSpacesCount - 1;
						charOffsetInPart += insertSpacesCount - 1;
						while (insertSpacesCount > 0) {
							partContent += '&nbsp;';
							partContentCnt++;
							insertSpacesCount--;
						}
						break;

					case CharCode.Space:
						partContent += '&nbsp;';
						partContentCnt++;
						break;

					case CharCode.LessThan:
						partContent += '&lt;';
						partContentCnt++;
						break;

					case CharCode.GreaterThan:
						partContent += '&gt;';
						partContentCnt++;
						break;

					case CharCode.Ampersand:
						partContent += '&amp;';
						partContentCnt++;
						break;

					case CharCode.Null:
						partContent += '&#00;';
						partContentCnt++;
						break;

					case CharCode.UTF8_BOM:
					case CharCode.LINE_SEPARATOR_2028:
						partContent += '\ufffd';
						partContentCnt++;
						break;

					case CharCode.CarriageReturn:
						// zero width space, because carriage return would introduce a line break
						partContent += '&#8203';
						partContentCnt++;
						break;

					default:
						if (renderControlCharacters && charCode < 32) {
							partContent += String.fromCharCode(9216 + charCode);
							partContentCnt++;
						} else {
							partContent += String.fromCharCode(charCode);
							partContentCnt++;
						}
				}

				charOffsetInPart++;
			}

			characterMapping.setPartLength(tokenIndex, partContentCnt);
			if (containsRTL) {
				out += `<span dir="ltr" class="${tokenType}">${partContent}</span>`;
			} else {
				out += `<span class="${tokenType}">${partContent}</span>`;
			}

		}
	}

	// When getting client rects for the last character, we will position the
	// text range at the end of the span, insteaf of at the beginning of next span
	characterMapping.setPartData(len, tokens.length - 1, charOffsetInPart);

	if (isOverflowing) {
		out += `<span class="vs-whitespace">&hellip;</span>`;
	}

	out += '</span>';

	return new RenderLineOutput(characterMapping, out, containsRTL, containsForeignElements);
}
