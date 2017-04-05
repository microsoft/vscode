/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Types from 'vs/base/common/types';

export function clone<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	if (obj instanceof RegExp) {
		// See https://github.com/Microsoft/TypeScript/issues/10990
		return obj as any;
	}
	var result = (Array.isArray(obj)) ? <any>[] : <any>{};
	Object.keys(obj).forEach((key) => {
		if (obj[key] && typeof obj[key] === 'object') {
			result[key] = clone(obj[key]);
		} else {
			result[key] = obj[key];
		}
	});
	return result;
}

export function deepClone<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	var result = (Array.isArray(obj)) ? <any>[] : <any>{};
	Object.getOwnPropertyNames(obj).forEach((key) => {
		if (obj[key] && typeof obj[key] === 'object') {
			result[key] = deepClone(obj[key]);
		} else {
			result[key] = obj[key];
		}
	});
	return result;
}

var hasOwnProperty = Object.prototype.hasOwnProperty;

export function cloneAndChange(obj: any, changer: (orig: any) => any): any {
	return _cloneAndChange(obj, changer, []);
}

function _cloneAndChange(obj: any, changer: (orig: any) => any, encounteredObjects: any[]): any {
	if (Types.isUndefinedOrNull(obj)) {
		return obj;
	}

	var changed = changer(obj);
	if (typeof changed !== 'undefined') {
		return changed;
	}

	if (Types.isArray(obj)) {
		var r1: any[] = [];
		for (var i1 = 0; i1 < obj.length; i1++) {
			r1.push(_cloneAndChange(obj[i1], changer, encounteredObjects));
		}
		return r1;
	}

	if (Types.isObject(obj)) {
		if (encounteredObjects.indexOf(obj) >= 0) {
			throw new Error('Cannot clone recursive data-structure');
		}
		encounteredObjects.push(obj);
		var r2 = {};
		for (var i2 in obj) {
			if (hasOwnProperty.call(obj, i2)) {
				r2[i2] = _cloneAndChange(obj[i2], changer, encounteredObjects);
			}
		}
		encounteredObjects.pop();
		return r2;
	}

	return obj;
}

// DON'T USE THESE FUNCTION UNLESS YOU KNOW HOW CHROME
// WORKS... WE HAVE SEEN VERY WEIRD BEHAVIOUR WITH CHROME >= 37

///**
// * Recursively call Object.freeze on object and any properties that are objects.
// */
//export function deepFreeze(obj:any):void {
//	Object.freeze(obj);
//	Object.keys(obj).forEach((key) => {
//		if(!(typeof obj[key] === 'object') || Object.isFrozen(obj[key])) {
//			return;
//		}
//
//		deepFreeze(obj[key]);
//	});
//	if(!Object.isFrozen(obj)) {
//		console.log('too warm');
//	}
//}
//
//export function deepSeal(obj:any):void {
//	Object.seal(obj);
//	Object.keys(obj).forEach((key) => {
//		if(!(typeof obj[key] === 'object') || Object.isSealed(obj[key])) {
//			return;
//		}
//
//		deepSeal(obj[key]);
//	});
//	if(!Object.isSealed(obj)) {
//		console.log('NOT sealed');
//	}
//}

/**
 * Copies all properties of source into destination. The optional parameter "overwrite" allows to control
 * if existing properties on the destination should be overwritten or not. Defaults to true (overwrite).
 */
export function mixin(destination: any, source: any, overwrite: boolean = true): any {
	if (!Types.isObject(destination)) {
		return source;
	}

	if (Types.isObject(source)) {
		Object.keys(source).forEach((key) => {
			if (key in destination) {
				if (overwrite) {
					if (Types.isObject(destination[key]) && Types.isObject(source[key])) {
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
	sources.forEach(source => Object.keys(source).forEach((key) => destination[key] = source[key]));
	return destination;
}

export function toObject<T>(arr: T[], keyMap: (t: T) => string): { [key: string]: T } {
	return arr.reduce((o, d) => assign(o, { [keyMap(d)]: d }), Object.create(null));
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

	var i: number,
		key: string;

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
		var oneKeys: string[] = [];

		for (key in one) {
			oneKeys.push(key);
		}
		oneKeys.sort();
		var otherKeys: string[] = [];
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

export function ensureProperty(obj: any, property: string, defaultValue: any) {
	if (typeof obj[property] === 'undefined') {
		obj[property] = defaultValue;
	}
}

export function arrayToHash(array: any[]) {
	var result: any = {};
	for (var i = 0; i < array.length; ++i) {
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
	var hash = arrayToHash(arr);
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
 * Started from TypeScript's __extends function to make a type a subclass of a specific class.
 * Modified to work with properties already defined on the derivedClass, since we can't get TS
 * to call this method before the constructor definition.
 */
export function derive(baseClass: any, derivedClass: any): void {

	for (var prop in baseClass) {
		if (baseClass.hasOwnProperty(prop)) {
			derivedClass[prop] = baseClass[prop];
		}
	}

	derivedClass = derivedClass || function () { };
	var basePrototype = baseClass.prototype;
	var derivedPrototype = derivedClass.prototype;
	derivedClass.prototype = Object.create(basePrototype);

	for (var prop in derivedPrototype) {
		if (derivedPrototype.hasOwnProperty(prop)) {
			// handle getters and setters properly
			Object.defineProperty(derivedClass.prototype, prop, Object.getOwnPropertyDescriptor(derivedPrototype, prop));
		}
	}

	// Cast to any due to Bug 16188:PropertyDescriptor set and get function should be optional.
	Object.defineProperty(derivedClass.prototype, 'constructor', <any>{ value: derivedClass, writable: true, configurable: true, enumerable: true });
}

/**
 * Calls JSON.Stringify with a replacer to break apart any circular references.
 * This prevents JSON.stringify from throwing the exception
 *  "Uncaught TypeError: Converting circular structure to JSON"
 */
export function safeStringify(obj: any): string {
	var seen: any[] = [];
	return JSON.stringify(obj, (key, value) => {

		if (Types.isObject(value) || Array.isArray(value)) {
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
export function distinct<T>(base: obj, target: obj): obj {
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