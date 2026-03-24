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
import { PermissionKind, ResponsePartKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type IToolCallCompletedState } from '../../common/state/sessionState.js';
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

	// ---- handleAction: session/permissionResolved -----------------------

	suite('handleAction — session/permissionResolved', () => {

		test('routes permission response to the correct agent', () => {
			setupSession();
			startTurn('turn-1');

			// Simulate a permission_request progress event to populate the pending map
			disposables.add(sideEffects.registerProgressListener(agent));
			agent.fireProgress({
				session: sessionUri,
				type: 'permission_request',
				requestId: 'perm-1',
				permissionKind: PermissionKind.Write,
				path: 'file.ts',
				rawRequest: '{}',
			});

			// Now resolve it
			sideEffects.handleAction({
				type: ActionType.SessionPermissionResolved,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				requestId: 'perm-1',
				approved: true,
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [{ requestId: 'perm-1', approved: true }]);
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

			assert.ok(envelopes.some(e => e.action.type === ActionType.SessionDelta));
		});

		test('returns a disposable that stops listening', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const listener = sideEffects.registerProgressListener(agent);

			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'before' });
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.SessionDelta).length, 1);

			listener.dispose();
			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-2', content: 'after' });
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.SessionDelta).length, 1);
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
			assert.strictEqual(state!.turns[0].responseText, 'Hi there!');
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
			assert.strictEqual(turn.toolCalls.length, 1);
			const tc = turn.toolCalls[0] as IToolCallCompletedState;
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
			assert.strictEqual(state!.turns[0].responseText, 'First answer');
			assert.strictEqual(state!.turns[1].userMessage.text, 'Second question');
			assert.strictEqual(state!.turns[1].responseText, 'Second answer');
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
			assert.strictEqual(state!.turns[0].responseText, '');
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].userMessage.text, 'Retried question');
			assert.strictEqual(state!.turns[1].responseText, 'Answer');
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
});
