/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { safeIntl } from '../../../../base/common/date.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { describeAutomationCron, validateAutomationCron } from '../../common/automationCron.js';

suite('Automation cron validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const expression of [
		'* * * * *', '*/2 * * * *', '0,59 0,23 1,31 1,12 0,7',
		'0-59/2 0-23/3 * jan-dec mon-fri', '0 0 29 FEB *',
		'0 0 30 FEB MON', '  0\t9  * * Mon  ', '*/100 * * * *',
		'15 * * * *', '2,10 4,5 * * *', '30 4-6 * * *', '20-59/15 * * * *',
		'0 9-23/6 * * *', '0 9 5-31/10 * *', '0 9 5 3-12/4 *',
		'0 9 * MAR-DEC/3 MON', '0 9 * * 1-6/2', '0 9 * * 7-7/2',
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
		['*/2/3 * * * *', /invalid step/], ['20/0 * * * *', /positive integer/],
		['60-59/15 * * * *', /Minute value is outside/], ['20/1.5 * * * *', /positive integer/],
		['20/15 * * * *', /steps require '\*' or a range/], ['0 9/6 * * *', /steps require '\*' or a range/],
		['0 9 5/10 * *', /steps require '\*' or a range/], ['0 9 5 3/4 *', /steps require '\*' or a range/],
		['0 9 * * 1/2', /steps require '\*' or a range/], ['0 9 * MAR/3 MON', /steps require '\*' or a range/],
		['0 9 * * MON/2', /steps require '\*' or a range/], ['0 9 * * 7/2', /steps require '\*' or a range/],
		['0,20/15 * * * *', /steps require '\*' or a range/],
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
		['3 3 3 5 7', 'In May, runs at 3:03 AM on day 3 of the month and also on Sunday.'],
		['3 3 5 5 2', 'In May, runs at 3:03 AM on day 5 of the month and also on Tuesday.'],
		['20-59/15 * * * *', 'Runs at minutes 20, 35 and 50 of every hour every day.'],
		['0 9 * * 1-6/2', 'Runs at 9:00 AM on Monday, Wednesday and Friday.'],
		['0 12 * * 0,7,SUN', 'Runs at 12:00 PM on Sunday.'],
		['30 9 * * MON-FRI', 'Runs at 9:30 AM on Monday through Friday.'],
		['0 8 1 JAN *', 'In January, runs at 8:00 AM on day 1 of the month.'],
		['0 0 29 FEB *', 'In February, runs at 12:00 AM on day 29 of the month.'],
		['0 9 1-3 JAN-MAR 1,3,5', 'In January through March, runs at 9:00 AM on days 1 through 3 of the month and also on Monday, Wednesday and Friday.'],
		['0 9 */1 * MON', 'Runs at 9:00 AM on days 1 through 31 of the month and also on Monday.'],
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
		assert.strictEqual(describeAutomationCron('3 3 3 5 7', 'en-GB'), 'In May, runs at 3:03 on day 3 of the month and also on Sunday.');
	});

	for (const locale of ['fa', 'en-US-u-ca-persian']) {
		test(`uses Gregorian month names with ${locale}`, () => {
			const january = new Date(Date.UTC(2024, 0, 1));
			const month = safeIntl.DateTimeFormat(locale, { month: 'long', calendar: 'gregory', timeZone: 'UTC' }).value.format(january);
			const time = safeIntl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).value.format(january);
			assert.strictEqual(describeAutomationCron('0 0 1 1 *', locale), `In ${month}, runs at ${time} on day 1 of the month.`);
		});
	}

	test('rejects invalid expressions rather than describing guessed schedules', () => {
		assert.throws(() => describeAutomationCron('0 24 * * *'), /Hour value is outside/);
		assert.throws(() => describeAutomationCron('20/15 * * * *'), /steps require '\*' or a range/);
	});
});
