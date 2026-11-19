/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { Readable } from 'stream';
import { suite, test } from 'node:test';
import { mapStream, merge, through } from '../streams.ts';
import { collectStream } from './collectStream.ts';

suite('gulp streams', () => {
	test('merges legacy and native sources, waiting for the last source', async () => {
		const last = through();
		const result = collectStream<string>(merge([Readable.from(['first']), last]));
		setImmediate(() => last.end('last'));
		assert.deepStrictEqual(await result, ['first', 'last']);
	});

	test('completes empty and non-empty merges for tasks that only listen for end', async () => {
		await Promise.all([once(merge([]), 'end'), once(merge(Readable.from([1, 2])), 'end')]);
	});

	test('waits for async mapping and skips items with no output', async () => {
		const result = Readable.from([1, 2, 3]).pipe(mapStream((item: number, done) => {
			setImmediate(() => done(undefined, item % 2 ? item : undefined));
		}));
		assert.deepStrictEqual(await collectStream(result), [1, 3]);
	});

	test('bounds concurrent mappings and emits results in input order', async () => {
		const input = Array.from({ length: 20 }, (_, i) => i);
		let inFlight = 0;
		let peak = 0;
		const output = Readable.from(input).pipe(mapStream((item: number, done) => {
			peak = Math.max(peak, ++inFlight);
			// Let later items finish before the first.
			const finish = () => { inFlight--; done(undefined, item); };
			setImmediate(item === 0 ? () => setImmediate(finish) : finish);
		}));
		assert.deepStrictEqual(await collectStream(output), input);
		assert.strictEqual(peak, 8);
	});
});
