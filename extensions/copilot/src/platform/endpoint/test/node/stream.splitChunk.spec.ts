/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { splitChunk } from '../../../networking/node/stream';

suite('splitChunk', () => {
	test('splits correctly with one newline in between', function () {
		const [lines, extra] = splitChunk('foo\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with one newline in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\nbar\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
	test('splits correctly with two newlines in between', function () {
		const [lines, extra] = splitChunk('foo\n\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with two newlines in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\n\nbar\n\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
	test('splits correctly with three newlines in between', function () {
		const [lines, extra] = splitChunk('foo\n\n\nbar');
		assert.deepStrictEqual(lines, ['foo']);
		assert.strictEqual(extra, 'bar');
	});
	test('splits correctly with three newlines in between and trailing', function () {
		const [lines, extra] = splitChunk('foo\n\n\nbar\n\n\n');
		assert.deepStrictEqual(lines, ['foo', 'bar']);
		assert.strictEqual(extra, '');
	});
});
