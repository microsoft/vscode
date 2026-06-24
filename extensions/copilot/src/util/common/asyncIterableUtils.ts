/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace AsyncIterUtils {

	export async function* map<T0, T1>(iterable: AsyncIterable<T0>, mapItem: (item: T0) => T1): AsyncIterable<T1> {
		for await (const item of iterable) {
			yield mapItem(item);
		}
	}

	export async function* mapWithReturn<T0, R0, N, T1, R1 = R0>(
		iterable: AsyncIterable<T0, R0, N>,
		mapItem: (item: T0) => T1,
		mapReturn: (ret: R0) => R1,
	): AsyncGenerator<T1, R1, N> {
		const iter = iterable[Symbol.asyncIterator]();
		let v: IteratorResult<T0, R0>;

		while (!((v = await iter.next()).done)) {
			yield mapItem(v.value);
		}

		return mapReturn(v.value);
	}

	export async function* filter<T>(iterable: AsyncIterable<T>, filterItem: (item: T) => boolean): AsyncIterable<T> {
		for await (const item of iterable) {
			if (filterItem(item)) {
				yield item;
			}
		}
	}

	export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
		const arr: T[] = [];
		for await (const item of iterable) {
			arr.push(item);
		}
		return arr;
	}

	export async function* fromArray<T>(arr: T[]): AsyncIterable<T> {
		for (const item of arr) {
			yield item;
		}
	}

	export async function* fromArrayWithReturn<T, R>(arr: T[], returnValue: R): AsyncGenerator<T, R> {
		for (const item of arr) {
			yield item;
		}
		return returnValue;
	}

	export async function toArrayWithReturn<T, R>(iterable: AsyncIterable<T, R>): Promise<[T[], ret: R]> {
		const iter = iterable[Symbol.asyncIterator]();
		const arr: T[] = [];
		let v: IteratorResult<T, R>;

		while (!((v = await iter.next()).done)) {
			arr.push(v.value);
		}

		return [arr, v.value];
	}

	export async function drainUntilReturn<T, R>(iterable: AsyncIterable<T, R>): Promise<R> {
		const iter = iterable[Symbol.asyncIterator]();
		let v: IteratorResult<T, R>;

		do {
			v = await iter.next();
		} while (!v.done);

		return v.value;
	}
}

/**
 * Namespace for extensions to AsyncIterUtils that are not generally useful enough to be in the main namespace, but are still worth keeping around.
 */
export namespace AsyncIterUtilsExt {

	export async function* splitLines(stream: AsyncIterable<string>): AsyncIterable<string> {
		let buffer: string | null = null;

		for await (const chunk of stream) {
			buffer ??= '';
			buffer += chunk;

			const parts: string[] = buffer.split(/\r?\n/);
			buffer = parts.pop() ?? '';

			yield* parts;
		}

		if (buffer !== null) {
			yield buffer;
		}
	}
}
