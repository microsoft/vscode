/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { IActionEnvelope, ISessionAction } from '../../common/state/sessionActions.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { MockAgent } from './mockAgent.js';

// ---- Tests ------------------------------------------------------------------

suite('AgentSideEffects', () => {

	const disposables = new DisposableStore();
	let stateManager: SessionStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let agentList: ReturnType<typeof observableValue<readonly IAgent[]>>;

	const sessionUri = AgentSession.uri('mock', 'session-1');

	function setupSession(): void {
		stateManager.createSession({
			resource: sessionUri,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		});
		stateManager.dispatchServerAction({ type: 'session/ready', session: sessionUri });
	}

	function startTurn(turnId: string): void {
		stateManager.dispatchClientAction(
			{ type: 'session/turnStarted', session: sessionUri, turnId, userMessage: { text: 'hello' } },
			{ clientId: 'test', clientSeq: 1 },
		);
	}

	setup(() => {
		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new SessionStateManager(new NullLogService()));
		agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		sideEffects = disposables.add(new AgentSideEffects(stateManager, {
			getAgent: () => agent,
			agents: agentList,
		}, new NullLogService()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- handleAction: session/turnStarted ------------------------------

	suite('handleAction — session/turnStarted', () => {

		test('calls sendMessage on the agent', async () => {
			setupSession();
			const action: ISessionAction = {
				type: 'session/turnStarted',
				session: sessionUri,
				turnId: 'turn-1',
				userMessage: { text: 'hello world' },
			};
			sideEffects.handleAction(action);

			// sendMessage is async but fire-and-forget; wait a tick
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: sessionUri, prompt: 'hello world' }]);
		});

		test('dispatches session/error when no agent is found', async () => {
			setupSession();
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
			}, new NullLogService()));

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			noAgentSideEffects.handleAction({
				type: 'session/turnStarted',
				session: sessionUri,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});

			const errorAction = envelopes.find(e => e.action.type === 'session/error');
			assert.ok(errorAction, 'should dispatch session/error');
		});
	});

	// ---- handleAction: session/turnCancelled ----------------------------

	suite('handleAction — session/turnCancelled', () => {

		test('calls abortSession on the agent', async () => {
			setupSession();
			sideEffects.handleAction({
				type: 'session/turnCancelled',
				session: sessionUri,
				turnId: 'turn-1',
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.abortSessionCalls, [sessionUri]);
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
				permissionKind: 'write',
				path: 'file.ts',
				rawRequest: '{}',
			});

			// Now resolve it
			sideEffects.handleAction({
				type: 'session/permissionResolved',
				session: sessionUri,
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
				type: 'session/modelChanged',
				session: sessionUri,
				model: 'gpt-5',
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeModelCalls, [{ session: sessionUri, model: 'gpt-5' }]);
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

			assert.ok(envelopes.some(e => e.action.type === 'session/delta'));
		});

		test('returns a disposable that stops listening', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const listener = sideEffects.registerProgressListener(agent);

			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'before' });
			assert.strictEqual(envelopes.filter(e => e.action.type === 'session/delta').length, 1);

			listener.dispose();
			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-2', content: 'after' });
			assert.strictEqual(envelopes.filter(e => e.action.type === 'session/delta').length, 1);
		});
	});

	// ---- handleCreateSession --------------------------------------------

	suite('handleCreateSession', () => {

		test('creates a session and dispatches session/ready', async () => {
			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			await sideEffects.handleCreateSession({ session: sessionUri, provider: 'mock' });

			const ready = envelopes.find(e => e.action.type === 'session/ready');
			assert.ok(ready, 'should dispatch session/ready');
		});

		test('throws when no provider is specified', async () => {
			await assert.rejects(
				() => sideEffects.handleCreateSession({ session: sessionUri }),
				/No provider specified/,
			);
		});

		test('throws when no agent matches provider', async () => {
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
			}, new NullLogService()));

			await assert.rejects(
				() => noAgentSideEffects.handleCreateSession({ session: sessionUri, provider: 'nonexistent' }),
				/No agent registered/,
			);
		});
	});

	// ---- handleDisposeSession -------------------------------------------

	suite('handleDisposeSession', () => {

		test('disposes the session on the agent and removes state', async () => {
			setupSession();

			sideEffects.handleDisposeSession(sessionUri);

			await new Promise(r => setTimeout(r, 10));

			assert.strictEqual(agent.disposeSessionCalls.length, 1);
			assert.strictEqual(stateManager.getSessionState(sessionUri), undefined);
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

	// ---- agents observable --------------------------------------------------

	suite('agents observable', () => {

		test('dispatches root/agentsChanged when observable changes', async () => {
			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agentList.set([agent], undefined);

			// Model fetch is async — wait for it
			await new Promise(r => setTimeout(r, 50));

			const action = envelopes.find(e => e.action.type === 'root/agentsChanged');
			assert.ok(action, 'should dispatch root/agentsChanged');
		});
	});
});
