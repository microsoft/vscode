/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
export function isObject(obj: any): obj is Object {
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
export function isUndefined(obj: any): obj is undefined {
	return typeof (obj) === _typeof.undefined;
}

/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj: any): obj is undefined | null {
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
	return objects.length > 0 && objects.every(isFunction);
}

export type TypeConstraint = string | Function;

export function validateConstraints(args: any[], constraints: Array<TypeConstraint | undefined>): void {
	const len = Math.min(args.length, constraints.length);
	for (let i = 0; i < len; i++) {
		validateConstraint(args[i], constraints[i]);
	}
}

export function validateConstraint(arg: any, constraint: TypeConstraint | undefined): void {

	if (isString(constraint)) {
		if (typeof arg !== constraint) {
			throw new Error(`argument does not match constraint: typeof ${constraint}`);
		}
	} else if (isFunction(constraint)) {
		try {
			if (arg instanceof constraint) {
				return;
			}
		} catch{
			// ignore
		}
		if (!isUndefinedOrNull(arg) && arg.constructor === constraint) {
			return;
		}
		if (constraint.length === 1 && constraint.call(undefined, arg) === true) {
			return;
		}
		throw new Error(`argument does not match one of these constraints: arg instanceof constraint, arg.constructor === constraint, nor constraint(arg) === true`);
	}
}

export function getAllPropertyNames(obj: object): string[] {
	let res: string[] = [];
	let proto = Object.getPrototypeOf(obj);
	while (Object.prototype !== proto) {
		res = res.concat(Object.getOwnPropertyNames(proto));
		proto = Object.getPrototypeOf(proto);
	}
	return res;
}

export function getAllMethodNames(obj: object): string[] {
	const methods: string[] = [];
	for (const prop of getAllPropertyNames(obj)) {
		if (typeof (obj as any)[prop] === 'function') {
			methods.push(prop);
		}
	}
	return methods;
}

export function createProxyObject<T extends object>(methodNames: string[], invoke: (method: string, args: any[]) => any): T {
	const createProxyMethod = (method: string): () => any => {
		return function () {
			const args = Array.prototype.slice.call(arguments, 0);
			return invoke(method, args);
		};
	};

	let result = {} as T;
	for (const methodName of methodNames) {
		(<any>result)[methodName] = createProxyMethod(methodName);
	}
	return result;
}

/**
 * Converts null to undefined, passes all other values through.
 */
export function withNullAsUndefined<T>(x: T | null): T | undefined {
	return x === null ? undefined : x;
}

/**
 * Converts undefined to null, passes all other values through.
 */
export function withUndefinedAsNull<T>(x: T | undefined): T | null {
	return typeof x === 'undefined' ? null : x;
}
