/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ConstantStringHash, isStringInSample, stringHash } from '../../common/hash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('isStringInSample', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns stable sample membership', () => {
		assert.deepStrictEqual(
			Array.from({ length: 9 }, (_, index) => isStringInSample(`session-${index + 60}`, 5)),
			[false, false, true, true, true, true, true, false, false]
		);
	});

	test('supports sample boundaries', () => {
		assert.deepStrictEqual(
			[isStringInSample('session', 0), isStringInSample('session', 100)],
			[false, true]
		);
	});

	test('rejects invalid percentages', () => {
		assert.throws(() => isStringInSample('session', -1));
		assert.throws(() => isStringInSample('session', 1.5));
		assert.throws(() => isStringInSample('session', 101));
	});
});

suite('ConstantStringHash', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches stringHash for int32 accumulators', () => {
		const values = ['', 'a', 'label', 'description', 'values', 'value', 'expectContiguousMatch', 'allowNonContiguousMatches', 'ünïcödé', '\u0000\u0001', '\uD83D\uDE80', '\uD800', '\uDFFF', 'x'.repeat(200)];
		const hashVals = [0, 1, -1, 149417, 2147483647, -2147483648, 123456789, ...Array.from({ length: 128 }, (_, index) => Math.imul(index + 1, 2654435761))];

		assert.deepStrictEqual(
			values.map(value => hashVals.map(hashVal => new ConstantStringHash(value).apply(hashVal))),
			values.map(value => hashVals.map(hashVal => stringHash(value, hashVal)))
		);
	});

	test('can be chained like stringHash', () => {
		const chained = new ConstantStringHash('b').apply(new ConstantStringHash('a').apply(0));

		assert.strictEqual(chained, stringHash('b', stringHash('a', 0)));
	});
});
