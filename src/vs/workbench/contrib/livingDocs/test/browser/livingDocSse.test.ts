/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseSseChunk } from '../../common/livingDocSse.js';

// The Anthropic-shaped events the proxy normalises both backends to (plan 27).
function delta(text: string): string {
	return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`;
}
const STOP = `event: message_stop\ndata: {"type":"message_stop"}\n\n`;

// Drive the parser the way the service does: keep a rolling buffer, feed it chunk by chunk, collect the
// deltas, and stop once `done` is seen. Returns the accumulated text and whether the stream terminated.
function drive(chunks: string[]): { text: string; done: boolean } {
	let buffer = '';
	let text = '';
	let done = false;
	for (const chunk of chunks) {
		buffer += chunk;
		const result = parseSseChunk(buffer);
		buffer = result.remainder;
		for (const d of result.deltas) { text += d; }
		if (result.done) { done = true; break; }
	}
	return { text, done };
}

suite('livingDocSse - parseSseChunk', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accumulates text deltas across a whole stream and reports done at message_stop', () => {
		const result = drive([delta('Hello '), delta('world'), STOP]);
		assert.deepStrictEqual(result, { text: 'Hello world', done: true });
	});

	test('reassembles an event split across network chunks (remainder is carried forward)', () => {
		const whole = delta('Access ') + delta('control');
		// Split at a byte that lands mid-event, so the first parse must hold an incomplete line as remainder.
		const cut = Math.floor(whole.length * 0.4);
		const result = drive([whole.slice(0, cut), whole.slice(cut) + STOP]);
		assert.deepStrictEqual(result, { text: 'Access control', done: true });
	});

	test('treats the SSE [DONE] sentinel as terminal (OpenRouter-style)', () => {
		const result = drive([delta('done via sentinel'), 'data: [DONE]\n\n']);
		assert.deepStrictEqual(result, { text: 'done via sentinel', done: true });
	});

	test('ignores malformed data lines, keep-alive comments and non-text events without throwing', () => {
		const noise = ': keep-alive comment\n'
			+ 'event: content_block_start\ndata: {"type":"content_block_start","index":0}\n\n'
			+ 'data: {not valid json\n\n'
			+ delta('kept');
		const result = drive([noise, STOP]);
		assert.deepStrictEqual(result, { text: 'kept', done: true });
	});

	test('holds a partial trailing line as remainder until its newline arrives', () => {
		const evt = delta('partial');
		const cut = evt.length - 3; // no terminating newline yet
		const first = parseSseChunk(evt.slice(0, cut));
		assert.deepStrictEqual({ deltas: first.deltas, done: first.done }, { deltas: [], done: false }, 'nothing emitted from an unterminated line');
		const second = parseSseChunk(first.remainder + evt.slice(cut));
		assert.deepStrictEqual({ deltas: second.deltas, done: second.done }, { deltas: ['partial'], done: false }, 'delta emitted once the line completes');
	});
});
