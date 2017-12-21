/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ViewLineTokenFactory, IViewLineTokens } from 'vs/editor/common/core/viewLineToken';
import { ColorId, FontStyle, StandardTokenType, LanguageId } from 'vs/editor/common/modes';

export class LineTokensIterator {
	private readonly _source: LineTokens;
	private readonly _tokenCount: number;

	private _tokenIndex: number;
	private _metadata: number;
	private _startOffset: number;
	private _endOffset: number;

	public get startOffset(): number {
		return this._startOffset;
	}
	public get endOffset(): number {
		return this._endOffset;
	}
	public get hasPrev(): boolean {
		return (this._tokenIndex > 0);
	}
	public get hasNext(): boolean {
		return (this._tokenIndex + 1 < this._tokenCount);
	}
	public get languageId(): LanguageId {
		return TokenMetadata.getLanguageId(this._metadata);
	}
	public get tokenType(): StandardTokenType {
		return TokenMetadata.getTokenType(this._metadata);
	}
	public get fontStyle(): FontStyle {
		return TokenMetadata.getFontStyle(this._metadata);
	}
	public get foregroundId(): ColorId {
		return TokenMetadata.getForeground(this._metadata);
	}
	public get backgroundId(): ColorId {
		return TokenMetadata.getBackground(this._metadata);
	}

	constructor(source: LineTokens, tokenIndex: number, tokenCount: number, startOffset: number, endOffset: number, metadata: number) {
		this._source = source;
		this._tokenCount = tokenCount;
		this._set(tokenIndex, startOffset, endOffset, metadata);
	}

	public clone(): LineTokensIterator {
		return new LineTokensIterator(this._source, this._tokenIndex, this._tokenCount, this._startOffset, this._endOffset, this._metadata);
	}

	_set(tokenIndex: number, startOffset: number, endOffset: number, metadata: number): void {
		this._tokenIndex = tokenIndex;
		this._metadata = metadata;
		this._startOffset = startOffset;
		this._endOffset = endOffset;
	}

	public prev(): LineTokensIterator {
		if (!this.hasPrev) {
			return null;
		}
		this._source.tokenAt(this._tokenIndex - 1, this);
		return this;
	}

	public next(): LineTokensIterator {
		if (!this.hasNext) {
			return null;
		}
		this._source.tokenAt(this._tokenIndex + 1, this);
		return this;
	}
}

export class LineTokens implements IViewLineTokens {
	_lineTokensBrand: void;

	private readonly _tokens: Uint32Array;
	private readonly _tokensCount: number;
	private readonly _text: string;
	private readonly _textLength: number;

	constructor(tokens: Uint32Array, text: string) {
		this._tokens = tokens;
		this._tokensCount = (this._tokens.length >>> 1);
		this._text = text;
		this._textLength = this._text.length;
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

	public getLanguageId(tokenIndex: number): LanguageId {
		const metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getLanguageId(metadata);
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

	public getEndOffset(tokenIndex: number): number {
		return this._tokens[tokenIndex << 1];
	}

	/**
	 * Find the token containing offset `offset`.
	 * @param offset The search offset
	 * @return The index of the token containing the offset.
	 */
	public findTokenIndexAtOffset(offset: number): number {
		return ViewLineTokenFactory.findIndexInSegmentsArray(this._tokens, offset);
	}

	public findTokenAtOffset(offset: number): LineTokensIterator {
		let tokenIndex = this.findTokenIndexAtOffset(offset);
		return this.tokenAt(tokenIndex);
	}

	public tokenAt(tokenIndex: number, dest?: LineTokensIterator): LineTokensIterator {
		const startOffset = (
			tokenIndex > 0
				? this._tokens[(tokenIndex - 1) << 1]
				: 0
		);
		const endOffset = this._tokens[tokenIndex << 1];
		let metadata = this._tokens[(tokenIndex << 1) + 1];

		if (dest) {
			dest._set(tokenIndex, startOffset, endOffset, metadata);
			return dest;
		}
		return new LineTokensIterator(this, tokenIndex, this._tokensCount, startOffset, endOffset, metadata);
	}

	public firstToken(): LineTokensIterator {
		if (this._textLength === 0) {
			return null;
		}
		return this.tokenAt(0);
	}

	public lastToken(): LineTokensIterator {
		if (this._textLength === 0) {
			return null;
		}
		return this.tokenAt(this._tokensCount - 1);
	}

	public inflate(): IViewLineTokens {
		return this;
	}

	public sliceAndInflate(startOffset: number, endOffset: number, deltaOffset: number): IViewLineTokens {
		return new SlicedLineTokens(this, startOffset, endOffset, deltaOffset);
	}

	public static convertToEndOffset(tokens: Uint32Array, lineTextLength: number): void {
		const tokenCount = (tokens.length >>> 1);
		const lastTokenIndex = tokenCount - 1;
		for (let tokenIndex = 0; tokenIndex < lastTokenIndex; tokenIndex++) {
			tokens[tokenIndex << 1] = tokens[(tokenIndex + 1) << 1];
		}
		tokens[lastTokenIndex << 1] = lineTextLength;
	}
}

export class SlicedLineTokens implements IViewLineTokens {

	private readonly _source: LineTokens;
	private readonly _startOffset: number;
	private readonly _endOffset: number;
	private readonly _deltaOffset: number;

	private readonly _firstTokenIndex: number;
	private readonly _tokensCount: number;

	constructor(source: LineTokens, startOffset: number, endOffset: number, deltaOffset: number) {
		this._source = source;
		this._startOffset = startOffset;
		this._endOffset = endOffset;
		this._deltaOffset = deltaOffset;
		this._firstTokenIndex = source.findTokenIndexAtOffset(startOffset);

		this._tokensCount = 0;
		for (let i = this._firstTokenIndex, len = source.getCount(); i < len; i++) {
			const tokenStartOffset = source.getStartOffset(i);
			if (tokenStartOffset >= endOffset) {
				break;
			}
			this._tokensCount++;
		}
	}

	public equals(other: IViewLineTokens): boolean {
		if (other instanceof SlicedLineTokens) {
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
}
