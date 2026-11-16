/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatScheduledChatTime } from '../../common/scheduledChatTime.js';

suite('formatScheduledChatTime', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('names the day first, without seconds or a time zone', () => {
		// Sunday, Nov 15, 2026, 6:30 PM local time.
		const now = new Date(2026, 10, 15, 18, 30).getTime();
		// Some ICU versions put a narrow no-break space before AM and PM.
		const format = (value: Date | string) => formatScheduledChatTime(value, now).replace(/\s/g, ' ');
		assert.deepStrictEqual([
			format(new Date(2026, 10, 15, 21, 0, 45)),
			format(new Date(2026, 10, 16, 9, 0)),
			format(new Date(2026, 10, 20, 9, 0)),
			format(new Date(2026, 10, 24, 9, 0)),
			format(new Date(2027, 0, 4, 9, 0)),
			format('not a date'),
		], [
			'Today 9:00 PM',
			'Tomorrow 9:00 AM',
			'Fri 9:00 AM',
			'Nov 24, 9:00 AM',
			'Jan 4, 2027, 9:00 AM',
			'Time unavailable',
		]);
	});
});
