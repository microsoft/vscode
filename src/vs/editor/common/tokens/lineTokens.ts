/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageIdCodec } from '../languages.js';
import { FontStyle, ColorId, StandardTokenType, MetadataConsts, ITokenPresentation, TokenMetadata } from '../encodedTokenAttributes.js';
import { IPosition } from '../core/position.js';
import { ITextModel } from '../model.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { onUnexpectedError } from '../../../base/common/errors.js';


export interface IViewLineTokens {
	languageIdCodec: ILanguageIdCodec;
	equals(other: IViewLineTokens): boolean;
	getCount(): number;
	getStandardTokenType(tokenIndex: number): StandardTokenType;
	getForeground(tokenIndex: number): ColorId;
	getEndOffset(tokenIndex: number): number;
	getClassName(tokenIndex: number): string;
	getInlineStyle(tokenIndex: number, colorMap: string[]): string;
	getPresentation(tokenIndex: number): ITokenPresentation;
	findTokenIndexAtOffset(offset: number): number;
	getLineContent(): string;
	getMetadata(tokenIndex: number): number;
	getLanguageId(tokenIndex: number): string;
	getTokenText(tokenIndex: number): string;
	forEach(callback: (tokenIndex: number) => void): void;
}

export class LineTokens implements IViewLineTokens {
	public static createEmpty(lineContent: string, decoder: ILanguageIdCodec): LineTokens {
		const defaultMetadata = LineTokens.defaultTokenMetadata;

		const tokens = new Uint32Array(2);
		tokens[0] = lineContent.length;
		tokens[1] = defaultMetadata;

		return new LineTokens(tokens, lineContent, decoder);
	}

	public static createFromTextAndMetadata(data: { text: string; metadata: number }[], decoder: ILanguageIdCodec): LineTokens {
		let offset: number = 0;
		let fullText: string = '';
		const tokens = new Array<number>();
		for (const { text, metadata } of data) {
			tokens.push(offset + text.length, metadata);
			offset += text.length;
			fullText += text;
		}
		return new LineTokens(new Uint32Array(tokens), fullText, decoder);
	}

	public static convertToEndOffset(tokens: Uint32Array, lineTextLength: number): void {
		const tokenCount = (tokens.length >>> 1);
		const lastTokenIndex = tokenCount - 1;
		for (let tokenIndex = 0; tokenIndex < lastTokenIndex; tokenIndex++) {
			tokens[tokenIndex << 1] = tokens[(tokenIndex + 1) << 1];
		}
		tokens[lastTokenIndex << 1] = lineTextLength;
	}

	public static findIndexInTokensArray(tokens: Uint32Array, desiredIndex: number): number {
		if (tokens.length <= 2) {
			return 0;
		}

		let low = 0;
		let high = (tokens.length >>> 1) - 1;

		while (low < high) {

			const mid = low + Math.floor((high - low) / 2);
			const endOffset = tokens[(mid << 1)];

			if (endOffset === desiredIndex) {
				return mid + 1;
			} else if (endOffset < desiredIndex) {
				low = mid + 1;
			} else if (endOffset > desiredIndex) {
				high = mid;
			}
		}

		return low;
	}

	_lineTokensBrand: void = undefined;

	private readonly _tokens: Uint32Array;
	private readonly _tokensCount: number;
	private readonly _text: string;

	public readonly languageIdCodec: ILanguageIdCodec;

	public static defaultTokenMetadata = (
		(FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;

	constructor(tokens: Uint32Array, text: string, decoder: ILanguageIdCodec) {
		const tokensLength = tokens.length > 1 ? tokens[tokens.length - 2] : 0;
		if (tokensLength !== text.length) {
			onUnexpectedError(new Error('Token length and text length do not match!'));
		}
		this._tokens = tokens;
		this._tokensCount = (this._tokens.length >>> 1);
		this._text = text;
		this.languageIdCodec = decoder;
	}

	public getTextLength(): number {
		return this._text.length;
	}

	public equals(other: IViewLineTokens): boolean {
		if (other instanceof LineTokens) {
			return this.slicedEquals(other, 0, this._tokensCount);
		}
		return false;
	}

	public slicedEquals(other: LineTokens, sliceFromTokenIndex: number, sliceTokenCount: number): boolean {
		if (this._text !== other._text) {
			return false;
		}
		if (this._tokensCount !== other._tokensCount) {
			return false;
		}
		const from = (sliceFromTokenIndex << 1);
		const to = from + (sliceTokenCount << 1);
		for (let i = from; i < to; i++) {
			if (this._tokens[i] !== other._tokens[i]) {
				return false;
			}
		}
		return true;
	}

	public getLineContent(): string {
		return this._text;
	}

	public getCount(): number {
		return this._tokensCount;
	}

	public getStartOffset(tokenIndex: number): number {
		if (tokenIndex > 0) {
			return this._tokens[(tokenIndex - 1) << 1];
		}
		return 0;
	}

	public getMetadata(tokenIndex: number): number {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return metadata;
	}

	public getLanguageId(tokenIndex: number): string {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		const languageId = TokenMetadata.getLanguageId(metadata);
		return this.languageIdCodec.decodeLanguageId(languageId);
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getTokenType(metadata);
	}

	public getForeground(tokenIndex: number): ColorId {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getForeground(metadata);
	}

	public getClassName(tokenIndex: number): string {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getClassNameFromMetadata(metadata);
	}

	public getInlineStyle(tokenIndex: number, colorMap: string[]): string {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getInlineStyleFromMetadata(metadata, colorMap);
	}

	public getPresentation(tokenIndex: number): ITokenPresentation {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getPresentationFromMetadata(metadata);
	}

	public getEndOffset(tokenIndex: number): number {
		return this._tokens[tokenIndex << 1];
	}

	/**
	 * Find the token containing offset `offset`.
	 * @param offset The search offset
	 * @return The index of the token containing the offset.
	 */
	public findTokenIndexAtOffset(offset: number): number {
		return LineTokens.findIndexInTokensArray(this._tokens, offset);
	}

	public inflate(): IViewLineTokens {
		return this;
	}

	public sliceAndInflate(startOffset: number, endOffset: number, deltaOffset: number): IViewLineTokens {
		return new SliceLineTokens(this, startOffset, endOffset, deltaOffset);
	}

	public sliceZeroCopy(range: OffsetRange): IViewLineTokens {
		return this.sliceAndInflate(range.start, range.endExclusive, 0);
	}

	/**
	 * @pure
	 * @param insertTokens Must be sorted by offset.
	*/
	public withInserted(insertTokens: { offset: number; text: string; tokenMetadata: number }[]): LineTokens {
		if (insertTokens.length === 0) {
			return this;
		}

		let nextOriginalTokenIdx = 0;
		let nextInsertTokenIdx = 0;
		let text = '';
		const newTokens = new Array<number>();

		let originalEndOffset = 0;
		while (true) {
			const nextOriginalTokenEndOffset = nextOriginalTokenIdx < this._tokensCount ? this._tokens[nextOriginalTokenIdx << 1] : -1;
			const nextInsertToken = nextInsertTokenIdx < insertTokens.length ? insertTokens[nextInsertTokenIdx] : null;

			if (nextOriginalTokenEndOffset !== -1 && (nextInsertToken === null || nextOriginalTokenEndOffset <= nextInsertToken.offset)) {
				// original token ends before next insert token
				text += this._text.substring(originalEndOffset, nextOriginalTokenEndOffset);
				const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
				newTokens.push(text.length, metadata);
				nextOriginalTokenIdx++;
				originalEndOffset = nextOriginalTokenEndOffset;

			} else if (nextInsertToken) {
				if (nextInsertToken.offset > originalEndOffset) {
					// insert token is in the middle of the next token.
					text += this._text.substring(originalEndOffset, nextInsertToken.offset);
					const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
					newTokens.push(text.length, metadata);
					originalEndOffset = nextInsertToken.offset;
				}

				text += nextInsertToken.text;
				newTokens.push(text.length, nextInsertToken.tokenMetadata);
				nextInsertTokenIdx++;
			} else {
				break;
			}
		}

		return new LineTokens(new Uint32Array(newTokens), text, this.languageIdCodec);
	}

	public getTokensInRange(range: OffsetRange): TokenArray {
		const builder = new TokenArrayBuilder();

		const startTokenIndex = this.findTokenIndexAtOffset(range.start);
		const endTokenIndex = this.findTokenIndexAtOffset(range.endExclusive);

		for (let tokenIndex = startTokenIndex; tokenIndex <= endTokenIndex; tokenIndex++) {
			const tokenRange = new OffsetRange(this.getStartOffset(tokenIndex), this.getEndOffset(tokenIndex));
			const length = tokenRange.intersectionLength(range);
			if (length > 0) {
				builder.add(length, this.getMetadata(tokenIndex));
			}
		}

		return builder.build();
	}

	public getTokenText(tokenIndex: number): string {
		const startOffset = this.getStartOffset(tokenIndex);
		const endOffset = this.getEndOffset(tokenIndex);
		const text = this._text.substring(startOffset, endOffset);
		return text;
	}

	public forEach(callback: (tokenIndex: number) => void): void {
		const tokenCount = this.getCount();
		for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
			callback(tokenIndex);
		}
	}

	toString(): string {
		let result = '';
		this.forEach((i) => {
			result += `[${this.getTokenText(i)}]{${this.getClassName(i)}}`;
		});
		return result;
	}
}

class SliceLineTokens implements IViewLineTokens {

	private readonly _source: LineTokens;
	private readonly _startOffset: number;
	private readonly _endOffset: number;
	private readonly _deltaOffset: number;

	private readonly _firstTokenIndex: number;
	private readonly _tokensCount: number;

	public readonly languageIdCodec: ILanguageIdCodec;

	constructor(source: LineTokens, startOffset: number, endOffset: number, deltaOffset: number) {
		this._source = source;
		this._startOffset = startOffset;
		this._endOffset = endOffset;
		this._deltaOffset = deltaOffset;
		this._firstTokenIndex = source.findTokenIndexAtOffset(startOffset);
		this.languageIdCodec = source.languageIdCodec;

		this._tokensCount = 0;
		for (let i = this._firstTokenIndex, len = source.getCount(); i < len; i++) {
			const tokenStartOffset = source.getStartOffset(i);
			if (tokenStartOffset >= endOffset) {
				break;
			}
			this._tokensCount++;
		}
	}

	public getMetadata(tokenIndex: number): number {
		return this._source.getMetadata(this._firstTokenIndex + tokenIndex);
	}

	public getLanguageId(tokenIndex: number): string {
		return this._source.getLanguageId(this._firstTokenIndex + tokenIndex);
	}

	public getLineContent(): string {
		return this._source.getLineContent().substring(this._startOffset, this._endOffset);
	}

	public equals(other: IViewLineTokens): boolean {
		if (other instanceof SliceLineTokens) {
			return (
				this._startOffset === other._startOffset
				&& this._endOffset === other._endOffset
				&& this._deltaOffset === other._deltaOffset
				&& this._source.slicedEquals(other._source, this._firstTokenIndex, this._tokensCount)
			);
		}
		return false;
	}

	public getCount(): number {
		return this._tokensCount;
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		return this._source.getStandardTokenType(this._firstTokenIndex + tokenIndex);
	}

	public getForeground(tokenIndex: number): ColorId {
		return this._source.getForeground(this._firstTokenIndex + tokenIndex);
	}

	public getEndOffset(tokenIndex: number): number {
		const tokenEndOffset = this._source.getEndOffset(this._firstTokenIndex + tokenIndex);
		return Math.min(this._endOffset, tokenEndOffset) - this._startOffset + this._deltaOffset;
	}

	public getClassName(tokenIndex: number): string {
		return this._source.getClassName(this._firstTokenIndex + tokenIndex);
	}

	public getInlineStyle(tokenIndex: number, colorMap: string[]): string {
		return this._source.getInlineStyle(this._firstTokenIndex + tokenIndex, colorMap);
	}

	public getPresentation(tokenIndex: number): ITokenPresentation {
		return this._source.getPresentation(this._firstTokenIndex + tokenIndex);
	}

	public findTokenIndexAtOffset(offset: number): number {
		return this._source.findTokenIndexAtOffset(offset + this._startOffset - this._deltaOffset) - this._firstTokenIndex;
	}

	public getTokenText(tokenIndex: number): string {
		const adjustedTokenIndex = this._firstTokenIndex + tokenIndex;
		const tokenStartOffset = this._source.getStartOffset(adjustedTokenIndex);
		const tokenEndOffset = this._source.getEndOffset(adjustedTokenIndex);
		let text = this._source.getTokenText(adjustedTokenIndex);
		if (tokenStartOffset < this._startOffset) {
			text = text.substring(this._startOffset - tokenStartOffset);
		}
		if (tokenEndOffset > this._endOffset) {
			text = text.substring(0, text.length - (tokenEndOffset - this._endOffset));
		}
		return text;
	}

	public forEach(callback: (tokenIndex: number) => void): void {
		for (let tokenIndex = 0; tokenIndex < this.getCount(); tokenIndex++) {
			callback(tokenIndex);
		}
	}
}

export function getStandardTokenTypeAtPosition(model: ITextModel, position: IPosition): StandardTokenType | undefined {
	const lineNumber = position.lineNumber;
	if (!model.tokenization.isCheapToTokenize(lineNumber)) {
		return undefined;
	}
	model.tokenization.forceTokenization(lineNumber);
	const lineTokens = model.tokenization.getLineTokens(lineNumber);
	const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
	const tokenType = lineTokens.getStandardTokenType(tokenIndex);
	return tokenType;
}



/**
 * This class represents a sequence of tokens.
 * Conceptually, each token has a length and a metadata number.
 * A token array might be used to annotate a string with metadata.
 * Use {@link TokenArrayBuilder} to efficiently create a token array.
 *
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenArray {
	public static fromLineTokens(lineTokens: LineTokens): TokenArray {
		const tokenInfo: TokenInfo[] = [];
		for (let i = 0; i < lineTokens.getCount(); i++) {
			tokenInfo.push(new TokenInfo(lineTokens.getEndOffset(i) - lineTokens.getStartOffset(i), lineTokens.getMetadata(i)));
		}
		return TokenArray.create(tokenInfo);
	}

	public static create(tokenInfo: TokenInfo[]): TokenArray {
		return new TokenArray(tokenInfo);
	}

	private constructor(
		private readonly _tokenInfo: TokenInfo[]
	) { }

	public toLineTokens(lineContent: string, decoder: ILanguageIdCodec): LineTokens {
		return LineTokens.createFromTextAndMetadata(this.map((r, t) => ({ text: r.substring(lineContent), metadata: t.metadata })), decoder);
	}

	public forEach(cb: (range: OffsetRange, tokenInfo: TokenInfo) => void): void {
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
			cb(range, tokenInfo);
			lengthSum += tokenInfo.length;
		}
	}

	public map<T>(cb: (range: OffsetRange, tokenInfo: TokenInfo) => T): T[] {
		const result: T[] = [];
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
			result.push(cb(range, tokenInfo));
			lengthSum += tokenInfo.length;
		}
		return result;
	}

	public slice(range: OffsetRange): TokenArray {
		const result: TokenInfo[] = [];
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const tokenStart = lengthSum;
			const tokenEndEx = tokenStart + tokenInfo.length;
			if (tokenEndEx > range.start) {
				if (tokenStart >= range.endExclusive) {
					break;
				}

				const deltaBefore = Math.max(0, range.start - tokenStart);
				const deltaAfter = Math.max(0, tokenEndEx - range.endExclusive);

				result.push(new TokenInfo(tokenInfo.length - deltaBefore - deltaAfter, tokenInfo.metadata));
			}

			lengthSum += tokenInfo.length;
		}
		return TokenArray.create(result);
	}

	public append(other: TokenArray): TokenArray {
		const result: TokenInfo[] = this._tokenInfo.concat(other._tokenInfo);
		return TokenArray.create(result);
	}
}

export type ITokenMetadata = number;

export class TokenInfo {
	constructor(
		public readonly length: number,
		public readonly metadata: ITokenMetadata
	) { }
}
/**
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/

export class TokenArrayBuilder {
	private readonly _tokens: TokenInfo[] = [];

	public add(length: number, metadata: ITokenMetadata): void {
		this._tokens.push(new TokenInfo(length, metadata));
	}

	public build(): TokenArray {
		return TokenArray.create(this._tokens);
	}
}

