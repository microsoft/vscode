/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Arrays } from 'vs/editor/common/core/arrays';

/**
 * A token on a line.
 */
export class ViewLineToken {
	_viewLineTokenBrand: void;

	public readonly startIndex: number;
	public readonly type: string;

	constructor(startIndex: number, type: string) {
		this.startIndex = startIndex | 0;// @perf
		this.type = type.replace(/[^a-z0-9\-]/gi, ' ');
	}

	public equals(other: ViewLineToken): boolean {
		return (
			this.startIndex === other.startIndex
			&& this.type === other.type
		);
	}

	public static findIndexInSegmentsArray(arr: ViewLineToken[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}

	public static equalsArray(a: ViewLineToken[], b: ViewLineToken[]): boolean {
		let aLen = a.length;
		let bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			if (!a[i].equals(b[i])) {
				return false;
			}
		}
		return true;
	}
}

export class ViewLineTokens {
	_viewLineTokensBrand: void;

	private _lineTokens: ViewLineToken[];
	private _fauxIndentLength: number;
	private _textLength: number;

	constructor(lineTokens: ViewLineToken[], fauxIndentLength: number, textLength: number) {
		this._lineTokens = lineTokens;
		this._fauxIndentLength = fauxIndentLength | 0;
		this._textLength = textLength | 0;
	}

	public getTokens(): ViewLineToken[] {
		return this._lineTokens;
	}

	public getFauxIndentLength(): number {
		return this._fauxIndentLength;
	}

	public getTextLength(): number {
		return this._textLength;
	}

	public equals(other: ViewLineTokens): boolean {
		return (
			this._fauxIndentLength === other._fauxIndentLength
			&& this._textLength === other._textLength
			&& ViewLineToken.equalsArray(this._lineTokens, other._lineTokens)
		);
	}

	public findIndexOfOffset(offset: number): number {
		return ViewLineToken.findIndexInSegmentsArray(this._lineTokens, offset);
	}
}
