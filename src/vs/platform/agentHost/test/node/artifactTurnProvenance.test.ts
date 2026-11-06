/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostArtifactRunInitiatorMetaKey, AgentHostArtifactRunMetaKey } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind, SessionStatus, type Message } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { ArtifactTurnInitiator, canChangeArtifactsInTurn, getArtifactTurnSource } from '../../node/shared/artifactTurnProvenance.js';

const session = 'copilot:/provenance';
const chat = buildDefaultChatUri(session);
const peer = buildChatUri(session, 'peer');
const worker = buildChatUri(session, 'worker');

const userMessage: Message = { text: 'Merge it', origin: { kind: MessageKind.User } };
const artifactRunMessage: Message = { text: 'Fix CI', origin: { kind: MessageKind.SystemNotification }, _meta: { [AgentHostArtifactRunMetaKey]: 'run-0' } };
const artifactRunBy = (initiator: string): Message => ({ ...artifactRunMessage, _meta: { ...artifactRunMessage._meta, [AgentHostArtifactRunInitiatorMetaKey]: initiator } });

suite('Artifact Turn Provenance', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createState() {
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session, defaultChat: chat, provider: 'copilot', title: 'Provenance', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		});
		const startTurn = (target: string, turnId: string, message: Message) => stateManager.dispatchServerAction(target, {
			type: ActionType.ChatTurnStarted, turnId, startedAt: new Date(0).toISOString(), message,
		});
		return { stateManager, startTurn };
	}

	function delegatedFrom(sourceChat: string, sourceTurnId: string): Message {
		return { text: 'Do this', origin: { kind: MessageKind.Agent }, _meta: toAgentMessageDelegationMeta({ sourceSession: session, sourceChat, sourceTurnId }) };
	}

	test('classifies direct turns and refuses every source but people and scheduled automations', () => {
		const initiators = [
			userMessage,
			{ text: 'Daily triage', origin: { kind: MessageKind.Automation } },
			artifactRunMessage,
			artifactRunBy('automation'),
			artifactRunBy('user'),
			artifactRunBy('agent'),
			{ text: 'Fix the merge gate', origin: { kind: MessageKind.SystemNotification }, _meta: toAgentMergeMessageMeta() },
			{ text: 'Notice', origin: { kind: MessageKind.SystemNotification } },
			{ text: 'Spawned', origin: { kind: MessageKind.Agent } },
		].map((message, index) => {
			const { stateManager, startTurn } = createState();
			startTurn(chat, `turn-${index}`, message);
			return getArtifactTurnSource(stateManager, chat).initiator;
		});
		const { stateManager } = createState();

		assert.deepStrictEqual({
			initiators,
			allowed: initiators.map(canChangeArtifactsInTurn),
			noTurn: getArtifactTurnSource(stateManager, chat).initiator,
		}, {
			initiators: [
				ArtifactTurnInitiator.Person, ArtifactTurnInitiator.ScheduledAutomation,
				// Prompt runs without a recorded initiator count as automated; a person's own prompt action acts for them.
				ArtifactTurnInitiator.ArtifactAutomation, ArtifactTurnInitiator.ArtifactAutomation, ArtifactTurnInitiator.Person, ArtifactTurnInitiator.Unknown,
				ArtifactTurnInitiator.AgentMerge, ArtifactTurnInitiator.Unknown, ArtifactTurnInitiator.Unknown,
			],
			allowed: [true, true, false, false, true, false, false, false, false],
			noTurn: ArtifactTurnInitiator.Unknown,
		});
	});

	test('delegated turns and spawned chats act for the turn that started them', () => {
		const automated = createState();
		automated.stateManager.addChat(session, peer, peer, {});
		automated.startTurn(peer, 'automatic', artifactRunMessage);
		automated.startTurn(chat, 'delegated', delegatedFrom(peer, 'automatic'));
		automated.stateManager.addChat(session, worker, worker, { origin: { kind: ChatOriginKind.Tool, chat, toolCallId: 'spawn' } });
		// Subagent turns claim a user origin; the spawning chat decides.
		automated.startTurn(worker, 'subagent', userMessage);

		const person = createState();
		person.stateManager.addChat(session, peer, peer, {});
		person.startTurn(peer, 'asked', userMessage);
		person.startTurn(chat, 'delegated', delegatedFrom(peer, 'asked'));

		const unresolved = createState();
		unresolved.startTurn(chat, 'delegated', delegatedFrom(peer, 'gone'));

		assert.deepStrictEqual({
			delegatedFromAutomation: getArtifactTurnSource(automated.stateManager, chat),
			subagentOfAutomation: getArtifactTurnSource(automated.stateManager, worker),
			delegatedFromPerson: getArtifactTurnSource(person.stateManager, chat),
			unresolved: getArtifactTurnSource(unresolved.stateManager, chat),
		}, {
			delegatedFromAutomation: { initiator: ArtifactTurnInitiator.ArtifactAutomation, chat: peer, turnId: 'automatic' },
			subagentOfAutomation: { initiator: ArtifactTurnInitiator.ArtifactAutomation, chat: peer, turnId: 'automatic' },
			delegatedFromPerson: { initiator: ArtifactTurnInitiator.Person, chat: peer, turnId: 'asked' },
			unresolved: { initiator: ArtifactTurnInitiator.Unknown },
		});
	});
});
