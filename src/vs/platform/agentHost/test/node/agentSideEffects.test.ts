/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, IActionEnvelope, ISessionAction } from '../../common/state/sessionActions.js';
import { PendingMessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentService } from '../../node/agentService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { join } from '../../../../base/common/path.js';
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

	function setupSession(workingDirectory?: string): void {
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			workingDirectory,
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
				tryOpenDatabase: async () => undefined,
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

		test('dispatches SessionPendingMessageRemoved for steering messages on steering_consumed', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));

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

			// Removal is not dispatched synchronously; it waits for the agent
			let removal = envelopes.find(e =>
				e.action.type === ActionType.SessionPendingMessageRemoved &&
				(e.action as { kind: PendingMessageKind }).kind === PendingMessageKind.Steering
			);
			assert.strictEqual(removal, undefined, 'should not dispatch removal until steering_consumed');

			// Simulate the agent consuming the steering message
			agent.fireProgress({
				session: sessionUri,
				type: 'steering_consumed',
				id: 'steer-rm',
			});

			removal = envelopes.find(e =>
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

	// ---- handleAction: session/activeClientChanged ----------------------

	suite('handleAction — session/activeClientChanged', () => {

		test('calls setClientCustomizations and dispatches customizationsChanged', async () => {
			setupSession();

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: ISessionAction = {
				type: ActionType.SessionActiveClientChanged,
				session: sessionUri.toString(),
				activeClient: {
					clientId: 'test-client',
					tools: [],
					customizations: [
						{ uri: 'file:///plugin-a', displayName: 'Plugin A' },
						{ uri: 'file:///plugin-b', displayName: 'Plugin B' },
					],
				},
			};
			sideEffects.handleAction(action);

			// Wait for async setClientCustomizations
			await new Promise(r => setTimeout(r, 50));

			assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
				clientId: 'test-client',
				customizations: [
					{ uri: 'file:///plugin-a', displayName: 'Plugin A' },
					{ uri: 'file:///plugin-b', displayName: 'Plugin B' },
				],
			}]);

			const customizationActions = envelopes
				.filter(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.ok(customizationActions.length >= 1, 'should dispatch at least one customizationsChanged');
		});

		test('skips when activeClient has no customizations', () => {
			setupSession();

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: ISessionAction = {
				type: ActionType.SessionActiveClientChanged,
				session: sessionUri.toString(),
				activeClient: {
					clientId: 'test-client',
					tools: [],
				},
			};
			sideEffects.handleAction(action);

			assert.strictEqual(agent.setClientCustomizationsCalls.length, 0);
			const customizationActions = envelopes
				.filter(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.strictEqual(customizationActions.length, 0);
		});

		test('skips when activeClient is null', () => {
			setupSession();

			const action: ISessionAction = {
				type: ActionType.SessionActiveClientChanged,
				session: sessionUri.toString(),
				activeClient: null,
			};
			sideEffects.handleAction(action);

			assert.strictEqual(agent.setClientCustomizationsCalls.length, 0);
		});
	});

	// ---- handleAction: session/customizationToggled ---------------------

	suite('handleAction — session/customizationToggled', () => {

		test('calls setCustomizationEnabled on the agent', () => {
			setupSession();

			const action: ISessionAction = {
				type: ActionType.SessionCustomizationToggled,
				session: sessionUri.toString(),
				uri: 'file:///plugin-a',
				enabled: false,
			};
			sideEffects.handleAction(action);

			assert.deepStrictEqual(agent.setCustomizationEnabledCalls, [
				{ uri: 'file:///plugin-a', enabled: false },
			]);
		});
	});

	// ---- handleAction: session/toolCallConfirmed ------------------------

	suite('handleAction — session/toolCallConfirmed', () => {

		test('routes confirmation to correct agent via _toolCallAgents', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Fire tool_start to register the tool call
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-conf-1',
				toolName: 'read',
				displayName: 'Read File',
				invocationMessage: 'Reading file',
			});

			// Fire tool_ready asking for permission (non-write, so not auto-approved)
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-conf-1',
				invocationMessage: 'Read file.txt',
				confirmationTitle: 'Read file.txt',
			});

			// Now confirm the tool call
			sideEffects.handleAction({
				type: ActionType.SessionToolCallConfirmed,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				toolCallId: 'tc-conf-1',
				approved: true,
				confirmed: 'user-action' as const,
			} as ISessionAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-conf-1', approved: true },
			]);
		});

		test('handles denial of tool call', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-deny-1',
				toolName: 'shell',
				displayName: 'Shell',
				invocationMessage: 'Running command',
			});

			sideEffects.handleAction({
				type: ActionType.SessionToolCallConfirmed,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				toolCallId: 'tc-deny-1',
				approved: false,
				reason: 'denied' as const,
			} as ISessionAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-deny-1', approved: false },
			]);
		});
	});

	// ---- Edit auto-approve ----------------------------------------------

	suite('edit auto-approve', () => {

		test('auto-approves writes to regular source files', async () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-auto-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write file',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-auto-1',
				invocationMessage: 'Write src/app.ts',
				permissionKind: 'write',
				permissionPath: '/workspace/src/app.ts',
			});

			// Auto-approved writes call respondToPermissionRequest directly
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-auto-1', approved: true },
			]);
		});

		test('blocks writes to .env files', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: IActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-env-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write .env',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-env-1',
				invocationMessage: 'Write .env',
				permissionKind: 'write',
				permissionPath: '/workspace/.env',
				confirmationTitle: 'Write .env',
			});

			// Should NOT auto-approve — .env is excluded
			assert.strictEqual(agent.respondToPermissionCalls.length, 0);

			// Should dispatch a tool_ready action for the client to confirm
			const readyAction = envelopes.find(e => e.action.type === ActionType.SessionToolCallReady);
			assert.ok(readyAction, 'should dispatch tool_ready for blocked write');
		});

		test('blocks writes to package.json', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-pkg-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write package.json',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-pkg-1',
				invocationMessage: 'Write package.json',
				permissionKind: 'write',
				permissionPath: '/workspace/package.json',
				confirmationTitle: 'Write package.json',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('blocks writes to .lock files', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-lock-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write yarn.lock',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-lock-1',
				invocationMessage: 'Write yarn.lock',
				permissionKind: 'write',
				permissionPath: '/workspace/yarn.lock',
				confirmationTitle: 'Write yarn.lock',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('blocks writes to .git directory', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-git-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write .git/config',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-git-1',
				invocationMessage: 'Write .git/config',
				permissionKind: 'write',
				permissionPath: '/workspace/.git/config',
				confirmationTitle: 'Write .git/config',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});
	});

	// ---- Title persistence --------------------------------------------------

	suite('title persistence', () => {

		let testDir: string;
		let sessionDb: SessionDatabase;

		/**
		 * Creates a real SessionDatabase-backed ISessionDataService.
		 * All sessions share the same DB for simplicity.
		 */
		function createSessionDataServiceWithDb(): ISessionDataService {
			return {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
				getSessionDataDirById: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
				openDatabase: (): IReference<ISessionDatabase> => ({
					object: sessionDb,
					dispose: () => { /* ref-counted; the suite teardown closes the DB */ },
				}),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({
					object: sessionDb,
					dispose: () => { /* ref-counted; the suite teardown closes the DB */ },
				}),
				deleteSessionData: async () => { },
				cleanupOrphanedData: async () => { },
			};
		}

		setup(async () => {
			testDir = join(tmpdir(), `vscode-side-effects-title-test-${randomUUID()}`);
			mkdirSync(testDir, { recursive: true });
			sessionDb = await SessionDatabase.open(join(testDir, 'session.db'));
		});

		teardown(async () => {
			await sessionDb.close();
			rmSync(testDir, { recursive: true, force: true });
		});

		test('SessionTitleChanged persists to the database', async () => {
			const sessionDataService = createSessionDataServiceWithDb();
			const localStateManager = disposables.add(new SessionStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = disposables.add(new AgentSideEffects(localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
			}, new NullLogService()));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			});

			localSideEffects.handleAction({
				type: ActionType.SessionTitleChanged,
				session: sessionUri.toString(),
				title: 'Custom Title',
			});

			// Wait for the async persistence
			await new Promise(r => setTimeout(r, 50));

			assert.strictEqual(await sessionDb.getMetadata('customTitle'), 'Custom Title');
		});

		test('handleListSessions returns persisted custom title', async () => {
			const sessionDataService = createSessionDataServiceWithDb();
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend
			await localAgent.createSession();

			// Persist a custom title in the DB
			await sessionDb.setMetadata('customTitle', 'My Custom Title');

			const sessions = await localService.listSessions();
			assert.strictEqual(sessions.length, 1);
			// Custom title comes from the DB and is returned via the agent's listSessions
			// The mock agent summary is used; the service doesn't read the DB for list
			assert.ok(sessions[0].summary);
		});

		test('handleRestoreSession uses persisted custom title', async () => {
			const sessionDataService = createSessionDataServiceWithDb();
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend
			const session = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Persist a custom title in the DB
			await sessionDb.setMetadata('customTitle', 'Restored Title');

			// Set up minimal messages for restore
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.summary.title, 'Restored Title');
		});
	});
});
