/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toAction } from '../../../base/common/actions.js';
import { extUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { toSessionConversationDropdownActions } from '../../browser/parts/sessionConversationsActionViewItem.js';
import { getSessionConversationGroupId, ISessionConversationGroupRegistry, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SIDE_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP, SessionConversationExtensions } from '../../browser/sessionConversationGroups.js';
import { ChatOriginKind, IChat, IChatOrigin } from '../../services/sessions/common/session.js';

const groups = [
	{ id: SESSION_CONVERSATION_CHATS_GROUP, label: 'Chats', order: 1 },
	{ id: SESSION_CONVERSATION_SIDE_CHATS_GROUP, label: 'Side chats', order: 2 },
	{ id: SESSION_CONVERSATION_SUBAGENTS_GROUP, label: 'Subagents', order: 3 },
] as const;

function createChat(id: string, origin?: IChatOrigin): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:/${id}`);
		override readonly origin = origin;
	}();
}

suite('Sessions - Session conversation groups', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('orders registered labeled groups for display', () => {
		const registry = Registry.as<ISessionConversationGroupRegistry>(SessionConversationExtensions.Groups);
		for (const group of groups) {
			disposables.add(registry.register(group));
		}

		assert.deepStrictEqual(registry.getGroups(), groups);
	});

	test('classifies regular chats, side chats, and active-chat subagents', () => {
		const activeChat = createChat('active');

		assert.deepStrictEqual([
			getSessionConversationGroupId(createChat('regular'), activeChat.resource, extUri),
			getSessionConversationGroupId(createChat('side', { kind: ChatOriginKind.SideChat, parentChat: activeChat.resource }), activeChat.resource, extUri),
			getSessionConversationGroupId(createChat('subagent', { kind: ChatOriginKind.Tool, parentChat: activeChat.resource }), activeChat.resource, extUri),
			getSessionConversationGroupId(createChat('other-subagent', { kind: ChatOriginKind.Tool, parentChat: URI.parse('test-chat:/other') }), activeChat.resource, extUri),
		], [
			SESSION_CONVERSATION_CHATS_GROUP,
			SESSION_CONVERSATION_SIDE_CHATS_GROUP,
			SESSION_CONVERSATION_SUBAGENTS_GROUP,
			undefined,
		]);
	});

	test('adapts contributed menu actions to labeled action-widget categories', async () => {
		let runCount = 0;
		const chatAction = toAction({
			id: 'test.chat',
			label: 'Main Chat',
			tooltip: 'Main Chat',
			enabled: false,
			checked: true,
			run: () => runCount++,
		});
		const [action] = toSessionConversationDropdownActions([[SESSION_CONVERSATION_CHATS_GROUP, [chatAction]]], groups);

		await action.run();

		assert.deepStrictEqual({
			id: action.id,
			label: action.label,
			enabled: action.enabled,
			checked: action.checked,
			category: action.category,
			runCount,
		}, {
			id: 'test.chat',
			label: 'Main Chat',
			enabled: false,
			checked: true,
			category: { label: 'Chats', order: 1, showHeader: true },
			runCount: 1,
		});
	});
});
