/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';
import {Token} from 'vs/editor/common/core/token';

const START_INDEX_MASK = 0xffffffff;
const TYPE_MASK = 0xffff;
const START_INDEX_OFFSET = 1;
const TYPE_OFFSET = Math.pow(2, 32);

const DEFAULT_VIEW_TOKEN = new ViewLineToken(0, '');
const INFLATED_TOKENS_EMPTY_TEXT:ViewLineToken[] = [];
const DEFLATED_TOKENS_EMPTY_TEXT:number[] = [];
const INFLATED_TOKENS_NON_EMPTY_TEXT:ViewLineToken[] = [DEFAULT_VIEW_TOKEN];
const DEFLATED_TOKENS_NON_EMPTY_TEXT:number[] = [0];

export class TokensInflatorMap {

	public _inflate:string[];

	public _deflate: {
		[token:string]:number;
	};

	constructor() {
		this._inflate = [ '' ];
		this._deflate = { '': 0 };
	}
}

export class TokensBinaryEncoding {
	public static START_INDEX_MASK = START_INDEX_MASK;
	public static TYPE_MASK = TYPE_MASK;
	public static START_INDEX_OFFSET = START_INDEX_OFFSET;
	public static TYPE_OFFSET = TYPE_OFFSET;

	public static deflateArr(map:TokensInflatorMap, tokens:Token[]): number[] {
		if (tokens.length === 0) {
			return DEFLATED_TOKENS_EMPTY_TEXT;
		}
		if (tokens.length === 1 && tokens[0].startIndex === 0 && !tokens[0].type) {
			return DEFLATED_TOKENS_NON_EMPTY_TEXT;
		}

		var i:number,
			len:number,
			deflatedToken:number,
			deflated:number,
			token:Token,
			inflateMap = map._inflate,
			deflateMap = map._deflate,
			prevStartIndex:number = -1,
			result:number[] = new Array(tokens.length);

		for (i = 0, len = tokens.length; i < len; i++) {
			token = tokens[i];

			if (token.startIndex <= prevStartIndex) {
				token.startIndex = prevStartIndex + 1;
				onUnexpectedError({
					message: 'Invalid tokens detected',
					tokens: tokens
				});
			}

			if (deflateMap.hasOwnProperty(token.type)) {
				deflatedToken = deflateMap[token.type];
			} else {
				deflatedToken = inflateMap.length;
				deflateMap[token.type] = deflatedToken;
				inflateMap.push(token.type);
			}

			// http://stackoverflow.com/a/2803010
			// All numbers in JavaScript are actually IEEE-754 compliant floating-point doubles.
			// These have a 53-bit mantissa which should mean that any integer value with a magnitude
			// of approximately 9 quadrillion or less -- more specifically, 9,007,199,254,740,991 --
			// will be represented accurately.

			// http://stackoverflow.com/a/6729252
			// Bitwise operations cast numbers to 32bit representation in JS

			// 32 bits for startIndex => up to 2^32 = 4,294,967,296
			// 16 bits for token => up to 2^16 = 65,536

			// [token][startIndex]
			deflated = deflatedToken * TYPE_OFFSET + token.startIndex * START_INDEX_OFFSET;

			result[i] = deflated;

			prevStartIndex = token.startIndex;
		}

		return result;
	}

	public static getStartIndex(binaryEncodedToken:number): number {
		return (binaryEncodedToken / START_INDEX_OFFSET) & START_INDEX_MASK;
	}

	public static getType(map:TokensInflatorMap, binaryEncodedToken:number): string {
		var deflatedType = (binaryEncodedToken / TYPE_OFFSET) & TYPE_MASK;
		if (deflatedType === 0) {
			return strings.empty;
		}
		return map._inflate[deflatedType];
	}

	public static inflateArr(map:TokensInflatorMap, binaryEncodedTokens:number[]): ViewLineToken[] {
		if (binaryEncodedTokens.length === 0) {
			return INFLATED_TOKENS_EMPTY_TEXT;
		}
		if (binaryEncodedTokens.length === 1 && binaryEncodedTokens[0] === 0) {
			return INFLATED_TOKENS_NON_EMPTY_TEXT;
		}

		let result: ViewLineToken[] = [];
		const inflateMap = map._inflate;

		for (let i = 0, len = binaryEncodedTokens.length; i < len; i++) {
			let deflated = binaryEncodedTokens[i];

			let startIndex = (deflated / START_INDEX_OFFSET) & START_INDEX_MASK;
			let deflatedType = (deflated / TYPE_OFFSET) & TYPE_MASK;

			result.push(new ViewLineToken(startIndex, inflateMap[deflatedType]));
		}

		return result;
	}

	public static findIndexOfOffset(binaryEncodedTokens:number[], offset:number): number {
		return this.findIndexInSegmentsArray(binaryEncodedTokens, offset);
	}

	public static sliceAndInflate(map:TokensInflatorMap, binaryEncodedTokens:number[], startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineToken[] {
		if (binaryEncodedTokens.length === 0) {
			return INFLATED_TOKENS_EMPTY_TEXT;
		}
		if (binaryEncodedTokens.length === 1 && binaryEncodedTokens[0] === 0) {
			return INFLATED_TOKENS_NON_EMPTY_TEXT;
		}

		let startIndex = this.findIndexInSegmentsArray(binaryEncodedTokens, startOffset);
		let result: ViewLineToken[] = [];
		const inflateMap = map._inflate;

		let originalToken = binaryEncodedTokens[startIndex];
		let deflatedType = (originalToken / TYPE_OFFSET) & TYPE_MASK;
		let newStartIndex = 0;
		result.push(new ViewLineToken(newStartIndex, inflateMap[deflatedType]));

		for (let i = startIndex + 1, len = binaryEncodedTokens.length; i < len; i++) {
			originalToken = binaryEncodedTokens[i];
			let originalStartIndex = (originalToken / START_INDEX_OFFSET) & START_INDEX_MASK;

			if (originalStartIndex >= endOffset) {
				break;
			}

			deflatedType = (originalToken / TYPE_OFFSET) & TYPE_MASK;
			newStartIndex = originalStartIndex - startOffset + deltaStartIndex;
			result.push(new ViewLineToken(newStartIndex, inflateMap[deflatedType]));
		}

		return result;
	}

	private static findIndexInSegmentsArray(arr:number[], desiredIndex: number):number {

		var low = 0,
			high = arr.length - 1,
			mid:number,
			value:number;

		while (low < high) {

			mid = low + Math.ceil((high - low)/2);

			value = arr[mid] & 0xffffffff;

			if (value > desiredIndex) {
				high = mid - 1;
			} else {
				low = mid;
			}
		}

		return low;
	}
}