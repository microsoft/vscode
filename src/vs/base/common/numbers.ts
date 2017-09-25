/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import types = require('vs/base/common/types');

export type NumberCallback = (index: number) => void;

export function count(to: number, callback: NumberCallback): void;
export function count(from: number, to: number, callback: NumberCallback): void;
export function count(fromOrTo: number, toOrCallback?: NumberCallback | number, callback?: NumberCallback): any {
	let from: number;
	let to: number;

	if (types.isNumber(toOrCallback)) {
		from = fromOrTo;
		to = <number>toOrCallback;
	} else {
		from = 0;
		to = fromOrTo;
		callback = <NumberCallback>toOrCallback;
	}

	const op = from <= to ? (i: number) => i + 1 : (i: number) => i - 1;
	const cmp = from <= to ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;

	for (let i = from; cmp(i, to); i = op(i)) {
		callback(i);
	}
}

export function countToArray(to: number): number[];
export function countToArray(from: number, to: number): number[];
export function countToArray(fromOrTo: number, to?: number): number[] {
	const result: number[] = [];
	const fn = (i: number) => result.push(i);

	if (types.isUndefined(to)) {
		count(fromOrTo, fn);
	} else {
		count(fromOrTo, to, fn);
	}

	return result;
}


export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}