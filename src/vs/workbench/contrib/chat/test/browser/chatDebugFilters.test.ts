/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatDebugFilterState } from '../../browser/chatDebug/chatDebugFilters.js';
import { parseTimeToken } from '../../common/chatDebugEvents.js';

suite('ChatDebugFilterState', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseTimeToken', () => {

		suite('before: prefix', () => {

			test('year only — rounds to end of year', () => {
				const result = parseTimeToken('before:2026', 'before');
				assert.strictEqual(result, new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
			});

			test('year-month — rounds to end of month', () => {
				const result = parseTimeToken('before:2026-03', 'before');
				// new Date(2026, 3, 0) gives last day of March
				assert.strictEqual(result, new Date(2026, 3, 0, 23, 59, 59, 999).getTime());
			});

			test('year-month (February, non-leap) — rounds to end of Feb', () => {
				const result = parseTimeToken('before:2025-02', 'before');
				assert.strictEqual(result, new Date(2025, 2, 0, 23, 59, 59, 999).getTime());
			});

			test('year-month-day — rounds to end of day', () => {
				const result = parseTimeToken('before:2026-03-03', 'before');
				assert.strictEqual(result, new Date(2026, 2, 3, 23, 59, 59, 999).getTime());
			});

			test('date with hour only — rounds to end of hour', () => {
				const result = parseTimeToken('before:2026-03-03t14', 'before');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 59, 59, 999).getTime());
			});

			test('date with hour:minute — rounds to end of minute', () => {
				const result = parseTimeToken('before:2026-03-03t14:30', 'before');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 30, 59, 999).getTime());
			});

			test('full date-time with seconds', () => {
				const result = parseTimeToken('before:2026-03-03t14:30:45', 'before');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 30, 45, 999).getTime());
			});
		});

		suite('after: prefix', () => {

			test('year only — start of year', () => {
				const result = parseTimeToken('after:2026', 'after');
				assert.strictEqual(result, new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
			});

			test('year-month — start of month', () => {
				const result = parseTimeToken('after:2026-03', 'after');
				assert.strictEqual(result, new Date(2026, 2, 1, 0, 0, 0, 0).getTime());
			});

			test('year-month-day — start of day', () => {
				const result = parseTimeToken('after:2026-03-03', 'after');
				assert.strictEqual(result, new Date(2026, 2, 3, 0, 0, 0, 0).getTime());
			});

			test('date with hour only — start of hour', () => {
				const result = parseTimeToken('after:2026-03-03t14', 'after');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 0, 0, 0).getTime());
			});

			test('date with hour:minute — start of minute', () => {
				const result = parseTimeToken('after:2026-03-03t14:30', 'after');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 30, 0, 0).getTime());
			});

			test('full date-time with seconds', () => {
				const result = parseTimeToken('after:2026-03-03t14:30:45', 'after');
				assert.strictEqual(result, new Date(2026, 2, 3, 14, 30, 45, 0).getTime());
			});
		});

		suite('no match', () => {

			test('returns undefined for empty string', () => {
				assert.strictEqual(parseTimeToken('', 'before'), undefined);
			});

			test('returns undefined for unrelated text', () => {
				assert.strictEqual(parseTimeToken('hello world', 'before'), undefined);
			});

			test('returns undefined for wrong prefix', () => {
				assert.strictEqual(parseTimeToken('after:2026', 'before'), undefined);
			});

			test('returns undefined for bare time without date', () => {
				assert.strictEqual(parseTimeToken('before:14:30', 'before'), undefined);
			});
		});

		suite('embedded in text', () => {

			test('extracts token from surrounding text', () => {
				const result = parseTimeToken('some text before:2026-03-03 more text', 'before');
				assert.strictEqual(result, new Date(2026, 2, 3, 23, 59, 59, 999).getTime());
			});

			test('handles both before and after in same string', () => {
				const text = 'after:2026-01 before:2026-03';
				const after = parseTimeToken(text, 'after');
				const before = parseTimeToken(text, 'before');
				assert.strictEqual(after, new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
				assert.strictEqual(before, new Date(2026, 3, 0, 23, 59, 59, 999).getTime());
			});
		});
	});

	suite('setTextFilter and timestamp parsing', () => {
		let state: ChatDebugFilterState;

		setup(() => {
			state = disposables.add(new ChatDebugFilterState());
		});

		test('sets beforeTimestamp and afterTimestamp from text', () => {
			state.setTextFilter('after:2026-01-01 before:2026-12-31');
			assert.strictEqual(state.afterTimestamp, new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
			assert.strictEqual(state.beforeTimestamp, new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
		});

		test('clears timestamps when tokens removed', () => {
			state.setTextFilter('before:2026');
			assert.ok(state.beforeTimestamp !== undefined);
			state.setTextFilter('hello');
			assert.strictEqual(state.beforeTimestamp, undefined);
		});
	});

	suite('textFilterWithoutTimestamps', () => {
		let state: ChatDebugFilterState;

		setup(() => {
			state = disposables.add(new ChatDebugFilterState());
		});

		test('strips year-only token', () => {
			state.setTextFilter('before:2026 hello');
			assert.strictEqual(state.textFilterWithoutTimestamps, 'hello');
		});

		test('strips year-month token', () => {
			state.setTextFilter('after:2026-03 hello');
			assert.strictEqual(state.textFilterWithoutTimestamps, 'hello');
		});

		test('strips full date-time token', () => {
			state.setTextFilter('before:2026-03-03t14:30:45 hello');
			assert.strictEqual(state.textFilterWithoutTimestamps, 'hello');
		});

		test('strips multiple tokens', () => {
			state.setTextFilter('after:2026-01 hello before:2026-12');
			assert.strictEqual(state.textFilterWithoutTimestamps, 'hello');
		});

		test('returns empty when only tokens', () => {
			state.setTextFilter('before:2026');
			assert.strictEqual(state.textFilterWithoutTimestamps, '');
		});
	});

	suite('isTimestampVisible', () => {
		let state: ChatDebugFilterState;

		setup(() => {
			state = disposables.add(new ChatDebugFilterState());
		});

		test('visible when no timestamp filters set', () => {
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 5, 15)), true);
		});

		test('hidden when after beforeTimestamp', () => {
			state.setTextFilter('before:2026-03');
			// April 1st is after end of March
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 3, 1)), false);
		});

		test('visible when before beforeTimestamp', () => {
			state.setTextFilter('before:2026-03');
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 1, 15)), true);
		});

		test('hidden when before afterTimestamp', () => {
			state.setTextFilter('after:2026-06');
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 4, 31)), false);
		});

		test('visible when after afterTimestamp', () => {
			state.setTextFilter('after:2026-06');
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 6, 1)), true);
		});

		test('visible when within before/after range', () => {
			state.setTextFilter('after:2026-03 before:2026-06');
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 3, 15)), true);
		});

		test('hidden when outside before/after range', () => {
			state.setTextFilter('after:2026-03 before:2026-06');
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 0, 1)), false);
			assert.strictEqual(state.isTimestampVisible(new Date(2026, 8, 1)), false);
		});
	});
});
