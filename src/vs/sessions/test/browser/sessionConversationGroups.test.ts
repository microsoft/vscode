/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { toAction } from '../../../base/common/actions.js';
import { extUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ISessionConversationActionMetadata, toSessionConversationDropdownActions } from '../../browser/parts/sessionConversationsActionViewItem.js';
import { getSelectedSessionConversationActionId, getSessionConversationActionId, getSessionConversationGroupId, getSessionConversationStatusAriaLabel, getSessionConversationStatusDescription, getSessionConversationStatusLabel, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP } from '../../browser/sessionConversationGroups.js';
import { ChatOriginKind, IChat, IChatOrigin, SessionStatus } from '../../services/sessions/common/session.js';

function createChat(id: string, origin?: IChatOrigin): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:/${id}`);
		override readonly origin = origin;
	}();
}

suite('Sessions - Session conversation groups', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps side chats top-level and separates subagents', () => {
		const activeChat = createChat('active');
		assert.deepStrictEqual([
			getSessionConversationGroupId(createChat('regular'), activeChat, extUri),
			getSessionConversationGroupId(createChat('side', { kind: ChatOriginKind.SideChat }), activeChat, extUri),
			getSessionConversationGroupId(createChat('subagent', { kind: ChatOriginKind.Tool, parentChat: activeChat.resource }), activeChat, extUri),
			getSessionConversationGroupId(createChat('other-subagent', { kind: ChatOriginKind.Tool, parentChat: URI.parse('test-chat:/other') }), activeChat, extUri),
		], [
			SESSION_CONVERSATION_CHATS_GROUP,
			SESSION_CONVERSATION_CHATS_GROUP,
			SESSION_CONVERSATION_SUBAGENTS_GROUP,
			undefined,
		]);
	});

	test('selects the active chat or subagent directly', () => {
		const parentChat = createChat('parent');
		const activeSubagent = createChat('active-subagent', { kind: ChatOriginKind.Tool, parentChat: parentChat.resource });
		const activeSideChat = createChat('active-side-chat', { kind: ChatOriginKind.SideChat, parentChat: parentChat.resource });

		assert.deepStrictEqual({
			subagent: getSelectedSessionConversationActionId('session', activeSubagent),
			sideChat: getSelectedSessionConversationActionId('session', activeSideChat),
		}, {
			subagent: getSessionConversationActionId('session', activeSubagent.resource),
			sideChat: getSessionConversationActionId('session', activeSideChat.resource),
		});
	});

	test('adapts flat chat and subagent groups with state', async () => {
		let runCount = 0;
		const firstChatAction = toAction({
			id: getSessionConversationActionId('session', URI.parse('test-chat:/parent-1')),
			label: 'First Chat',
			enabled: false,
			run: () => runCount++,
		});
		const secondChatAction = toAction({
			id: getSessionConversationActionId('session', URI.parse('test-chat:/parent-2')),
			label: 'Second Chat',
			run: () => runCount++,
		});
		const firstSubagentAction = toAction({
			id: 'test.subagent.1',
			label: 'Research',
			run: () => runCount++,
		});
		const metadata = new Map<string, ISessionConversationActionMetadata>([
			[firstChatAction.id, { description: 'In Progress', ariaDescription: 'State: In Progress', icon: Codicon.sessionInProgress }],
			[firstSubagentAction.id, { description: 'Completed', ariaDescription: 'State: Completed', icon: Codicon.circleSmallFilled }],
		]);
		const actions = toSessionConversationDropdownActions([
			[SESSION_CONVERSATION_CHATS_GROUP, [firstChatAction, secondChatAction]],
			[SESSION_CONVERSATION_SUBAGENTS_GROUP, [firstSubagentAction]],
		], metadata);

		await actions[0].run();

		assert.deepStrictEqual({
			actions: actions.map(action => ({
				label: action.label,
				description: action.description,
				ariaDescription: action.ariaDescription,
				category: action.category,
			})),
			runCount,
		}, {
			actions: [
				{
					label: 'First Chat',
					description: 'In Progress',
					ariaDescription: 'State: In Progress',
					category: { label: 'Chats', order: 1, showHeader: false },
				},
				{
					label: 'Second Chat',
					description: undefined,
					ariaDescription: undefined,
					category: { label: 'Chats', order: 1, showHeader: false },
				},
				{
					label: 'Research',
					description: 'Completed',
					ariaDescription: 'State: Completed',
					category: { label: 'Subagents', order: 2, showHeader: true },
				},
			],
			runCount: 1,
		});
	});

	test('shows only subagents when there is one first-level chat', () => {
		const chatAction = toAction({
			id: getSessionConversationActionId('session', URI.parse('test-chat:/parent')),
			label: 'Only Chat',
			run: () => { },
		});
		const subagentAction = toAction({ id: 'test.subagent', label: 'Research', run: () => { } });

		const actions = toSessionConversationDropdownActions([
			[SESSION_CONVERSATION_CHATS_GROUP, [chatAction]],
			[SESSION_CONVERSATION_SUBAGENTS_GROUP, [subagentAction]],
		]);

		assert.deepStrictEqual(actions.map(action => ({
			label: action.label,
			category: action.category?.label,
			showHeader: action.category?.showHeader,
		})), [
			{ label: 'Research', category: 'Subagents', showHeader: true },
		]);
	});

	test('localizes every conversation state', () => {
		assert.deepStrictEqual([
			SessionStatus.Untitled,
			SessionStatus.InProgress,
			SessionStatus.NeedsInput,
			SessionStatus.Completed,
			SessionStatus.Error,
		].map(status => ({
			label: getSessionConversationStatusLabel(status),
			ariaLabel: getSessionConversationStatusAriaLabel(status),
		})), [
			{ label: 'New', ariaLabel: 'State: New' },
			{ label: 'In Progress', ariaLabel: 'State: In Progress' },
			{ label: 'Input Needed', ariaLabel: 'State: Input Needed' },
			{ label: 'Completed', ariaLabel: 'State: Completed' },
			{ label: 'Failed', ariaLabel: 'State: Failed' },
		]);
	});

	test('keeps completed state visually quiet but accessible', () => {
		assert.deepStrictEqual([
			SessionStatus.Untitled,
			SessionStatus.InProgress,
			SessionStatus.NeedsInput,
			SessionStatus.Completed,
			SessionStatus.Error,
		].map(status => getSessionConversationStatusDescription(status)), [
			'New',
			'In Progress',
			'Input Needed',
			undefined,
			'Failed',
		]);
	});
});
