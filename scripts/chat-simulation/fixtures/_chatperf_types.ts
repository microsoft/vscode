/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/types.ts for stable perf testing.
 */

export function isString(thing: unknown): thing is string {
	return typeof thing === 'string';
}

export function isNumber(thing: unknown): thing is number {
	return typeof thing === 'number' && !isNaN(thing);
}

export function isBoolean(thing: unknown): thing is boolean {
	return thing === true || thing === false;
}

export function isUndefined(thing: unknown): thing is undefined {
	return typeof thing === 'undefined';
}

export function isDefined<T>(thing: T | undefined | null): thing is T {
	return !isUndefinedOrNull(thing);
}

export function isUndefinedOrNull(thing: unknown): thing is undefined | null {
	return isUndefined(thing) || thing === null;
}

export function isFunction(thing: unknown): thing is Function {
	return typeof thing === 'function';
}

export function isObject(thing: unknown): thing is object {
	return typeof thing === 'object'
		&& thing !== null
		&& !Array.isArray(thing)
		&& !(thing instanceof RegExp)
		&& !(thing instanceof Date);
}

export function isArray(thing: unknown): thing is unknown[] {
	return Array.isArray(thing);
}

export function assertType(condition: unknown, type?: string): asserts condition {
	if (!condition) {
		throw new Error(type ? `Unexpected type, expected '${type}'` : 'Unexpected type');
	}
}

export function assertIsDefined<T>(thing: T | undefined | null): T {
	if (isUndefinedOrNull(thing)) {
		throw new Error('Assertion failed: value is undefined or null');
	}
	return thing;
}

export function assertAllDefined<T1, T2>(t1: T1 | undefined | null, t2: T2 | undefined | null): [T1, T2] {
	return [assertIsDefined(t1), assertIsDefined(t2)];
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
			if (arg instanceof constraint) { return; }
		} catch { }
		if (!isUndefinedOrNull(arg) && (arg as any).constructor === constraint) { return; }
		if (constraint.length === 1 && constraint.call(undefined, arg) === true) { return; }
		throw new Error('argument does not match one of these constraints: arg instanceof constraint, arg.constructor === constraint, nor constraint(arg) === true');
	}
}
