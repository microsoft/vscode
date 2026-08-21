/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { AsyncIterableObject, AsyncIterableSource } from '../../../../util/vs/base/common/async';
import { LineFilters, streamLines } from '../streamingEdits';

suite('streamLinesInCodeBlock', function () {
	test('no code', async function () {

		const source = new AsyncIterableSource<string>();
		source.emitOne('Hello');
		source.emitOne('World');
		source.resolve();
		const stream = streamLinesInCodeBlock(source.asyncIterable);
		const actual = await AsyncIterableObject.toPromise(stream);
		assert.deepStrictEqual(actual, []);
	});

	test('emits no lines outside code block', async function () {

		const source = new AsyncIterableSource<string>();
		const input = [
			'Hello World',
			'```py',
			'# Hello World',
			'foo',
			'```',
			'END',
		];
		source.emitOne(input.join('\n'));
		source.resolve();

		const stream = streamLinesInCodeBlock(source.asyncIterable);
		const actual = await AsyncIterableObject.toPromise(stream);
		assert.deepStrictEqual(actual, input.slice(2, 4));
	});

	test.skip('emits no lines outside code block, N blocks', async function () {

		const source = new AsyncIterableSource<string>();
		const input = [
			'Hello World',
			'```py',
			'# Hello World',
			'foo',
			'```',
			'MID',
			'```ts',
			'type Foo = number',
			'console.log()',
			'```',
		];
		source.emitOne(input.join('\n'));
		source.resolve();

		const stream = streamLinesInCodeBlock(source.asyncIterable);
		const actual = await AsyncIterableObject.toPromise(stream);
		assert.deepStrictEqual(actual, [input[2], input[3], input[7], input[8]]);
	});
});

/**
 * Extract just the lines that are inside a code block.
 */
function streamLinesInCodeBlock(source: AsyncIterable<string>): AsyncIterableObject<string> {
	return (
		streamLines(source)
			.filter(LineFilters.createCodeBlockFilter())
			.map(line => line.value)
	);
}
