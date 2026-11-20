/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getChatScheduledRequestAccessibleText } from '../../../browser/chatRequestText.js';
import { getScheduledRequestAbsoluteTimeLabel } from '../../../browser/widget/chatScheduledRequestTime.js';

suite('Chat scheduled request time', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats the local day and minute without seconds or a time zone', () => {
		const now = new Date(2026, 10, 16, 9).getTime();
		const dates = [
			new Date(2026, 10, 16, 11, 42, 30),
			new Date(2026, 10, 17, 9),
			new Date(2026, 10, 20, 9),
			new Date(2026, 10, 24, 9),
			new Date(2027, 0, 4, 9),
		];
		assert.deepStrictEqual([
			...dates.map(date => getScheduledRequestAbsoluteTimeLabel(date.toISOString(), now).replace(/\s/g, ' ')),
			getScheduledRequestAbsoluteTimeLabel('invalid', now),
		], [
			'Today at 11:42 AM', 'Tomorrow at 9:00 AM', 'Fri at 9:00 AM',
			'Nov 24 at 9:00 AM', 'Jan 4, 2027 at 9:00 AM', 'Time unavailable',
		]);
	});

	test('calendar-day labels survive daylight-saving boundaries', () => {
		assert.deepStrictEqual([
			getScheduledRequestAbsoluteTimeLabel(new Date(2026, 2, 9, 0, 15).toISOString(), new Date(2026, 2, 8, 0, 30).getTime()),
			getScheduledRequestAbsoluteTimeLabel(new Date(2026, 10, 1, 23, 30).toISOString(), new Date(2026, 10, 1, 0, 30).getTime()),
		].map(label => label.replace(/\s/g, ' ')), ['Tomorrow at 12:15 AM', 'Today at 11:30 PM']);
	});

	test('accessible scheduled text uses the same relative and local send time', () => runWithFakedTimers({ startTime: new Date(2026, 10, 16, 9).getTime(), useFakeTimers: true }, async () => {
		const text = getChatScheduledRequestAccessibleText({
			id: 'later', text: 'Check the build', description: 'Raw timestamp with time zone',
			runAt: new Date(2026, 10, 16, 12).toISOString(), attachments: ['notes.txt'], actions: [],
		});
		assert.strictEqual(text.replace(/[^\S\n]/g, ' '), 'Sends in 3 hours, Today at 12:00 PM\nCheck the build\nAttachments: notes.txt');
	}));
});
