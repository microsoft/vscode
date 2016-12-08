/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const toString = Object.prototype.toString;

export function defined(value: any): boolean {
	return typeof value !== 'undefined';
}

export function boolean(value: any): value is boolean {
	return value === true || value === false;
}

export function string(value: any): value is string {
	return toString.call(value) === '[object String]';
}
