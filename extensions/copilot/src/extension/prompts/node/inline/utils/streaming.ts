/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../../util/vs/base/common/async';

export async function* replaceStringInStream(stream: AsyncIterable<string>, searchValue: string, replaceValue: string): AsyncIterable<string> {
	let buffer = '';

	const searchValuePrefixes = getPrefixes(searchValue);
	searchValuePrefixes.reverse(); // longest first

	for await (const chunk of stream) {
		buffer += chunk;

		let searchIndex: number;
		let lastIndex = 0;

		let textToYield = '';

		// Process the buffer in chunks, but retain potential partial matches at the end.
		while ((searchIndex = buffer.indexOf(searchValue, lastIndex)) !== -1) {
			textToYield += buffer.slice(lastIndex, searchIndex) + replaceValue;
			lastIndex = searchIndex + searchValue.length;
		}

		// Retain the remaining buffer that could be part of the next `searchValue`.
		if (lastIndex !== 0) {
			buffer = buffer.slice(lastIndex);
		}

		// At this point, buffer does not contain any `searchValue` anymore.
		// However, there could be a future chunk c, such that `buffer + c.substring(0, searchValue.length - 1)` contains it,
		// so we cannot yield the full buffer.

		// longest prefix first
		for (const p of searchValuePrefixes) {
			if (buffer.endsWith(p)) {
				const idx = buffer.length - p.length;

				textToYield += buffer.slice(0, idx);
				buffer = buffer.slice(idx);

				break;
			}
		}

		if (textToYield.length > 0) {
			yield textToYield;
		}
	}

	// Yield any remaining buffer content that didn't match `searchValue`.
	if (buffer.length > 0) {
		yield buffer;
	}
}

function getPrefixes(value: string): string[] {
	const prefixes: string[] = [];
	for (let i = 0; i <= value.length; i++) {
		prefixes.push(value.substring(0, i));
	}
	return prefixes;
}

export type StreamPipe<T> = (stream: AsyncIterable<T>) => AsyncIterable<T>;

export namespace StreamPipe {
	export function identity<T>(): StreamPipe<T> {
		return stream => stream;
	}

	export function discard<T>(): StreamPipe<T> {
		return _stream => AsyncIterableObject.EMPTY;
	}

	export function chain<T>(...pipes: StreamPipe<T>[]): StreamPipe<T> {
		return stream => pipes.reduce((s, pipe) => pipe(s), stream);
	}
}

export function forEachStreamed<T>(stream: AsyncIterable<T>, fn: (item: T) => void): Promise<void> {
	return (async () => {
		for await (const item of stream) {
			fn(item);
		}
	})();
}
