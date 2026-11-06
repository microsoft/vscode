/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { HttpHeaders, HttpResponse } from './fetchTypes';

/**
 * An HTTP response whose body may be a {@link ReadableStream} or a
 * `DestroyableStream` (from the platform `Response` class).
 */
export interface CloneableResponse {
	readonly status: number;
	readonly headers: HttpHeaders;
	readonly body: ReadableStream<Uint8Array> | { toReadableStream(): ReadableStream<Uint8Array> } | null;
}

/**
 * Clones a response by teeing its body stream, returning two independent
 * {@link HttpResponse} objects that can each be consumed separately.
 *
 * Both returned responses have fully functional `text()` and `json()`
 * methods backed by their own stream branch.
 *
 * Accepts either an {@link HttpResponse} (with `ReadableStream` body) or a
 * platform `Response` (with `DestroyableStream` body) transparently.
 */
export function cloneResponse(response: CloneableResponse): [HttpResponse, HttpResponse] {
	const { status, headers } = response;

	if (!response.body) {
		return [makeHttpResponse(status, headers, null), makeHttpResponse(status, headers, null)];
	}

	const readable: ReadableStream<Uint8Array> = 'toReadableStream' in response.body
		? response.body.toReadableStream()
		: response.body;

	const [a, b] = readable.tee();
	return [makeHttpResponse(status, headers, a), makeHttpResponse(status, headers, b)];
}

function makeHttpResponse(status: number, headers: HttpHeaders, body: ReadableStream<Uint8Array> | null): HttpResponse {
	return {
		status,
		headers,
		body,
		async text() {
			if (!body) {
				return '';
			}
			const reader = body.getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				chunks.push(value);
			}
			const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
			const merged = new Uint8Array(totalLength);
			let offset = 0;
			for (const chunk of chunks) {
				merged.set(chunk, offset);
				offset += chunk.length;
			}
			return new TextDecoder().decode(merged);
		},
		async json() {
			return JSON.parse(await this.text());
		},
	};
}
