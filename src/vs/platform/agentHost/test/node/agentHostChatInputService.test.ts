/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { readChatInputState } from '../../common/meta/vscode/agentHostChatInputState.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChatInputService } from '../../node/agentHostChatInputService.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
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

	test('a moved chat takes its blocked input state to its new session', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const service = disposables.add(new AgentHostChatInputService(stateManager, createTestAgentHostProviderService(() => undefined),
			disposables.add(new AgentHostSubscriptionService(chatOwnership)), chatOwnership,
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createNullSessionDataService())));
		const source = URI.from({ scheme: 'copilot', path: '/input-source' }).toString();
		const target = URI.from({ scheme: 'copilot', path: '/input-target' }).toString();
		stateManager.createSession(summary(source));
		stateManager.createSession(summary(target));
		const peer = buildChatUri(source, 'peer');
		stateManager.addChat(source, peer, creationTimeChatStorageResource(source, peer, buildDefaultChatUri(source)));
		stateManager.getChatState(peer);
		service.setBlocked(peer, { errorType: 'CodexThreadInUse', message: 'In use' });
		const blocked = readChatInputState(stateManager.getSessionState(source), peer);

		stateManager.transferChats(source, target, [peer], undefined);
		service.transfer(source, peer);

		assert.deepStrictEqual({
			blocked: blocked?.kind,
			source: readChatInputState(stateManager.getSessionState(source), peer),
			target: readChatInputState(stateManager.getSessionState(target), peer)?.kind,
			interactivity: stateManager.getSessionState(target)?.chats.find(chat => chat.resource === peer)?.interactivity,
		}, { blocked: 'blocked', source: undefined, target: 'blocked', interactivity: ChatInteractivity.ReadOnly });
	});
});
