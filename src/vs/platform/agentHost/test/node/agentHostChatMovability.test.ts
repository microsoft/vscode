/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatMoveConfigKey } from '../../common/agentHostChatMove.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatMovability } from '../../node/agentHostChatMovability.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';

suite('AgentHostChatMovability', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.from({ scheme: 'copilot', path: '/movable-source' }).toString();
	const target = URI.from({ scheme: 'copilot', path: '/movable-target' }).toString();

	function summary(resource: string) {
		return {
			resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Session', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		};
	}

	test('publishes eligibility per chat and follows the setting, a move and the default chat', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configuration = disposables.add(new AgentConfigurationService(stateManager, new NullLogService()));
		disposables.add(new AgentHostChatMovability(stateManager, configuration));
		stateManager.createSession(summary(session));
		stateManager.createSession(summary(target));
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		const tool = buildChatUri(session, 'tool');
		const hidden = buildChatUri(session, 'hidden');
		const storage = (chat: string) => creationTimeChatStorageResource(session, chat, defaultChat);
		stateManager.addChat(session, peer, storage(peer));
		stateManager.addChat(session, tool, storage(tool), { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'call' } });
		stateManager.addChat(session, hidden, storage(hidden), { interactivity: ChatInteractivity.Hidden });
		const labels = new Map([[defaultChat, 'default'], [buildDefaultChatUri(target), 'targetDefault'], [peer, 'peer'], [tool, 'tool'], [hidden, 'hidden']]);
		const movable = () => Object.fromEntries([session, target].flatMap(owner => stateManager.getSessionState(owner)?.chats ?? [])
			.map(chat => [labels.get(chat.resource), chat.movable ?? false]));
		const chatActions: string[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatMovableChanged) {
				chatActions.push(`${envelope.channel === peer ? 'peer' : envelope.channel} ${envelope.action.movable}`);
			}
		}));
		await timeout(0);
		const disabled = movable();

		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		const enabled = movable();
		const peerState = stateManager.getChatState(peer)?.movable;

		stateManager.transferChats(session, target, [peer, tool], undefined);
		const afterMove = movable();

		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: false });
		const disabledAgain = movable();

		assert.deepStrictEqual({ disabled, enabled, peerState, afterMove, disabledAgain, chatActions }, {
			disabled: { default: false, targetDefault: false, peer: false, tool: false, hidden: false },
			enabled: { default: false, targetDefault: false, peer: true, tool: false, hidden: false },
			peerState: true,
			afterMove: { default: false, targetDefault: false, peer: true, tool: false, hidden: false },
			disabledAgain: { default: false, targetDefault: false, peer: false, tool: false, hidden: false },
			chatActions: ['peer true', 'peer false'],
		});
	});
});
