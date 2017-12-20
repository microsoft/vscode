/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { isObject, isUndefinedOrNull, isArray } from 'vs/base/common/types';

export function deepClone<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	if (obj instanceof RegExp) {
		// See https://github.com/Microsoft/TypeScript/issues/10990
		return obj as any;
	}
	const result: any = Array.isArray(obj) ? [] : {};
	Object.keys(obj).forEach((key: keyof T) => {
		if (obj[key] && typeof obj[key] === 'object') {
			result[key] = deepClone(obj[key]);
		} else {
			result[key] = obj[key];
		}
	});
	return result;
}

export function deepFreeze<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	const stack: any[] = [obj];
	while (stack.length > 0) {
		let obj = stack.shift();
		Object.freeze(obj);
		for (const key in obj) {
			if (_hasOwnProperty.call(obj, key)) {
				let prop = obj[key];
				if (typeof prop === 'object' && !Object.isFrozen(prop)) {
					stack.push(prop);
				}
			}
		}
	}
	return obj;
}

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function cloneAndChange(obj: any, changer: (orig: any) => any): any {
	return _cloneAndChange(obj, changer, []);
}

function _cloneAndChange(obj: any, changer: (orig: any) => any, encounteredObjects: any[]): any {
	if (isUndefinedOrNull(obj)) {
		return obj;
	}

	const changed = changer(obj);
	if (typeof changed !== 'undefined') {
		return changed;
	}

	if (isArray(obj)) {
		const r1: any[] = [];
		for (let i1 = 0; i1 < obj.length; i1++) {
			r1.push(_cloneAndChange(obj[i1], changer, encounteredObjects));
		}
		return r1;
	}

	if (isObject(obj)) {
		if (encounteredObjects.indexOf(obj) >= 0) {
			throw new Error('Cannot clone recursive data-structure');
		}
		encounteredObjects.push(obj);
		const r2 = {};
		for (let i2 in obj) {
			if (_hasOwnProperty.call(obj, i2)) {
				(r2 as any)[i2] = _cloneAndChange(obj[i2], changer, encounteredObjects);
			}
		}
		encounteredObjects.pop();
		return r2;
	}

	return obj;
}

/**
 * Copies all properties of source into destination. The optional parameter "overwrite" allows to control
 * if existing properties on the destination should be overwritten or not. Defaults to true (overwrite).
 */
export function mixin(destination: any, source: any, overwrite: boolean = true): any {
	if (!isObject(destination)) {
		return source;
	}

	if (isObject(source)) {
		Object.keys(source).forEach(key => {
			if (key in destination) {
				if (overwrite) {
					if (isObject(destination[key]) && isObject(source[key])) {
						mixin(destination[key], source[key], overwrite);
					} else {
						destination[key] = source[key];
					}
				}
			} else {
				destination[key] = source[key];
			}
		});
	}
	return destination;
}

export function assign(destination: any, ...sources: any[]): any {
	sources.forEach(source => Object.keys(source).forEach(key => destination[key] = source[key]));
	return destination;
}

export function equals(one: any, other: any): boolean {
	if (one === other) {
		return true;
	}
	if (one === null || one === undefined || other === null || other === undefined) {
		return false;
	}
	if (typeof one !== typeof other) {
		return false;
	}
	if (typeof one !== 'object') {
		return false;
	}
	if ((Array.isArray(one)) !== (Array.isArray(other))) {
		return false;
	}

	let i: number;
	let key: string;

	if (Array.isArray(one)) {
		if (one.length !== other.length) {
			return false;
		}
		for (i = 0; i < one.length; i++) {
			if (!equals(one[i], other[i])) {
				return false;
			}
		}
	} else {
		const oneKeys: string[] = [];

		for (key in one) {
			oneKeys.push(key);
		}
		oneKeys.sort();
		const otherKeys: string[] = [];
		for (key in other) {
			otherKeys.push(key);
		}
		otherKeys.sort();
		if (!equals(oneKeys, otherKeys)) {
			return false;
		}
		for (i = 0; i < oneKeys.length; i++) {
			if (!equals(one[oneKeys[i]], other[oneKeys[i]])) {
				return false;
			}
		}
	}
	return true;
}

export function arrayToHash(array: any[]) {
	const result: any = {};
	for (let i = 0; i < array.length; ++i) {
		result[array[i]] = true;
	}
	return result;
}

/**
 * Given an array of strings, returns a function which, given a string
 * returns true or false whether the string is in that array.
 */
export function createKeywordMatcher(arr: string[], caseInsensitive: boolean = false): (str: string) => boolean {
	if (caseInsensitive) {
		arr = arr.map(function (x) { return x.toLowerCase(); });
	}
	const hash = arrayToHash(arr);
	if (caseInsensitive) {
		return function (word) {
			return hash[word.toLowerCase()] !== undefined && hash.hasOwnProperty(word.toLowerCase());
		};
	} else {
		return function (word) {
			return hash[word] !== undefined && hash.hasOwnProperty(word);
		};
	}
}

/**
 * Calls JSON.Stringify with a replacer to break apart any circular references.
 * This prevents JSON.stringify from throwing the exception
 *  "Uncaught TypeError: Converting circular structure to JSON"
 */
export function safeStringify(obj: any): string {
	const seen: any[] = [];
	return JSON.stringify(obj, (key, value) => {
		if (isObject(value) || Array.isArray(value)) {
			if (seen.indexOf(value) !== -1) {
				return '[Circular]';
			} else {
				seen.push(value);
			}
		}
		return value;
	});
}

export function getOrDefault<T, R>(obj: T, fn: (obj: T) => R, defaultValue: R = null): R {
	const result = fn(obj);
	return typeof result === 'undefined' ? defaultValue : result;
}

/**
 * Returns an object that has keys for each value that is different in the base object. Keys
 * that do not exist in the target but in the base object are not considered.
 *
 * Note: This is not a deep-diffing method, so the values are strictly taken into the resulting
 * object if they differ.
 *
 * @param base the object to diff against
 * @param obj the object to use for diffing
 */
export type obj = { [key: string]: any; };
export function distinct(base: obj, target: obj): obj {
	const result = Object.create(null);

	if (!base || !target) {
		return result;
	}

	const targetKeys = Object.keys(target);
	targetKeys.forEach(k => {
		const baseValue = base[k];
		const targetValue = target[k];

		if (!equals(baseValue, targetValue)) {
			result[k] = targetValue;
		}
	});

	return result;
}
