/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { isMinifiedText } from '../../node/workspaceFileIndex';

suite('isMinifiedText', () => {
	test('Empty string should never be considered minified', () => {
		assert.ok(!isMinifiedText('', { minifiedMaxLineLength: 3, minifiedMaxAverageLineLength: 100 }));
		assert.ok(!isMinifiedText('', { minifiedMaxLineLength: 0, minifiedMaxAverageLineLength: 0 }));
	});

	test('Should find long strings in text', () => {
		assert.ok(!isMinifiedText('abc', { minifiedMaxLineLength: 3, minifiedMaxAverageLineLength: 100 }));
		assert.ok(isMinifiedText('abcd', { minifiedMaxLineLength: 3, minifiedMaxAverageLineLength: 100 }));

		assert.ok(isMinifiedText([
			'a',
			'ab',
			'abcd',
			'ab',
			'b'
		].join('\n'), { minifiedMaxLineLength: 3, minifiedMaxAverageLineLength: 100 }));
	});

	test('Should find long averages averages', () => {
		assert.ok(!isMinifiedText('abcd', { minifiedMaxLineLength: 1000, minifiedMaxAverageLineLength: 10 }));
		assert.ok(isMinifiedText('abcd', { minifiedMaxLineLength: 1000, minifiedMaxAverageLineLength: 3 }));
		assert.ok(!isMinifiedText('abcd\nab', { minifiedMaxLineLength: 1000, minifiedMaxAverageLineLength: 3 }));
		assert.ok(!isMinifiedText('a\nb\nc', { minifiedMaxLineLength: 1, minifiedMaxAverageLineLength: 1 }));
	});
});