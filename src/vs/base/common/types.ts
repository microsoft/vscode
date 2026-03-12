/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from './assert.js';

/**
 * @returns whether the provided parameter is a JavaScript String or not.
 */
export function isString(str: unknown): str is string {
	return (typeof str === 'string');
}

/**
 * @returns whether the provided parameter is a JavaScript Array and each element in the array is a string.
 */
export function isStringArray(value: unknown): value is string[] {
	return isArrayOf(value, isString);
}

/**
 * @returns whether the provided parameter is a JavaScript Array and each element in the array satisfies the provided type guard.
 */
export function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
	return Array.isArray(value) && value.every(check);
}

/**
 * @returns whether the provided parameter is of type `object` but **not**
 *	`null`, an `array`, a `regexp`, nor a `date`.
 */
export function isObject(obj: unknown): obj is Object {
	// The method can't do a type cast since there are type (like strings) which
	// are subclasses of any put not positvely matched by the function. Hence type
	// narrowing results in wrong results.
	return typeof obj === 'object'
		&& obj !== null
		&& !Array.isArray(obj)
		&& !(obj instanceof RegExp)
		&& !(obj instanceof Date);
}

/**
 * @returns whether the provided parameter is of type `Buffer` or Uint8Array dervived type
 */
export function isTypedArray(obj: unknown): obj is Object {
	const TypedArray = Object.getPrototypeOf(Uint8Array);
	return typeof obj === 'object'
		&& obj instanceof TypedArray;
}

/**
 * In **contrast** to just checking `typeof` this will return `false` for `NaN`.
 * @returns whether the provided parameter is a JavaScript Number or not.
 */
export function isNumber(obj: unknown): obj is number {
	return (typeof obj === 'number' && !isNaN(obj));
}

/**
 * @returns whether the provided parameter is an Iterable, casting to the given generic
 */
export function isIterable<T>(obj: unknown): obj is Iterable<T> {
	// eslint-disable-next-line local/code-no-any-casts
	return !!obj && typeof (obj as any)[Symbol.iterator] === 'function';
}

/**
 * @returns whether the provided parameter is an Iterable, casting to the given generic
 */
export function isAsyncIterable<T>(obj: unknown): obj is AsyncIterable<T> {
	// eslint-disable-next-line local/code-no-any-casts
	return !!obj && typeof (obj as any)[Symbol.asyncIterator] === 'function';
}

/**
 * @returns whether the provided parameter is a JavaScript Boolean or not.
 */
export function isBoolean(obj: unknown): obj is boolean {
	return (obj === true || obj === false);
}

/**
 * @returns whether the provided parameter is undefined.
 */
export function isUndefined(obj: unknown): obj is undefined {
	return (typeof obj === 'undefined');
}

/**
 * @returns whether the provided parameter is defined.
 */
export function isDefined<T>(arg: T | null | undefined): arg is T {
	return !isUndefinedOrNull(arg);
}

/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj: unknown): obj is undefined | null {
	return (isUndefined(obj) || obj === null);
}


export function assertType(condition: unknown, type?: string): asserts condition {
	if (!condition) {
		throw new Error(type ? `Unexpected type, expected '${type}'` : 'Unexpected type');
	}
}

/**
 * Asserts that the argument passed in is neither undefined nor null.
 *
 * @see {@link assertDefined} for a similar utility that leverages TS assertion functions to narrow down the type of `arg` to be non-nullable.
 */
export function assertReturnsDefined<T>(arg: T | null | undefined): NonNullable<T> {
	assert(
		arg !== null && arg !== undefined,
		'Argument is `undefined` or `null`.',
	);

	return arg;
}

/**
 * Asserts that a provided `value` is `defined` - not `null` or `undefined`,
 * throwing an error with the provided error or error message, while also
 * narrowing down the type of the `value` to be `NonNullable` using TS
 * assertion functions.
 *
 * @throws if the provided `value` is `null` or `undefined`.
 *
 * ## Examples
 *
 * ```typescript
 * // an assert with an error message
 * assertDefined('some value', 'String constant is not defined o_O.');
 *
 * // `throws!` the provided error
 * assertDefined(null, new Error('Should throw this error.'));
 *
 * // narrows down the type of `someValue` to be non-nullable
 * const someValue: string | undefined | null = blackbox();
 * assertDefined(someValue, 'Some value must be defined.');
 * console.log(someValue.length); // now type of `someValue` is `string`
 * ```
 *
 * @see {@link assertReturnsDefined} for a similar utility but without assertion.
 * @see {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions typescript-3-7.html#assertion-functions}
 */
export function assertDefined<T>(value: T, error: string | NonNullable<Error>): asserts value is NonNullable<T> {
	if (value === null || value === undefined) {
		const errorToThrow = typeof error === 'string' ? new Error(error) : error;

		throw errorToThrow;
	}
}

/**
 * Asserts that each argument passed in is neither undefined nor null.
 */
export function assertReturnsAllDefined<T1, T2>(t1: T1 | null | undefined, t2: T2 | null | undefined): [T1, T2];
export function assertReturnsAllDefined<T1, T2, T3>(t1: T1 | null | undefined, t2: T2 | null | undefined, t3: T3 | null | undefined): [T1, T2, T3];
export function assertReturnsAllDefined<T1, T2, T3, T4>(t1: T1 | null | undefined, t2: T2 | null | undefined, t3: T3 | null | undefined, t4: T4 | null | undefined): [T1, T2, T3, T4];
export function assertReturnsAllDefined(...args: (unknown | null | undefined)[]): unknown[] {
	const result = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (isUndefinedOrNull(arg)) {
			throw new Error(`Assertion Failed: argument at index ${i} is undefined or null`);
		}

		result.push(arg);
	}

	return result;
}

/**
 * Checks if the provided value is one of the vales in the provided list.
 *
 * ## Examples
 *
 * ```typescript
 * // note! item type is a `subset of string`
 * type TItem = ':' | '.' | '/';
 *
 * // note! item is type of `string` here
 * const item: string = ':';
 * // list of the items to check against
 * const list: TItem[] = [':', '.'];
 *
 * // ok
 * assert(
 *   isOneOf(item, list),
 *   'Must succeed.',
 * );
 *
 * // `item` is of `TItem` type now
 * ```
 */
export const isOneOf = <TType, TSubtype extends TType>(
	value: TType,
	validValues: readonly TSubtype[],
): value is TSubtype => {
	// note! it is OK to type cast here, because we rely on the includes
	//       utility to check if the value is present in the provided list
	return validValues.includes(<TSubtype>value);
};

/**
 * Compile-time type check of a variable.
 */
export function typeCheck<T = never>(_thing: NoInfer<T>): void { }

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * @returns whether the provided parameter is an empty JavaScript Object or not.
 */
export function isEmptyObject(obj: unknown): obj is object {
	if (!isObject(obj)) {
		return false;
	}

	for (const key in obj) {
		if (hasOwnProperty.call(obj, key)) {
			return false;
		}
	}

	return true;
}

/**
 * @returns whether the provided parameter is a JavaScript Function or not.
 */
export function isFunction(obj: unknown): obj is Function {
	return (typeof obj === 'function');
}

/**
 * @returns whether the provided parameters is are JavaScript Function or not.
 */
export function areFunctions(...objects: unknown[]): boolean {
	return objects.length > 0 && objects.every(isFunction);
}

export type TypeConstraint = string | Function;

export function validateConstraints(args: unknown[], constraints: Array<TypeConstraint | undefined>): void {
	const len = Math.min(args.length, constraints.length);
	for (let i = 0; i < len; i++) {
		validateConstraint(args[i], constraints[i]);
	}
}

export function validateConstraint(arg: unknown, constraint: TypeConstraint | undefined): void {

	if (isString(constraint)) {
		if (typeof arg !== constraint) {
			throw new Error(`argument does not match constraint: typeof ${constraint}`);
		}
	} else if (isFunction(constraint)) {
		try {
			if (arg instanceof constraint) {
				return;
			}
		} catch {
			// ignore
		}
		// eslint-disable-next-line local/code-no-any-casts
		if (!isUndefinedOrNull(arg) && (arg as any).constructor === constraint) {
			return;
		}
		if (constraint.length === 1 && constraint.call(undefined, arg) === true) {
			return;
		}
		throw new Error(`argument does not match one of these constraints: arg instanceof constraint, arg.constructor === constraint, nor constraint(arg) === true`);
	}
}

/**
 * Helper type assertion that safely upcasts a type to a supertype.
 *
 * This can be used to make sure the argument correctly conforms to the subtype while still being able to pass it
 * to contexts that expects the supertype.
 */
export function upcast<Base, Sub extends Base = Base>(x: Sub): Base {
	return x;
}

type AddFirstParameterToFunction<T, TargetFunctionsReturnType, FirstParameter> = T extends (...args: any[]) => TargetFunctionsReturnType ?
	// Function: add param to function
	(firstArg: FirstParameter, ...args: Parameters<T>) => ReturnType<T> :

	// Else: just leave as is
	T;

/**
 * Allows to add a first parameter to functions of a type.
 */
export type AddFirstParameterToFunctions<Target, TargetFunctionsReturnType, FirstParameter> = {
	// For every property
	[K in keyof Target]: AddFirstParameterToFunction<Target[K], TargetFunctionsReturnType, FirstParameter>;
};

/**
 * Given an object with all optional properties, requires at least one to be defined.
 * i.e. AtLeastOne<MyObject>;
 */
export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

/**
 * Only picks the non-optional properties of a type.
 */
export type OmitOptional<T> = { [K in keyof T as T[K] extends Required<T>[K] ? K : never]: T[K] };

/**
 * A type that removed readonly-less from all properties of `T`
 */
export type Mutable<T> = {
	-readonly [P in keyof T]: T[P]
};

/**
 * A type that adds readonly to all properties of T, recursively.
 */
export type DeepImmutable<T> = T extends (infer U)[]
	? ReadonlyArray<DeepImmutable<U>>
	: T extends ReadonlyArray<infer U>
	? ReadonlyArray<DeepImmutable<U>>
	: T extends Map<infer K, infer V>
	? ReadonlyMap<K, DeepImmutable<V>>
	: T extends Set<infer U>
	? ReadonlySet<DeepImmutable<U>>
	: T extends object
	? {
		readonly [K in keyof T]: DeepImmutable<T[K]>;
	}
	: T;

/**
 * A single object or an array of the objects.
 */
export type SingleOrMany<T> = T | T[];

/**
 * Given a `type X = { foo?: string }` checking that an object `satisfies X`
 * will ensure each property was explicitly defined, ensuring no properties
 * are omitted or forgotten.
 */
export type WithDefinedProps<T> = { [K in keyof Required<T>]: T[K] };


/**
 * A type that recursively makes all properties of `T` required
 */
export type DeepRequiredNonNullable<T> = {
	[P in keyof T]-?: T[P] extends object ? DeepRequiredNonNullable<T[P]> : Required<NonNullable<T[P]>>;
};


/**
 * Represents a type that is a partial version of a given type `T`, where all properties are optional and can be deeply nested.
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : Partial<T[P]>;
};

/**
 * Represents a type that is a partial version of a given type `T`, except a subset.
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;


type KeysOfUnionType<T> = T extends T ? keyof T : never;
type FilterType<T, TTest> = T extends TTest ? T : never;
type MakeOptionalAndTrue<T extends object> = { [K in keyof T]?: true };

/**
 * Type guard that checks if an object has specific keys and narrows the type accordingly.
 *
 * @param x - The object to check
 * @param key - An object with boolean values indicating which keys to check for
 * @returns true if all specified keys exist in the object, false otherwise
 *
 * @example
 * ```typescript
 * type A = { a: string };
 * type B = { b: number };
 * const obj: A | B = getObject();
 *
 * if (hasKey(obj, { a: true })) {
 *   // obj is now narrowed to type A
 *   console.log(obj.a);
 * }
 * ```
 */
export function hasKey<T extends object, TKeys extends MakeOptionalAndTrue<T>>(x: T, key: TKeys): x is FilterType<T, { [K in KeysOfUnionType<T> & keyof TKeys]: unknown }> {
	for (const k in key) {
		if (!(k in x)) {
			return false;
		}
	}
	return true;
}
