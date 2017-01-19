/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { done } from './util';

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return (target: any, key: string, descriptor: any) => {
		let fnKey: string | null = null;
		let fn: Function | null = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn || !fnKey) {
			throw new Error('not supported');
		}

		descriptor[fnKey] = decorator(fn, key);
	};
}

function _memoize(fn: Function, key: string): Function {
	const memoizeKey = `$memoize$${key}`;

	return function (...args: any[]) {
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

export const memoize = decorate(_memoize);

function _throttle<T>(fn: Function): Function {
	let current: Promise<T> | undefined;
	let next: Promise<T> | undefined;

	const trigger = function (...args: any[]) {
		if (next) {
			return next;
		}

		if (current) {
			next = done(current).then(() => {
				next = undefined;
				return trigger.apply(this, args);
			});

			return next;
		}

		current = fn.apply(this, args) as Promise<T>;

		done(current).then(() => {
			current = undefined;
		});

		return current;
	};

	return trigger;
}

export const throttle = decorate(_throttle);

export function debounce(delay: number): Function {
	return decorate((fn, key) => {
		const timerKey = `$debounce$${key}`;

		return function (...args: any[]) {
			clearTimeout(this[timerKey]);
			this[timerKey] = setTimeout(() => fn.apply(this, args), delay);
		};
	});
}