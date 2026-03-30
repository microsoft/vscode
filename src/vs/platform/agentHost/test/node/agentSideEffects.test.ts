/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, IActionEnvelope, ISessionAction } from '../../common/state/sessionActions.js';
import { PendingMessageKind, ResponsePartKind, SessionStatus, ToolCallStatus, type IToolCallResponsePart } from '../../common/state/sessionState.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { MockAgent } from './mockAgent.js';

// ---- Tests ------------------------------------------------------------------

suite('AgentSideEffects', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let stateManager: SessionStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let agentList: ReturnType<typeof observableValue<readonly IAgent[]>>;

	const sessionUri = AgentSession.uri('mock', 'session-1');

	function setupSession(): void {
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		});
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri.toString() });
	}

	function startTurn(turnId: string): void {
		stateManager.dispatchClientAction(
			{ type: ActionType.SessionTurnStarted, session: sessionUri.toString(), turnId, userMessage: { text: 'hello' } },
			{ clientId: 'test', clientSeq: 1 },
		);
	}

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		// Seed a file so the handleBrowseDirectory tests can distinguish files from dirs
		const testDir = URI.from({ scheme: Schemas.inMemory, path: '/testDir' });
		await fileService.createFolder(testDir);
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new SessionStateManager(new NullLogService()));
		agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		sideEffects = disposables.add(new AgentSideEffects(stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService: {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
				getSessionDataDirById: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
				openDatabase: () => { throw new Error('not implemented'); },
				deleteSessionData: async () => { },
				cleanupOrphanedData: async () => { },
			} satisfies ISessionDataService,
		}, new NullLogService()));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- handleAction: session/turnStarted ------------------------------

	suite('handleAction — session/turnStarted', () => {

		test('calls sendMessage on the agent', async () => {
			setupSession();
			const action: ISessionAction = {
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hello world' },
			};
			sideEffects.handleAction(action);

			// sendMessage is async but fire-and-forget; wait a tick
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: 'hello world' }]);
		});

		test('dispatches session/error when no agent is found', async () => {
			setupSession();
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
				sessionDataService: {} as ISessionDataService,
			}, new NullLogService()));

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			noAgentSideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});

			const errorAction = envelopes.find(e => e.action.type === ActionType.SessionError);
			assert.ok(errorAction, 'should dispatch session/error');
		});
	});

	// ---- handleAction: session/turnCancelled ----------------------------

	suite('handleAction — session/turnCancelled', () => {

		test('calls abortSession on the agent', async () => {
			setupSession();
			sideEffects.handleAction({
				type: ActionType.SessionTurnCancelled,
				session: sessionUri.toString(),
				turnId: 'turn-1',
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.abortSessionCalls, [URI.parse(sessionUri.toString())]);
		});
	});

	// ---- handleAction: session/modelChanged -----------------------------

	suite('handleAction — session/modelChanged', () => {

		test('calls changeModel on the agent', async () => {
			setupSession();
			sideEffects.handleAction({
				type: ActionType.SessionModelChanged,
				session: sessionUri.toString(),
				model: 'gpt-5',
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: 'gpt-5' }]);
		});
	});

	// ---- registerProgressListener ---------------------------------------

	suite('registerProgressListener', () => {

		test('maps agent progress events to state actions', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'hi' });

			// First delta creates a response part (not a delta action)
			assert.ok(envelopes.some(e => e.action.type === ActionType.SessionResponsePart));
		});

		test('returns a disposable that stops listening', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const listener = sideEffects.registerProgressListener(agent);

			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'before' });
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.SessionResponsePart).length, 1);

			listener.dispose();
			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-2', content: 'after' });
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.SessionResponsePart).length, 1);
		});
	});

	// ---- agents observable --------------------------------------------------

	suite('agents observable', () => {

		test('dispatches root/agentsChanged when observable changes', async () => {
			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agentList.set([agent], undefined);

			// Model fetch is async — wait for it
			await new Promise(r => setTimeout(r, 50));

			const action = envelopes.find(e => e.action.type === ActionType.RootAgentsChanged);
			assert.ok(action, 'should dispatch root/agentsChanged');
		});
	});

	// ---- Pending message sync -----------------------------------------------

	suite('pending message sync', () => {

		test('syncs steering message to agent on SessionPendingMessageSet', () => {
			setupSession();

			const action = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Steering,
				id: 'steer-1',
				userMessage: { text: 'focus on tests' },
			};
			stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(action);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].steeringMessage, { id: 'steer-1', userMessage: { text: 'focus on tests' } });
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
		});

		test('syncs queued message to agent on SessionPendingMessageSet', () => {
			setupSession();

			const action = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-1',
				userMessage: { text: 'queued message' },
			};
			stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(action);

			// Queued messages are not forwarded to the agent; the server controls consumption
			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.strictEqual(agent.setPendingMessagesCalls[0].steeringMessage, undefined);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);

			// Session was idle, so the queued message is consumed immediately
			assert.strictEqual(agent.sendMessageCalls.length, 1);
			assert.strictEqual(agent.sendMessageCalls[0].prompt, 'queued message');
		});

		test('syncs on SessionPendingMessageRemoved', () => {
			setupSession();

			// Add a queued message
			const setAction = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-rm',
				userMessage: { text: 'will be removed' },
			};
			stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(setAction);

			agent.setPendingMessagesCalls.length = 0;

			// Remove
			const removeAction = {
				type: ActionType.SessionPendingMessageRemoved as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-rm',
			};
			stateManager.dispatchClientAction(removeAction, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(removeAction);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
		});

		test('syncs on SessionQueuedMessagesReordered', () => {
			setupSession();

			// Add two queued messages
			const setA = { type: ActionType.SessionPendingMessageSet as const, session: sessionUri.toString(), kind: PendingMessageKind.Queued, id: 'q-a', userMessage: { text: 'A' } };
			stateManager.dispatchClientAction(setA, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(setA);

			const setB = { type: ActionType.SessionPendingMessageSet as const, session: sessionUri.toString(), kind: PendingMessageKind.Queued, id: 'q-b', userMessage: { text: 'B' } };
			stateManager.dispatchClientAction(setB, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(setB);

			agent.setPendingMessagesCalls.length = 0;

			// Reorder
			const reorderAction = { type: ActionType.SessionQueuedMessagesReordered as const, session: sessionUri.toString(), order: ['q-b', 'q-a'] };
			stateManager.dispatchClientAction(reorderAction, { clientId: 'test', clientSeq: 3 });
			sideEffects.handleAction(reorderAction);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
		});
	});

	// ---- Queued message consumption -----------------------------------------

	suite('queued message consumption', () => {

		test('auto-starts turn from queued message on idle', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));

			// Queue a message while a turn is active
			startTurn('turn-1');
			const setAction = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-auto',
				userMessage: { text: 'auto queued' },
			};
			stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(setAction);

			// Message should NOT be consumed yet (turn is active)
			assert.strictEqual(agent.sendMessageCalls.length, 0);

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			// Fire idle → turn completes → queued message should be consumed
			agent.fireProgress({ session: sessionUri, type: 'idle' });

			const turnComplete = envelopes.find(e => e.action.type === ActionType.SessionTurnComplete);
			assert.ok(turnComplete, 'should dispatch session/turnComplete');

			const turnStarted = envelopes.find(e => e.action.type === ActionType.SessionTurnStarted);
			assert.ok(turnStarted, 'should dispatch session/turnStarted for queued message');
			assert.strictEqual((turnStarted!.action as { queuedMessageId?: string }).queuedMessageId, 'q-auto');

			assert.strictEqual(agent.sendMessageCalls.length, 1);
			assert.strictEqual(agent.sendMessageCalls[0].prompt, 'auto queued');

			// Queued message should be removed from state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.queuedMessages, undefined);
		});

		test('does not consume queued message while a turn is active', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const setAction = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-wait',
				userMessage: { text: 'should wait' },
			};
			stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(setAction);

			// No turn started for the queued message
			const turnStarted = envelopes.find(e => e.action.type === ActionType.SessionTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'should not start a turn while one is active');
			assert.strictEqual(agent.sendMessageCalls.length, 0);

			// Queued message still in state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.queuedMessages?.length, 1);
			assert.strictEqual(state?.queuedMessages?.[0].id, 'q-wait');
		});

		test('dispatches SessionPendingMessageRemoved for steering messages', () => {
			setupSession();

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Steering,
				id: 'steer-rm',
				userMessage: { text: 'steer me' },
			};
			stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(action);

			const removal = envelopes.find(e =>
				e.action.type === ActionType.SessionPendingMessageRemoved &&
				(e.action as { kind: PendingMessageKind }).kind === PendingMessageKind.Steering
			);
			assert.ok(removal, 'should dispatch SessionPendingMessageRemoved for steering');
			assert.strictEqual((removal!.action as { id: string }).id, 'steer-rm');

			// Steering message should be removed from state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.steeringMessage, undefined);
		});
	});

	// ---- Edit auto-approve patterns -----------------------------------------

	suite('edit auto-approve patterns', () => {

		test('auto-approves regular files with default patterns', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));
			startTurn('turn-1');

			// Fire tool_start so the tool call exists in the state
			agent.fireProgress({ session: sessionUri, type: 'tool_start' as const, toolCallId: 'tc-write-1', toolName: 'bash', displayName: 'Write File', invocationMessage: 'Write' });

			// Fire tool_ready with write permission for a regular .ts file
			agent.fireProgress({ session: sessionUri, type: 'tool_ready' as const, toolCallId: 'tc-write-1', invocationMessage: 'Write src/app.ts', permissionKind: 'write', permissionPath: '/workspace/src/app.ts' });

			// The agent should have been auto-responded to with approved=true
			const permCall = agent.respondToPermissionCalls.find(c => c.requestId === 'tc-write-1');
			assert.ok(permCall, 'should auto-approve regular files with default patterns');
			assert.strictEqual(permCall!.approved, true);

			// The tool call should NOT be in PendingConfirmation state (it was auto-approved)
			const state = stateManager.getSessionState(sessionUri.toString());
			const tcPart = state?.activeTurn?.responseParts.find(
				p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === 'tc-write-1'
			) as IToolCallResponsePart | undefined;
			assert.ok(tcPart);
			assert.strictEqual(tcPart!.toolCall.status, ToolCallStatus.Running);
		});

		test('default patterns block .env files', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));
			startTurn('turn-1');

			agent.fireProgress({ session: sessionUri, type: 'tool_start' as const, toolCallId: 'tc-write-2', toolName: 'bash', displayName: 'Write File', invocationMessage: 'Write' });
			agent.fireProgress({ session: sessionUri, type: 'tool_ready' as const, toolCallId: 'tc-write-2', invocationMessage: 'Write .env', permissionKind: 'write', permissionPath: '/workspace/.env' });

			// Should NOT have auto-responded
			const permCall = agent.respondToPermissionCalls.find(c => c.requestId === 'tc-write-2');
			assert.ok(!permCall, 'should not auto-approve .env files with default patterns');

			// The tool call should be in PendingConfirmation state
			const state = stateManager.getSessionState(sessionUri.toString());
			const tcPart = state?.activeTurn?.responseParts.find(
				p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === 'tc-write-2'
			) as IToolCallResponsePart | undefined;
			assert.ok(tcPart);
			assert.strictEqual(tcPart!.toolCall.status, ToolCallStatus.PendingConfirmation);
		});

		test('default patterns block .git files', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));
			startTurn('turn-1');

			agent.fireProgress({ session: sessionUri, type: 'tool_start' as const, toolCallId: 'tc-write-3', toolName: 'bash', displayName: 'Write File', invocationMessage: 'Write' });
			agent.fireProgress({ session: sessionUri, type: 'tool_ready' as const, toolCallId: 'tc-write-3', invocationMessage: 'Write .git/config', permissionKind: 'write', permissionPath: '/workspace/.git/config' });

			const permCall = agent.respondToPermissionCalls.find(c => c.requestId === 'tc-write-3');
			assert.ok(!permCall, 'should not auto-approve .git files with default patterns');
		});
	});
});
