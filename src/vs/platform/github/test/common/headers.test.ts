/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseHeaderNumber, parseRetryAfter } from '../../common/client/headers.js';

suite('HTTP header readers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const now = Date.UTC(2026, 9, 2);

	test('reads decimal nonnegative safe integers', () => {
		assert.deepStrictEqual({
			missing: parseHeaderNumber(null),
			decimal: parseHeaderNumber('\t 42 \r\n'),
			zero: parseHeaderNumber('0'),
			maximum: parseHeaderNumber(String(Number.MAX_SAFE_INTEGER)),
		}, { missing: undefined, decimal: 42, zero: 0, maximum: Number.MAX_SAFE_INTEGER });
	});

	for (const value of ['', ' ', '1 2', '-1', '0.5', '1e3', '0x10', '0b10', 'NaN', 'Infinity', '9007199254740992']) {
		test(`counters and delays reject ${JSON.stringify(value)}`, () => {
			assert.deepStrictEqual({ number: parseHeaderNumber(value), delay: parseRetryAfter(value, now) }, {
				number: undefined, delay: undefined,
			});
		});
	}

	test('reads Retry-After integer seconds', () => {
		assert.deepStrictEqual({
			missing: parseRetryAfter(null, now),
			seconds: parseRetryAfter('12', now),
			trimmedSeconds: parseRetryAfter(' 12 ', now),
			zero: parseRetryAfter('0', now),
		}, { missing: undefined, seconds: 12, trimmedSeconds: 12, zero: 0 });
	});

	for (const date of ['Fri, 02 Oct 2026 00:00:10 GMT', 'Friday, 02-Oct-26 00:00:10 GMT', 'Fri Oct  2 00:00:10 2026']) {
		test(`HTTP dates use GMT and round waits up: ${date}`, () => {
			assert.deepStrictEqual({
				future: parseRetryAfter(date, now + 250),
				past: parseRetryAfter(date, now + 10_250),
			}, { future: 10, past: 0 });
		});
	}

	test('rejects malformed and non-HTTP date feedback', () => {
		assert.deepStrictEqual(['not a date', '2026-10-02', 'Fri, 99 Oct 2026 00:00:10 GMT', 'Fri, 02 Oct 2026 00:00:10 PST']
			.map(value => parseRetryAfter(value, now)), [undefined, undefined, undefined, undefined]);
	});
});
