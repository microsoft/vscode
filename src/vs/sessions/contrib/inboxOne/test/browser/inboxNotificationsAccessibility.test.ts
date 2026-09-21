/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InboxNotificationKind, InboxNotificationPriority } from '../../common/inboxNotificationsService.js';
import { buildInboxNotificationsAccessibleContent } from '../../browser/inboxNotificationsAccessibility.js';

suite('InboxNotificationsAccessibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds empty accessible content', () => {
		assert.strictEqual(
			buildInboxNotificationsAccessibleContent([]),
			'No active notifications.',
		);
	});

	test('builds numbered accessible content for notifications', () => {
		assert.strictEqual(
			buildInboxNotificationsAccessibleContent([
				{
					kind: InboxNotificationKind.NeedsInput,
					priority: InboxNotificationPriority.High,
					title: 'Input Needed for Session A',
					description: 'Open this session to answer.'
				},
				{
					kind: InboxNotificationKind.Completed,
					priority: InboxNotificationPriority.Low,
					title: 'Completed: Session B',
					description: 'Review and mark as read.'
				},
			]),
			[
				'Inbox notifications',
				'',
				'1. Input Needed for Session A',
				'   Priority: High. Type: Needs Input',
				'   Open this session to answer.',
				'2. Completed: Session B',
				'   Priority: Low. Type: Completed',
				'   Review and mark as read.',
			].join('\n'),
		);
	});
});
