/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are strings.
 */
export interface IStringDictionary<V> {
	[name: string]: V;
}

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are numbers.
 */
export interface INumberDictionary<V> {
	[idx: number]: V;
}

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Returns an array which contains all values that reside
 * in the given set.
 */
export function values<T>(from: IStringDictionary<T> | INumberDictionary<T>): T[] {
	const result: T[] = [];
	for (let key in from) {
		if (hasOwnProperty.call(from, key)) {
			result.push((from as any)[key]);
		}
	}
	return result;
}

export function size<T>(from: IStringDictionary<T> | INumberDictionary<T>): number {
	let count = 0;
	for (let key in from) {
		if (hasOwnProperty.call(from, key)) {
			count += 1;
		}
	}
	return count;
}

export function first<T>(from: IStringDictionary<T> | INumberDictionary<T>): T | undefined {
	for (let key in from) {
		if (hasOwnProperty.call(from, key)) {
			return from[key];
		}
	}
	return undefined;
}

/**
 * Iterates over each entry in the provided set. The iterator allows
 * to remove elements and will stop when the callback returns {{false}}.
 */
export function forEach<T>(from: IStringDictionary<T> | INumberDictionary<T>, callback: (entry: { key: any; value: T; }, remove: () => void) => any): void {
	for (let key in from) {
		if (hasOwnProperty.call(from, key)) {
			const result = callback({ key: key, value: (from as any)[key] }, function () {
				delete (from as any)[key];
			});
			if (result === false) {
				return;
			}
		}
	}
}

/**
 * Groups the collection into a dictionary based on the provided
 * group function.
 */
export function groupBy<T>(data: T[], groupFn: (element: T) => string): IStringDictionary<T[]> {
	const result: IStringDictionary<T[]> = Object.create(null);
	for (const element of data) {
		const key = groupFn(element);
		let target = result[key];
		if (!target) {
			target = result[key] = [];
		}
		target.push(element);
	}
	return result;
}

export function fromMap<T>(original: Map<string, T>): IStringDictionary<T> {
	const result: IStringDictionary<T> = Object.create(null);
	if (original) {
		original.forEach((value, key) => {
			result[key] = value;
		});
	}
	return result;
}