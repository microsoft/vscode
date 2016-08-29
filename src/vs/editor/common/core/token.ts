/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export class Token {
	_tokenBrand: void;

	public startIndex:number;
	public type:string;

	constructor(startIndex:number, type:string) {
		this.startIndex = startIndex;
		this.type = type;
	}

	public toString(): string {
		return '(' + this.startIndex + ', ' + this.type + ')';
	}
}
