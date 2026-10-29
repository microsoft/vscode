/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { InboxCanvasFocusContext } from '../../../../common/contextkeys.js';
import { InboxNotificationKind, InboxNotificationPriority } from '../../common/inboxNotificationsService.js';
import { buildInboxNotificationsAccessibleContent } from '../../browser/inboxNotificationsAccessibility.js';

suite('InboxNotificationsAccessibility', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('Inbox accessibility providers yield to Chat inside the embedded conversation', () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const providers = AccessibleViewRegistry.getImplementations().filter(provider => provider.name.startsWith('sessions-inbox-notifications-'));
		const inboxFocused = InboxCanvasFocusContext.bindTo(context);
		const inChat = ChatContextKeys.inChatSession.bindTo(context);
		const matches = () => providers.map(provider => context.contextMatchesRules(provider.when));
		inboxFocused.set(true);
		const inbox = matches();
		inChat.set(true);
		const chat = matches();
		inChat.reset();
		inboxFocused.reset();
		assert.deepStrictEqual({ inbox, chat, outside: matches() }, { inbox: [true, true], chat: [false, false], outside: [false, false] });
	});

	test('builds empty accessible content', () => {
		assert.strictEqual(
			buildInboxNotificationsAccessibleContent([]),
			'No active notifications.',
		);
	});

	test('includes the actual terminal command and disclaimer in accessible content', () => {
		const content = buildInboxNotificationsAccessibleContent([{
			kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Terminal', description: '',
			needsInputPart: {
				kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool',
				confirmationKind: 'execution', title: 'Run in terminal?', message: 'Run checks', commandLine: 'npm test',
				disclaimer: { value: 'Runs outside the sandbox' }, buttons: [],
			},
		}]);
		assert.deepStrictEqual(['npm test', 'Runs outside the sandbox', 'Open the session to review the full request and respond.'].map(text => content.includes(text)), [true, true, true]);
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

	test('keeps notification descriptions separate from selected-item interpretation', () => {
		const content = buildInboxNotificationsAccessibleContent([
			{ kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Question', description: 'Generic' },
			{ kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later, title: 'Done', description: 'Fallback' },
		]);
		assert.deepStrictEqual({ preview: content.includes('Choose the deployment target.'), generic: content.includes('Generic'), fallback: content.includes('Fallback') }, {
			preview: false, generic: true, fallback: true,
		});
	});
});
