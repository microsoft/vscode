/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseToolArguments, readSse, type SseEvent } from '../src/sse.ts';
import { chop, streamOf } from './helpers.ts';

async function events(text: string, size: number): Promise<SseEvent[]> {
	const out: SseEvent[] = [];
	for await (const event of readSse(streamOf(chop(text, size)))) {
		out.push(event);
	}
	return out;
}

test('parses events however the bytes are chunked', async () => {
	const text = 'event: a\ndata: {"x":1}\n\ndata: second\n\n';
	for (const size of [1, 2, 3, 5, 8, 64]) {
		assert.deepEqual(await events(text, size), [
			{ event: 'a', data: '{"x":1}' },
			{ event: undefined, data: 'second' },
		], `chunk size ${size}`);
	}
});

test('handles CRLF, comments, multi-line data and a missing final blank line', async () => {
	const text = ': keep-alive\r\ndata: line one\r\ndata: line two\r\n\r\ndata:no-space';
	assert.deepEqual(await events(text, 4), [
		{ event: undefined, data: 'line one\nline two' },
		{ event: undefined, data: 'no-space' },
	]);
});

test('decodes multi-byte characters split across chunks', async () => {
	const encoder = new TextEncoder();
	const bytes = encoder.encode('data: héllo 👋\n\n');
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const byte of bytes) {
				controller.enqueue(new Uint8Array([byte]));
			}
			controller.close();
		},
	});
	const out: SseEvent[] = [];
	for await (const event of readSse(body)) {
		out.push(event);
	}
	assert.deepEqual(out, [{ event: undefined, data: 'héllo 👋' }]);
});

test('reports bad tool-argument JSON instead of throwing', () => {
	assert.deepEqual(parseToolArguments('', 'x'), { arguments: {} });
	assert.deepEqual(parseToolArguments('{"a":1}', 'x'), { arguments: { a: 1 } });
	assert.match(parseToolArguments('{"a":', 'x').argumentsError ?? '', /not valid JSON/);
	assert.match(parseToolArguments('[1]', 'x').argumentsError ?? '', /JSON object/);
});
