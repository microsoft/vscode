/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgent, IAgentChats } from '../../common/agent.js';
import { readChatInputState } from '../../common/meta/vscode/agentHostChatInputState.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChatInputService } from '../../node/agentHostChatInputService.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostStateManager, ChatRemovalReason, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentHostSubscriptionService } from '../../node/agentHostSubscriptionService.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';

suite('AgentHostChatInputService', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function summary(resource: string) {
		return {
			resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Session', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		};
	}

	function setup(agent?: IAgent) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const subscriptions = disposables.add(new AgentHostSubscriptionService(chatOwnership));
		const service = disposables.add(new AgentHostChatInputService(stateManager, createTestAgentHostProviderService(() => agent),
			subscriptions, chatOwnership,
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createNullSessionDataService())));
		// What the chat input contribution forwards.
		disposables.add(stateManager.onDidEmitEnvelope(({ channel, action }) => {
			if (action.type === ActionType.SessionChatAdded) {
				service.transferAdded(channel, action.summary.resource);
			} else if (action.type === ActionType.SessionChatRemoved && stateManager.chatRemovalReason(channel, action.chat) === ChatRemovalReason.Moved) {
				service.transfer(channel, action.chat);
			}
		}));
		const source = URI.from({ scheme: 'copilot', path: '/input-source' }).toString();
		const target = URI.from({ scheme: 'copilot', path: '/input-target' }).toString();
		stateManager.createSession(summary(source));
		stateManager.createSession(summary(target));
		const peer = buildChatUri(source, 'peer');
		stateManager.addChat(source, peer, creationTimeChatStorageResource(source, peer, buildDefaultChatUri(source)));
		stateManager.getChatState(peer);
		return { stateManager, subscriptions, service, source, target, peer };
	}

	function inputOf(stateManager: AgentHostStateManager, session: string, chat: string) {
		return {
			input: readChatInputState(stateManager.getSessionState(session), chat)?.kind,
			interactivity: stateManager.getSessionState(session)?.chats.find(summary => summary.resource === chat)?.interactivity,
		};
	}

	test('a moved chat takes its blocked input state to its new session', () => {
		const { stateManager, service, source, target, peer } = setup();
		service.setBlocked(peer, { errorType: 'CodexThreadInUse', message: 'In use' });
		const blocked = readChatInputState(stateManager.getSessionState(source), peer);

		stateManager.transferChats(source, target, [peer], undefined);

		assert.deepStrictEqual({
			blocked: blocked?.kind,
			source: readChatInputState(stateManager.getSessionState(source), peer),
			target: inputOf(stateManager, target, peer),
		}, { blocked: 'blocked', source: undefined, target: { input: 'blocked', interactivity: ChatInteractivity.ReadOnly } });
	});

	test('a session moved under another takes its blocked default chat\'s input state along, though its chat is never removed from it', () => {
		const { stateManager, service, source, target } = setup();
		const chat = buildDefaultChatUri(source);
		stateManager.getChatState(chat);
		stateManager.removeChat(source, buildChatUri(source, 'peer'));
		service.setBlocked(chat, { errorType: 'CodexThreadInUse', message: 'In use' });

		stateManager.transferSession(source, target, [chat], undefined);

		assert.deepStrictEqual(inputOf(stateManager, target, chat), { input: 'blocked', interactivity: ChatInteractivity.ReadOnly });
	});

	test('a promoted chat takes its blocked input state to its new session', () => {
		const { stateManager, service, peer } = setup();
		service.setBlocked(peer, { errorType: 'CodexThreadInUse', message: 'In use' });
		const promoted = URI.from({ scheme: 'copilot', path: '/input-promoted' }).toString();

		stateManager.promoteChats(URI.from({ scheme: 'copilot', path: '/input-source' }).toString(), { ...summary(promoted), defaultChat: peer }, undefined, [peer]);

		assert.deepStrictEqual(inputOf(stateManager, promoted, peer), { input: 'blocked', interactivity: ChatInteractivity.ReadOnly });
	});

	test('a check that completes after its chat moved settles the chat in its new session', async () => {
		const started = new DeferredPromise<void>();
		const completed = new DeferredPromise<void>();
		const prepareChat: IAgentChats['prepareChat'] = async () => {
			started.complete();
			await completed.p;
			return {};
		};
		const { stateManager, subscriptions, service, source, target, peer } = setup({ chats: { prepareChat } } as unknown as IAgent);
		subscriptions.addSubscriber(URI.parse(peer), 'client');
		const preparing = service.prepareChat(URI.parse(peer));
		await started.p;

		stateManager.transferChats(source, target, [peer], undefined);
		const moved = inputOf(stateManager, target, peer);
		completed.complete();
		await preparing;

		assert.deepStrictEqual({ moved, settled: inputOf(stateManager, target, peer) }, {
			moved: { input: 'checking', interactivity: ChatInteractivity.ReadOnly },
			settled: { input: undefined, interactivity: ChatInteractivity.Full },
		});
	});
});
