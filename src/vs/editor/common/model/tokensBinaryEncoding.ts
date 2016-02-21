/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import {ITokensInflatorMap} from 'vs/editor/common/editorCommon';
import {IToken} from 'vs/editor/common/modes';

class InflatedToken implements IToken {
	startIndex:number;
	type:string;

	constructor(startIndex:number, type:string) {
		this.startIndex = startIndex;
		this.type = type;
	}

	public toString(): string {
		return '{ ' + this.startIndex + ', \'' + this.type + '\'}';
	}
}

export var START_INDEX_MASK = 0xffffffff;
export var TYPE_MASK = 0xffff;
export var START_INDEX_OFFSET = 1;
export var TYPE_OFFSET = Math.pow(2, 32);

var DEFAULT_TOKEN = {
	startIndex: 0,
	type: ''
};
var INFLATED_TOKENS_EMPTY_TEXT = <IToken[]>[];
var DEFLATED_TOKENS_EMPTY_TEXT = <number[]>[];
var INFLATED_TOKENS_NON_EMPTY_TEXT = <IToken[]>[DEFAULT_TOKEN];
var DEFLATED_TOKENS_NON_EMPTY_TEXT = <number[]>[0];

export function deflateArr(map:ITokensInflatorMap, tokens:IToken[]): number[] {
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
		token:IToken,
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

export function inflate(map:ITokensInflatorMap, binaryEncodedToken:number): IToken {
	if (binaryEncodedToken === 0) {
		return DEFAULT_TOKEN;
	}

	var startIndex = (binaryEncodedToken / START_INDEX_OFFSET) & START_INDEX_MASK;
	var deflatedType = (binaryEncodedToken / TYPE_OFFSET) & TYPE_MASK;

	return new InflatedToken(startIndex, map._inflate[deflatedType]);
}

export function getStartIndex(binaryEncodedToken:number): number {
	return (binaryEncodedToken / START_INDEX_OFFSET) & START_INDEX_MASK;
}

export function getType(map:ITokensInflatorMap, binaryEncodedToken:number): string {
	var deflatedType = (binaryEncodedToken / TYPE_OFFSET) & TYPE_MASK;
	if (deflatedType === 0) {
		return strings.empty;
	}
	return map._inflate[deflatedType];
}

export function inflateArr(map:ITokensInflatorMap, binaryEncodedTokens:number[]): IToken[] {
	if (binaryEncodedTokens.length === 0) {
		return INFLATED_TOKENS_EMPTY_TEXT;
	}
	if (binaryEncodedTokens.length === 1 && binaryEncodedTokens[0] === 0) {
		return INFLATED_TOKENS_NON_EMPTY_TEXT;
	}

	var result: IToken[] = new Array(binaryEncodedTokens.length),
		i:number,
		len:number,
		deflated:number,
		startIndex:number,
		deflatedType:number,
		inflateMap = map._inflate;

	for (i = 0, len = binaryEncodedTokens.length; i < len; i++) {
		deflated = binaryEncodedTokens[i];

		startIndex = (deflated / START_INDEX_OFFSET) & START_INDEX_MASK;
		deflatedType = (deflated / TYPE_OFFSET) & TYPE_MASK;

		result[i] = new InflatedToken(startIndex, inflateMap[deflatedType]);
	}

	return result;
}

export function findIndexOfOffset(binaryEncodedTokens:number[], offset:number): number {
	return findIndexInSegmentsArray(binaryEncodedTokens, offset);
}

export function sliceAndInflate(map:ITokensInflatorMap, binaryEncodedTokens:number[], startOffset:number, endOffset:number, deltaStartIndex:number): IToken[] {
	if (binaryEncodedTokens.length === 0) {
		return INFLATED_TOKENS_EMPTY_TEXT;
	}
	if (binaryEncodedTokens.length === 1 && binaryEncodedTokens[0] === 0) {
		return INFLATED_TOKENS_NON_EMPTY_TEXT;
	}

	var startIndex = findIndexInSegmentsArray(binaryEncodedTokens, startOffset),
		i:number,
		len:number,
		originalToken:number,
		originalStartIndex:number,
		newStartIndex:number,
		deflatedType:number,
		result: IToken[] = [],
		inflateMap = map._inflate;

	originalToken = binaryEncodedTokens[startIndex];
	deflatedType = (originalToken / TYPE_OFFSET) & TYPE_MASK;
	newStartIndex = 0;
	result.push(new InflatedToken(newStartIndex, inflateMap[deflatedType]));

	for (i = startIndex + 1, len = binaryEncodedTokens.length; i < len; i++) {
		originalToken = binaryEncodedTokens[i];
		originalStartIndex = (originalToken / START_INDEX_OFFSET) & START_INDEX_MASK;

		if (originalStartIndex >= endOffset) {
			break;
		}

		deflatedType = (originalToken / TYPE_OFFSET) & TYPE_MASK;
		newStartIndex = originalStartIndex - startOffset + deltaStartIndex;
		result.push(new InflatedToken(newStartIndex, inflateMap[deflatedType]));
	}

	return result;
}

export function findIndexInSegmentsArray(arr:number[], desiredIndex: number):number {

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