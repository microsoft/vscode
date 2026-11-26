/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
