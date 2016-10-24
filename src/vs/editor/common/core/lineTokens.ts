/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokensBinaryEncoding, TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';

export class LineToken {
	_lineTokenBrand: void;

	private _source: LineTokens;
	private _tokenIndex: number;
	private _modeIndex: number;

	public readonly startOffset: number;
	public readonly endOffset: number;
	public readonly type: string;
	public readonly modeId: string;
	public readonly hasPrev: boolean;
	public readonly hasNext: boolean;

	constructor(source: LineTokens, tokenIndex: number, modeIndex: number) {
		this._source = source;
		this._tokenIndex = tokenIndex;
		this._modeIndex = modeIndex;

		this.startOffset = this._source.getTokenStartOffset(this._tokenIndex);
		this.endOffset = this._source.getTokenEndOffset(this._tokenIndex);
		this.type = this._source.getTokenType(this._tokenIndex);
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

	private _map: TokensInflatorMap;
	private _tokens: number[];
	private _textLength: number;

	readonly modeTransitions: ModeTransition[];

	constructor(map: TokensInflatorMap, tokens: number[], modeTransitions: ModeTransition[], textLength: number) {
		this._map = map;
		this._tokens = tokens;
		this.modeTransitions = modeTransitions;
		this._textLength = textLength;
	}

	public getTokenCount(): number {
		return this._tokens.length;
	}

	public getTokenStartOffset(tokenIndex: number): number {
		return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex]);
	}

	public getTokenType(tokenIndex: number): string {
		return TokensBinaryEncoding.getType(this._map, this._tokens[tokenIndex]);
	}

	public getTokenEndOffset(tokenIndex: number): number {
		if (tokenIndex + 1 < this._tokens.length) {
			return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex + 1]);
		}
		return this._textLength;
	}

	public equals(other: LineTokens): boolean {
		if (other instanceof LineTokens) {
			if (this._map !== other._map) {
				return false;
			}
			if (this._tokens.length !== other._tokens.length) {
				return false;
			}
			for (let i = 0, len = this._tokens.length; i < len; i++) {
				if (this._tokens[i] !== other._tokens[i]) {
					return false;
				}
			}
			return true;
		}
		if (!(other instanceof LineTokens)) {
			return false;
		}
	}

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
