/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ColorId } from 'vs/editor/common/modes';
import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';

/**
 * A token on a line.
 */
export class ViewLineToken {
	_viewLineTokenBrand: void;

	/**
	 * last char index of this token (not inclusive).
	 */
	public readonly endIndex: number;
	private readonly _metadata: number;

	constructor(endIndex: number, metadata: number) {
		this.endIndex = endIndex;
		this._metadata = metadata;
	}

	public getForeground(): ColorId {
		return TokenMetadata.getForeground(this._metadata);
	}

	public getType(): string {
		return TokenMetadata.getClassNameFromMetadata(this._metadata);
	}

	public getInlineStyle(colorMap: string[]): string {
		return TokenMetadata.getInlineStyleFromMetadata(this._metadata, colorMap);
	}

	private static _equals(a: ViewLineToken, b: ViewLineToken): boolean {
		return (
			a.endIndex === b.endIndex
			&& a._metadata === b._metadata
		);
	}

	public static equalsArr(a: ViewLineToken[], b: ViewLineToken[]): boolean {
		const aLen = a.length;
		const bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			if (!this._equals(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
}

export class ViewLineTokenFactory {

	public static inflateArr(tokens: Uint32Array): ViewLineToken[] {
		const tokensCount = (tokens.length >>> 1);

		let result: ViewLineToken[] = new Array<ViewLineToken>(tokensCount);
		for (let i = 0; i < tokensCount; i++) {
			const endOffset = tokens[i << 1];
			const metadata = tokens[(i << 1) + 1];

			result[i] = new ViewLineToken(endOffset, metadata);
		}

		return result;
	}

	public static sliceAndInflate(tokens: Uint32Array, startOffset: number, endOffset: number, deltaOffset: number, lineLength: number): ViewLineToken[] {
		const tokenIndex = this.findIndexInSegmentsArray(tokens, startOffset);
		const maxEndOffset = (endOffset - startOffset + deltaOffset);
		let result: ViewLineToken[] = [], resultLen = 0;

		for (let i = tokenIndex, len = (tokens.length >>> 1); i < len; i++) {
			const tokenStartOffset = (i > 0 ? tokens[((i - 1) << 1)] : 0);

			if (tokenStartOffset >= endOffset) {
				break;
			}

			const tokenEndOffset = tokens[(i << 1)];
			const newEndOffset = Math.min(maxEndOffset, tokenEndOffset - startOffset + deltaOffset);
			const metadata = tokens[(i << 1) + 1];

			result[resultLen++] = new ViewLineToken(newEndOffset, metadata);
		}

		return result;
	}

	public static findIndexInSegmentsArray(tokens: Uint32Array, desiredIndex: number): number {
		if (tokens.length <= 2) {
			return 0;
		}

		let low = 0;
		let high = (tokens.length >>> 1) - 1;

		while (low < high) {

			let mid = low + Math.floor((high - low) / 2);
			let endOffset = tokens[(mid << 1)];

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
}
