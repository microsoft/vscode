/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { describeAutomationCron, validateAutomationCron } from '../../common/automationCron.js';

suite('Automation cron validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const expression of [
		'* * * * *', '*/2 * * * *', '0,59 0,23 1,31 1,12 0,7',
		'0-59/2 0-23/3 * jan-dec mon-fri', '0 0 29 FEB *',
		'0 0 30 FEB MON', '  0\t9  * * Mon  ', '*/100 * * * *',
	]) {
		test(`accepts ${JSON.stringify(expression)}`, () => {
			assert.doesNotThrow(() => validateAutomationCron(expression, 'UTC'));
		});

	}

	for (const [expression, message] of [
		['', /exactly five fields/], ['* * * *', /exactly five fields/],
		['* * * * * *', /exactly five fields/], ['@daily', /exactly five fields/],
		['60 * * * *', /Minute value is outside 0-59/],
		['0 24 * * *', /Hour value is outside 0-23/],
		['0 0 0 * *', /Day of month value is outside 1-31/],
		['0 0 * 13 *', /Month value is outside 1-12/],
		['0 0 * * 8', /Day of week value is outside 0-7/],
		['0 0 ? * *', /outside/], ['0 0 L * *', /outside/],
		['0 0 1W * *', /outside/], ['0 0 * * MON#2', /outside/],
		['0,,1 * * * *', /empty list item/], ['0, * * * *', /empty list item/],
		['*/0 * * * *', /positive integer/], ['*/1.5 * * * *', /positive integer/],
		['*/2/3 * * * *', /invalid step/], ['1/2 * * * *', /require '\*' or a range/],
		['5-1 * * * *', /ascending/], ['1-2-3 * * * *', /invalid range/],
		['0 0 30 FEB *', /real calendar date/], ['0 0 * FOO *', /outside/],
	] as const) {
		test(`rejects ${JSON.stringify(expression)}`, () => {
			assert.throws(() => validateAutomationCron(expression, 'UTC'), message);
		});
	}
});

suite('Automation cron descriptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [expression, expected] of [
		['* * * * *', 'Runs every minute every day.'],
		['*/5 * * * *', 'Runs every 5 minutes every day.'],
		['*/7 * * * *', 'Runs at minutes 0, 7, 14, 21, 28, 35, 42, 49 and 56 of every hour every day.'],
		['*/100 * * * *', 'Runs at minute 0 of every hour every day.'],
		['7 * * * *', 'Runs at minute 7 of every hour every day.'],
		['0,30 * * * *', 'Runs every 30 minutes every day.'],
		['* 9 * * *', 'Runs every minute during the 9 AM hour every day.'],
		['*/15 9 * * *', 'Runs every 15 minutes during the 9 AM hour every day.'],
		['0 */2 * * *', 'Runs every 2 hours every day.'],
		['3 3 3 5 7', 'Runs at 3:03 AM on day 3 of the month or on Sunday in May.'],
		['0 12 * * 0,7,SUN', 'Runs at 12:00 PM on Sunday.'],
		['30 9 * * MON-FRI', 'Runs at 9:30 AM on Monday through Friday.'],
		['0 8 1 JAN *', 'Runs at 8:00 AM on day 1 of the month in January.'],
		['0 0 29 FEB *', 'Runs at 12:00 AM on day 29 of the month in February.'],
		['0 9 1-3 JAN-MAR 1,3,5', 'Runs at 9:00 AM on days 1 through 3 of the month or on Monday, Wednesday and Friday in January through March.'],
		['0 9 */1 * MON', 'Runs at 9:00 AM on days 1 through 31 of the month or on Monday.'],
		['0 9 * JAN-DEC MON', 'Runs at 9:00 AM on Monday.'],
		['30 9,13,17 * * *', 'Runs at 9:30 AM, 1:30 PM and 5:30 PM every day.'],
		['0,30 9,17 * * *', 'Runs every 30 minutes during the hours 9 AM and 5 PM every day.'],
		['5,30 9,17 * * *', 'Runs at 9:05 AM, 9:30 AM, 5:05 PM and 5:30 PM every day.'],
		['0,15,30,45 9-17 * * *', 'Runs every 15 minutes during the hours 9 AM through 5 PM every day.'],
		['1,3,5,7 9,17 * * *', 'Runs at minutes 1, 3, 5 and 7 past the hours 9 AM and 5 PM every day.'],
	] as const) {
		test(`describes ${JSON.stringify(expression)}`, () => {
			assert.strictEqual(describeAutomationCron(expression, 'en-US'), expected);
		});
	}

	test('uses the requested clock convention without changing wall-clock values', () => {
		assert.strictEqual(describeAutomationCron('3 3 3 5 7', 'en-GB'), 'Runs at 3:03 on day 3 of the month or on Sunday in May.');
	});

	test('rejects invalid expressions rather than describing guessed schedules', () => {
		assert.throws(() => describeAutomationCron('0 24 * * *'), /Hour value is outside/);
	});
});
