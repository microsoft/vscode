/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/arrays.ts for stable perf testing.
 */

export function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
	return array.filter((e): e is T => e !== undefined && e !== null);
}

export function groupBy<T>(data: ReadonlyArray<T>, groupFn: (element: T) => string): { [key: string]: T[] } {
	const result: { [key: string]: T[] } = {};
	for (const element of data) {
		const key = groupFn(element);
		(result[key] ??= []).push(element);
	}
	return result;
}

export function distinct<T>(array: ReadonlyArray<T>, keyFn: (t: T) => any = t => t): T[] {
	const seen = new Set<any>();
	return array.filter(element => {
		const key = keyFn(element);
		if (seen.has(key)) { return false; }
		seen.add(key);
		return true;
	});
}

export function firstOrDefault<T>(array: ReadonlyArray<T>): T | undefined;
export function firstOrDefault<T>(array: ReadonlyArray<T>, defaultValue: T): T;
export function firstOrDefault<T>(array: ReadonlyArray<T>, defaultValue?: T): T | undefined {
	return array.length > 0 ? array[0] : defaultValue;
}

export function lastOrDefault<T>(array: ReadonlyArray<T>): T | undefined;
export function lastOrDefault<T>(array: ReadonlyArray<T>, defaultValue: T): T;
export function lastOrDefault<T>(array: ReadonlyArray<T>, defaultValue?: T): T | undefined {
	return array.length > 0 ? array[array.length - 1] : defaultValue;
}

export function binarySearch<T>(array: ReadonlyArray<T>, key: T, comparator: (a: T, b: T) => number): number {
	let low = 0;
	let high = array.length - 1;
	while (low <= high) {
		const mid = ((low + high) / 2) | 0;
		const comp = comparator(array[mid], key);
		if (comp < 0) { low = mid + 1; }
		else if (comp > 0) { high = mid - 1; }
		else { return mid; }
	}
	return -(low + 1);
}

export function insertSorted<T>(array: T[], element: T, comparator: (a: T, b: T) => number): void {
	const idx = binarySearch(array, element, comparator);
	const insertIdx = idx < 0 ? ~idx : idx;
	array.splice(insertIdx, 0, element);
}

export function flatten<T>(arr: T[][]): T[] {
	return ([] as T[]).concat(...arr);
}

export function range(to: number): number[];
export function range(from: number, to: number): number[];
export function range(arg: number, to?: number): number[] {
	const from = to !== undefined ? arg : 0;
	const end = to !== undefined ? to : arg;
	const result: number[] = [];
	for (let i = from; i < end; i++) { result.push(i); }
	return result;
}

export function tail<T>(array: T[]): [T[], T] {
	if (array.length === 0) { throw new Error('Invalid tail call'); }
	return [array.slice(0, array.length - 1), array[array.length - 1]];
}
