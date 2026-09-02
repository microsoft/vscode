/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../log/common/log.js';
import { IAgentHostChatContributions, type IDispatchedAction } from '../../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../../common/sessionDataService.js';
import { ActionType, type ChatAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, buildSubagentChatUri, createErrorResponsePart, MessageKind, parseRequiredSessionUriFromChatUri, ResponsePartKind, SessionStatus, TurnState, type Turn } from '../../../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../../../node/agentHostStateManager.js';
import { InterruptedTurnContribution, OPEN_TURN_METADATA_KEY } from '../../../../node/chatContributions/interruptedTurn/interruptedTurnContribution.js';
import { createSessionDataService, TestSessionDatabase } from '../../../common/sessionTestHelpers.js';

const SESSION = 'agent-host-session://test';
const CHAT = buildDefaultChatUri(SESSION);
const INTERRUPTED_PART = { kind: ResponsePartKind.Error, error: { errorType: 'executionInterrupted', message: 'The agent was interrupted before this request finished.' } };

function createContributions(disposables: Pick<DisposableStore, 'add'>) {
	const logService = new NullLogService();
	const database = new TestSessionDatabase();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const services = new ServiceCollection(
		[ILogService, logService],
		[ISessionDataService, createSessionDataService(database)],
		[IAgentHostStateManager, stateManager],
	);
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	disposables.add(service.registerContribution(InterruptedTurnContribution));
	return { service, database, stateManager, marker: () => database.getMetadata(OPEN_TURN_METADATA_KEY) };
}

function createSessionState(stateManager: AgentHostStateManager): void {
	stateManager.createSession({
		resource: SESSION,
		provider: 'test',
		title: 'Test',
		status: SessionStatus.IsRead,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
	});
}

function at(seconds: number): string {
	return new Date(Date.UTC(2025, 0, 1, 0, 0, seconds)).toISOString();
}

function dispatched(channel: string, action: ChatAction, rejectionReason?: string): IDispatchedAction {
	return { channel, session: parseRequiredSessionUriFromChatUri(channel), action, ...(rejectionReason !== undefined ? { rejectionReason } : {}) };
}

function turnStarted(turnId: string, startedAt: string): ChatAction {
	return { type: ActionType.ChatTurnStarted, turnId, startedAt, message: { text: 'hi', origin: { kind: MessageKind.User } } };
}

function restoredTurn(id: string, startedAt: string, state = TurnState.Complete): Turn {
	return {
		id,
		startedAt,
		state,
		message: { text: id, origin: { kind: MessageKind.User } },
		responseParts: [{ kind: ResponsePartKind.Markdown, id: `${id}-reply`, content: `reply to ${id}` }],
		usage: undefined,
	};
}

function hydrationContext(chat = CHAT) {
	return { session: SESSION, chat };
}

function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

suite('InterruptedTurnContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('writes the open-turn marker on ChatTurnStarted and clears it on complete, cancel, error and truncate', async () => {
		const contributions = createContributions(disposables);
		const terminalActions: ChatAction[] = [
			{ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1 },
			{ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1 },
			{ type: ActionType.ChatError, turnId: 'turn-1', duration: 1, part: createErrorResponsePart({ errorType: 'boom', message: 'boom' }) },
			{ type: ActionType.ChatTruncated },
		];

		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('turn-1', at(0))));
		await tick();
		const written = await contributions.marker();
		const cleared: (string | undefined)[] = [];
		for (const terminal of terminalActions) {
			contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('turn-1', at(0))));
			contributions.service.didDispatchAction(dispatched(CHAT, terminal));
			await tick();
			cleared.push(await contributions.marker());
		}
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('rejected', at(5)), 'rejected'));
		await tick();

		assert.deepStrictEqual(JSON.parse(written!), { turnId: 'turn-1', startedAt: at(0) });
		assert.deepStrictEqual(cleared, ['', '', '', '']);
		assert.strictEqual(await contributions.marker(), '');
	});

	test('records the resumed turn with its original start on ChatTurnResume', async () => {
		const contributions = createContributions(disposables);
		createSessionState(contributions.stateManager);
		const resume: ChatAction = { type: ActionType.ChatTurnResume, turnId: 'turn-1' };
		contributions.stateManager.dispatchServerAction(CHAT, turnStarted('turn-1', at(0)));
		contributions.stateManager.dispatchServerAction(CHAT, { type: ActionType.ChatError, turnId: 'turn-1', duration: 1, part: createErrorResponsePart({ errorType: 'boom', message: 'boom' }, true) });
		contributions.stateManager.dispatchServerAction(CHAT, resume);

		contributions.service.didDispatchAction(dispatched(CHAT, resume));
		await tick();

		assert.deepStrictEqual(JSON.parse((await contributions.marker())!), { turnId: 'turn-1', startedAt: at(0) });
	});

	test('marks the trailing restored turn as interrupted when a marker is present', async () => {
		const contributions = createContributions(disposables);
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('turn-2', at(60))));
		await tick();
		const restored = [restoredTurn('turn-1', at(0)), restoredTurn('turn-2', at(60))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, [
			restored[0],
			{ ...restored[1], state: TurnState.Error, responseParts: [...restored[1].responseParts, INTERRUPTED_PART] },
		]);
		assert.strictEqual(await contributions.marker(), '');
	});

	test('does not mark a trailing turn that is already an error', async () => {
		const contributions = createContributions(disposables);
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('turn-1', at(0))));
		await tick();
		const restored = [restoredTurn('turn-1', at(0), TurnState.Error)];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, restored);
		assert.strictEqual(await contributions.marker(), '');
	});

	test('does not mark when the trailing turn predates the marker', async () => {
		const contributions = createContributions(disposables);
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('host-turn', at(60))));
		await tick();
		const restored = [restoredTurn('u1', at(0))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, restored);
		assert.strictEqual(await contributions.marker(), '');
	});

	test('falls back to startedAt when turn ids differ', async () => {
		const contributions = createContributions(disposables);
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('host-turn', at(60))));
		await tick();
		const restored = [restoredTurn('u1', at(0)), restoredTurn('u2', at(61))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, [
			restored[0],
			{ ...restored[1], state: TurnState.Error, responseParts: [...restored[1].responseParts, INTERRUPTED_PART] },
		]);
		assert.strictEqual(await contributions.marker(), '');
	});

	test('tolerates a trailing turn whose start time was floored to the second', async () => {
		const contributions = createContributions(disposables);
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('host-turn', '2025-01-01T00:01:00.750Z')));
		await tick();
		const restored = [restoredTurn('codex-turn', at(60))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, [{ ...restored[0], state: TurnState.Error, responseParts: [...restored[0].responseParts, INTERRUPTED_PART] }]);
	});

	test('leaves the marker alone while the chat has a live turn', async () => {
		const contributions = createContributions(disposables);
		createSessionState(contributions.stateManager);
		contributions.stateManager.dispatchServerAction(CHAT, turnStarted('turn-1', at(0)));
		contributions.service.didDispatchAction(dispatched(CHAT, turnStarted('turn-1', at(0))));
		await tick();
		const restored = [restoredTurn('turn-1', at(0))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(), restored);

		assert.deepStrictEqual(turns, restored);
		assert.deepStrictEqual(JSON.parse((await contributions.marker())!), { turnId: 'turn-1', startedAt: at(0) });
	});

	test('does not touch subagent chats', async () => {
		const contributions = createContributions(disposables);
		const subagentChat = buildSubagentChatUri(SESSION, 'tool-call');
		contributions.service.didDispatchAction(dispatched(subagentChat, turnStarted('turn-1', at(0))));
		await tick();
		const writes = contributions.database.setMetadataCalls.length;
		await contributions.database.setMetadata(OPEN_TURN_METADATA_KEY, JSON.stringify({ turnId: 'turn-1', startedAt: at(0) }));
		const restored = [restoredTurn('turn-1', at(0))];

		const turns = await contributions.service.hydrateTurns(hydrationContext(subagentChat), restored);

		assert.strictEqual(writes, 0);
		assert.deepStrictEqual(turns, restored);
		assert.deepStrictEqual(JSON.parse((await contributions.marker())!), { turnId: 'turn-1', startedAt: at(0) });
	});
});
