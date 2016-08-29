/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Arrays} from 'vs/editor/common/core/arrays';

export class Token {
	_tokenBrand: void;

	public startIndex:number;
	public type:string;

	constructor(startIndex:number, type:string) {
		this.startIndex = startIndex|0;// @perf
		this.type = type;
	}

	public toString(): string {
		return '(' + this.startIndex + ', ' + this.type + ')';
	}

	public equals(other:Token): boolean {
		return (
			this.startIndex === other.startIndex
			&& this.type === other.type
		);
	}

	public static findIndexInSegmentsArray(arr:Token[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}

	public static equalsArray(a:Token[], b:Token[]): boolean {
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
