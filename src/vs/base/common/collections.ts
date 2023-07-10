/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are strings.
 */
export type IStringDictionary<V> = Record<string, V>;

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are numbers.
 */
export type INumberDictionary<V> = Record<number, V>;

/**
 * Groups the collection into a dictionary based on the provided
 * group function.
 */
export function groupBy<K extends string | number | symbol, V>(data: V[], groupFn: (element: V) => K): Record<K, V[]> {
	const result: Record<K, V[]> = Object.create(null);
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

export function diffSets<T>(before: Set<T>, after: Set<T>): { removed: T[]; added: T[] } {
	const removed: T[] = [];
	const added: T[] = [];
	for (const element of before) {
		if (!after.has(element)) {
			removed.push(element);
		}
	}
	for (const element of after) {
		if (!before.has(element)) {
			added.push(element);
		}
	}
	return { removed, added };
}

export function diffMaps<K, V>(before: Map<K, V>, after: Map<K, V>): { removed: V[]; added: V[] } {
	const removed: V[] = [];
	const added: V[] = [];
	for (const [index, value] of before) {
		if (!after.has(index)) {
			removed.push(value);
		}
	}
	for (const [index, value] of after) {
		if (!before.has(index)) {
			added.push(value);
		}
	}
	return { removed, added };
}
export class SetMap<K, V> {

	private map = new Map<K, Set<V>>();

	add(key: K, value: V): void {
		let values = this.map.get(key);

		if (!values) {
			values = new Set<V>();
			this.map.set(key, values);
		}

		values.add(value);
	}

	delete(key: K, value: V): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.delete(value);

		if (values.size === 0) {
			this.map.delete(key);
		}
	}

	forEach(key: K, fn: (value: V) => void): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.forEach(fn);
	}

	get(key: K): ReadonlySet<V> {
		const values = this.map.get(key);
		if (!values) {
			return new Set<V>();
		}
		return new Set(values);
	}
}
