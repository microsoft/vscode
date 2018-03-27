/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export function createDecorator(mapFn: (fn: Function, key: string) => Function): Function {
	return (target: any, key: string, descriptor: any) => {
		let fnKey: string = null;
		let fn: Function = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn) {
			throw new Error('not supported');
		}

		descriptor[fnKey] = mapFn(fn, key);
	};
}

export function memoize(target: any, key: string, descriptor: any) {
	let fnKey: string = null;
	let fn: Function = null;

	if (typeof descriptor.value === 'function') {
		fnKey = 'value';
		fn = descriptor.value;

		if (fn.length !== 0) {
			console.warn('Memoize should only be used in functions with zero parameters');
		}
	} else if (typeof descriptor.get === 'function') {
		fnKey = 'get';
		fn = descriptor.get;
	}

	if (!fn) {
		throw new Error('not supported');
	}

	const memoizeKey = `$memoize$${key}`;

	descriptor[fnKey] = function (...args: any[]) {
		if (!this.hasOwnProperty(memoizeKey)) {
			Object.defineProperty(this, memoizeKey, {
				configurable: false,
				enumerable: false,
				writable: false,
				value: fn.apply(this, args)
			});
		}

		return this[memoizeKey];
	};
}

export interface IDebouceReducer<T> {
	(previousValue: T, ...args: any[]): T;
}

export function debounce<T>(delay: number, reducer?: IDebouceReducer<T>, initialValue?: T): Function {
	return createDecorator((fn, key) => {
		const timerKey = `$debounce$${key}`;
		let result = initialValue;

		return function (this: any, ...args: any[]) {
			clearTimeout(this[timerKey]);

			if (reducer) {
				result = reducer(result, ...args);
				args = [result];
			}

			this[timerKey] = setTimeout(() => fn.apply(this, args), delay);
		};
	});
}