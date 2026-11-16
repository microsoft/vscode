/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatScheduledRequestTime, formatScheduledRequestTimeFromNow, getScheduledRequestTimeFromNowChange } from '../../../common/widget/chatScheduledRequestTime.js';

suite('Chat scheduled request time', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// Sunday, Nov 15, 2026, 6:30 PM local time.
	const now = new Date(2026, 10, 15, 18, 30).getTime();

	test('names the day first, without seconds or a time zone', () => {
		// Some ICU versions put a narrow no-break space before AM and PM.
		const format = (value: Date | string) => [
			formatScheduledRequestTime(value, now),
			formatScheduledRequestTime(value, now, true),
		].map(text => text.replace(/\s/g, ' '));
		assert.deepStrictEqual([
			format(new Date(2026, 10, 15, 21, 0, 45)),
			format(new Date(2026, 10, 16, 9, 0)),
			format(new Date(2026, 10, 20, 9, 0)),
			format(new Date(2026, 10, 24, 9, 0)),
			format(new Date(2027, 0, 4, 9, 0)),
			format('not a date'),
		], [
			['Today 9:00 PM', 'Today at 9:00 PM'],
			['Tomorrow 9:00 AM', 'Tomorrow at 9:00 AM'],
			['Fri 9:00 AM', 'Fri at 9:00 AM'],
			['Nov 24, 9:00 AM', 'Nov 24 at 9:00 AM'],
			['Jan 4, 2027, 9:00 AM', 'Jan 4, 2027 at 9:00 AM'],
			['Time unavailable', 'Time unavailable'],
		]);
	});

	test('says how long until it sends, rounded to the nearest minute, hour or day', () => {
		const minutes = (count: number) => now + count * 60_000;
		assert.deepStrictEqual([
			formatScheduledRequestTimeFromNow(now + 20_000, now),
			formatScheduledRequestTimeFromNow(minutes(1), now),
			formatScheduledRequestTimeFromNow(minutes(10), now),
			// Picked "In 1 Hour" a moment ago.
			formatScheduledRequestTimeFromNow(minutes(60) - 5_000, now),
			formatScheduledRequestTimeFromNow(minutes(59), now),
			formatScheduledRequestTimeFromNow(minutes(3 * 60 - 10), now),
			formatScheduledRequestTimeFromNow(minutes(14 * 60 + 30), now),
			formatScheduledRequestTimeFromNow(minutes(24 * 60), now),
			formatScheduledRequestTimeFromNow(minutes(5 * 24 * 60 + 60), now),
			formatScheduledRequestTimeFromNow(now - 60_000, now),
			formatScheduledRequestTimeFromNow(minutes(3 * 60), now, true),
			formatScheduledRequestTimeFromNow(now, now, true),
		], [
			'Sending in less than a minute',
			'Sending in 1 minute',
			'Sending in 10 minutes',
			'Sending in 1 hour',
			'Sending in 59 minutes',
			'Sending in 3 hours',
			'Sending in 15 hours',
			'Sending in 1 day',
			'Sending in 5 days',
			'Sending now',
			'In 3 hours',
			'Now',
		]);
	});

	test('knows when the time left next reads differently', () => {
		const at = (offset: number) => {
			const change = getScheduledRequestTimeFromNowChange(now + offset, now);
			return change === undefined ? undefined : {
				change,
				before: formatScheduledRequestTimeFromNow(now + offset, now + change - 1),
				after: formatScheduledRequestTimeFromNow(now + offset, now + change + 1),
			};
		};
		assert.deepStrictEqual([at(10 * 60_000), at(45_000), at(20_000), at(0)], [
			{ change: 30_000, before: 'Sending in 10 minutes', after: 'Sending in 9 minutes' },
			{ change: 15_000, before: 'Sending in 1 minute', after: 'Sending in less than a minute' },
			{ change: 20_000, before: 'Sending in less than a minute', after: 'Sending now' },
			undefined,
		]);
	});
});
