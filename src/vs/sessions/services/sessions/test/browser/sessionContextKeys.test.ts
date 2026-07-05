/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../common/session.js';
import { IActiveSession } from '../../common/sessionsManagement.js';
import { setActiveSessionContextKeys } from '../../common/sessionContextKeys.js';
import { SessionHasClosedChatsContext, SessionHasMultipleOpenChatsContext } from '../../../../common/contextkeys.js';

suite('Sessions - Context Keys', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const stubChat: IChat = {
		resource: URI.parse('test:///chat'),
		createdAt: new Date(),
		title: constObservable('Chat'),
		updatedAt: constObservable(new Date()),
		status: constObservable(SessionStatus.Completed),
		changes: constObservable([]),
		checkpoints: constObservable(undefined),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		interactivity: constObservable(ChatInteractivity.Full),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};

	function makeChat(id: string): IChat {
		return { ...stubChat, resource: URI.parse(`test:///chat/${id}`), title: constObservable(id) };
	}

	function makeSession(id: string, chats: IChat[]): ISession {
		return {
			sessionId: id,
			resource: URI.parse(`test:///session/${id}`),
			providerId: 'test-provider',
			sessionType: 'test-type',
			icon: { id: 'test-icon' },
			createdAt: new Date(),
			workspace: constObservable(undefined),
			isQuickChat: constObservable(false),
			title: constObservable(id),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			isRead: constObservable(true),
			capabilities: constObservable({ supportsMultipleChats: true }),
			chats: constObservable(chats),
			mainChat: constObservable(chats[0]),
			changesets: constObservable([]),
			changes: constObservable([]),
			workingSet: constObservable(undefined),
		};
	}

	function makeActiveSession(session: ISession, openChats: IChat[], closedChats: IChat[]): IActiveSession {
		return {
			...session,
			isCreated: constObservable(true),
			sticky: constObservable(false),
			openChats: constObservable(openChats),
			closedChats: constObservable(closedChats),
			lastClosedChat: closedChats[closedChats.length - 1],
			visibleChatTabs: constObservable(openChats),
			shouldShowChatTabs: constObservable(openChats.length > 1),
			activeChat: constObservable(openChats[0]),
			setActiveChat: () => {},
			closeChat: () => Promise.resolve(),
			openChat: () => Promise.resolve(),
			setSticky: () => {},
			addDisposable: (d) => d,
		};
	}

	test('setActiveSessionContextKeys sets closed chats context keys correctly', () => {
		const contextKeyService = new MockContextKeyService();
		const main = makeChat('main');
		const secondary = makeChat('secondary');
		const session = makeSession('S', [main, secondary]);

		// No closed chats
		const activeSessionNoClosed = makeActiveSession(session, [main, secondary], []);
		setActiveSessionContextKeys(activeSessionNoClosed, contextKeyService, undefined);
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionHasClosedChatsContext.key), false);
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionHasMultipleOpenChatsContext.key), true);

		// With closed chats
		const activeSessionWithClosed = makeActiveSession(session, [main], [secondary]);
		setActiveSessionContextKeys(activeSessionWithClosed, contextKeyService, undefined);
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionHasClosedChatsContext.key), true);
		assert.strictEqual(contextKeyService.getContextKeyValue(SessionHasMultipleOpenChatsContext.key), false);
	});
});
