/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * A token on a line.
 */
export class ViewLineToken {
	_viewLineTokenBrand: void;

	/**
	 * last char index of this token (not inclusive).
	 */
	public readonly endIndex: number;
	public readonly type: string;

	constructor(endIndex: number, type: string) {
		this.endIndex = endIndex;
		this.type = type;
	}

	private static _equals(a: ViewLineToken, b: ViewLineToken): boolean {
		return (
			a.endIndex === b.endIndex
			&& a.type === b.type
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
