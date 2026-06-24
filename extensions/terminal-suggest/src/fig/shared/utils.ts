/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { osIsWindows } from '../../helpers/os.js';
import { createErrorInstance } from './errors.js';

// Use bitwise representation of suggestion flags.
// See here: https://stackoverflow.com/questions/39359740/what-are-enum-flags-in-typescript/
//
// Given a number `flags` we can test `if (flags & Subcommands)` to see if we
// should be suggesting subcommands.
//
// This is more maintainable in the future if we add more options (e.g. if we
// distinguish between subcommand args and option args) as we can just add a
// number here instead of passing 3+ boolean flags everywhere.
export enum SuggestionFlag {
	None = 0,
	Subcommands = 1 << 0,
	Options = 1 << 1,
	Args = 1 << 2,
	Any = (1 << 2) | (1 << 1) | (1 << 0),
}

// Combination of suggestion flags.
export type SuggestionFlags = number;

export enum SpecLocationSource {
	GLOBAL = 'global',
	LOCAL = 'local',
}

export function makeArray<T>(object: T | T[]): T[] {
	return Array.isArray(object) ? object : [object];
}

export function firstMatchingToken(
	str: string,
	chars: Set<string>,
): string | undefined {
	for (const char of str) {
		if (chars.has(char)) {
			return char;
		}
	}
	return undefined;
}

export function makeArrayIfExists<T>(
	obj: T | T[] | null | undefined,
): T[] | null {
	return !obj ? null : makeArray(obj);
}

export function isOrHasValue(
	obj: string | Array<string>,
	valueToMatch: string,
) {
	return Array.isArray(obj) ? obj.includes(valueToMatch) : obj === valueToMatch;
}

export const TimeoutError = createErrorInstance('TimeoutError');

export async function withTimeout<T>(
	time: number,
	promise: Promise<T>,
): Promise<T> {
	let timeout: NodeJS.Timeout;
	return Promise.race<Promise<T>>([
		promise,
		new Promise<T>((_, reject) => {
			timeout = setTimeout(() => {
				reject(new TimeoutError('Function timed out'));
			}, time);
		}),
	]).finally(() => {
		clearTimeout(timeout);
	});
}

export const longestCommonPrefix = (strings: string[]): string => {
	const sorted = strings.sort();

	const { 0: firstItem, [sorted.length - 1]: lastItem } = sorted;
	const firstItemLength = firstItem.length;

	let i = 0;

	while (i < firstItemLength && firstItem.charAt(i) === lastItem.charAt(i)) {
		i += 1;
	}

	return firstItem.slice(0, i);
};

export function findLast<T>(
	values: T[],
	predicate: (v: T) => boolean,
): T | undefined {
	for (let i = values.length - 1; i >= 0; i -= 1) {
		if (predicate(values[i])) {
			return values[i];
		}
	}
	return undefined;
}

type NamedObject =
	| {
		name?: string[] | string;
	}
	| string;

export function compareNamedObjectsAlphabetically<
	A extends NamedObject,
	B extends NamedObject,
>(a: A, b: B): number {
	const getName = (object: NamedObject): string =>
		typeof object === 'string' ? object : makeArray(object.name)[0] || '';
	return getName(a).localeCompare(getName(b));
}

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export type Func<S extends unknown[], T> = (...args: S) => T;
type EqualFunc<T> = (args: T, newArgs: T) => boolean;

// Memoize a function (cache the most recent result based on the most recent args)
// Optionally can pass an equals function to determine whether or not the old arguments
// and new arguments are equal.
//
// e.g. let fn = (a, b) => a * 2
//
// If we memoize this then we recompute every time a or b changes. if we memoize with
// isEqual = ([a, b], [newA, newB]) => newA === a
// then we will only recompute when a changes.
export function memoizeOne<S extends unknown[], T>(
	fn: Func<S, T>,
	isEqual?: EqualFunc<S>,
): Func<S, T> {
	let lastArgs = [] as unknown[] as S;
	let lastResult: T;
	let hasBeenCalled = false;
	const areArgsEqual: EqualFunc<S> =
		isEqual || ((args, newArgs) => args.every((x, idx) => x === newArgs[idx]));
	return (...args: S): T => {
		if (!hasBeenCalled || !areArgsEqual(lastArgs, args)) {
			hasBeenCalled = true;
			lastArgs = [...args] as unknown[] as S;
			lastResult = fn(...args);
		}
		return lastResult;
	};
}

function isNonNullObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function isEmptyObject(v: unknown): v is Record<string, never> {
	return isNonNullObj(v) && Object.keys(v).length === 0;
}

// TODO: to fix this we may want to have the default fields as Object.keys(A)
/**
 * If no fields are specified and A,B are not equal primitives/empty objects, this returns false
 * even if the objects are actually equal.
 */
export function fieldsAreEqual<T>(A: T, B: T, fields: (keyof T)[]): boolean {
	if (A === B || (isEmptyObject(A) && isEmptyObject(B))) {
		return true;
	}
	if (!fields.length || !A || !B) {
		return false;
	}
	return fields.every((field) => {
		const aField = A[field];
		const bField = B[field];

		if (typeof aField !== typeof bField) {
			return false;
		}
		if (isNonNullObj(aField) && isNonNullObj(bField)) {
			if (Object.keys(aField).length !== Object.keys(bField).length) {
				return false;
			}
			return fieldsAreEqual(aField, bField, Object.keys(aField) as never[]);
		}
		return aField === bField;
	});
}

export const splitPath = (path: string): [string, string] => {
	const idx = path.lastIndexOf('/') + 1;
	return [path.slice(0, idx), path.slice(idx)];
};

export const ensureTrailingSlash = (str: string) =>
	str.endsWith('/') ? str : `${str}/`;

// Outputs CWD with trailing `/`
export const getCWDForFilesAndFolders = (
	cwd: string | null,
	searchTerm: string,
): string => {
	if (cwd === null) {
		return '/';
	}
	const [dirname] = splitPath(searchTerm);

	if (dirname === '') {
		return ensureTrailingSlash(cwd);
	}

	return dirname.startsWith('~/') || dirname.startsWith('/')
		? dirname
		: `${cwd}/${dirname}`;
};

export function localProtocol(domain: string, path: string) {
	let modifiedDomain;
	//TODO@meganrogge
	// if (domain === 'path' && !window.fig?.constants?.newUriFormat) {
	if (domain === 'path') {
		modifiedDomain = '';
	} else {
		modifiedDomain = domain;
	}

	if (osIsWindows()) {
		return `https://fig.${modifiedDomain}/${path}`;
	}
	return `fig://${modifiedDomain}/${path}`;
}

type ExponentialBackoffOptions = {
	attemptTimeout: number; // The maximum time in milliseconds to wait for a function to execute.
	baseDelay: number; // The initial delay in milliseconds.
	maxRetries: number; // The maximum number of retries.
	jitter: number; // A random factor to add to the delay on each retry.
};

export async function exponentialBackoff<T>(
	options: ExponentialBackoffOptions,
	fn: () => Promise<T>,
): Promise<T> {
	let retries = 0;
	let delay = options.baseDelay;

	while (retries < options.maxRetries) {
		try {
			return await withTimeout(options.attemptTimeout, fn());
		} catch (_error) {
			retries += 1;
			delay *= 2;
			delay += Math.floor(Math.random() * options.jitter);

			await new Promise((resolve) => {
				setTimeout(resolve, delay);
			});
		}
	}

	throw new Error('Failed to execute function after all retries.');
}
