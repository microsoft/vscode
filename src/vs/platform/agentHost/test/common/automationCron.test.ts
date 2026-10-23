/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { validateAutomationCron } from '../../common/automationCron.js';

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
