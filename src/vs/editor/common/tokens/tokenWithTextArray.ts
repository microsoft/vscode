/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../core/ranges/offsetRange.js';
import { ILanguageIdCodec } from '../languages.js';
import { LineTokens } from './lineTokens.js';

/**
 * This class represents a sequence of tokens.
 * Conceptually, each token has a length and a metadata number.
 * A token array might be used to annotate a string with metadata.
 * Use {@link TokenWithTextArrayBuilder} to efficiently create a token array.
 *
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenWithTextArray {
	public static fromLineTokens(lineTokens: LineTokens): TokenWithTextArray {
		const tokenInfo: TokenWithTextInfo[] = [];
		for (let i = 0; i < lineTokens.getCount(); i++) {
			tokenInfo.push(new TokenWithTextInfo(lineTokens.getTokenText(i), lineTokens.getMetadata(i)));
		}
		return TokenWithTextArray.create(tokenInfo);
	}

	public static create(tokenInfo: TokenWithTextInfo[]): TokenWithTextArray {
		return new TokenWithTextArray(tokenInfo);
	}

	private constructor(
		private readonly _tokenInfo: TokenWithTextInfo[],
	) { }

	public toLineTokens(decoder: ILanguageIdCodec): LineTokens {
		return LineTokens.createFromTextAndMetadata(this.map((_r, t) => ({ text: t.text, metadata: t.metadata })), decoder);
	}

	public forEach(cb: (range: OffsetRange, tokenInfo: TokenWithTextInfo) => void): void {
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.text.length);
			cb(range, tokenInfo);
			lengthSum += tokenInfo.text.length;
		}
	}

	public map<T>(cb: (range: OffsetRange, tokenInfo: TokenWithTextInfo) => T): T[] {
		const result: T[] = [];
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.text.length);
			result.push(cb(range, tokenInfo));
			lengthSum += tokenInfo.text.length;
		}
		return result;
	}

	public slice(range: OffsetRange): TokenWithTextArray {
		const result: TokenWithTextInfo[] = [];
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const tokenStart = lengthSum;
			const tokenEndEx = tokenStart + tokenInfo.text.length;
			if (tokenEndEx > range.start) {
				if (tokenStart >= range.endExclusive) {
					break;
				}

				const deltaBefore = Math.max(0, range.start - tokenStart);
				const deltaAfter = Math.max(0, tokenEndEx - range.endExclusive);

				result.push(new TokenWithTextInfo(tokenInfo.text.slice(deltaBefore, tokenInfo.text.length - deltaAfter), tokenInfo.metadata));
			}

			lengthSum += tokenInfo.text.length;
		}
		return TokenWithTextArray.create(result);
	}

	public append(other: TokenWithTextArray): TokenWithTextArray {
		const result: TokenWithTextInfo[] = this._tokenInfo.concat(other._tokenInfo);
		return TokenWithTextArray.create(result);
	}
}

export type TokenMetadata = number;

export class TokenWithTextInfo {
	constructor(
		public readonly text: string,
		public readonly metadata: TokenMetadata,
	) { }
}

/**
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenWithTextArrayBuilder {
	private readonly _tokens: TokenWithTextInfo[] = [];

	public add(text: string, metadata: TokenMetadata): void {
		this._tokens.push(new TokenWithTextInfo(text, metadata));
	}

	public build(): TokenWithTextArray {
		return TokenWithTextArray.create(this._tokens);
	}
}
