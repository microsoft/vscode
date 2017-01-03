/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export class Token {
	_tokenBrand: void;

	public readonly offset: number;
	public readonly type: string;
	public readonly language: string;

	constructor(offset: number, type: string, language: string) {
		this.offset = offset | 0;// @perf
		this.type = type;
		this.language = language;
	}

	public toString(): string {
		return '(' + this.offset + ', ' + this.type + ')';
	}
}
