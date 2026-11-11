/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { parseReminder, parseReminderTime } from '../../../common/automations/reminderParser.js';

suite('Reminder parser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const now = new Date(2026, 10, 11, 13, 20, 0);

	test('accepts Slack-style leading and trailing times without rewriting reminder text', () => {
		const at = new Date(now.getTime() + 3_600_000).toISOString();
		assert.deepStrictEqual([
			parseReminder('/remind me in one hour to do reminder feature in vscode', now),
			parseReminder('me review PR #42 in 60 minutes', now),
			parseReminder('me in an hour to review PR #42', now),
			parseReminder('me tomorrow at 9am to review PR #42', now),
		], [
			{ text: 'do reminder feature in vscode', at },
			{ text: 'review PR #42', at },
			{ text: 'review PR #42', at },
			{ text: 'review PR #42', at: new Date(2026, 10, 12, 9).toISOString() },
		]);
	});

	test('requires clarification instead of guessing invalid, ambiguous, recurring or past times', () => {
		assert.deepStrictEqual([
			'me later to review', 'me tomorrow to review', 'me today at 9 to review',
			'me today at 9am to review', 'me in zero hours to review', 'me in 0 minutes to review',
			'me every day at 9am to review', 'me 2027-02-30 at 14:30 to review',
			'me in 1 hour', 'me in 1 hour to review in 2 hours', 'me tomorrow at 25:00 to review',
			'me tomorrow at 12:99 to review',
		].map(value => parseReminder(value, now)), Array(12).fill(undefined));
	});

	test('resolves local dates, weekday rollover, midnight and noon', () => {
		assert.deepStrictEqual([
			'today at 14:30', 'tomorrow at 12am', 'tomorrow at 12pm', 'wednesday at 9am', '2027-01-15 at 14:30',
		].map(value => parseReminderTime(value, now)?.getTime()), [
			new Date(2026, 10, 11, 14, 30).getTime(),
			new Date(2026, 10, 12, 0).getTime(),
			new Date(2026, 10, 12, 12).getTime(),
			new Date(2026, 10, 18, 9).getTime(),
			new Date(2027, 0, 15, 14, 30).getTime(),
		]);
	});
});
