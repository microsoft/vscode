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
import { ActionType, IActionEnvelope, ISessionAction } from '../../common/state/sessionActions.js';
import { PermissionKind, SessionStatus } from '../../common/state/sessionState.js';
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
});
