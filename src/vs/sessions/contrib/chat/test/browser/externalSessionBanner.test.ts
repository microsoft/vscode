/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { getExternalSessionVisibilityConfirmation, shouldConfirmExternalSessionVisibilityChange } from '../../browser/externalSessionBanner.js';

suite('Sessions - External Session Banner', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches external session visibility time boundaries', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual({
			recent: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Recent, new Date(now), now),
			none: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.None, new Date(now), now),
			all: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.All, new Date(0), now),
			at24Hours: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last24Hours, new Date(now - day), now),
			olderThan24Hours: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last24Hours, new Date(now - day - 1), now),
			at7Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day), now),
			olderThan7Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day - 1), now),
		}, {
			recent: true,
			none: true,
			all: false,
			at24Hours: false,
			olderThan24Hours: true,
			at7Days: false,
			olderThan7Days: true,
		});
	});

	test('describes why a time-filtered open session will disappear', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual(
			getExternalSessionVisibilityConfirmation(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day - 1), now, 'Code - OSS'),
			{
				type: 'warning',
				message: 'This session will no longer appear in Code - OSS',
				detail: 'Only external sessions updated in the last 7 days will be shown. This session was last updated 8 days ago. Are you sure you want to save this change?',
				primaryButton: '&&Save Anyway',
			}
		);
	});

	test('warns that recent may hide the open session', () => {
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual(
			getExternalSessionVisibilityConfirmation(ChatExternalSessionsMode.Recent, new Date(now), now, 'Code - OSS'),
			{
				type: 'warning',
				message: 'This session may no longer appear in Code - OSS',
				detail: 'Only the 2 most recently updated external sessions from the last 7 days will be shown. Are you sure you want to save this change?',
				primaryButton: '&&Save Anyway',
			}
		);
	});
});
