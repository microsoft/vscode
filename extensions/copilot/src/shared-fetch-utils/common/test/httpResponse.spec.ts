/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { HttpHeaders } from '../fetchTypes';
import { cloneResponse, type CloneableResponse } from '../httpResponse';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeHeaders(entries: Record<string, string> = {}): HttpHeaders {
	const map = new Map(Object.entries(entries));
	return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

function textStream(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

function multiChunkStream(chunks: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(new TextEncoder().encode(chunk));
			}
			controller.close();
		},
	});
}

/** Simulates the platform `DestroyableStream` which exposes `toReadableStream()`. */
function fakeDestroyableStream(text: string) {
	return { toReadableStream: () => textStream(text) };
}

function makeResponse(status: number, headers: HttpHeaders, body: ReadableStream<Uint8Array> | null): CloneableResponse {
	return { status, headers, body };
}

// ── cloneResponse ───────────────────────────────────────────────────────

describe('cloneResponse', () => {

	describe('null body', () => {
		it('returns two independent responses with null body', () => {
			const headers = makeHeaders({ 'x-test': '1' });
			const [a, b] = cloneResponse(makeResponse(200, headers, null));

			expect(a.status).toBe(200);
			expect(b.status).toBe(200);
			expect(a.body).toBeNull();
			expect(b.body).toBeNull();
			expect(a).not.toBe(b);
		});

		it('text() returns empty string for null body', async () => {
			const [a, b] = cloneResponse(makeResponse(204, makeHeaders(), null));
			expect(await a.text()).toBe('');
			expect(await b.text()).toBe('');
		});
	});

	describe('ReadableStream body', () => {
		it('produces two independently consumable streams', async () => {
			const response = makeResponse(200, makeHeaders(), textStream('hello'));
			const [a, b] = cloneResponse(response);

			expect(await a.text()).toBe('hello');
			expect(await b.text()).toBe('hello');
		});

		it('text() handles multi-chunk streams', async () => {
			const response = makeResponse(200, makeHeaders(), multiChunkStream(['hel', 'lo ', 'world']));
			const [a, b] = cloneResponse(response);

			expect(await a.text()).toBe('hello world');
			expect(await b.text()).toBe('hello world');
		});

		it('json() parses body as JSON', async () => {
			const payload = { key: 'value', n: 42 };
			const response = makeResponse(200, makeHeaders(), textStream(JSON.stringify(payload)));
			const [a, b] = cloneResponse(response);

			expect(await a.json()).toEqual(payload);
			expect(await b.json()).toEqual(payload);
		});

		it('preserves status and headers on both clones', () => {
			const headers = makeHeaders({ 'content-type': 'application/json', 'etag': '"v1"' });
			const response = makeResponse(200, headers, textStream('{}'));
			const [a, b] = cloneResponse(response);

			expect(a.status).toBe(200);
			expect(b.status).toBe(200);
			expect(a.headers.get('content-type')).toBe('application/json');
			expect(b.headers.get('etag')).toBe('"v1"');
		});
	});

	describe('DestroyableStream body (toReadableStream)', () => {
		it('unwraps DestroyableStream and produces two consumable clones', async () => {
			const response: CloneableResponse = {
				status: 200,
				headers: makeHeaders(),
				body: fakeDestroyableStream('from destroyable'),
			};
			const [a, b] = cloneResponse(response);

			expect(await a.text()).toBe('from destroyable');
			expect(await b.text()).toBe('from destroyable');
		});
	});

	describe('repeated cloning', () => {
		it('can clone a clone', async () => {
			const response = makeResponse(200, makeHeaders(), textStream('original'));
			const [first, second] = cloneResponse(response);

			// Clone one of the halves again
			const [firstA, firstB] = cloneResponse(first);

			expect(await firstA.text()).toBe('original');
			expect(await firstB.text()).toBe('original');
			expect(await second.text()).toBe('original');
		});
	});
});
