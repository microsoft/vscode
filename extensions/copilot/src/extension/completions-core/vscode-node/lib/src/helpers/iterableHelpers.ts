/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function* asyncIterableMap<TSource, TDest>(
	source: AsyncIterable<TSource>,
	selector: (x: TSource) => Promise<TDest> | TDest
): AsyncIterable<TDest> {
	for await (const item of source) {
		yield selector(item);
	}
}

export async function* asyncIterableFilter<TSource>(
	source: AsyncIterable<TSource>,
	predicate: (x: TSource) => Promise<boolean> | boolean
): AsyncIterable<TSource> {
	for await (const item of source) {
		if (await predicate(item)) {
			yield item;
		}
	}
}

export async function* asyncIterableMapFilter<TSource, TDest>(
	source: AsyncIterable<TSource>,
	selector: (x: TSource) => Promise<TDest | undefined> | TDest | undefined
): AsyncIterable<TDest> {
	for await (const item of source) {
		const result = await selector(item);
		if (result !== undefined) {
			yield result;
		}
	}
}

export async function* asyncIterableFromArray<TSource>(source: TSource[]): AsyncIterable<TSource, void, unknown> {
	for (const item of source) {
		yield Promise.resolve(item);
	}
}

export async function asyncIterableToArray<TSource>(source: AsyncIterable<TSource>): Promise<TSource[]> {
	const result: TSource[] = [];
	for await (const item of source) {
		result.push(item);
	}
	return result;
}

export async function* asyncIterableConcat<TSource>(...sources: AsyncIterable<TSource>[]): AsyncIterable<TSource> {
	for (const source of sources) {
		yield* source;
	}
}

export async function asyncIterableCount<TSource>(source: AsyncIterable<TSource>): Promise<number> {
	let count = 0;
	for await (const _ of source) {
		count++;
	}
	return count;
}

export function* iterableMap<TSource, TDest>(
	source: Iterable<TSource>,
	selector: (x: TSource) => TDest
): Iterable<TDest> {
	for (const item of source) {
		yield selector(item);
	}
}

export function* iterableMapFilter<TSource, TDest>(
	source: Iterable<TSource>,
	selector: (x: TSource) => TDest | undefined
): Iterable<TDest> {
	for (const item of source) {
		const result = selector(item);
		if (result !== undefined) {
			yield result;
		}
	}
}
