/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../core/offsetRange.js';

/**
 * This class represents a sequence of tokens.
 * Conceptually, each token has a length and a metadata number.
 * A token array might be used to annotate a string with metadata.
 * Use {@link TokenArrayBuilder} to efficiently create a token array.
 *
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenArray {
	public static create(tokenInfo: TokenInfo[]): TokenArray {
		return new TokenArray(tokenInfo);
	}

	private constructor(
		private readonly _tokenInfo: TokenInfo[],
	) { }

	public forEach(cb: (range: OffsetRange, tokenInfo: TokenInfo) => void): void {
		let lengthSum = 0;
		for (const tokenInfo of this._tokenInfo) {
			const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
			cb(range, tokenInfo);
			lengthSum += tokenInfo.length;
		}
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
}

export type TokenMetadata = number;

export class TokenInfo {
	constructor(
		public readonly length: number,
		public readonly metadata: TokenMetadata,
	) { }
}

/**
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenArrayBuilder {
	private readonly _tokens: TokenInfo[] = [];

	public add(length: number, metadata: TokenMetadata): void {
		this._tokens.push(new TokenInfo(length, metadata));
	}

	public build(): TokenArray {
		return TokenArray.create(this._tokens);
	}
}
