/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert } from './assert.js';
/**
 * @returns whether the provided parameter is a JavaScript String or not.
 */
export function isString(str) {
    return (typeof str === 'string');
}
/**
 * @returns whether the provided parameter is a JavaScript Array and each element in the array is a string.
 */
export function isStringArray(value) {
    return isArrayOf(value, isString);
}
/**
 * @returns whether the provided parameter is a JavaScript Array and each element in the array satisfies the provided type guard.
 */
export function isArrayOf(value, check) {
    return Array.isArray(value) && value.every(check);
}
/**
 * @returns whether the provided parameter is of type `object` but **not**
 *	`null`, an `array`, a `regexp`, nor a `date`.
 */
export function isObject(obj) {
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
export function isTypedArray(obj) {
    const TypedArray = Object.getPrototypeOf(Uint8Array);
    return typeof obj === 'object'
        && obj instanceof TypedArray;
}
/**
 * In **contrast** to just checking `typeof` this will return `false` for `NaN`.
 * @returns whether the provided parameter is a JavaScript Number or not.
 */
export function isNumber(obj) {
    return (typeof obj === 'number' && !isNaN(obj));
}
/**
 * @returns whether the provided parameter is an Iterable, casting to the given generic
 */
export function isIterable(obj) {
    // eslint-disable-next-line local/code-no-any-casts
    return !!obj && typeof obj[Symbol.iterator] === 'function';
}
/**
 * @returns whether the provided parameter is an Iterable, casting to the given generic
 */
export function isAsyncIterable(obj) {
    // eslint-disable-next-line local/code-no-any-casts
    return !!obj && typeof obj[Symbol.asyncIterator] === 'function';
}
/**
 * @returns whether the provided parameter is a JavaScript Boolean or not.
 */
export function isBoolean(obj) {
    return (obj === true || obj === false);
}
/**
 * @returns whether the provided parameter is undefined.
 */
export function isUndefined(obj) {
    return (typeof obj === 'undefined');
}
/**
 * @returns whether the provided parameter is defined.
 */
export function isDefined(arg) {
    return !isUndefinedOrNull(arg);
}
/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj) {
    return (isUndefined(obj) || obj === null);
}
export function assertType(condition, type) {
    if (!condition) {
        throw new Error(type ? `Unexpected type, expected '${type}'` : 'Unexpected type');
    }
}
/**
 * Asserts that the argument passed in is neither undefined nor null.
 *
 * @see {@link assertDefined} for a similar utility that leverages TS assertion functions to narrow down the type of `arg` to be non-nullable.
 */
export function assertReturnsDefined(arg) {
    assert(arg !== null && arg !== undefined, 'Argument is `undefined` or `null`.');
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
export function assertDefined(value, error) {
    if (value === null || value === undefined) {
        const errorToThrow = typeof error === 'string' ? new Error(error) : error;
        throw errorToThrow;
    }
}
export function assertReturnsAllDefined(...args) {
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
export const isOneOf = (value, validValues) => {
    // note! it is OK to type cast here, because we rely on the includes
    //       utility to check if the value is present in the provided list
    return validValues.includes(value);
};
/**
 * Compile-time type check of a variable.
 */
export function typeCheck(_thing) { }
const hasOwnProperty = Object.prototype.hasOwnProperty;
/**
 * @returns whether the provided parameter is an empty JavaScript Object or not.
 */
export function isEmptyObject(obj) {
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
export function isFunction(obj) {
    return (typeof obj === 'function');
}
/**
 * @returns whether the provided parameters is are JavaScript Function or not.
 */
export function areFunctions(...objects) {
    return objects.length > 0 && objects.every(isFunction);
}
export function validateConstraints(args, constraints) {
    const len = Math.min(args.length, constraints.length);
    for (let i = 0; i < len; i++) {
        validateConstraint(args[i], constraints[i]);
    }
}
export function validateConstraint(arg, constraint) {
    if (isString(constraint)) {
        if (typeof arg !== constraint) {
            throw new Error(`argument does not match constraint: typeof ${constraint}`);
        }
    }
    else if (isFunction(constraint)) {
        try {
            if (arg instanceof constraint) {
                return;
            }
        }
        catch {
            // ignore
        }
        // eslint-disable-next-line local/code-no-any-casts
        if (!isUndefinedOrNull(arg) && arg.constructor === constraint) {
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
export function upcast(x) {
    return x;
}
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
export function hasKey(x, key) {
    for (const k in key) {
        if (!(k in x)) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi90eXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRXJDOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFFBQVEsQ0FBQyxHQUFZO0lBQ3BDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQztBQUNsQyxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFDLEtBQWM7SUFDM0MsT0FBTyxTQUFTLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxTQUFTLENBQUksS0FBYyxFQUFFLEtBQW1DO0lBQy9FLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25ELENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsUUFBUSxDQUFDLEdBQVk7SUFDcEMsNEVBQTRFO0lBQzVFLDhFQUE4RTtJQUM5RSxzQ0FBc0M7SUFDdEMsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1dBQzFCLEdBQUcsS0FBSyxJQUFJO1dBQ1osQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztXQUNuQixDQUFDLENBQUMsR0FBRyxZQUFZLE1BQU0sQ0FBQztXQUN4QixDQUFDLENBQUMsR0FBRyxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQzVCLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxZQUFZLENBQUMsR0FBWTtJQUN4QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFD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