/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

const _typeof = {
	number: 'number',
	string: 'string',
	undefined: 'undefined',
	object: 'object',
	function: 'function'
};

/**
 * @returns whether the provided parameter is a JavaScript Array or not.
 */
export function isArray(array: any): array is any[] {
	if (Array.isArray) {
		return Array.isArray(array);
	}

	if (array && typeof (array.length) === _typeof.number && array.constructor === Array) {
		return true;
	}

	return false;
}

/**
 * @returns whether the provided parameter is a JavaScript String or not.
 */
export function isString(str: any): str is string {
	if (typeof (str) === _typeof.string || str instanceof String) {
		return true;
	}

	return false;
}

/**
 * @returns whether the provided parameter is a JavaScript Array and each element in the array is a string.
 */
export function isStringArray(value: any): value is string[] {
	return isArray(value) && (<any[]>value).every(elem => isString(elem));
}

/**
 *
 * @returns whether the provided parameter is of type `object` but **not**
 *	`null`, an `array`, a `regexp`, nor a `date`.
 */
export function isObject(obj: any): boolean {
	// The method can't do a type cast since there are type (like strings) which
	// are subclasses of any put not positvely matched by the function. Hence type
	// narrowing results in wrong results.
	return typeof obj === _typeof.object
		&& obj !== null
		&& !Array.isArray(obj)
		&& !(obj instanceof RegExp)
		&& !(obj instanceof Date);
}

/**
 * In **contrast** to just checking `typeof` this will return `false` for `NaN`.
 * @returns whether the provided parameter is a JavaScript Number or not.
 */
export function isNumber(obj: any): obj is number {
	if ((typeof (obj) === _typeof.number || obj instanceof Number) && !isNaN(obj)) {
		return true;
	}

	return false;
}

/**
 * @returns whether the provided parameter is a JavaScript Boolean or not.
 */
export function isBoolean(obj: any): obj is boolean {
	return obj === true || obj === false;
}

/**
 * @returns whether the provided parameter is undefined.
 */
export function isUndefined(obj: any): boolean {
	return typeof (obj) === _typeof.undefined;
}

/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj: any): boolean {
	return isUndefined(obj) || obj === null;
}


const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * @returns whether the provided parameter is an empty JavaScript Object or not.
 */
export function isEmptyObject(obj: any): obj is any {
	if (!isObject(obj)) {
		return false;
	}

	for (let key in obj) {
		if (hasOwnProperty.call(obj, key)) {
			return false;
		}
	}

	return true;
}

/**
 * @returns whether the provided parameter is a JavaScript Function or not.
 */
export function isFunction(obj: any): obj is Function {
	return typeof obj === _typeof.function;
}

/**
 * @returns whether the provided parameters is are JavaScript Function or not.
 */
export function areFunctions(...objects: any[]): boolean {
	return objects && objects.length > 0 && objects.every(isFunction);
}

export type TypeConstraint = string | Function;

export function validateConstraints(args: any[], constraints: TypeConstraint[]): void {
	const len = Math.min(args.length, constraints.length);
	for (let i = 0; i < len; i++) {
		validateConstraint(args[i], constraints[i]);
	}
}

export function validateConstraint(arg: any, constraint: TypeConstraint): void {

	if (isString(constraint)) {
		if (typeof arg !== constraint) {
			throw new Error(`argument does not match constraint: typeof ${constraint}`);
		}
	} else if (isFunction(constraint)) {
		if (arg instanceof constraint) {
			return;
		}
		if (arg && arg.constructor === constraint) {
			return;
		}
		if (constraint.length === 1 && constraint.call(undefined, arg) === true) {
			return;
		}
		throw new Error(`argument does not match one of these constraints: arg instanceof constraint, arg.constructor === constraint, nor constraint(arg) === true`);
	}
}

/**
 * Creates a new object of the provided class and will call the constructor with
 * any additional argument supplied.
 */
export function create(ctor: Function, ...args: any[]): any {
	let obj = Object.create(ctor.prototype);
	ctor.apply(obj, args);

	return obj;
}

export interface IFunction0<T> {
	(): T;
}
export interface IFunction1<A1, T> {
	(a1: A1): T;
}
export interface IFunction2<A1, A2, T> {
	(a1: A1, a2: A2): T;
}
export interface IFunction3<A1, A2, A3, T> {
	(a1: A1, a2: A2, a3: A3): T;
}
export interface IFunction4<A1, A2, A3, A4, T> {
	(a1: A1, a2: A2, a3: A3, a4: A4): T;
}
export interface IFunction5<A1, A2, A3, A4, A5, T> {
	(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): T;
}
export interface IFunction6<A1, A2, A3, A4, A5, A6, T> {
	(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): T;
}
export interface IFunction7<A1, A2, A3, A4, A5, A6, A7, T> {
	(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): T;
}
export interface IFunction8<A1, A2, A3, A4, A5, A6, A7, A8, T> {
	(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): T;
}

export interface IAction0 extends IFunction0<void> { }
export interface IAction1<A1> extends IFunction1<A1, void> { }
export interface IAction2<A1, A2> extends IFunction2<A1, A2, void> { }
export interface IAction3<A1, A2, A3> extends IFunction3<A1, A2, A3, void> { }
export interface IAction4<A1, A2, A3, A4> extends IFunction4<A1, A2, A3, A4, void> { }
export interface IAction5<A1, A2, A3, A4, A5> extends IFunction5<A1, A2, A3, A4, A5, void> { }
export interface IAction6<A1, A2, A3, A4, A5, A6> extends IFunction6<A1, A2, A3, A4, A5, A6, void> { }
export interface IAction7<A1, A2, A3, A4, A5, A6, A7> extends IFunction7<A1, A2, A3, A4, A5, A6, A7, void> { }
export interface IAction8<A1, A2, A3, A4, A5, A6, A7, A8> extends IFunction8<A1, A2, A3, A4, A5, A6, A7, A8, void> { }

export interface IAsyncFunction0<T> extends IFunction0<TPromise<T>> { }
export interface IAsyncFunction1<A1, T> extends IFunction1<A1, TPromise<T>> { }
export interface IAsyncFunction2<A1, A2, T> extends IFunction2<A1, A2, TPromise<T>> { }
export interface IAsyncFunction3<A1, A2, A3, T> extends IFunction3<A1, A2, A3, TPromise<T>> { }
export interface IAsyncFunction4<A1, A2, A3, A4, T> extends IFunction4<A1, A2, A3, A4, TPromise<T>> { }
export interface IAsyncFunction5<A1, A2, A3, A4, A5, T> extends IFunction5<A1, A2, A3, A4, A5, TPromise<T>> { }
export interface IAsyncFunction6<A1, A2, A3, A4, A5, A6, T> extends IFunction6<A1, A2, A3, A4, A5, A6, TPromise<T>> { }
export interface IAsyncFunction7<A1, A2, A3, A4, A5, A6, A7, T> extends IFunction7<A1, A2, A3, A4, A5, A6, A7, TPromise<T>> { }
export interface IAsyncFunction8<A1, A2, A3, A4, A5, A6, A7, A8, T> extends IFunction8<A1, A2, A3, A4, A5, A6, A7, A8, TPromise<T>> { }

