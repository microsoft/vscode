/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseTime } from '../../browser/automationSchedulePicker.js';

suite('AutomationSchedulePicker.parseTime', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses common 12-hour and 24-hour inputs', () => {
		assert.deepStrictEqual(parseTime('9:15 AM'), { hour: 9, minute: 15 });
		assert.deepStrictEqual(parseTime('9:15am'), { hour: 9, minute: 15 });
		assert.deepStrictEqual(parseTime(' 9:15 PM '), { hour: 21, minute: 15 });
		assert.deepStrictEqual(parseTime('12:00 AM'), { hour: 0, minute: 0 });
		assert.deepStrictEqual(parseTime('12:30 PM'), { hour: 12, minute: 30 });
		assert.deepStrictEqual(parseTime('21:30'), { hour: 21, minute: 30 });
		assert.deepStrictEqual(parseTime('09:15'), { hour: 9, minute: 15 });
		assert.deepStrictEqual(parseTime('9 PM'), { hour: 21, minute: 0 });
		assert.deepStrictEqual(parseTime('0'), { hour: 0, minute: 0 });
		assert.deepStrictEqual(parseTime('23:59'), { hour: 23, minute: 59 });
	});

	test('rejects invalid inputs', () => {
		assert.strictEqual(parseTime(''), undefined);
		assert.strictEqual(parseTime('abc'), undefined);
		assert.strictEqual(parseTime('25:00'), undefined);
		assert.strictEqual(parseTime('9:60 AM'), undefined);
		assert.strictEqual(parseTime('13:00 PM'), undefined);
		assert.strictEqual(parseTime('0:00 AM'), undefined);
		assert.strictEqual(parseTime('9:15 XM'), undefined);
		assert.strictEqual(parseTime('9-15'), undefined);
	});
});
