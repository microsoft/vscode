/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isRepetitive } from '../anomalyDetection';

suite('Anomaly Repetition Tests', function () {
	test('recognizes sequence consisting of single repeated token', function () {
		const tokens = 'Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar'.split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be recognized.');
	});

	test('does nothing on a too short sequence of single repeated token', function () {
		const tokens = 'Bar Bar Bar Bar Bar Bar Bar Bar Bar'.split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, false, 'Repetition should not be recognized.');
	});

	test('recognizes single repeated token in proper suffix', function () {
		const tokens = 'Baz Baz Baz Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar Bar'.split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be recognized.');
	});

	test('recognizes repeated pattern', function () {
		const tokens = (
			'Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car ' +
			'Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car'
		).split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be recognized.');
	});

	test('does nothing on a too short repeated pattern', function () {
		const tokens = (
			'Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car Bar Far Car ' +
			'Bar Far Car Bar Far Car Bar Far Car'
		).split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, false, 'Repetition should not be recognized.');
	});

	test('does nothing in absence of a pattern', function () {
		const tokens = (
			'12 1 23 43 ac er gf gf 12 er gd 34 dg 35 ;o lo 34 xc ' +
			'4t ggf gf 46 l7 dg qs 5y ku df 34 gr gr gr df er gr gr'
		).split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, false, 'No repetition should be claimed.');
	});

	test('does nothing on too long a pattern', function () {
		const tokens = '12 1 23 43 ac er gf gf 12 er gd '.repeat(4).split(' ');
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, false, 'No repetition should be claimed.');
	});

	test('recognizes short real world example', function () {
		const tokens = [
			'C',
			' LIM',
			'IT',
			' 1',
			')',
			'\n',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
			'\t',
		];
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be found.');
	});

	test('recognizes long real world example', function () {
		const tokens =
			'Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the website. Try to use the keyboard to navigate the'.split(
				' '
			);
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be found.');
	});

	test('recognizes repetitions with some prefix', function () {
		const tokens = ['prefix', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo'];
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be found.');
	});

	test('recognizes repetitions that differ only in whitespace tokens, with some prefix', function () {
		const tokens = ['prefix', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', 'foo', '   ', 'foo'];
		const repetitive = isRepetitive(tokens);
		assert.strictEqual(repetitive, true, 'Repetition should be found.');
	});
});
