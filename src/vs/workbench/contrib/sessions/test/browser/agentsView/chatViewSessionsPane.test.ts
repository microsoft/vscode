/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { IAgentsChatPartChat, IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { ChatViewSessionsRouter } from '../../../browser/agentsView/chatViewSessionsPane.js';

suite('ChatViewSessionsRouter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Where chats open, as it records them. */
	function createTarget(name: string, calls: string[], activeChat?: IAgentsChatPartChat): IAgentsChatPartService {
		return upcastPartial<IAgentsChatPartService>({
			activeChat: constObservable(activeChat),
			openChat: async (_session, chatResource) => { calls.push(`${name} openChat ${chatResource?.toString()}`); },
			openComposer: async () => { calls.push(`${name} openComposer`); },
			show: async () => { calls.push(`${name} show`); },
			isShowing: () => { calls.push(`${name} isShowing`); return false; },
		});
	}

	test('opens chats in the Chat view by default, and in the chat part while chat.viewSessions.openInChatPart is on', async () => {
		const calls: string[] = [];
		const inViewChat = upcastPartial<IAgentsChatPartChat>({});
		const inChatPartChat = upcastPartial<IAgentsChatPartChat>({});
		const openInChatPart = observableValue('openInChatPart', false);
		let chatPartCreated = 0;
		const chatPart = createTarget('chatPart', calls, inChatPartChat);
		const router = new ChatViewSessionsRouter(createTarget('view', calls, inViewChat), () => { chatPartCreated++; return chatPart; }, openInChatPart);
		const session = upcastPartial<ISession>({});
		const chat = URI.parse('agent-host-copilot:/session-1');

		await router.openChat(session, chat);
		await router.openComposer(undefined);
		const inView = { active: router.activeChat.get() === inViewChat, chatPartCreated };
		openInChatPart.set(true, undefined);
		await router.openChat(session, chat);
		await router.show(undefined);
		const inChatPart = { active: router.activeChat.get() === inChatPartChat };

		assert.deepStrictEqual({ calls, inView, inChatPart }, {
			calls: ['view openChat agent-host-copilot:/session-1', 'view openComposer', 'chatPart openChat agent-host-copilot:/session-1', 'chatPart show'],
			// The chat part is created only once chats open in it
			inView: { active: true, chatPartCreated: 0 },
			inChatPart: { active: true },
		});
	});

	test('the Chat view shows only the sessions, without its side pane and Maximize, while their chats open in the chat part', () => {
		const evaluate = (listActive: boolean, openInChatPart: boolean) => {
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService({ chat: { viewSessions: { openInChatPart } } })));
			ChatContextKeys.chatViewSessionsListActive.bindTo(contextKeyService).set(listActive);
			return contextKeyService.contextMatchesRules(ChatContextKeys.chatViewSessionsInChatPart);
		};

		assert.deepStrictEqual({
			inChatPart: evaluate(true, true),
			inView: evaluate(true, false),
			chatViewOwnSessions: evaluate(false, true),
		}, { inChatPart: true, inView: false, chatViewOwnSessions: false });
	});
});
