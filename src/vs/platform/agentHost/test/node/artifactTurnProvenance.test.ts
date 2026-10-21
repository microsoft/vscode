/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { AgentHostArtifactRunInitiatorMetaKey, AgentHostArtifactRunMetaKey } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputResponseKind, ChatOriginKind, MessageKind, ResponsePartKind, SessionStatus, type Message } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { ArtifactTurnInitiator, canChangeArtifactsInTurn, getArtifactTurnSource } from '../../node/shared/artifactTurnProvenance.js';
import { requestServerToolConfirmation } from '../../node/shared/serverToolConfirmation.js';

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

suite('Server Tool Confirmation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const confirmation = { title: 'Turn on automation for #1?', message: 'Merges *once* ready.\n\nRuns on the agent host.', confirmLabel: 'Turn On', declineLabel: 'Cancel' };

	function createState(withTurn = true) {
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session, defaultChat: chat, provider: 'copilot', title: 'Confirmation', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		});
		if (withTurn) {
			stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: new Date(0).toISOString(), message: userMessage });
		}
		return stateManager;
	}

	function openRequest(stateManager: AgentHostStateManager) {
		const part = stateManager.getChatState(chat)?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.InputRequest);
		return part?.kind === ResponsePartKind.InputRequest ? part.request : undefined;
	}

	function answer(stateManager: AgentHostStateManager, response: ChatInputResponseKind, optionId?: string): void {
		stateManager.dispatchServerAction(chat, {
			type: ActionType.ChatInputCompleted,
			requestId: openRequest(stateManager)!.id,
			response,
			...(optionId ? { answers: { decision: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: optionId } } } } : {}),
		});
	}

	test('asks the person in the chat and resolves with their answer', async () => {
		const confirmed = createState();
		const accepted = requestServerToolConfirmation(confirmed, chat, 'turn-1', confirmation);
		const request = openRequest(confirmed)!;
		answer(confirmed, ChatInputResponseKind.Accept, 'confirm');

		const declined = createState();
		const rejected = requestServerToolConfirmation(declined, chat, 'turn-1', confirmation);
		answer(declined, ChatInputResponseKind.Accept, 'decline');

		const cancelled = createState();
		const dismissed = requestServerToolConfirmation(cancelled, chat, 'turn-1', confirmation);
		answer(cancelled, ChatInputResponseKind.Cancel);

		assert.deepStrictEqual({
			purpose: readChatInputRequestPurpose(request),
			question: request.questions?.map(question => ({ title: question.title, message: question.message })),
			accepted: await accepted,
			rejected: await rejected,
			dismissed: await dismissed,
		}, {
			purpose: ChatInputRequestPurpose.ServerToolConfirmation,
			question: [{ title: confirmation.title, message: 'Merges \\*once\\* ready.\n\nRuns on the agent host.' }],
			accepted: true,
			rejected: false,
			dismissed: false,
		});
	});

	test('declines when the turn ends first or no turn is running', async () => {
		const ending = createState();
		const pending = requestServerToolConfirmation(ending, chat, 'turn-1', confirmation);
		ending.dispatchServerAction(chat, { type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 0 });
		const idle = createState(false);

		assert.deepStrictEqual({
			endedTurn: await pending,
			noTurn: await requestServerToolConfirmation(idle, chat, 'turn-1', confirmation),
			attached: openRequest(idle),
		}, {
			endedTurn: false,
			noTurn: false,
			attached: undefined,
		});
	});
});
