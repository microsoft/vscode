/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { buildInboxNotificationsAccessibleContent } from '../../browser/inboxNotificationsAccessibility.js';

suite('InboxNotificationsAccessibility', () => {
	test('builds empty accessible content', () => {
		assert.strictEqual(
			buildInboxNotificationsAccessibleContent([]),
			'No active notifications.',
		);
	});

	test('builds numbered accessible content for notifications', () => {
		assert.strictEqual(
			buildInboxNotificationsAccessibleContent([
				{ title: 'Input Needed for Session A', description: 'Open this session to answer.' },
				{ title: 'Completed: Session B', description: 'Review and mark as read.' },
			]),
			[
				'Inbox notifications',
				'',
				'1. Input Needed for Session A',
				'   Open this session to answer.',
				'2. Completed: Session B',
				'   Review and mark as read.',
			].join('\n'),
		);
	});
});
