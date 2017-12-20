/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ViewLineTokenFactory, ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { ColorId, FontStyle, StandardTokenType, LanguageId } from 'vs/editor/common/modes';

export class LineToken {
	_lineTokenBrand: void;

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

	public clone(): LineToken {
		return new LineToken(this._source, this._tokenIndex, this._tokenCount, this._startOffset, this._endOffset, this._metadata);
	}

	_set(tokenIndex: number, startOffset: number, endOffset: number, metadata: number): void {
		this._tokenIndex = tokenIndex;
		this._metadata = metadata;
		this._startOffset = startOffset;
		this._endOffset = endOffset;
	}

	public prev(): LineToken {
		if (!this.hasPrev) {
			return null;
		}
		this._source.tokenAt(this._tokenIndex - 1, this);
		return this;
	}

	public next(): LineToken {
		if (!this.hasNext) {
			return null;
		}
		this._source.tokenAt(this._tokenIndex + 1, this);
		return this;
	}
}

export class LineTokens {
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

	public getTokenCount(): number {
		return this._tokensCount;
	}

	public getLineContent(): string {
		return this._text;
	}

	public getTokenStartOffset(tokenIndex: number): number {
		if (tokenIndex > 0) {
			return this._tokens[(tokenIndex - 1) << 1];
		}
		return 0;
	}

	public getLanguageId(tokenIndex: number): LanguageId {
		let metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getLanguageId(metadata);
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		let metadata = this._tokens[(tokenIndex << 1) + 1];
		return TokenMetadata.getTokenType(metadata);
	}

	public getTokenEndOffset(tokenIndex: number): number {
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

	public findTokenAtOffset(offset: number): LineToken {
		let tokenIndex = this.findTokenIndexAtOffset(offset);
		return this.tokenAt(tokenIndex);
	}

	public tokenAt(tokenIndex: number, dest?: LineToken): LineToken {
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
		return new LineToken(this, tokenIndex, this._tokensCount, startOffset, endOffset, metadata);
	}

	public firstToken(): LineToken {
		if (this._textLength === 0) {
			return null;
		}
		return this.tokenAt(0);
	}

	public lastToken(): LineToken {
		if (this._textLength === 0) {
			return null;
		}
		return this.tokenAt(this._tokensCount - 1);
	}

	public inflate(): ViewLineToken[] {
		return ViewLineTokenFactory.inflateArr(this._tokens);
	}

	public sliceAndInflate(startOffset: number, endOffset: number, deltaOffset: number): ViewLineToken[] {
		return ViewLineTokenFactory.sliceAndInflate(this._tokens, startOffset, endOffset, deltaOffset, this._textLength);
	}

	public static convertToEndOffset(tokens: Uint32Array, lineTextLength: number): void {
		// TODO@tokenize: massage, use tokenLength
		const tokenCount = (tokens.length >>> 1);
		const lastTokenIndex = tokenCount - 1;
		for (let tokenIndex = 0; tokenIndex < lastTokenIndex; tokenIndex++) {
			tokens[tokenIndex << 1] = tokens[(tokenIndex + 1) << 1];
		}
		tokens[lastTokenIndex << 1] = lineTextLength;
	}
}
