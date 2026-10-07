/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseHeaderNumber, parseRetryAfter } from '../../common/httpHeaders.js';

suite('HTTP header readers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const now = Date.UTC(2026, 9, 2);

	test('reads decimal numbers and distinguishes strict quota counters from legacy numeric headers', () => {
		assert.deepStrictEqual({
			missing: parseHeaderNumber(null),
			decimal: parseHeaderNumber(' 42 '),
			fraction: parseHeaderNumber('0.5'),
			negative: parseHeaderNumber('-1'),
			zero: parseHeaderNumber('0', true),
			maximum: parseHeaderNumber(String(Number.MAX_SAFE_INTEGER), true),
		}, { missing: undefined, decimal: 42, fraction: 0.5, negative: -1, zero: 0, maximum: Number.MAX_SAFE_INTEGER });
	});

	for (const value of ['', ' ', '-1', '0.5', '1e3', '0x10', '0b10', 'NaN', 'Infinity', '9007199254740992']) {
		test(`strict counters and delays reject ${JSON.stringify(value)}`, () => {
			assert.deepStrictEqual({ number: parseHeaderNumber(value, true), delay: parseRetryAfter(value, now, true) }, {
				number: undefined, delay: undefined,
			});
		});
	}

	test('preserves default Retry-After numeric parsing while strict mode requires integer seconds', () => {
		assert.deepStrictEqual({
			missing: parseRetryAfter(null, now),
			seconds: parseRetryAfter('12', now),
			fraction: parseRetryAfter('0.5', now),
			negative: parseRetryAfter('-1', now),
			strictSeconds: parseRetryAfter(' 12 ', now, true),
			strictZero: parseRetryAfter('0', now, true),
		}, { missing: undefined, seconds: 12, fraction: 0.5, negative: 0, strictSeconds: 12, strictZero: 0 });
	});

	for (const date of ['Fri, 02 Oct 2026 00:00:10 GMT', 'Friday, 02-Oct-26 00:00:10 GMT', 'Fri Oct  2 00:00:10 2026']) {
		test(`strict HTTP dates use GMT and round waits up: ${date}`, () => {
			assert.deepStrictEqual({
				future: parseRetryAfter(date, now + 250, true),
				past: parseRetryAfter(date, now + 10_250, true),
			}, { future: 10, past: 0 });
		});
	}

	test('rejects malformed and non-HTTP date feedback in strict mode', () => {
		assert.deepStrictEqual(['not a date', '2026-10-02', 'Fri, 99 Oct 2026 00:00:10 GMT', 'Fri, 02 Oct 2026 00:00:10 PST']
			.map(value => parseRetryAfter(value, now, true)), [undefined, undefined, undefined, undefined]);
	});
});
