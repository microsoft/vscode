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
					priority: InboxNotificationPriority.Now,
					title: 'Input Needed for Session A',
					description: 'Open this session to answer.',
					repositoryLabel: 'microsoft/vscode',
					pullRequestStates: [
						{ label: '#123', repositoryLabel: 'microsoft/vscode', statusLabel: 'Checks failed', icon: { id: 'git-pull-request-error' } },
						{ label: '#124', repositoryLabel: 'microsoft/vscode', statusLabel: 'Unresolved comments', icon: { id: 'git-pull-request-comment' } },
					],
				},
				{
					kind: InboxNotificationKind.Completed,
					priority: InboxNotificationPriority.Later,
					title: 'Completed: Session B',
					description: 'Review and mark done.'
				},
			]),
			[
				'Inbox notifications',
				'',
				'1. Input Needed for Session A',
				'   Priority: Now. Type: Needs Input',
				'   Repository: microsoft/vscode',
				'   Pull request states: #123 (Checks failed), #124 (Unresolved comments)',
				'   Open this session to answer.',
				'2. Completed: Session B',
				'   Priority: Later. Type: Completed',
				'   Review and mark done.',
			].join('\n'),
		);
	});
});
