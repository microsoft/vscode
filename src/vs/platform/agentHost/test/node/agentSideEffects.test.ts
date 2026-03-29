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
import { PendingMessageKind, ResponsePartKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type IMarkdownResponsePart, type IToolCallCompletedState, type IToolCallResponsePart } from '../../common/state/sessionState.js';
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
		}, new NullLogService(), fileService));
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
			}, new NullLogService(), fileService));

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

	// ---- handleCreateSession --------------------------------------------

	suite('handleCreateSession', () => {

		test('creates a session and dispatches session/ready', async () => {
			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			await sideEffects.handleCreateSession({ session: sessionUri.toString(), provider: 'mock' });

			const ready = envelopes.find(e => e.action.type === ActionType.SessionReady);
			assert.ok(ready, 'should dispatch session/ready');
		});

		test('throws when no provider is specified', async () => {
			await assert.rejects(
				() => sideEffects.handleCreateSession({ session: sessionUri.toString() }),
				/No provider specified/,
			);
		});

		test('throws when no agent matches provider', async () => {
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
				sessionDataService: {} as ISessionDataService,
			}, new NullLogService(), fileService));

			await assert.rejects(
				() => noAgentSideEffects.handleCreateSession({ session: sessionUri.toString(), provider: 'nonexistent' }),
				/No agent registered/,
			);
		});
	});

	// ---- handleDisposeSession -------------------------------------------

	suite('handleDisposeSession', () => {

		test('disposes the session on the agent and removes state', async () => {
			setupSession();

			sideEffects.handleDisposeSession(sessionUri.toString());

			await new Promise(r => setTimeout(r, 10));

			assert.strictEqual(agent.disposeSessionCalls.length, 1);
			assert.strictEqual(stateManager.getSessionState(sessionUri.toString()), undefined);
		});
	});

	// ---- handleListSessions ---------------------------------------------

	suite('handleListSessions', () => {

		test('aggregates sessions from all agents', async () => {
			await agent.createSession();
			const sessions = await sideEffects.handleListSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].provider, 'mock');
			assert.strictEqual(sessions[0].title, 'Session');
		});
	});

	// ---- handleRestoreSession -----------------------------------------------

	suite('handleRestoreSession', () => {

		test('restores a session with message history into the state manager', async () => {
			// Create a session on the agent backend (not in the state manager)
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			// Set up the agent's stored messages
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];

			// Before restore, state manager shouldn't have it
			assert.strictEqual(stateManager.getSessionState(sessionResource), undefined);

			await sideEffects.handleRestoreSession(sessionResource);

			// After restore, state manager should have it
			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state, 'session should be in state manager');
			assert.strictEqual(state!.lifecycle, SessionLifecycle.Ready);
			assert.strictEqual(state!.turns.length, 1);
			assert.strictEqual(state!.turns[0].userMessage.text, 'Hello');
			const mdPart = state!.turns[0].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdPart, 'should have a markdown response part');
			assert.strictEqual(mdPart.content, 'Hi there!');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);
		});

		test('restores a session with tool calls', async () => {
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Run a command', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'I will run a command.', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running command...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'output' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done!', toolRequests: [] },
			];

			await sideEffects.handleRestoreSession(sessionResource);

			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 1);

			const turn = state!.turns[0];
			const toolCallParts = turn.responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1);
			const tc = toolCallParts[0].toolCall as IToolCallCompletedState;
			assert.strictEqual(tc.status, ToolCallStatus.Completed);
			assert.strictEqual(tc.toolCallId, 'tc-1');
			assert.strictEqual(tc.toolName, 'shell');
			assert.strictEqual(tc.displayName, 'Shell');
			assert.strictEqual(tc.success, true);
			assert.strictEqual(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
		});

		test('restores a session with multiple turns', async () => {
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'First question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'First answer', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'msg-3', content: 'Second question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-4', content: 'Second answer', toolRequests: [] },
			];

			await sideEffects.handleRestoreSession(sessionResource);

			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].userMessage.text, 'First question');
			const mdPart0 = state!.turns[0].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.strictEqual(mdPart0?.content, 'First answer');
			assert.strictEqual(state!.turns[1].userMessage.text, 'Second question');
			const mdPart1 = state!.turns[1].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.strictEqual(mdPart1?.content, 'Second answer');
		});

		test('flushes interrupted turns when user message arrives without closing assistant message', async () => {
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Interrupted question', toolRequests: [] },
				// No assistant message - the turn was interrupted
				{ type: 'message', session, role: 'user', messageId: 'msg-2', content: 'Retried question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Answer', toolRequests: [] },
			];

			await sideEffects.handleRestoreSession(sessionResource);

			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].userMessage.text, 'Interrupted question');
			const mdPart0 = state!.turns[0].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(!mdPart0 || mdPart0.content === '', 'interrupted turn should have empty response');
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].userMessage.text, 'Retried question');
			const mdPart1 = state!.turns[1].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.strictEqual(mdPart1?.content, 'Answer');
			assert.strictEqual(state!.turns[1].state, TurnState.Complete);
		});

		test('is a no-op for a session already in the state manager', async () => {
			setupSession();
			// Should not throw or create a duplicate
			await sideEffects.handleRestoreSession(sessionUri.toString());
			assert.ok(stateManager.getSessionState(sessionUri.toString()));
		});

		test('throws when no agent found for session', async () => {
			const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
				getAgent: () => undefined,
				agents: observableValue<readonly IAgent[]>('agents', []),
				sessionDataService: {} as ISessionDataService,
			}, new NullLogService(), fileService));

			await assert.rejects(
				() => noAgentSideEffects.handleRestoreSession('unknown://session-1'),
				/No agent for session/,
			);
		});

		test('response parts include markdown segments', async () => {
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'response text', toolRequests: [] },
			];

			await sideEffects.handleRestoreSession(sessionResource);

			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state);
			assert.strictEqual(state!.turns[0].responseParts.length, 1);
			assert.strictEqual(state!.turns[0].responseParts[0].kind, ResponsePartKind.Markdown);
			assert.strictEqual(state!.turns[0].responseParts[0].content, 'response text');
		});

		test('throws when session is not found on backend', async () => {
			// Agent exists but session is not in listSessions
			await assert.rejects(
				() => sideEffects.handleRestoreSession(AgentSession.uri('mock', 'nonexistent').toString()),
				/Session not found on backend/,
			);
		});

		test('preserves workingDirectory from agent metadata', async () => {
			agent.sessionMetadataOverrides = { workingDirectory: '/home/user/project' };
			const session = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session.toString();

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'hi', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'hello', toolRequests: [] },
			];

			await sideEffects.handleRestoreSession(sessionResource);

			const state = stateManager.getSessionState(sessionResource);
			assert.ok(state);
			assert.strictEqual(state!.summary.workingDirectory, '/home/user/project');
		});
	});

	// ---- handleBrowseDirectory ------------------------------------------

	suite('handleBrowseDirectory', () => {

		test('throws when the directory does not exist', async () => {
			await assert.rejects(
				() => sideEffects.handleBrowseDirectory(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' }).toString()),
				/Directory not found/,
			);
		});

		test('throws when the target is not a directory', async () => {
			await assert.rejects(
				() => sideEffects.handleBrowseDirectory(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }).toString()),
				/Not a directory/,
			);
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

	// ---- handleGetResourceMetadata / handleAuthenticate -----------------

	suite('auth', () => {

		test('handleGetResourceMetadata aggregates resources from agents', () => {
			agentList.set([agent], undefined);

			const metadata = sideEffects.handleGetResourceMetadata();
			assert.strictEqual(metadata.resources.length, 0, 'mock agent has no protected resources');
		});

		test('handleGetResourceMetadata returns resources when agent declares them', () => {
			const copilotAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => copilotAgent.dispose()));
			agentList.set([copilotAgent], undefined);

			const metadata = sideEffects.handleGetResourceMetadata();
			assert.strictEqual(metadata.resources.length, 1);
			assert.strictEqual(metadata.resources[0].resource, 'https://api.github.com');
		});

		test('handleAuthenticate returns authenticated for matching resource', async () => {
			const copilotAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => copilotAgent.dispose()));
			agentList.set([copilotAgent], undefined);

			const result = await sideEffects.handleAuthenticate({ resource: 'https://api.github.com', token: 'test-token' });
			assert.deepStrictEqual(result, { authenticated: true });
			assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'test-token' }]);
		});

		test('handleAuthenticate returns not authenticated for non-matching resource', async () => {
			agentList.set([agent], undefined);

			const result = await sideEffects.handleAuthenticate({ resource: 'https://unknown.example.com', token: 'test-token' });
			assert.deepStrictEqual(result, { authenticated: false });
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
