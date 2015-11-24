/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const toString = Object.prototype.toString;

export function defined(value: any): boolean {
	return typeof value !== 'undefined';
}

export function undefined(value: any): boolean {
	return typeof value === 'undefined';
}

export function nil(value: any): boolean {
	return value === null;
}

export function boolean(value: any): value is boolean {
	return value === true || value === false;
}

export function string(value: any): value is string {
	return toString.call(value) === '[object String]';
}

export function number(value: any): value is number {
	return toString.call(value) === '[object Number]';
}

export function error(value: any): value is Error {
	return toString.call(value) === '[object Error]';
}

export function func(value: any): value is Function {
	return toString.call(value) === '[object Function]';
}

export function array<T>(value: any): value is T[] {
	return Array.isArray(value);
}

export function stringArray(value: any): value is string[] {
	return array(value) && (<any[]>value).every(elem => string(elem));
}