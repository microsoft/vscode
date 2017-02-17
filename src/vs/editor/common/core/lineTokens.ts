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
	private readonly _tokenIndex: number;
	private readonly _metadata: number;

	public readonly startOffset: number;
	public readonly endOffset: number;

	public readonly hasPrev: boolean;
	public readonly hasNext: boolean;

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
		this._tokenIndex = tokenIndex;
		this._metadata = metadata;

		this.startOffset = startOffset;
		this.endOffset = endOffset;

		this.hasPrev = (this._tokenIndex > 0);
		this.hasNext = (this._tokenIndex + 1 < tokenCount);
	}

	public prev(): LineToken {
		if (!this.hasPrev) {
			return null;
		}

		return this._source.tokenAt(this._tokenIndex - 1);
	}

	public next(): LineToken {
		if (!this.hasNext) {
			return null;
		}

		return this._source.tokenAt(this._tokenIndex + 1);
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

	public getLineLength(): number {
		return this._textLength;
	}

	public getTokenStartOffset(tokenIndex: number): number {
		return this._tokens[(tokenIndex << 1)];
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
		if (tokenIndex + 1 < this._tokensCount) {
			return this._tokens[(tokenIndex + 1) << 1];
		}
		return this._textLength;
	}

	/**
	 * Find the token containing offset `offset`.
	 * ```
	 *   For example, with the following tokens [0, 5), [5, 9), [9, infinity)
	 *   Searching for 0, 1, 2, 3 or 4 will return 0.
	 *   Searching for 5, 6, 7 or 8 will return 1.
	 *   Searching for 9, 10, 11, ... will return 2.
	 * ```
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

	public tokenAt(tokenIndex: number): LineToken {
		let startOffset = this._tokens[(tokenIndex << 1)];
		let endOffset: number;
		if (tokenIndex + 1 < this._tokensCount) {
			endOffset = this._tokens[(tokenIndex + 1) << 1];
		} else {
			endOffset = this._textLength;
		}
		let metadata = this._tokens[(tokenIndex << 1) + 1];
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
		return ViewLineTokenFactory.inflateArr(this._tokens, this._textLength);
	}

	public sliceAndInflate(startOffset: number, endOffset: number, deltaOffset: number): ViewLineToken[] {
		return ViewLineTokenFactory.sliceAndInflate(this._tokens, startOffset, endOffset, deltaOffset, this._textLength);
	}
}
