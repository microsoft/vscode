/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentCreateSessionConfig, IAgentHostService, IAgentSessionMetadata, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IActionEnvelope, INotification, ISessionAction, IToolCallConfirmedAction, ITurnStartedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IStateSnapshot } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import type { ICustomizationRef } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionLifecycle, SessionStatus, TurnState, ToolCallStatus, ToolCallConfirmationReason, createSessionState, createActiveTurn, ROOT_STATE_URI, PolicyState, ResponsePartKind, type ISessionState, type ISessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatMarkdownContent, IChatProgress, IChatTerminalToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostContribution, AgentHostSessionListController, AgentHostSessionHandler } from '../../../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';

// ---- Mock agent host service ------------------------------------------------

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<IActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;
	override readonly onAgentHostExit = Event.None;
	override readonly onAgentHostStart = Event.None;

	private _nextId = 1;
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public createSessionCalls: IAgentCreateSessionConfig[] = [];
	public disposedSessions: URI[] = [];
	public agents = [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', requiresAuth: true }];

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async listAgents() {
		return this.agents;
	}

	override async refreshModels(): Promise<void> { }

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (config) {
			this.createSessionCalls.push(config);
		}
		const id = `sdk-session-${this._nextId++}`;
		const session = AgentSession.uri('copilot', id);
		this._sessions.set(id, { session, startTime: Date.now(), modifiedTime: Date.now() });
		return session;
	}

	override async disposeSession(session: URI): Promise<void> { this.disposedSessions.push(session); }
	override async shutdown(): Promise<void> { }
	override async restartAgentHost(): Promise<void> { }

	// Protocol methods
	public override readonly clientId = 'test-window-1';
	public dispatchedActions: { action: ISessionAction; clientId: string; clientSeq: number }[] = [];

	/** Returns dispatched actions filtered to turn-related types only
	 *  (excludes lifecycle actions like activeClientChanged). */
	get turnActions() {
		return this.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
	}
	public sessionStates = new Map<string, ISessionState>();
	override async subscribe(resource: URI): Promise<IStateSnapshot> {
		const resourceStr = resource.toString();
		const existingState = this.sessionStates.get(resourceStr);
		if (existingState) {
			return { resource: resourceStr, state: existingState, fromSeq: 0 };
		}
		// Root state subscription
		if (resourceStr === ROOT_STATE_URI) {
			return {
				resource: resourceStr,
				state: {
					agents: this.agents.map(a => ({ provider: a.provider, displayName: a.displayName, description: a.description, models: [] })),
					activeSessions: 0
				},
				fromSeq: 0,
			};
		}
		const summary: ISessionSummary = {
			resource: resourceStr,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		};
		return {
			resource: resourceStr,
			state: { ...createSessionState(summary), lifecycle: SessionLifecycle.Ready },
			fromSeq: 0,
		};
	}
	override unsubscribe(_resource: URI): void { }
	override dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ action, clientId, clientSeq });
	}
	private _nextSeq = 1;
	override nextClientSeq(): number {
		return this._nextSeq++;
	}

	// Test helpers
	fireAction(envelope: IActionEnvelope): void {
		this._onDidAction.fire(envelope);
	}

	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
	}
}

// ---- Minimal service mocks --------------------------------------------------

class MockChatAgentService extends mock<IChatAgentService>() {
	declare readonly _serviceBrand: undefined;

	registeredAgents = new Map<string, { data: IChatAgentData; impl: IChatAgentImplementation }>();

	override registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation) {
		this.registeredAgents.set(data.id, { data, impl: agentImpl });
		return toDisposable(() => this.registeredAgents.delete(data.id));
	}
}

// ---- Helpers ----------------------------------------------------------------

function createTestServices(disposables: DisposableStore) {
	const instantiationService = disposables.add(new TestInstantiationService());

	const agentHostService = new MockAgentHostService();
	disposables.add(toDisposable(() => agentHostService.dispose()));

	const chatAgentService = new MockChatAgentService();

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IProductService, { quality: 'insider' });
	instantiationService.stub(IChatAgentService, chatAgentService);
	instantiationService.stub(IFileService, TestFileService);
	instantiationService.stub(ILabelService, MockLabelService);
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionItemController: () => toDisposable(() => { }),
		registerChatSessionContentProvider: () => toDisposable(() => { }),
		registerChatSessionContribution: () => toDisposable(() => { }),
	});
	instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
	instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
	instantiationService.stub(ILanguageModelsService, {
		deltaLanguageModelChatProviderDescriptors: () => { },
		registerLanguageModelProvider: () => toDisposable(() => { }),
	});
	instantiationService.stub(IConfigurationService, { getValue: () => true });
	instantiationService.stub(IOutputService, { getChannel: () => undefined });
	instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null });
	instantiationService.stub(IChatEditingService, {
		registerEditingSessionProvider: () => toDisposable(() => { }),
	});
	instantiationService.stub(IAgentHostFileSystemService, {
		registerAuthority: () => toDisposable(() => { }),
		ensureSyncedCustomizationProvider: () => { },
	});
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ICustomizationHarnessService, {
		registerExternalHarness: () => toDisposable(() => { }),
	});
	instantiationService.stub(IAgentPluginService, {
		plugins: observableValue('plugins', []),
	});

	return { instantiationService, agentHostService, chatAgentService };
}

function createContribution(disposables: DisposableStore) {
	const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

	const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined));
	const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
		provider: 'copilot' as const,
		agentId: 'agent-host-copilot',
		sessionType: 'agent-host-copilot',
		fullName: 'Agent Host - Copilot',
		description: 'Copilot SDK agent running in a dedicated process',
		connection: agentHostService,
		connectionAuthority: 'local',
	}));
	const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));

	return { contribution, listController, sessionHandler, agentHostService, chatAgentService };
}

function makeRequest(overrides: Partial<{ message: string; sessionResource: URI; variables: IChatAgentRequest['variables']; userSelectedModelId: string }> = {}): IChatAgentRequest {
	return upcastPartial<IChatAgentRequest>({
		sessionResource: overrides.sessionResource ?? URI.from({ scheme: 'untitled', path: '/chat-1' }),
		requestId: 'req-1',
		agentId: 'agent-host-copilot',
		message: overrides.message ?? 'Hello',
		variables: overrides.variables ?? { variables: [] },
		location: ChatAgentLocation.Chat,
		userSelectedModelId: overrides.userSelectedModelId,
	});
}

/** Extract the text value from a string or IMarkdownString. */
function textOf(value: string | IMarkdownString | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : value.value;
}

/**
 * Start a turn through the state-driven flow. Creates a chat session,
 * starts the requestHandler (non-blocking), and waits for the first action
 * to be dispatched. Returns helpers to fire server action envelopes.
 */
async function startTurn(
	sessionHandler: AgentHostSessionHandler,
	agentHostService: MockAgentHostService,
	ds: DisposableStore,
	overrides?: Partial<{
		message: string;
		sessionResource: URI;
		variables: IChatAgentRequest['variables'];
		userSelectedModelId: string;
		cancellationToken: CancellationToken;
	}>,
) {
	const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: 'agent-host-copilot', path: '/untitled-turntest' });
	const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
	ds.add(toDisposable(() => chatSession.dispose()));

	// Clear any lifecycle actions (e.g. activeClientChanged from customization setup)
	// so tests only see turn-related dispatches.
	agentHostService.dispatchedActions.length = 0;

	const collected: IChatProgress[][] = [];
	const seq = { v: 1 };

	const turnPromise = chatSession.requestHandler!(
		makeRequest({
			message: overrides?.message ?? 'Hello',
			sessionResource,
			variables: overrides?.variables,
			userSelectedModelId: overrides?.userSelectedModelId,
		}),
		(parts) => collected.push(parts),
		[],
		overrides?.cancellationToken ?? CancellationToken.None,
	);

	await timeout(10);

	// Filter for turn-related dispatches only (skip activeClientChanged etc.)
	const turnDispatches = agentHostService.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
	const lastDispatch = turnDispatches[turnDispatches.length - 1] ?? agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
	const session = (lastDispatch?.action as ITurnStartedAction)?.session;
	const turnId = (lastDispatch?.action as ITurnStartedAction)?.turnId;

	const fire = (action: ISessionAction) => {
		agentHostService.fireAction({ action, serverSeq: seq.v++, origin: undefined });
	};

	// Echo the turnStarted action to clear the pending write-ahead entry.
	// Without this, the optimistic state replay would re-add activeTurn after
	// the server's turnComplete clears it, preventing the turn from finishing.
	if (lastDispatch) {
		agentHostService.fireAction({
			action: lastDispatch.action,
			serverSeq: seq.v++,
			origin: { clientId: agentHostService.clientId, clientSeq: lastDispatch.clientSeq },
		});
	}

	return { turnPromise, collected, chatSession, session, turnId, fire };
}

suite('AgentHostChatContribution', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Registration ---------------------------------------------------

	suite('registration', () => {

		test('registers agent', () => {
			const { chatAgentService } = createContribution(disposables);

			assert.ok(chatAgentService.registeredAgents.has('agent-host-copilot'));
		});
	});

	// ---- Session list (IChatSessionItemController) ----------------------

	suite('session list', () => {

		test('refresh populates items from agent host', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'bbb'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 2);
			assert.strictEqual(listController.items[0].label, 'My session');
			assert.strictEqual(listController.items[1].label, 'Session bbb');
			assert.strictEqual(listController.items[0].resource.scheme, 'agent-host-copilot');
			assert.strictEqual(listController.items[0].resource.path, '/aaa');
		});

		test('refresh fires onDidChangeChatSessionItems', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			let fired = false;
			disposables.add(listController.onDidChangeChatSessionItems(() => { fired = true; }));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'x'), startTime: 1000, modifiedTime: 2000 });
			await listController.refresh(CancellationToken.None);

			assert.ok(fired);
		});

		test('refresh handles error gracefully', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.listSessions = async () => { throw new Error('fail'); };

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 0);
		});
	});

	// ---- Session ID resolution in _invokeAgent --------------------------

	suite('session ID resolution', () => {

		test('creates new SDK session for untitled resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, { message: 'Hello' });
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual(agentHostService.turnActions[0].action.type, 'session/turnStarted');
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).userMessage.text, 'Hello');
			assert.ok(AgentSession.id(URI.parse(session)).startsWith('sdk-session-'));
		}));

		test('reuses SDK session for same resource on second message', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-reuse' });
			const chatSession = await sessionHandler.provideChatSessionContent(resource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// First turn
			const turn1Promise = chatSession.requestHandler!(
				makeRequest({ message: 'First', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			// Echo the turnStarted to clear pending write-ahead
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action1.session, turnId: action1.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Second turn
			const turn2Promise = chatSession.requestHandler!(
				makeRequest({ message: 'Second', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch2 = agentHostService.turnActions[1];
			const action2 = dispatch2.action as ITurnStartedAction;
			agentHostService.fireAction({ action: dispatch2.action, serverSeq: 3, origin: { clientId: agentHostService.clientId, clientSeq: dispatch2.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action2.session, turnId: action2.turnId } as ISessionAction, serverSeq: 4, origin: undefined });
			await turn2Promise;

			assert.strictEqual(agentHostService.turnActions.length, 2);
			assert.strictEqual(
				(agentHostService.turnActions[0].action as ITurnStartedAction).session.toString(),
				(agentHostService.turnActions[1].action as ITurnStartedAction).session.toString(),
			);
		}));

		test('uses sessionId from agent-host scheme resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'Hi',
				sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-42' }),
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(AgentSession.id(URI.parse(session)), 'existing-session-42');
		}));

		test('agent-host scheme with untitled path creates new session via mapping', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'Hi',
				sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc123' }),
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			// Should create a new SDK session, not use "untitled-abc123" literally
			assert.ok(AgentSession.id(URI.parse(session)).startsWith('sdk-session-'));
		}));
		test('passes raw model id extracted from language model identifier', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].model, 'claude-sonnet-4-20250514');
		}));

		test('passes model id as-is when no vendor prefix', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'gpt-4o',
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].model, 'gpt-4o');
		}));

		test('does not create backend session eagerly for untitled sessions', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-deferred' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			// No backend session should have been created yet
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
		});
	});

	// ---- Progress event → chat progress conversion ----------------------

	suite('progress routing', () => {

		test('delta events become markdownContent progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'hello ' } } as ISessionAction);
			fire({ type: 'session/delta', session, turnId, partId: 'md-1', content: 'world' } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			// Events may be coalesced by the throttler, so check total content
			const markdownParts = collected.flat().filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'hello world');
		}));

		test('tool_start events become toolInvocation progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-1', toolName: 'read_file', displayName: 'Read File' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-1', invocationMessage: 'Reading file', confirmed: 'not-needed' } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('tool_complete event transitions toolInvocation to completed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-2', toolName: 'bash', displayName: 'Bash' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-2', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-2',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(invocation.toolCallId, 'tc-2');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('tool_complete with failure sets error state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-3', toolName: 'bash', displayName: 'Bash' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-3', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-3',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found' }], error: { message: 'command not found' } },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('malformed toolArguments does not throw', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-bad', toolName: 'bash', displayName: 'Bash' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-bad', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('outstanding tool invocations are completed on idle', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			// tool_start without tool_complete
			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-orphan', toolName: 'bash', displayName: 'Bash' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-orphan', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('events from other sessions are ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			// Delta from a different session — will be ignored (session not subscribed)
			agentHostService.fireAction({
				action: { type: 'session/delta', session: AgentSession.uri('copilot', 'other-session').toString(), turnId, partId: 'md-other', content: 'wrong' } as ISessionAction,
				serverSeq: 100,
				origin: undefined,
			});
			fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'right' } } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual((collected[0][0] as IChatMarkdownContent).content.value, 'right');
		}));
	});

	// ---- Cancellation -----------------------------------------------------

	suite('cancellation', () => {

		test('cancellation resolves the agent invoke', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
		}));

		test('cancellation force-completes outstanding tool invocations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				cancellationToken: cts.token,
			});

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-cancel', toolName: 'bash', displayName: 'Bash' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-cancel', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);

			cts.cancel();
			await turnPromise;

			// The tool invocation may or may not have been emitted before cancellation
			// (the throttler can coalesce events). If it was emitted, it should be complete.
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			for (const inv of toolInvocations) {
				assert.strictEqual(IChatToolInvocation.isComplete(inv as IChatToolInvocation), true);
			}
		}));

		test('cancellation calls abortSession on the agent host service', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			// Cancellation now dispatches session/turnCancelled action
			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
		}));
	});

	// ---- Error events -------------------------------------------------------

	suite('error events', () => {

		test('error event renders error message and finishes the request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId } = await startTurn(sessionHandler, agentHostService, disposables);

			agentHostService.fireAction({
				action: {
					type: 'session/error',
					session,
					turnId,
					error: { errorType: 'test_error', message: 'Something went wrong' },
				} as ISessionAction,
				serverSeq: 99,
				origin: undefined,
			});

			await turnPromise;

			// Should have received the error message and the request should have finished
			assert.ok(collected.length >= 1);
			const errorPart = collected.flat().find(p => p.kind === 'markdownContent' && (p as IChatMarkdownContent).content.value.includes('Something went wrong'));
			assert.ok(errorPart, 'Should have found a markdownContent part containing the error message');
		}));
	});

	// ---- Permission requests -----------------------------------------------

	suite('permission requests', () => {

		test('permission_request event shows confirmation and responds when confirmed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			// Simulate a tool call requiring confirmation via toolCallStart + toolCallReady
			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-1', toolName: 'shell', displayName: 'Shell' } as ISessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-1',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as ISessionAction);

			await timeout(10);

			// The tool call should have produced a ChatToolInvocation in WaitingForConfirmation state
			// After toolCallStart (Streaming) and toolCallReady without confirmed (PendingConfirmation),
			// the handler emits two progress events — we want the last one (with confirmation).
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			assert.ok(toolInvocations.length >= 1, 'Should have received tool confirmation progress');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			assert.strictEqual(permInvocation.kind, 'toolInvocation');

			// Confirm the tool
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });

			await timeout(10);

			// The handler should have dispatched session/toolCallConfirmed
			assert.ok(agentHostService.dispatchedActions.some(
				a => {
					if (a.action.type !== 'session/toolCallConfirmed') {
						return false;
					}
					const action = a.action as IToolCallConfirmedAction;
					return action.toolCallId === 'tc-perm-1' && action.approved === true;
				}
			));

			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;
		}));

		test('permission_request denied when user skips', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-2', toolName: 'write', displayName: 'Write File' } as ISessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-2',
				invocationMessage: 'Write to /tmp/test.txt',
			} as ISessionAction);

			await timeout(10);

			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			// Deny the permission
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.Denied });

			await timeout(10);

			assert.ok(agentHostService.dispatchedActions.some(
				a => {
					if (a.action.type !== 'session/toolCallConfirmed') {
						return false;
					}
					const action = a.action as IToolCallConfirmedAction;
					return action.toolCallId === 'tc-perm-2' && action.approved === false;
				}
			));

			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;
		}));

		test('shell permission shows terminal-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-shell', toolName: 'shell', displayName: 'Shell', _meta: { toolKind: 'terminal' } } as ISessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-shell',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as ISessionAction);

			await timeout(10);
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			assert.strictEqual(permInvocation.toolSpecificData?.kind, 'terminal');
			const termData = permInvocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.strictEqual(termData.commandLine.original, 'echo hello');

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;
		}));

		test('read permission shows input-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-read', toolName: 'read_file', displayName: 'Read File' } as ISessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-read',
				invocationMessage: 'Read file contents', toolInput: '/workspace/file.ts',
			} as ISessionAction);

			await timeout(10);
			const permInvocation = collected[0][0] as IChatToolInvocation;

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;
		}));
	});

	// ---- History loading ---------------------------------------------------

	suite('history loading', () => {

		test('loads user and assistant messages into history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'sess-1');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					userMessage: { text: 'What is 2+2?' },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: '4' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/sess-1' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);

			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.strictEqual(request.prompt, 'What is 2+2?');
			}

			const response = session.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				assert.strictEqual(response.parts.length, 1);
				assert.strictEqual((response.parts[0] as IChatMarkdownContent).content.value, '4');
			}
		});

		test('untitled sessions have empty history', async () => {
			const { sessionHandler } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-xyz' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 0);
		});
	});

	// ---- Tool invocation rendering -----------------------------------------

	suite('tool invocation rendering', () => {

		test('bash tool renders as terminal command block with output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-shell', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-shell', invocationMessage: 'Running `echo hello`', toolInput: 'echo hello', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-shell',
				result: { success: true, pastTenseMessage: 'Ran `echo hello`', content: [{ type: 'text', text: 'hello\n' }] },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				kind: invocation.kind,
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				dataKind: termData.kind,
				commandLine: termData.commandLine.original,
				language: termData.language,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				kind: 'toolInvocation',
				invocationMessage: 'Running `echo hello`',
				pastTenseMessage: undefined,
				dataKind: 'terminal',
				commandLine: 'echo hello',
				language: 'shellscript',
				outputText: 'hello\n',
				exitCode: 0,
			});
		}));

		test('bash tool failure sets exit code 1 and error output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-fail', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-fail', invocationMessage: 'Running `bad_cmd`', toolInput: 'bad_cmd', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-fail',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found: bad_cmd' }], error: { message: 'command not found: bad_cmd' } },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				pastTenseMessage: invocation.pastTenseMessage,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				pastTenseMessage: undefined,
				outputText: 'command not found: bad_cmd',
				exitCode: 1,
			});
		}));

		test('generic tool has invocation message and no toolSpecificData', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-gen', toolName: 'custom_tool', displayName: 'custom_tool' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-gen', invocationMessage: 'Using "custom_tool"', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-gen',
				result: { success: true, pastTenseMessage: 'Used "custom_tool"' },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Using "custom_tool"',
				pastTenseMessage: 'Used "custom_tool"',
				toolSpecificData: undefined,
			});
		}));

		test('bash tool without arguments has no terminal data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-noargs', toolName: 'bash', displayName: 'Bash', toolKind: 'terminal' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-noargs', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-noargs',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Running Bash command',
				pastTenseMessage: 'Ran Bash command',
				toolSpecificData: undefined,
			});
		}));

		test('view tool shows file path in messages', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-view', toolName: 'view', displayName: 'View File' } as ISessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-view', invocationMessage: 'Reading /tmp/test.txt', confirmed: 'not-needed' } as ISessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-view',
				result: { success: true, pastTenseMessage: 'Read /tmp/test.txt' },
			} as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
			}, {
				invocationMessage: 'Reading /tmp/test.txt',
				pastTenseMessage: 'Read /tmp/test.txt',
			});
		}));
	});

	// ---- History with tool events ----------------------------------------

	suite('history with tool events', () => {

		test('tool_start and tool_complete appear as toolInvocationSerialized in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'tool-hist');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					userMessage: { text: 'run ls' },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: {
							status: 'completed' as const, toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash',
							invocationMessage: 'Running `ls`', toolInput: 'ls', _meta: { toolKind: 'terminal', language: 'shellscript' },
							confirmed: 'not-needed' as const, success: true, pastTenseMessage: 'Ran `ls`', content: [{ type: 'text' as const, text: 'file1\nfile2' }],
						}
					}],
					usage: undefined,
				}],
			} as ISessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/tool-hist' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// request, response
			assert.strictEqual(chatSession.history.length, 2);

			const response = chatSession.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				assert.strictEqual(response.parts.length, 1);
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.toolCallId, 'tc-1');
				assert.strictEqual(toolPart.isComplete, true);
				// Terminal tool has output and exit code
				assert.strictEqual(toolPart.toolSpecificData?.kind, 'terminal');
				const termData = toolPart.toolSpecificData as IChatTerminalToolInvocationData;
				assert.strictEqual(termData.terminalCommandOutput?.text, 'file1\nfile2');
				assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
			}
		});

		test('orphaned tool_start is marked complete in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'orphan-tool');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					userMessage: { text: 'do something' },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: { status: 'completed' as const, toolCallId: 'tc-orphan', toolName: 'read_file', displayName: 'Read File', invocationMessage: 'Reading file', confirmed: 'not-needed' as const, success: false, pastTenseMessage: 'Reading file' },
					}],
					usage: undefined,
				}],
			} as ISessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/orphan-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 2);
			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.isComplete, true);
			}
		});

		test('non-terminal tool_complete sets pastTenseMessage in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'generic-tool');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					userMessage: { text: 'search' },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: { status: 'completed' as const, toolCallId: 'tc-g', toolName: 'grep', displayName: 'Grep', invocationMessage: 'Searching...', confirmed: 'not-needed' as const, success: true, pastTenseMessage: 'Searched for pattern' },
					}],
					usage: undefined,
				}],
			} as ISessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/generic-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(textOf(toolPart.pastTenseMessage), 'Searched for pattern');
				assert.strictEqual(toolPart.toolSpecificData, undefined);
			}
		});

		test('empty session produces empty history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'empty-sess');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [],
			} as ISessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/empty-sess' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 0);
		});
	});

	// ---- Server error handling ----------------------------------------------

	suite('server error handling', () => {

		test('server-side error resolves the agent invoke without throwing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId } = await startTurn(sessionHandler, agentHostService, disposables);

			// Simulate a server-side error (e.g. sendMessage failure on the server)
			agentHostService.fireAction({
				action: {
					type: 'session/error',
					session,
					turnId,
					error: { errorType: 'connection_error', message: 'connection lost' },
				} as ISessionAction,
				serverSeq: 99,
				origin: undefined,
			});

			await turnPromise;
		}));
	});

	// ---- Session list provider filtering --------------------------------

	suite('session list provider filtering', () => {

		test('filters sessions to only the matching provider', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			// Add sessions from both providers (use a non-copilot scheme to test filtering)
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-1'), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: URI.from({ scheme: 'other-provider', path: '/cl-1' }), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-2'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			// The list controller is configured for 'copilot', so only copilot sessions
			assert.strictEqual(listController.items.length, 2);
			assert.ok(listController.items.every(item => item.resource.scheme === 'agent-host-copilot'));
		});
	});

	// ---- Language model provider ----------------------------------------

	suite('language model provider', () => {

		test('maps models with correct metadata', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: true },
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].identifier, 'agent-host-copilot:gpt-4o');
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
			assert.strictEqual(models[0].metadata.maxInputTokens, 128000);
			assert.strictEqual(models[0].metadata.capabilities?.vision, true);
			assert.strictEqual(models[0].metadata.targetChatSessionType, 'agent-host-copilot');
		});

		test('filters out disabled models', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: false, policyState: PolicyState.Enabled },
				{ provider: 'copilot', id: 'gpt-3.5', name: 'GPT-3.5', maxContextWindow: 16000, supportsVision: false, policyState: PolicyState.Disabled },
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
		});

		test('returns empty when no models set', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 0);
		});

		test('sendChatRequest throws', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));

			await assert.rejects(() => provider.sendChatRequest(), /do not support direct chat requests/);
		});
	});

	// ---- Attachment context conversion --------------------------------------

	suite('attachment context', () => {

		test('file variable with file:// URI becomes file attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'check this file',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', path: URI.file('/workspace/test.ts').fsPath, displayName: 'test.ts' },
			]);
		}));

		test('directory variable with file:// URI becomes directory attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'check this dir',
				variables: {
					variables: [
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'src', value: URI.file('/workspace/src') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'directory', path: URI.file('/workspace/src').fsPath, displayName: 'src' },
			]);
		}));

		test('implicit selection variable becomes selection attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'explain this',
				variables: {
					variables: [
						upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true as const, isSelection: true, uri: URI.file('/workspace/foo.ts'), enabled: true, value: undefined }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'selection', path: URI.file('/workspace/foo.ts').fsPath, displayName: 'selection' },
			]);
		}));

		test('non-file URIs are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'untitled', value: URI.from({ scheme: 'untitled', path: '/foo' }) }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			// No attachments because it's not a file:// URI
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));

		test('tool variables are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'use tools',
				variables: {
					variables: [
						upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));

		test('mixed variables extracts only supported types', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'mixed',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/workspace/a.ts') }),
						upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/workspace/lib') }),
						upcastPartial({ kind: 'file', id: 'v-file', name: 'remote.ts', value: URI.from({ scheme: 'vscode-remote', path: '/remote/file.ts' }) }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', path: URI.file('/workspace/a.ts').fsPath, displayName: 'a.ts' },
				{ type: 'directory', path: URI.file('/workspace/lib').fsPath, displayName: 'lib' },
			]);
		}));

		test('no variables results in no attachments argument', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables, {
				message: 'Hello',
			});
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));
	});

	// ---- AgentHostContribution discovery ---------------------------------

	suite('dynamic discovery', () => {

		test('setting gate prevents registration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService } = createTestServices(disposables);
			instantiationService.stub(IConfigurationService, { getValue: () => false });

			const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));
			// Contribution should exist but not have registered any agents
			assert.ok(contribution);
			// Let async work settle
			await timeout(10);
		}));
	});

	// ---- IAgentConnection unification -------------------------------------

	suite('IAgentConnection config', () => {

		test('handler uses custom extensionId from config', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'remote-test-copilot',
				sessionType: 'remote-test-copilot',
				fullName: 'Remote Copilot',
				description: 'Remote agent',
				connection: agentHostService,
				connectionAuthority: 'local',
				extensionId: 'vscode.remote-agent-host',
				extensionDisplayName: 'Remote Agent Host',
			}));

			const registered = chatAgentService.registeredAgents.get('remote-test-copilot');
			assert.ok(registered);
			assert.strictEqual(registered.data.extensionId.value, 'vscode.remote-agent-host');
			assert.strictEqual(registered.data.extensionDisplayName, 'Remote Agent Host');
		});

		test('handler defaults extensionId when not provided', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'default-ext-test',
				sessionType: 'default-ext-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const registered = chatAgentService.registeredAgents.get('default-ext-test');
			assert.ok(registered);
			assert.strictEqual(registered.data.extensionId.value, 'vscode.agent-host');
			assert.strictEqual(registered.data.extensionDisplayName, 'Agent Host');
		});

		test('handler uses resolveWorkingDirectory callback', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-test',
				sessionType: 'workdir-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
				resolveWorkingDirectory: () => URI.file('/custom/working/dir'),
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), URI.file('/custom/working/dir').toString());
		}));

		test('handler passes vscode-agent-host URI as-is to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			// The workspace repository URI in the Sessions app is a
			// vscode-agent-host:// URI. It must be passed through unchanged
			// because the connection's createSession already converts it via
			// fromAgentHostUri before sending to the remote server.
			const agentHostUri = URI.from({
				scheme: 'vscode-agent-host',
				authority: 'my-server',
				path: '/file/-/home/user/project',
			});

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-agenthost-test',
				sessionType: 'workdir-agenthost-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'my-server',
				resolveWorkingDirectory: () => agentHostUri,
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), agentHostUri.toString());
		}));

		test('list controller includes description in items', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = disposables.add(instantiationService.createInstance(
				AgentHostSessionListController, 'remote-test', 'copilot', agentHostService, 'My Remote Host'));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-1'), startTime: 1000, modifiedTime: 2000, summary: 'Test session' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, 'My Remote Host');
		});

		test('list controller omits description when undefined', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = disposables.add(instantiationService.createInstance(
				AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-2'), startTime: 1000, modifiedTime: 2000, summary: 'Test' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, undefined);
		});

		test('handler works with any IAgentConnection, not just IAgentHostService', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			// Create handler with agentHostService as IAgentConnection (not IAgentHostService)
			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'connection-test',
				sessionType: 'connection-test',
				fullName: 'Connection Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			// Verify it registered an agent
			assert.ok(chatAgentService.registeredAgents.has('connection-test'));

			// Verify it can run a turn through the IAgentConnection path
			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, disposables, {
				message: 'Test message',
			});

			fire({ type: 'session/delta', session, turnId, content: 'Response' } as ISessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			// Turn dispatched via connection.dispatchAction
			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).userMessage.text, 'Test message');
		}));
	});

	// ---- Reconnection to active turn ----------------------------------------

	suite('reconnection to active turn', () => {

		function makeSessionStateWithActiveTurn(sessionUri: string, overrides?: Partial<{ streamingText: string; reasoning: string }>): ISessionState {
			const summary: ISessionSummary = {
				resource: sessionUri,
				provider: 'copilot',
				title: 'Active Session',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
			const activeTurnParts = [];
			const reasoningText = overrides?.reasoning ?? '';
			if (reasoningText) {
				activeTurnParts.push({ kind: ResponsePartKind.Reasoning as const, id: 'reasoning-1', content: reasoningText });
			}
			activeTurnParts.push({ kind: ResponsePartKind.Markdown as const, id: 'md-active', content: overrides?.streamingText ?? 'Partial response so far' });
			return {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-completed',
					userMessage: { text: 'First message' },
					responseParts: [{ kind: ResponsePartKind.Markdown as const, id: 'md-1', content: 'First response' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
				activeTurn: {
					...createActiveTurn('turn-active', { text: 'Second message' }),
					responseParts: activeTurnParts,
				},
			};
		}

		test('loads completed turns as history and active turn request/response', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-1');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-1' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			// Should have: completed turn (request + response) + active turn (request + empty response) = 4
			assert.strictEqual(session.history.length, 4);
			assert.strictEqual(session.history[0].type, 'request');
			if (session.history[0].type === 'request') {
				assert.strictEqual(session.history[0].prompt, 'First message');
			}
			assert.strictEqual(session.history[2].type, 'request');
			if (session.history[2].type === 'request') {
				assert.strictEqual(session.history[2].prompt, 'Second message');
			}
			// Active turn response should be an empty placeholder
			assert.strictEqual(session.history[3].type, 'response');
			if (session.history[3].type === 'response') {
				assert.strictEqual(session.history[3].parts.length, 0);
			}
		});

		test('sets isCompleteObs to false and populates progressObs for active turn', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-2');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-2' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.isCompleteObs?.get(), false, 'Should not be complete when active turn exists');
			const progress = session.progressObs?.get() ?? [];
			assert.ok(progress.length > 0, 'Should have initial progress from active turn');
			// Should contain the streaming text as markdown
			const markdownPart = progress.find(p => p.kind === 'markdownContent') as IChatMarkdownContent | undefined;
			assert.ok(markdownPart, 'Should have markdown content from streaming text');
			assert.strictEqual(markdownPart!.content.value, 'Partial response so far');
		});

		test('provides interruptActiveResponseCallback when reconnecting', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-3');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-3' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.ok(session.interruptActiveResponseCallback, 'Should provide interrupt callback');
		});

		test('interrupt callback dispatches turnCancelled action', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-cancel');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-cancel' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.ok(session.interruptActiveResponseCallback);
			const result = await session.interruptActiveResponseCallback!();
			assert.strictEqual(result, true);

			// Should have dispatched a turnCancelled action
			const cancelAction = agentHostService.dispatchedActions.find(d => d.action.type === 'session/turnCancelled');
			assert.ok(cancelAction, 'Should dispatch session/turnCancelled');
		});

		test('streams new text deltas into progressObs after reconnection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-stream');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString(), { streamingText: 'Before' });
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-stream' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const initialLen = (session.progressObs?.get() ?? []).length;

			// Fire a delta action to simulate the server streaming more text
			agentHostService.fireAction({
				action: { type: 'session/delta', session: sessionUri.toString(), turnId: 'turn-active', partId: 'md-active', content: ' and more' } as ISessionAction,
				serverSeq: 1,
				origin: undefined,
			});

			await timeout(10);

			const progress = session.progressObs?.get() ?? [];
			assert.ok(progress.length > initialLen, 'Should have appended new progress items');
			// The last markdown part should be the delta
			const lastMarkdown = [...progress].reverse().find(p => p.kind === 'markdownContent') as IChatMarkdownContent;
			assert.ok(lastMarkdown, 'Should have a new markdown delta');
			assert.strictEqual(lastMarkdown.content.value, ' and more');
		}));

		test('marks session complete when turn finishes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-complete');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-complete' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.isCompleteObs?.get(), false);

			// Fire turnComplete to finish the active turn
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' } as ISessionAction,
				serverSeq: 1,
				origin: undefined,
			});

			await timeout(10);

			assert.strictEqual(session.isCompleteObs?.get(), true, 'Should be complete after turnComplete');
		}));

		test('handles active turn with running tool call', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-tool');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
			sessionState.activeTurn!.responseParts.push({
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					toolCallId: 'tc-running',
					toolName: 'bash',
					displayName: 'Bash',
					invocationMessage: 'Running command',
					status: ToolCallStatus.Running,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-tool' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const toolInvocation = progress.find(p => p.kind === 'toolInvocation') as IChatToolInvocation | undefined;
			assert.ok(toolInvocation, 'Should have a live tool invocation in progress');
			assert.strictEqual(toolInvocation!.toolCallId, 'tc-running');
		});

		test('handles active turn with pending tool confirmation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-perm');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
			sessionState.activeTurn!.responseParts.push({
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					toolCallId: 'tc-pending',
					toolName: 'bash',
					displayName: 'Bash',
					invocationMessage: 'Run command',
					confirmationTitle: 'Clean up',
					toolInput: 'rm -rf /tmp/test',
					status: ToolCallStatus.PendingConfirmation,
				},
			});
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-perm' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const permInvocation = progress.find(p => p.kind === 'toolInvocation') as IChatToolInvocation | undefined;
			assert.ok(permInvocation, 'Should have a live permission request in progress');

			// Complete the turn so the awaitConfirmation promise and its internal
			// DisposableStore are cleaned up before test teardown.
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' } as ISessionAction,
				serverSeq: 1,
				origin: undefined,
			});
			await timeout(10);
		}));

		test('no active turn loads completed history only with isComplete true', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'no-active-turn');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Done', status: SessionStatus.Idle, createdAt: Date.now(), modifiedAt: Date.now() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-done',
					userMessage: { text: 'Hello' },
					responseParts: [{ kind: ResponsePartKind.Markdown as const, id: 'md-1', content: 'Hi' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/no-active-turn' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);
			assert.strictEqual(session.isCompleteObs?.get(), true);
			assert.deepStrictEqual(session.progressObs?.get(), []);
		});

		test('includes reasoning in initial progress', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-reasoning');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString(), {
				streamingText: 'text',
				reasoning: 'Let me think...',
			}));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-reasoning' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const thinking = progress.find(p => p.kind === 'thinking');
			assert.ok(thinking, 'Should have thinking progress from reasoning');
			const markdown = progress.find(p => p.kind === 'markdownContent') as IChatMarkdownContent;
			assert.ok(markdown);
			assert.strictEqual(markdown.content.value, 'text');
		});
	});

	// ---- Server-initiated turns -------------------------------------------

	suite('server-initiated turns', () => {

		test('detects server-initiated turn and fires onDidStartServerRequest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			// Create and subscribe a session
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-turn' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// First, do a normal turn so the backend session is created
			const turn1Promise = chatSession.requestHandler!(
				makeRequest({ message: 'Hello', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			// Echo + complete the first turn
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Now simulate a server-initiated turn (e.g. from a consumed queued message)
			const serverTurnId = 'server-turn-1';
			const serverRequestEvents: { prompt: string }[] = [];
			disposables.add(chatSession.onDidStartServerRequest!(e => serverRequestEvents.push(e)));

			agentHostService.fireAction({
				action: {
					type: 'session/turnStarted',
					session,
					turnId: serverTurnId,
					userMessage: { text: 'queued message text' },
				} as ISessionAction,
				serverSeq: 3,
				origin: undefined, // Server-originated — no client origin
			});

			await timeout(10);

			// onDidStartServerRequest should have fired
			assert.strictEqual(serverRequestEvents.length, 1);
			assert.strictEqual(serverRequestEvents[0].prompt, 'queued message text');

			// isCompleteObs should be false (turn in progress)
			assert.strictEqual(chatSession.isCompleteObs!.get(), false);
		}));

		test('server-initiated turn streams progress through progressObs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-progress' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// Normal turn to create backend session
			const turn1Promise = chatSession.requestHandler!(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-progress';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'auto queued' } } as ISessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Stream a response part + delta
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-srv', content: 'Hello ' } } as ISessionAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/delta', session, turnId: serverTurnId, partId: 'md-srv', content: 'world' } as ISessionAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(50);

			// Progress should be in progressObs
			const progress = chatSession.progressObs!.get();
			const markdownParts = progress.filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'Hello world');

			// Complete the turn
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as ISessionAction,
				serverSeq: 6, origin: undefined,
			});
			await timeout(10);

			assert.strictEqual(chatSession.isCompleteObs!.get(), true);
		}));

		test('disposing chat session does not call disposeSession on connection', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-1' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// Dispose the chat session (simulates user navigating away)
			chatSession.dispose();

			// disposeSession must NOT be called — the backend session should persist
			assert.strictEqual(agentHostService.disposedSessions.length, 0,
				'Disposing the UI chat session should not dispose the backend session');
		});

		test('client-dispatched turns are not treated as server-initiated', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-no-dupe' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const serverRequestEvents: { prompt: string }[] = [];
			disposables.add(chatSession.onDidStartServerRequest!(e => serverRequestEvents.push(e)));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// Normal client turn — should NOT fire onDidStartServerRequest
			const turnPromise = chatSession.requestHandler!(
				makeRequest({ message: 'Client turn', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch = agentHostService.turnActions[0];
			const action = dispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action.session, turnId: action.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.strictEqual(serverRequestEvents.length, 0, 'Client-dispatched turns should not trigger onDidStartServerRequest');
		}));

		test('server-initiated turn does not duplicate tool calls on repeated state changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-tool-dedup' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// First, do a normal turn so the backend session is created
			const turn1Promise = chatSession.requestHandler!(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-tool-dedup';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } } as ISessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Tool start + ready (auto-confirmed)
			agentHostService.fireAction({
				action: { type: 'session/toolCallStart', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', toolName: 'bash', displayName: 'Bash' } as ISessionAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/toolCallReady', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', invocationMessage: 'Running Bash', confirmed: 'not-needed' } as ISessionAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(50);

			// Tool complete
			agentHostService.fireAction({
				action: { type: 'session/toolCallComplete', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', result: { success: true, pastTenseMessage: 'Ran Bash' } } as ISessionAction,
				serverSeq: 6, origin: undefined,
			});
			await timeout(50);

			// Fire additional state changes that might cause re-processing
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-after', content: 'Done.' } } as ISessionAction,
				serverSeq: 7, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as ISessionAction,
				serverSeq: 8, origin: undefined,
			});
			await timeout(50);

			// Count tool invocations in progressObs — should be exactly 1
			const progress = chatSession.progressObs!.get();
			const toolInvocations = progress.filter(p => p.kind === 'toolInvocation');
			assert.strictEqual(toolInvocations.length, 1, 'Tool call should not be duplicated');
		}));

		test('server-initiated turn picks up markdown arriving with turnStarted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-server-md-initial' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			// First, do a normal turn so the backend session is created
			const turn1Promise = chatSession.requestHandler!(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as ISessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Fire turnStarted followed immediately by a response part.
			// In production, these can arrive in rapid succession from the
			// WebSocket, and the immediate reconciliation in
			// _trackServerTurnProgress ensures content already in the state
			// is not missed.
			const serverTurnId = 'server-turn-md-initial';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } } as ISessionAction,
				serverSeq: 3, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-init', content: 'Initial text' } } as ISessionAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(50);

			// The markdown should appear in progressObs
			const progress = chatSession.progressObs!.get();
			const markdownParts = progress.filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'Initial text', 'Markdown arriving with/right after turnStarted should be picked up');

			// Complete the turn
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as ISessionAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(10);

			assert.strictEqual(chatSession.isCompleteObs!.get(), true);
		}));
	});

	// ---- Customizations dispatch ------------------------------------------

	suite('customizations', () => {

		test('dispatches activeClientChanged when a new session is created', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const customizations = observableValue<ICustomizationRef[]>('customizations', [
				{ uri: 'file:///plugin-a', displayName: 'Plugin A' },
			]);

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
				customizations,
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			const activeClientAction = agentHostService.dispatchedActions.find(
				d => d.action.type === 'session/activeClientChanged'
			);
			assert.ok(activeClientAction, 'should dispatch activeClientChanged');
			const ac = activeClientAction!.action as { activeClient: { customizations?: ICustomizationRef[] } };
			assert.strictEqual(ac.activeClient.customizations?.length, 1);
			assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-a');
		});

		test('re-dispatches activeClientChanged when customizations observable changes', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const customizations = observableValue<ICustomizationRef[]>('customizations', []);

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
				customizations,
			}));

			// Create a session first
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as ISessionAction);
			await turnPromise;

			agentHostService.dispatchedActions.length = 0;

			// Update customizations
			customizations.set([
				{ uri: 'file:///plugin-b', displayName: 'Plugin B' },
			], undefined);

			const activeClientAction = agentHostService.dispatchedActions.find(
				d => d.action.type === 'session/activeClientChanged'
			);
			assert.ok(activeClientAction, 'should re-dispatch activeClientChanged on change');
			const ac = activeClientAction!.action as { activeClient: { customizations?: ICustomizationRef[] } };
			assert.strictEqual(ac.activeClient.customizations?.length, 1);
			assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-b');
		});
	});
});
