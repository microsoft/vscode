/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { FetchLike, StreamEvent } from '../src/index.ts';

export interface RecordedCall {
	readonly url: string;
	readonly method: string;
	readonly headers: Record<string, string>;
	readonly body: Record<string, unknown> | undefined;
}

/** Splits text into pieces of `size` characters so parsers see lines broken mid-way. */
export function chop(text: string, size: number): string[] {
	const pieces: string[] = [];
	for (let i = 0; i < text.length; i += size) {
		pieces.push(text.slice(i, i + size));
	}
	return pieces;
}

export function streamOf(pieces: readonly string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const piece of pieces) {
				controller.enqueue(encoder.encode(piece));
			}
			controller.close();
		},
	});
}

/** An SSE response built from data payloads, delivered in 7-character chunks. */
export function sseResponse(events: readonly (unknown | { event: string; data: unknown })[], options: { raw?: string; chunkSize?: number } = {}): Response {
	const text = options.raw ?? events.map(entry => {
		if (entry && typeof entry === 'object' && 'event' in entry && 'data' in entry) {
			const { event, data } = entry as { event: string; data: unknown };
			return `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
		}
		return `data: ${typeof entry === 'string' ? entry : JSON.stringify(entry)}\n\n`;
	}).join('');
	return new Response(streamOf(chop(text, options.chunkSize ?? 7)), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function mockFetch(respond: (call: RecordedCall) => Response | Promise<Response>): { fetch: FetchLike; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	const fetch: FetchLike = async (url, init) => {
		const call: RecordedCall = {
			url,
			method: init.method ?? 'GET',
			headers: (init.headers ?? {}) as Record<string, string>,
			body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
		};
		calls.push(call);
		return respond(call);
	};
	return { fetch, calls };
}

export async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
	const out: StreamEvent[] = [];
	for await (const event of events) {
		out.push(event);
	}
	return out;
}

export function textFrom(events: readonly StreamEvent[]): string {
	return events.map(event => event.type === 'text' ? event.text : '').join('');
}
