/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokensBinaryEncoding, TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';

/**
 * A standard token type. Values are 2^x such that a bit mask can be used.
 */
export const enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 4
}

const STANDARD_TOKEN_TYPE_REGEXP = /\b(comment|string|regex)\b/;
function toStandardTokenType(tokenType: string): StandardTokenType {
	let m = tokenType.match(STANDARD_TOKEN_TYPE_REGEXP);
	if (!m) {
		return StandardTokenType.Other;
	}
	switch (m[1]) {
		case 'comment':
			return StandardTokenType.Comment;
		case 'string':
			return StandardTokenType.String;
		case 'regex':
			return StandardTokenType.RegEx;
	}
	throw new Error('Unexpected match for standard token type!');
}

export class LineToken {
	_lineTokenBrand: void;

	private _source: LineTokens;
	private _tokenIndex: number;
	private _modeIndex: number;

	public readonly startOffset: number;
	public readonly endOffset: number;
	public readonly standardType: StandardTokenType;
	public readonly modeId: string;
	public readonly hasPrev: boolean;
	public readonly hasNext: boolean;

	constructor(source: LineTokens, tokenIndex: number, modeIndex: number) {
		this._source = source;
		this._tokenIndex = tokenIndex;
		this._modeIndex = modeIndex;

		this.startOffset = this._source.getTokenStartOffset(this._tokenIndex);
		this.endOffset = this._source.getTokenEndOffset(this._tokenIndex);
		this.standardType = this._source.getStandardTokenType(this._tokenIndex);
		this.modeId = this._source.modeTransitions[this._modeIndex].modeId;
		this.hasPrev = (this._tokenIndex > 0);
		this.hasNext = (this._tokenIndex + 1 < this._source.getTokenCount());
	}

	public prev(): LineToken {
		if (!this.hasPrev) {
			return null;
		}
		if (this._modeIndex === 0) {
			return new LineToken(this._source, this._tokenIndex - 1, this._modeIndex);
		}
		const modeTransitions = this._source.modeTransitions;
		const currentModeTransition = modeTransitions[this._modeIndex];
		const prevStartOffset = this._source.getTokenStartOffset(this._tokenIndex - 1);

		if (prevStartOffset < currentModeTransition.startIndex) {
			// Going to previous mode transition
			return new LineToken(this._source, this._tokenIndex - 1, this._modeIndex - 1);
		}
		return new LineToken(this._source, this._tokenIndex - 1, this._modeIndex);
	}

	public next(): LineToken {
		if (!this.hasNext) {
			return null;
		}
		const modeTransitions = this._source.modeTransitions;
		if (this._modeIndex === modeTransitions.length - 1) {
			return new LineToken(this._source, this._tokenIndex + 1, this._modeIndex);
		}
		const nextModeTransition = modeTransitions[this._modeIndex + 1];
		const nextStartOffset = this._source.getTokenStartOffset(this._tokenIndex + 1);

		if (nextStartOffset >= nextModeTransition.startIndex) {
			// Going to next mode transition
			return new LineToken(this._source, this._tokenIndex + 1, this._modeIndex + 1);
		}
		return new LineToken(this._source, this._tokenIndex + 1, this._modeIndex);
	}
}

export class LineTokens {
	_lineTokensBrand: void;

	private readonly _map: TokensInflatorMap;
	private readonly _tokens: number[];
	private readonly _text: string;
	private readonly _textLength: number;

	readonly modeTransitions: ModeTransition[];

	constructor(map: TokensInflatorMap, tokens: number[], modeTransitions: ModeTransition[], text: string) {
		this._map = map;
		this._tokens = tokens;
		this.modeTransitions = modeTransitions;
		this._text = text;
		this._textLength = this._text.length;
	}

	public getTokenCount(): number {
		return this._tokens.length;
	}

	public getLineContent(): string {
		return this._text;
	}

	public getTokenStartOffset(tokenIndex: number): number {
		return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex]);
	}

	public getTokenType(tokenIndex: number): string {
		return TokensBinaryEncoding.getType(this._map, this._tokens[tokenIndex]);
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		return toStandardTokenType(this.getTokenType(tokenIndex));
	}

	public getTokenEndOffset(tokenIndex: number): number {
		if (tokenIndex + 1 < this._tokens.length) {
			return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex + 1]);
		}
		return this._textLength;
	}

	/**
	 * Find the token containing offset `offset`.
	 *    For example, with the following tokens [0, 5), [5, 9), [9, infinity)
	 *    Searching for 0, 1, 2, 3 or 4 will return 0.
	 *    Searching for 5, 6, 7 or 8 will return 1.
	 *    Searching for 9, 10, 11, ... will return 2.
	 * @param offset The search offset
	 * @return The index of the token containing the offset.
	 */
	public findTokenIndexAtOffset(offset: number): number {
		return TokensBinaryEncoding.findIndexOfOffset(this._tokens, offset);
	}

	public findTokenAtOffset(offset: number): LineToken {
		if (this._textLength === 0) {
			return null;
		}
		let tokenIndex = this.findTokenIndexAtOffset(offset);
		let modeIndex = ModeTransition.findIndexInSegmentsArray(this.modeTransitions, offset);
		return new LineToken(this, tokenIndex, modeIndex);
	}

	public firstToken(): LineToken {
		if (this._textLength === 0) {
			return null;
		}
		return new LineToken(this, 0, 0);
	}

	public lastToken(): LineToken {
		if (this._textLength === 0) {
			return null;
		}
		return new LineToken(this, this._tokens.length - 1, this.modeTransitions.length - 1);
	}

	public inflate(): ViewLineToken[] {
		return TokensBinaryEncoding.inflateArr(this._map, this._tokens);
	}

	public sliceAndInflate(startOffset: number, endOffset: number, deltaStartIndex: number): ViewLineToken[] {
		return TokensBinaryEncoding.sliceAndInflate(this._map, this._tokens, startOffset, endOffset, deltaStartIndex);
	}
}
