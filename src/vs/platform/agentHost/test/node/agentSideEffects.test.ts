/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, ActionEnvelope, SessionAction } from '../../common/state/sessionActions.js';
import { AttachmentType, buildSubagentSessionUri, PendingMessageKind, ResponsePartKind, SessionStatus, ToolCallStatus, ToolResultContentType } from '../../common/state/sessionState.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentService } from '../../node/agentService.js';
import { AgentSideEffects, IAgentSideEffectsOptions } from '../../node/agentSideEffects.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';

// ---- Tests ------------------------------------------------------------------

/**
 * Constructs an {@link AgentSideEffects} with a minimal local instantiation
 * scope that satisfies its {@link IAgentConfigurationService} /
 * {@link ILogService} / {@link IAgentHostGitService} dependencies.
 */
function createTestSideEffects(disposables: DisposableStore, stateManager: AgentHostStateManager, options: IAgentSideEffectsOptions, gitService?: IAgentHostGitService): AgentSideEffects {
	const logService = new NullLogService();
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
		[ILogService, logService],
		[IAgentConfigurationService, configService],
		[IAgentHostGitService, gitService ?? createNoopGitService()],
	), /*strict*/ true));
	return disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, options));
}

suite('AgentSideEffects', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let stateManager: AgentHostStateManager;
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
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
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
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		sideEffects = createTestSideEffects(disposables, stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService: createNullSessionDataService(),
			onTurnComplete: () => { },
		});
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- handleAction: session/turnStarted ------------------------------

	suite('handleAction — session/turnStarted', () => {

		test('calls sendMessage on the agent', async () => {
			setupSession();
			const action: SessionAction = {
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hello world' },
			};
			sideEffects.handleAction(action);

			// sendMessage is async but fire-and-forget; wait a tick
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: 'hello world', attachments: undefined }]);
		});

		test('parses protocol attachment URI strings before passing them to the agent', () => {
			setupSession();
			const fileUri = URI.file('/workspace/test.ts');
			const action: SessionAction = {
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hello world', attachments: [{ type: AttachmentType.File, uri: fileUri.toString(), displayName: 'test.ts' }] },
			};

			sideEffects.handleAction(action);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'hello world',
				attachments: [{ type: AttachmentType.File, uri: URI.parse(fileUri.toString()), displayName: 'test.ts' }],
			}]);
		});

		test('dispatches session/error when no agent is found', async () => {
			setupSession();
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
				sessionDataService: {} as ISessionDataService,
				onTurnComplete: () => { },
			});

			const envelopes: ActionEnvelope[] = [];
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

	// ---- immediate title on first turn -----------------------------------

	suite('immediate title on first turn', () => {

		function setupDefaultSession(): void {
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: '',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri.toString() });
		}

		test('dispatches titleChanged with user message on first turn', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'Fix the login bug' },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.ok(titleAction, 'should dispatch session/titleChanged');
			if (titleAction?.action.type === ActionType.SessionTitleChanged) {
				assert.strictEqual(titleAction.action.title, 'Fix the login bug');
			}
		});

		test('does not dispatch titleChanged when message is whitespace', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: '   ' },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not dispatch titleChanged for empty message');
		});

		test('normalizes whitespace and truncates long messages', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const longMessage = 'Fix the bug\nin the login\tpage  please ' + 'a'.repeat(250);
			sideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: longMessage },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.ok(titleAction, 'should dispatch session/titleChanged');
			if (titleAction?.action.type === ActionType.SessionTitleChanged) {
				assert.ok(!titleAction.action.title.includes('\n'), 'should not contain newlines');
				assert.ok(!titleAction.action.title.includes('\t'), 'should not contain tabs');
				assert.ok(!titleAction.action.title.includes('  '), 'should not contain double spaces');
				assert.ok(titleAction.action.title.length <= 200, 'should be truncated to 200 chars');
			}
		});

		test('does not dispatch titleChanged on second turn', () => {
			setupDefaultSession();
			startTurn('turn-1');

			// Complete the first turn so turns.length becomes 1.
			stateManager.dispatchServerAction({
				type: ActionType.SessionTurnComplete,
				session: sessionUri.toString(),
				turnId: 'turn-1',
			});

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-2',
				userMessage: { text: 'second message' },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not dispatch titleChanged on second turn');
		});

		test('does not dispatch titleChanged when title is already set', () => {
			// Session has a non-empty title (e.g. user renamed before first message)
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'User Renamed',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri.toString() });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not clobber existing title');
		});
	});

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
				model: { id: 'gpt-5' },
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: { id: 'gpt-5' } }]);
		});
	});

	// ---- registerProgressListener ---------------------------------------

	suite('registerProgressListener', () => {

		test('maps agent progress events to state actions', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'hi' });

			// First delta creates a response part (not a delta action)
			assert.ok(envelopes.some(e => e.action.type === ActionType.SessionResponsePart));
		});

		test('returns a disposable that stops listening', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
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

		test('dispatches root/agentsChanged without fetching models when observable changes', async () => {
			agentList.set([], undefined);
			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents.length === 1;
			}));
			agentList.set([agent], undefined);
			const { action } = await envelope;
			assert.strictEqual(action.type, ActionType.RootAgentsChanged);

			assert.deepStrictEqual(action.agents[0].models, []);
		});

		test('model observable update publishes models', async () => {
			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents[0]?.models.length === 1;
			}));
			agent.setModels([{ provider: 'mock', id: 'mock-model', name: 'mock Model', maxContextWindow: 128000, supportsVision: false }]);
			await envelope;

			const actions = envelopes.map(e => e.action).filter(action => action.type === ActionType.RootAgentsChanged);
			const action = actions[actions.length - 1];
			assert.ok(action, 'should dispatch root/agentsChanged');
			assert.deepStrictEqual(action.agents[0].models, [{
				id: 'mock-model',
				provider: 'mock',
				name: 'mock Model',
				maxContextWindow: 128000,
				supportsVision: false,
				policyState: undefined,
				configSchema: undefined,
			}]);
		});

		test('unchanged model observable update does not dispatch unchanged agent infos', async () => {
			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const models = [{ provider: 'mock' as const, id: 'mock-model', name: 'mock Model', maxContextWindow: 128000, supportsVision: false }];

			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents[0]?.models.length === 1;
			}));
			agent.setModels(models);
			await envelope;
			envelopes.length = 0;
			agent.setModels([...models]);
			await Promise.resolve();
			await Promise.resolve();

			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.RootAgentsChanged).length, 0);
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

		test('parses queued protocol attachment URI strings before passing them to the agent', () => {
			setupSession();
			const fileUri = URI.file('/workspace/queued.ts');
			const action: SessionAction = {
				type: ActionType.SessionPendingMessageSet as const,
				session: sessionUri.toString(),
				kind: PendingMessageKind.Queued,
				id: 'q-uri',
				userMessage: { text: 'queued message', attachments: [{ type: AttachmentType.File, uri: fileUri.toString(), displayName: 'queued.ts' }] },
			};

			stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(action);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'queued message',
				attachments: [{ type: AttachmentType.File, uri: URI.parse(fileUri.toString()), displayName: 'queued.ts' }],
			}]);
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

			const envelopes: ActionEnvelope[] = [];
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

			const envelopes: ActionEnvelope[] = [];
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

			const envelopes: ActionEnvelope[] = [];
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

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: SessionAction = {
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

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: SessionAction = {
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

			const action: SessionAction = {
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

			const action: SessionAction = {
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
			} as SessionAction);

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
			} as SessionAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-deny-1', approved: false },
			]);
		});
	});

	// ---- Session-level auto-approve (config) ----------------------------

	suite('session config auto-approve', () => {

		function setupSessionWithConfig(autoApproveLevel: string): void {
			setupSession(URI.file('/workspace').toString());
			// Set config on the session state directly (as agentService.ts does)
			const state = stateManager.getSessionState(sessionUri.toString());
			if (state) {
				state.config = {
					schema: {
						type: 'object',
						properties: {
							autoApprove: {
								type: 'string',
								title: 'Approvals',
								enum: ['default', 'autoApprove', 'autopilot'],
								default: 'default',
								sessionMutable: true,
							},
						},
					},
					values: { autoApprove: autoApproveLevel },
				};
			}
		}

		test('auto-approves all writes when autoApprove is set to bypass', () => {
			setupSessionWithConfig('autoApprove');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-bypass-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write .env',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-bypass-1',
				invocationMessage: 'Write .env',
				permissionKind: 'write',
				permissionPath: '/workspace/.env',
			});

			// .env would normally be blocked, but session-level auto-approve overrides
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-bypass-1', approved: true },
			]);
		});

		test('auto-approves shell commands when autoApprove is set to autopilot', () => {
			setupSessionWithConfig('autopilot');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-ap-shell-1',
				toolName: 'shell',
				displayName: 'Shell',
				invocationMessage: 'Run rm -rf /',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-ap-shell-1',
				invocationMessage: 'Run rm -rf /',
				permissionKind: 'shell',
				toolInput: 'rm -rf /',
			});

			// Dangerous command would normally be blocked, but session-level auto-approve overrides
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-ap-shell-1', approved: true },
			]);
		});

		test('does NOT auto-approve when autoApprove is default', () => {
			setupSessionWithConfig('default');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-default-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write .env',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-default-1',
				invocationMessage: 'Write .env',
				permissionKind: 'write',
				permissionPath: '/workspace/.env',
			});

			// .env should still be blocked with default config
			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('respects mid-session config change via SessionConfigChanged', () => {
			setupSessionWithConfig('default');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Change to bypass mid-session
			stateManager.dispatchServerAction({
				type: ActionType.SessionConfigChanged,
				session: sessionUri.toString(),
				config: { autoApprove: 'autoApprove' },
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-mid-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write .env',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-mid-1',
				invocationMessage: 'Write .env',
				permissionKind: 'write',
				permissionPath: '/workspace/.env',
			});

			// Should now be auto-approved after config change
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-mid-1', approved: true },
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

			const envelopes: ActionEnvelope[] = [];
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

	// ---- Read auto-approve -------------------------------------------------

	suite('read auto-approve', () => {

		test('auto-approves reads inside working directory', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-read-1',
				toolName: 'read',
				displayName: 'Read',
				invocationMessage: 'Read file',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-read-1',
				invocationMessage: 'Read src/app.ts',
				permissionKind: 'read',
				permissionPath: '/workspace/src/app.ts',
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-read-1', approved: true },
			]);
		});

		test('does not auto-approve reads outside working directory', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-read-2',
				toolName: 'read',
				displayName: 'Read',
				invocationMessage: 'Read file',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-read-2',
				invocationMessage: 'Read /etc/passwd',
				permissionKind: 'read',
				permissionPath: '/etc/passwd',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);

			const readyAction = envelopes.find(e => e.action.type === ActionType.SessionToolCallReady);
			assert.ok(readyAction, 'should dispatch tool_ready for read outside working directory');
		});
	});

	// ---- Title persistence --------------------------------------------------

	suite('title persistence', () => {

		let sessionDb: SessionDatabase;

		setup(async () => {
			sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
		});

		teardown(async () => {
			await sessionDb.close();
		});

		test('SessionTitleChanged persists to the database', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			});

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
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
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
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
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend
			const { session } = await localAgent.createSession();
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

		test('SessionConfigChanged persists merged config values to the database', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			});

			const session = localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			session.config = { schema: { type: 'object', properties: {} }, values: { autoApprove: 'default' } };

			// Mid-session change merges new values into existing.
			localStateManager.dispatchClientAction({
				type: ActionType.SessionConfigChanged,
				session: sessionUri.toString(),
				config: { autoApprove: 'autoApprove' },
			}, { clientId: 'test-client', clientSeq: 1 });
			localSideEffects.handleAction({
				type: ActionType.SessionConfigChanged,
				session: sessionUri.toString(),
				config: { autoApprove: 'autoApprove' },
			});

			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.ok(persisted);
			assert.deepStrictEqual(JSON.parse(persisted!), { autoApprove: 'autoApprove' });
		});
	});

	// ---- Subagent sessions ----------------------------------------------

	suite('subagent sessions', () => {

		test('subagent_started creates a subagent session and dispatches content on parent tool call', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start a parent tool call
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-1',
				toolName: 'runSubagent',
				displayName: 'Run Subagent',
				invocationMessage: 'Delegating task...',
			});

			// Fire subagent_started
			agent.fireProgress({
				session: sessionUri,
				type: 'subagent_started',
				toolCallId: 'tc-1',
				agentName: 'code-reviewer',
				agentDisplayName: 'Code Reviewer',
				agentDescription: 'Reviews code',
			});

			// Verify the subagent session was created
			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState, 'subagent session should exist');
			assert.strictEqual(subState!.summary.title, 'Code Reviewer');
			assert.ok(subState!.activeTurn, 'subagent should have an active turn');

			// Verify content was dispatched on the parent tool call
			const parentState = stateManager.getSessionState(sessionUri.toString());
			assert.ok(parentState?.activeTurn);
			const parentToolCall = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(parentToolCall);
			if (parentToolCall?.kind === ResponsePartKind.ToolCall && parentToolCall.toolCall.status === ToolCallStatus.Running) {
				assert.ok(parentToolCall.toolCall.content);
				assert.strictEqual(parentToolCall.toolCall.content![0].type, ToolResultContentType.Subagent);
			}
		});

		test('events with parentToolCallId route to subagent session', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start parent tool + subagent
			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Fire an inner tool start with parentToolCallId
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-tc-1',
				toolName: 'readFile',
				displayName: 'Read File',
				invocationMessage: 'Reading file...',
				parentToolCallId: 'tc-1',
			});

			// Verify the inner tool call is on the subagent session's turn, not the parent
			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn);
			const innerTool = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.ok(innerTool, 'inner tool call should be in subagent session');

			// Verify the parent session does NOT have the inner tool call
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const parentInnerTool = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.strictEqual(parentInnerTool, undefined, 'inner tool call should NOT be in parent session');
		});

		test('completeSubagentSession clears pending buffered events when subagent never started', () => {
			// Regression: if the parent tool completes (or fails) before any
			// `subagent_started` arrives, buffered inner events would
			// otherwise leak in `_pendingSubagentEvents` until session
			// disposal. After completion, a late `subagent_started` for the
			// same toolCallId must not replay stale events.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', invocationMessage: 'Delegating...' });

			// Inner event arrives but `subagent_started` never does.
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-1',
				toolName: 'read',
				displayName: 'Read',
				invocationMessage: 'Reading...',
				parentToolCallId: 'tc-1',
			});

			// Parent tool completes (e.g. it errored before delegating).
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_complete',
				toolCallId: 'tc-1',
				result: { success: false, pastTenseMessage: 'Failed' },
			});

			// Now a late `subagent_started` for the same toolCallId arrives.
			// This is unusual but possible after a reconnect/replay. The
			// drain must NOT replay the (cleared) buffered inner tool call.
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState, 'subagent session should still be created');
			const innerTool = subState!.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1'
			);
			assert.strictEqual(innerTool, undefined, 'stale buffered inner tool call must not be replayed');
		});

		test('completeSubagentSession completes the subagent turn when parent tool completes', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start parent tool + subagent
			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Complete the parent tool call
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_complete',
				toolCallId: 'tc-1',
				result: { success: true, pastTenseMessage: 'Done' },
			});

			// Verify the subagent session's turn was completed
			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState);
			assert.strictEqual(subState!.activeTurn, undefined, 'subagent turn should be completed');
			assert.strictEqual(subState!.turns.length, 1);
		});

		test('cancelSubagentSessions cancels all subagent sessions', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start two parent tool calls with subagents
			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Sub 1', invocationMessage: 'Delegating 1...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'sub1', agentDisplayName: 'Sub 1', agentDescription: 'First' });

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-2', toolName: 'runSubagent', displayName: 'Sub 2', invocationMessage: 'Delegating 2...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-2', agentName: 'sub2', agentDisplayName: 'Sub 2', agentDescription: 'Second' });

			// Cancel via parent turn cancellation
			sideEffects.handleAction({
				type: ActionType.SessionTurnCancelled,
				session: sessionUri.toString(),
				turnId: 'turn-1',
			});

			// Both subagent sessions should have their turns completed (cancelled)
			const sub1 = stateManager.getSessionState(`${sessionUri.toString()}/subagent/tc-1`);
			const sub2 = stateManager.getSessionState(`${sessionUri.toString()}/subagent/tc-2`);
			assert.strictEqual(sub1?.activeTurn, undefined, 'sub1 turn should be cancelled');
			assert.strictEqual(sub2?.activeTurn, undefined, 'sub2 turn should be cancelled');
		});

		test('removeSubagentSessions removes all subagent sessions from state', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Sub 1', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'sub', agentDisplayName: 'Sub', agentDescription: 'Has subagent' });

			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			assert.ok(stateManager.getSessionState(subagentUri));

			sideEffects.removeSubagentSessions(sessionUri.toString());

			assert.strictEqual(stateManager.getSessionState(subagentUri), undefined, 'subagent session should be removed');
		});

		test('deltas with parentToolCallId route to subagent session', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Fire a delta with parentToolCallId
			agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-sub', content: 'thinking...', parentToolCallId: 'tc-1' });

			// Verify the delta went to the subagent session
			const subagentUri = `${sessionUri.toString()}/subagent/tc-1`;
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn);
			const markdownPart = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.Markdown
			);
			assert.ok(markdownPart, 'delta should create a markdown part in subagent session');
		});

		test('tool_complete preserves subagent content in completed tool call', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-1', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-1', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });

			// Verify subagent content is on the running tool
			const runningState = stateManager.getSessionState(sessionUri.toString());
			const runningTool = runningState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(runningTool?.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(runningTool.toolCall.status, ToolCallStatus.Running);

			// Complete the tool — the SDK result has its own content
			agent.fireProgress({
				session: sessionUri, type: 'tool_complete', toolCallId: 'tc-1',
				result: { success: true, pastTenseMessage: 'Delegated', content: [{ type: ToolResultContentType.Text, text: 'Done' }] },
			});

			// Verify the completed tool still has the subagent content entry
			const completedState = stateManager.getSessionState(sessionUri.toString());
			const completedTool = completedState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(completedTool?.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(completedTool.toolCall.status, ToolCallStatus.Completed);
			const content = completedTool.toolCall.content ?? [];
			const subagentEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
			assert.ok(subagentEntry, 'Completed tool should preserve subagent content entry');
			const textEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Text);
			assert.ok(textEntry, 'Completed tool should also have the SDK result content');
		});

		test('inner tool_start arriving BEFORE subagent_started routes to subagent (not parent)', () => {
			// Reproduces the regression where inner subagent tool calls show up
			// flat at the top level of the parent session because the SDK can
			// emit `tool_start` (with parentToolCallId) before `subagent_started`.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// 1. Parent tool starts (the `task` invocation).
			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...' });

			// 2. Inner tool fires BEFORE subagent_started (race condition).
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-tc-1',
				toolName: 'readFile',
				displayName: 'Read File',
				invocationMessage: 'Reading file...',
				parentToolCallId: 'tc-parent',
			});

			// 3. subagent_started arrives later.
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			const subagentUri = buildSubagentSessionUri(sessionUri.toString(), 'tc-parent');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn, 'subagent session should exist');

			const innerTool = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.ok(innerTool, 'inner tool fired before subagent_started should still end up in the subagent session');

			// Parent must NOT have the inner tool.
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const parentInnerTool = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.strictEqual(parentInnerTool, undefined, 'inner tool must not leak into parent session');
		});

		test('reads inside parent working directory are auto-approved for tools in subagent sessions', () => {
			// Subagent sessions don't carry their own workingDirectory or
			// autoApprove config. Without inheritance from the parent, every
			// tool call inside a subagent (even a read in the workspace) would
			// surface a confirmation dialog.
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Parent task tool spawns a subagent.
			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Inner tool inside the subagent requests permission to read a file
			// inside the parent workspace.
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-read-1',
				toolName: 'read',
				displayName: 'Read',
				invocationMessage: 'Read file',
				parentToolCallId: 'tc-parent',
			});
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'inner-read-1',
				invocationMessage: 'Read src/app.ts',
				permissionKind: 'read',
				permissionPath: '/workspace/src/app.ts',
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-read-1', approved: true },
			]);
		});

		test('session-level autoApprove on the parent is inherited by tools in subagent sessions', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Set the parent session to "Bypass Approvals" via session config.
			const parentState = stateManager.getSessionState(sessionUri.toString());
			if (parentState) {
				parentState.config = {
					schema: {
						type: 'object',
						properties: {
							autoApprove: {
								type: 'string',
								title: 'Approvals',
								enum: ['default', 'autoApprove', 'autopilot'],
								default: 'default',
								sessionMutable: true,
							},
						},
					},
					values: { autoApprove: 'autoApprove' },
				};
			}

			agent.fireProgress({ session: sessionUri, type: 'tool_start', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...' });
			agent.fireProgress({ session: sessionUri, type: 'subagent_started', toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Inner write outside the workspace would normally NOT auto-approve,
			// but session-level autoApprove on the parent must apply.
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-write-1',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Write file',
				parentToolCallId: 'tc-parent',
			});
			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'inner-write-1',
				invocationMessage: 'Write /tmp/foo',
				permissionKind: 'write',
				permissionPath: '/tmp/foo',
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-write-1', approved: true },
			]);
		});
	});

	// ---- Session permissions ------------------------------------------------

	suite('session permissions', () => {

		test('tool_ready action includes confirmation options when confirmation is needed', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-perm-1',
				toolName: 'CustomTool',
				displayName: 'Custom Tool',
				invocationMessage: 'Running custom tool',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-perm-1',
				invocationMessage: 'Run custom tool',
				confirmationTitle: 'Run custom tool',
				permissionKind: 'custom-tool',
			});

			const state = stateManager.getSessionState(sessionUri.toString());
			const tc = state!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-perm-1'
			);
			assert.ok(tc && tc.kind === ResponsePartKind.ToolCall, 'tool call should exist');
			assert.strictEqual(tc.toolCall.status, ToolCallStatus.PendingConfirmation);
			assert.ok(Array.isArray(tc.toolCall.options), 'options should be an array');
			assert.deepStrictEqual(tc.toolCall.options!.map(o => o.id), ['allow-session', 'allow-once', 'skip']);
		});

		test('SessionToolCallConfirmed with allow-session adds tool to session permissions', () => {
			setupSession();
			const state = stateManager.getSessionState(sessionUri.toString());
			if (state) {
				state.config = {
					schema: { type: 'object', properties: {} },
					values: {},
				};
			}
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-perm-2',
				toolName: 'CustomTool',
				displayName: 'Custom Tool',
				invocationMessage: 'Running custom tool',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-perm-2',
				invocationMessage: 'Run custom tool',
				confirmationTitle: 'Run custom tool',
				permissionKind: 'custom-tool',
			});

			sideEffects.handleAction({
				type: ActionType.SessionToolCallConfirmed,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				toolCallId: 'tc-perm-2',
				approved: true,
				confirmed: 'user-action' as const,
				selectedOptionId: 'allow-session',
			} as SessionAction);

			const updatedState = stateManager.getSessionState(sessionUri.toString());
			assert.deepStrictEqual(
				updatedState!.config!.values.permissions,
				{ allow: ['CustomTool'], deny: [] },
			);
		});

		test('subsequent tool_ready for same tool is auto-approved after allow-session permission', () => {
			setupSession();
			const state = stateManager.getSessionState(sessionUri.toString());
			if (state) {
				state.config = {
					schema: { type: 'object', properties: {} },
					values: { permissions: { allow: ['CustomTool'], deny: [] } },
				};
			}
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-perm-3',
				toolName: 'CustomTool',
				displayName: 'Custom Tool',
				invocationMessage: 'Running custom tool',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'tc-perm-3',
				invocationMessage: 'Run custom tool',
				confirmationTitle: 'Run custom tool',
				permissionKind: 'custom-tool',
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-perm-3', approved: true },
			]);
		});

		test('subagent tool calls inherit parent session permissions', () => {
			setupSession();
			const state = stateManager.getSessionState(sessionUri.toString());
			if (state) {
				state.config = {
					schema: { type: 'object', properties: {} },
					values: { permissions: { allow: ['CustomTool'], deny: [] } },
				};
			}
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'tc-parent',
				toolName: 'task',
				displayName: 'Task',
				invocationMessage: 'Delegating...',
			});
			agent.fireProgress({
				session: sessionUri,
				type: 'subagent_started',
				toolCallId: 'tc-parent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				agentDescription: 'Helps',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_start',
				toolCallId: 'inner-perm-1',
				toolName: 'CustomTool',
				displayName: 'Custom Tool',
				invocationMessage: 'Running custom tool',
				parentToolCallId: 'tc-parent',
			});

			agent.fireProgress({
				session: sessionUri,
				type: 'tool_ready',
				toolCallId: 'inner-perm-1',
				invocationMessage: 'Run custom tool',
				confirmationTitle: 'Run custom tool',
				permissionKind: 'custom-tool',
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-perm-1', approved: true },
			]);
		});
	});

	// ---- Session diff computation ----------------------------------------------

	suite('session diff computation', () => {

		test('git-driven path is preferred when a git service is provided and the working dir is a git work tree', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));

			const gitDiffs = [{
				after: { uri: 'file:///wd/new.ts', content: { uri: 'file:///wd/new.ts' } },
				diff: { added: 1, removed: 0 },
			}];
			const computeCalls: { workingDirectory: string; sessionUri: string; baseBranch: string | undefined }[] = [];
			const stubGit = {
				computeSessionFileDiffs: async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
					computeCalls.push({ workingDirectory: wd.toString(), sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
					return gitDiffs;
				},
			} as unknown as import('../../node/agentHostGitService.js').IAgentHostGitService;

			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			}, stubGit);

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
			});
			await sessionDb.setMetadata('agentHost.diffBaseBranch', 'main');
			disposables.add(localSideEffects.registerProgressListener(localAgent));

			const envelopes: ActionEnvelope[] = [];
			let resolveDiffs: (() => void) | undefined;
			const diffsEmitted = new Promise<void>(r => { resolveDiffs = r; });
			disposables.add(localStateManager.onDidEmitEnvelope(e => {
				envelopes.push(e);
				if (e.action.type === ActionType.SessionDiffsChanged) {
					resolveDiffs?.();
				}
			}));

			// Trigger a turn-complete (which fires the immediate diff path).
			localSideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hi' },
			});
			localAgent.fireProgress({ session: URI.parse(sessionUri.toString()), type: 'idle' });

			// Wait deterministically for the SessionDiffsChanged envelope rather
			// than sleeping a fixed amount.
			await diffsEmitted;

			assert.deepStrictEqual(computeCalls, [{ workingDirectory: 'file:///wd', sessionUri: sessionUri.toString(), baseBranch: 'main' }]);
			const diffsAction = envelopes.map(e => e.action).find(a => a.type === ActionType.SessionDiffsChanged);
			assert.ok(diffsAction, 'expected a SessionDiffsChanged action');
			assert.deepStrictEqual((diffsAction as { diffs: unknown }).diffs, gitDiffs);
		});

		test('falls back to the edit-tracker aggregator when the git service returns undefined', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));

			const stubGit = {
				computeSessionFileDiffs: async () => undefined,
			} as unknown as import('../../node/agentHostGitService.js').IAgentHostGitService;

			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			}, stubGit);

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
			});
			disposables.add(localSideEffects.registerProgressListener(localAgent));

			const envelopes: ActionEnvelope[] = [];
			let resolveDiffs: (() => void) | undefined;
			const diffsEmitted = new Promise<void>(r => { resolveDiffs = r; });
			disposables.add(localStateManager.onDidEmitEnvelope(e => {
				envelopes.push(e);
				if (e.action.type === ActionType.SessionDiffsChanged) {
					resolveDiffs?.();
				}
			}));

			localSideEffects.handleAction({
				type: ActionType.SessionTurnStarted,
				session: sessionUri.toString(),
				turnId: 'turn-1',
				userMessage: { text: 'hi' },
			});
			localAgent.fireProgress({ session: URI.parse(sessionUri.toString()), type: 'idle' });

			await diffsEmitted;

			// With no recorded edits, the edit-tracker aggregator returns an empty array — the
			// important assertion is that we still produced a SessionDiffsChanged envelope, which
			// proves the fallback path executed without throwing.
			const diffsAction = envelopes.map(e => e.action).find(a => a.type === ActionType.SessionDiffsChanged);
			assert.ok(diffsAction, 'expected a SessionDiffsChanged action from the fallback path');
			assert.deepStrictEqual((diffsAction as { diffs: unknown[] }).diffs, []);
		});
	});
});
