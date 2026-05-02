/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ISettableObservable, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentCreateSessionConfig, IAgentHostService, IAgentSessionMetadata, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification, type IToolCallConfirmedAction, type ITurnStartedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IStateSnapshot } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import type { CustomizationRef } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, SessionLifecycle, SessionStatus, TurnState, ToolCallStatus, ToolCallConfirmationReason, createSessionState, createActiveTurn, ROOT_STATE_URI, PolicyState, ResponsePartKind, StateComponents, buildSubagentSessionUri, ToolResultContentType, type SessionState, type SessionSummary, RootState, type ToolCallState, type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatService, IChatMarkdownContent, IChatProgress, IChatTerminalToolInvocationData, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostContribution, AgentHostSessionListController, AgentHostSessionHandler, getAgentHostBranchNameHint } from '../../../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';

// ---- Mock agent host service ------------------------------------------------

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;
	override readonly onAgentHostExit = Event.None;
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', false);
	override readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	override setAuthenticationPending(pending: boolean): void {
		this._authenticationPending.set(pending, undefined);
	}

	// Track live subscriptions so fireAction can route to them
	private readonly _liveSubscriptions = new Map<string, { state: SessionState; emitter: Emitter<SessionState>; onWillApply: Emitter<ActionEnvelope>; onDidApply: Emitter<ActionEnvelope> }>();

	private _nextId = 1;
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public createSessionCalls: IAgentCreateSessionConfig[] = [];
	public disposedSessions: URI[] = [];
	public agents = [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', requiresAuth: true }];

	/**
	 * If set, the next {@link createSession} call seeds the session summary's
	 * `workingDirectory` to this URI instead of echoing back
	 * `config.workingDirectory`. Used to simulate the server resolving the
	 * working directory to a worktree path that differs from the requested
	 * directory.
	 */
	public nextResolvedWorkingDirectory?: URI;

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (config) {
			this.createSessionCalls.push(config);
		}
		const session = config?.session ?? AgentSession.uri('copilot', `sdk-session-${this._nextId++}`);
		const id = AgentSession.id(session);
		this._sessions.set(id, { session, startTime: Date.now(), modifiedTime: Date.now() });
		// Simulate the server's eager active-client claim: if the caller
		// provided activeClient, seed the session state so subscribers see it.
		if (config?.activeClient) {
			const summary: SessionSummary = {
				resource: session.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: (this.nextResolvedWorkingDirectory ?? config.workingDirectory)?.toString(),
			};
			const state: SessionState = {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeClient: config.activeClient,
			};
			this.sessionStates.set(session.toString(), state);
		}
		this.nextResolvedWorkingDirectory = undefined;
		return session;
	}

	override async disposeSession(session: URI): Promise<void> { this.disposedSessions.push(session); }
	async shutdown(): Promise<void> { }
	override async restartAgentHost(): Promise<void> { }

	// Protocol methods
	public override readonly clientId = 'test-window-1';
	public dispatchedActions: { action: SessionAction | TerminalAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];

	/** Returns dispatched actions filtered to turn-related types only
	 *  (excludes lifecycle actions like activeClientChanged). */
	get turnActions() {
		return this.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
	}
	public sessionStates = new Map<string, SessionState>();
	async subscribe(resource: URI): Promise<IStateSnapshot> {
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
		const summary: SessionSummary = {
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
	unsubscribe(_resource: URI): void { }
	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ action, clientId, clientSeq });
	}
	private _nextSeq = 1;
	nextClientSeq(): number {
		return this._nextSeq++;
	}

	private _rootStateValue: RootState | undefined = undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();

	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const onDidChangeEmitter = this._rootStateOnDidChange;
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: onDidChangeEmitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	/** Test helper: set rootState value and fire onDidChange. */
	setRootState(state: RootState): void {
		this._rootStateValue = state;
		this._rootStateOnDidChange.fire(state);
	}

	public authenticateCalls: { resource: string; token: string }[] = [];
	override async authenticate(params: { resource: string; token: string }): Promise<{ authenticated: boolean }> {
		this.authenticateCalls.push({ resource: params.resource, token: params.token });
		return { authenticated: true };
	}
	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const resourceStr = resource.toString();
		const emitter = new Emitter<T>();
		const onWillApply = new Emitter<ActionEnvelope>();
		const onDidApply = new Emitter<ActionEnvelope>();

		// Hydrate synchronously with a default state
		const existingState = this.sessionStates.get(resourceStr);
		let initialState: SessionState;
		if (existingState) {
			initialState = existingState;
		} else {
			const summary: SessionSummary = {
				resource: resourceStr,
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
			initialState = { ...createSessionState(summary), lifecycle: SessionLifecycle.Ready };
		}

		// Register in live subscriptions so fireAction can route to it
		const entry = { state: initialState, emitter: emitter as unknown as Emitter<SessionState>, onWillApply, onDidApply };
		this._liveSubscriptions.set(resourceStr, entry);

		const self = this;
		const sub: IAgentSubscription<T> = {
			get value() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
			get verifiedValue() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
			onDidChange: emitter.event,
			onWillApplyAction: entry.onWillApply.event,
			onDidApplyAction: entry.onDidApply.event,
		};
		return {
			object: sub,
			dispose: () => {
				this._liveSubscriptions.delete(resourceStr);
				emitter.dispose();
				onWillApply.dispose();
				onDidApply.dispose();
			},
		};
	}
	override getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		const entry = this._liveSubscriptions.get(resource.toString());
		if (!entry) {
			return undefined;
		}
		const self = this;
		return {
			get value() { return self._liveSubscriptions.get(resource.toString())?.state as unknown as T; },
			get verifiedValue() { return self._liveSubscriptions.get(resource.toString())?.state as unknown as T; },
			onDidChange: entry.emitter.event as unknown as Event<T>,
			onWillApplyAction: entry.onWillApply.event,
			onDidApplyAction: entry.onDidApply.event,
		} satisfies IAgentSubscription<T>;
	}
	override dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ action, clientId: this.clientId, clientSeq: this._nextSeq++ });
		// Apply state-management actions optimistically so state-dependent
		// logic (e.g. customization re-dispatch) sees the correct activeClient.
		// Turn lifecycle actions (turnStarted, toolCallConfirmed, etc.) are applied
		// later via fireAction when the server echoes them back.
		if (isSessionAction(action) && action.type === 'session/activeClientChanged') {
			const entry = this._liveSubscriptions.get(action.session);
			if (entry) {
				const noop = () => { };
				entry.state = sessionReducer(entry.state, action as Parameters<typeof sessionReducer>[1], noop);
				entry.emitter.fire(entry.state);
			}
		}
	}

	// Test helpers
	fireAction(envelope: ActionEnvelope): void {
		this._onDidAction.fire(envelope);
		// Route action to matching live subscriptions
		if (isSessionAction(envelope.action)) {
			const sessionUri = envelope.action.session;
			const entry = this._liveSubscriptions.get(sessionUri);
			if (entry) {
				const noop = () => { };
				entry.onWillApply.fire(envelope);
				entry.state = sessionReducer(entry.state, envelope.action as Parameters<typeof sessionReducer>[1], noop);
				entry.emitter.fire(entry.state);
				entry.onDidApply.fire(envelope);
			}
		}
	}

	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(AgentSession.id(meta.session), meta);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._rootStateOnDidChange.dispose();
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

class MockChatWidgetService extends mock<IChatWidgetService>() {
	declare readonly _serviceBrand: undefined;

	readonly clearQuestionCarouselCalls: { sessionResource: URI; responseId: string | undefined; resolveId: string | undefined }[] = [];
	private readonly _widgets = new Map<string, ReturnType<IChatWidgetService['getWidgetBySessionResource']>>();

	setWidgetForSession(sessionResource: URI): void {
		// eslint-disable-next-line local/code-no-any-casts
		this._widgets.set(sessionResource.toString(), {
			input: {
				clearQuestionCarousel: (responseId?: string, resolveId?: string) => {
					this.clearQuestionCarouselCalls.push({ sessionResource, responseId, resolveId });
				},
			},
		} as any);
	}

	override getWidgetBySessionResource(sessionResource: URI): ReturnType<IChatWidgetService['getWidgetBySessionResource']> {
		return this._widgets.get(sessionResource.toString());
	}
}

// ---- Helpers ----------------------------------------------------------------

function createTestServices(disposables: DisposableStore, workingDirectoryResolver?: { resolve(sessionResource: URI): URI | undefined; isNewSession?: (sessionResource: URI) => boolean }, authServiceOverride?: Partial<IAuthenticationService>) {
	const instantiationService = disposables.add(new TestInstantiationService());

	const agentHostService = new MockAgentHostService();
	disposables.add(toDisposable(() => agentHostService.dispose()));

	const chatAgentService = new MockChatAgentService();
	const chatWidgetService = new MockChatWidgetService();

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IProductService, { quality: 'insider' });
	instantiationService.stub(IChatAgentService, chatAgentService);
	instantiationService.stub(IChatWidgetService, chatWidgetService);
	instantiationService.stub(IFileService, TestFileService);
	instantiationService.stub(ILabelService, MockLabelService);
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionItemController: () => toDisposable(() => { }),
		registerChatSessionContentProvider: () => toDisposable(() => { }),
		registerChatSessionContribution: () => toDisposable(() => { }),
	});
	instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
	instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None, ...authServiceOverride });
	instantiationService.stub(ILanguageModelsService, {
		deltaLanguageModelChatProviderDescriptors: () => { },
		registerLanguageModelProvider: () => toDisposable(() => { }),
	});
	instantiationService.stub(IConfigurationService, {
		onDidChangeConfiguration: Event.None,
		getValue: (...args: any[]) => typeof args[0] === 'string' && args[0] === 'chat.agentHost.clientTools' ? [] : true,
	});
	instantiationService.stub(ILanguageModelToolsService, {
		observeTools: () => observableValue('tools', []),
		onDidChangeTools: Event.None,
		getTools: () => [],
		_serviceBrand: undefined,
	});
	instantiationService.stub(IOutputService, { getChannel: () => undefined });
	instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null });
	instantiationService.stub(IChatEditingService, {
		registerEditingSessionProvider: () => toDisposable(() => { }),
	});
	const chatService = {
		getSession: () => undefined,
		onDidCreateModel: Event.None,
		removePendingRequestCalls: [] as { sessionResource: URI; requestId: string }[],
		removePendingRequest(sessionResource: URI, requestId: string) {
			this.removePendingRequestCalls.push({ sessionResource, requestId });
		},
	};
	instantiationService.stub(IChatService, chatService);
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
	instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;

		override async listPromptFilesForStorage() {
			return [];
		}
	}());
	instantiationService.stub(ITerminalChatService, {
		onDidContinueInBackground: Event.None,
		registerTerminalInstanceWithToolSession: () => { },
		getAhpCommandSource: () => undefined,
	});
	instantiationService.stub(IAgentHostTerminalService, {
		reviveTerminal: async () => undefined!,
		createTerminalForEntry: async () => undefined,
		profiles: observableValue('test', []),
		getProfileForConnection: () => undefined,
		registerEntry: () => ({ dispose() { } }),
	});
	instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, {
		registerResolver: () => toDisposable(() => { }),
		resolve: sessionResource => workingDirectoryResolver?.resolve(sessionResource),
		isNewSession: sessionResource => workingDirectoryResolver?.isNewSession?.(sessionResource) ?? sessionResource.path.substring(1).startsWith('new-'),
	});
	instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false } as Partial<IWorkbenchEnvironmentService>);

	return { instantiationService, agentHostService, chatAgentService, chatWidgetService, chatService };
}

function createContribution(disposables: DisposableStore, opts?: { authServiceOverride?: Partial<IAuthenticationService>; workingDirectoryResolver?: { resolve(sessionResource: URI): URI | undefined; isNewSession?: (sessionResource: URI) => boolean } }) {
	const { instantiationService, agentHostService, chatAgentService, chatWidgetService, chatService } = createTestServices(disposables, opts?.workingDirectoryResolver, opts?.authServiceOverride);

	const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined, 'local'));
	const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
		provider: 'copilot' as const,
		agentId: 'agent-host-copilot',
		sessionType: 'agent-host-copilot',
		fullName: 'Agent Host - Copilot',
		description: 'Copilot SDK agent running in a dedicated process',
		connection: agentHostService,
		connectionAuthority: 'local',
		isNewSession: sessionResource => listController.isNewSession(sessionResource),
	}));
	const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));

	return { contribution, listController, sessionHandler, agentHostService, chatAgentService, chatWidgetService, chatService };
}

function makeRequest(overrides: Partial<{ message: string; sessionResource: URI; variables: IChatAgentRequest['variables']; userSelectedModelId: string; modelConfiguration: Record<string, unknown>; agentHostSessionConfig: Record<string, string>; agentId: string }> = {}): IChatAgentRequest {
	return upcastPartial<IChatAgentRequest>({
		sessionResource: overrides.sessionResource ?? URI.from({ scheme: 'untitled', path: '/chat-1' }),
		requestId: 'req-1',
		agentId: overrides.agentId ?? 'agent-host-copilot',
		message: overrides.message ?? 'Hello',
		variables: overrides.variables ?? { variables: [] },
		location: ChatAgentLocation.Chat,
		userSelectedModelId: overrides.userSelectedModelId,
		modelConfiguration: overrides.modelConfiguration,
		agentHostSessionConfig: overrides.agentHostSessionConfig,
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
 * invokes the agent (non-blocking), and waits for the first action
 * to be dispatched. Returns helpers to fire server action envelopes.
 */
async function startTurn(
	sessionHandler: AgentHostSessionHandler,
	agentHostService: MockAgentHostService,
	chatAgentService: MockChatAgentService,
	ds: DisposableStore,
	overrides?: Partial<{
		message: string;
		sessionResource: URI;
		variables: IChatAgentRequest['variables'];
		userSelectedModelId: string;
		modelConfiguration: Record<string, unknown>;
		agentHostSessionConfig: Record<string, string>;
		cancellationToken: CancellationToken;
		agentId: string;
	}>,
) {
	const agentId = overrides?.agentId ?? 'agent-host-copilot';
	const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: agentId, path: '/new-turntest' });
	const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
	ds.add(toDisposable(() => chatSession.dispose()));

	// Clear any lifecycle actions (e.g. activeClientChanged from customization setup)
	// so tests only see turn-related dispatches.
	agentHostService.dispatchedActions.length = 0;

	const collected: IChatProgress[][] = [];
	const seq = { v: 1 };

	const registered = chatAgentService.registeredAgents.get(agentId);
	assert.ok(registered, `${agentId} agent should be registered`);

	const turnPromise = registered.impl.invoke(
		makeRequest({
			message: overrides?.message ?? 'Hello',
			sessionResource,
			variables: overrides?.variables,
			userSelectedModelId: overrides?.userSelectedModelId,
			modelConfiguration: overrides?.modelConfiguration,
			agentHostSessionConfig: overrides?.agentHostSessionConfig,
			agentId,
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

	const fire = (action: SessionAction) => {
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

async function startDynamicAgentTurn(
	chatAgentService: MockChatAgentService,
	agentHostService: MockAgentHostService,
	agentId: string,
	overrides?: Partial<{
		message: string;
		sessionResource: URI;
		variables: IChatAgentRequest['variables'];
		userSelectedModelId: string;
		agentHostSessionConfig: Record<string, string>;
		cancellationToken: CancellationToken;
	}>,
) {
	const registered = chatAgentService.registeredAgents.get(agentId);
	assert.ok(registered);
	const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: agentId, path: '/new-turntest' });
	const collected: IChatProgress[][] = [];
	const seq = { v: 1 };

	agentHostService.dispatchedActions.length = 0;
	const turnPromise = registered.impl.invoke(
		makeRequest({
			message: overrides?.message ?? 'Hello',
			sessionResource,
			variables: overrides?.variables,
			userSelectedModelId: overrides?.userSelectedModelId,
			agentHostSessionConfig: overrides?.agentHostSessionConfig,
			agentId,
		}),
		parts => collected.push(parts),
		[],
		overrides?.cancellationToken ?? CancellationToken.None,
	);

	await timeout(10);

	const turnDispatches = agentHostService.dispatchedActions.filter(d => d.action.type === 'session/turnStarted');
	const lastDispatch = turnDispatches[turnDispatches.length - 1] ?? agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
	const session = (lastDispatch?.action as ITurnStartedAction)?.session;
	const turnId = (lastDispatch?.action as ITurnStartedAction)?.turnId;
	const fire = (action: SessionAction) => {
		agentHostService.fireAction({ action, serverSeq: seq.v++, origin: undefined });
	};

	if (lastDispatch) {
		agentHostService.fireAction({
			action: lastDispatch.action,
			serverSeq: seq.v++,
			origin: { clientId: agentHostService.clientId, clientSeq: lastDispatch.clientSeq },
		});
	}

	return { turnPromise, collected, session, turnId, fire };
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

	// ---- Session disposal -----------------------------------------------

	suite('disposal', () => {

		test('fires onWillDispose before session is disposed', async () => {
			const { sessionHandler } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/dispose-test' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// `onWillDispose` is consumed by `ContributedChatSessionData` in
			// `ChatSessionsService` to evict disposed sessions from its cache.
			// If this event does not fire (e.g. because the emitter was
			// disposed before `.fire()` ran during teardown), the service
			// would hand out the disposed `IChatSession` to subsequent
			// `getOrCreateChatSession` callers.
			let fired = 0;
			disposables.add(chatSession.onWillDispose(() => { fired++; }));

			chatSession.dispose();

			assert.strictEqual(fired, 1, 'onWillDispose should fire exactly once when the session is disposed');
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

		test('refresh marks archived sessions as archived items', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({
				session: AgentSession.uri('copilot', 'archived'),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'Archived session',
				isArchived: true,
			});

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 1);
			assert.strictEqual(listController.items[0].archived, true);
		});

		test('refresh skips listSessions RPC after first successful call', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => { listCalls++; return originalListSessions(); };

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 1);

			// Subsequent refresh should not re-fetch — the cache is kept in
			// sync via notify/sessionAdded etc.
			await listController.refresh(CancellationToken.None);
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 1);
		});

		test('refresh retries listSessions if the first call failed', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => {
				listCalls++;
				if (listCalls === 1) {
					throw new Error('fail');
				}
				return originalListSessions();
			};

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 0);

			// Failure must not mark the cache valid; the next refresh retries.
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 2);
			assert.strictEqual(listController.items.length, 1);
		});

		test('agent host restart invalidates cache so next refresh re-fetches', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'Before restart' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => { listCalls++; return originalListSessions(); };

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);

			// Subsequent refresh uses cache — no new RPC.
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);

			// Directly resetting the cache (as onAgentHostStart does) must cause
			// the next refresh to re-fetch.
			listController.resetCache();

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 2);
		});

		test('newChatSessionItem creates final-looking resource used for requested backend session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { listController, sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const item = await listController.newChatSessionItem({ prompt: 'Hello from controller' }, CancellationToken.None);
			assert.ok(item);
			assert.strictEqual(item.resource.scheme, 'agent-host-copilot');
			assert.ok(!item.resource.path.substring(1).startsWith('untitled-'));
			assert.strictEqual(listController.isNewSession(item.resource), true);
			assert.strictEqual(listController.items.some(existing => existing.resource.toString() === item.resource.toString()), false);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hello from controller',
				sessionResource: item.resource,
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].session?.toString(), AgentSession.uri('copilot', item.resource.path.substring(1)).toString());

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listController.isNewSession(item.resource), false);
			assert.strictEqual(listController.items.some(existing => existing.resource.toString() === item.resource.toString()), true);
		}));
	});

	// ---- Session ID resolution in _invokeAgent --------------------------

	suite('session ID resolution', () => {

		test('requests backend session for provider-owned new resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { message: 'Hello' });
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual(agentHostService.turnActions[0].action.type, 'session/turnStarted');
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).userMessage.text, 'Hello');
			assert.strictEqual(AgentSession.id(URI.parse(session)), 'new-turntest');
		}));

		test('reuses SDK session for same resource on second message', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/new-reuse' });
			const chatSession = await sessionHandler.provideChatSessionContent(resource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First turn
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'First', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			// Echo the turnStarted to clear pending write-ahead
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action1.session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Second turn
			const turn2Promise = registered.impl.invoke(
				makeRequest({ message: 'Second', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch2 = agentHostService.turnActions[1];
			const action2 = dispatch2.action as ITurnStartedAction;
			agentHostService.fireAction({ action: dispatch2.action, serverSeq: 3, origin: { clientId: agentHostService.clientId, clientSeq: dispatch2.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action2.session, turnId: action2.turnId } as SessionAction, serverSeq: 4, origin: undefined });
			await turn2Promise;

			assert.strictEqual(agentHostService.turnActions.length, 2);
			assert.strictEqual(
				(agentHostService.turnActions[0].action as ITurnStartedAction).session.toString(),
				(agentHostService.turnActions[1].action as ITurnStartedAction).session.toString(),
			);
		}));

		test('uses sessionId from agent-host scheme resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-42' }),
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(AgentSession.id(URI.parse(session)), 'existing-session-42');
		}));

		test('rejects generic contributed-chat untitled resource', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			await assert.rejects(
				() => sessionHandler.provideChatSessionContent(URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc123' }), CancellationToken.None),
				/created by the sessions provider/
			);
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
			assert.strictEqual(chatAgentService.registeredAgents.has('agent-host-copilot'), true);
		});
		test('passes raw model id extracted from language model identifier', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'claude-sonnet-4-20250514' });
		}));

		test('passes selected model configuration through create session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
				modelConfiguration: { thinkingLevel: 'high', ignored: 1 },
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'claude-sonnet-4-20250514', config: { thinkingLevel: 'high' } });
		}));

		test('passes model id as-is when no vendor prefix', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'gpt-4o',
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'gpt-4o' });
		}));

		test('does not create backend session eagerly for untitled sessions', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-deferred' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			// No backend session should have been created yet
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
		});
	});

	// ---- Progress event → chat progress conversion ----------------------

	suite('progress routing', () => {

		test('delta events become markdownContent progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'hello ' } } as SessionAction);
			fire({ type: 'session/delta', session, turnId, partId: 'md-1', content: 'world' } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			// Events may be coalesced by the throttler, so check total content
			const markdownParts = collected.flat().filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'hello world');
		}));

		test('live turn marks chat session complete after turnComplete', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, chatSession, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(chatSession.isCompleteObs?.get(), true, 'should be complete after turn finishes');
		}));

		test('tool_start events become toolInvocation progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-1', toolName: 'read_file', displayName: 'Read File' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-1', invocationMessage: 'Reading file', confirmed: 'not-needed' } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('tool_complete event transitions toolInvocation to completed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-2', toolName: 'bash', displayName: 'Bash' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-2', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-2',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(invocation.toolCallId, 'tc-2');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('tool_complete with failure sets error state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-3', toolName: 'bash', displayName: 'Bash' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-3', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-3',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found' }], error: { message: 'command not found' } },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('malformed toolArguments does not throw', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-bad', toolName: 'bash', displayName: 'Bash' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-bad', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('outstanding tool invocations are completed on idle', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// tool_start without tool_complete
			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-orphan', toolName: 'bash', displayName: 'Bash' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-orphan', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('events from other sessions are ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Delta from a different session — will be ignored (session not subscribed)
			agentHostService.fireAction({
				action: { type: 'session/delta', session: AgentSession.uri('copilot', 'other-session').toString(), turnId, partId: 'md-other', content: 'wrong' } as SessionAction,
				serverSeq: 100,
				origin: undefined,
			});
			fire({ type: 'session/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'right' } } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual((collected[0][0] as IChatMarkdownContent).content.value, 'right');
		}));

		test('input request completion from another client clears local question carousel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.SessionInputRequested,
				session,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: SessionInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}, {
						kind: SessionInputQuestionKind.SingleSelect,
						id: 'question-2',
						message: 'Which color?',
						options: [{ id: 'blue', label: 'Blue' }],
					}],
				},
			});
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');
			assert.strictEqual(carousel.resolveId, 'input-1');

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.SessionInputCompleted,
				session,
				requestId: 'input-1',
				response: SessionInputResponseKind.Accept,
				answers: {
					'question-1': {
						state: SessionInputAnswerState.Submitted,
						value: { kind: SessionInputAnswerValueKind.Text, value: 'from another client' },
					},
					'question-2': {
						state: SessionInputAnswerState.Submitted,
						value: { kind: SessionInputAnswerValueKind.Selected, value: 'blue', freeformValues: ['cerulean'] },
					},
				},
			});
			await timeout(10);

			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'input-1' },
			]);
			assert.strictEqual(carousel.isUsed, true);
			assert.deepStrictEqual(carousel.data, {
				'question-1': 'from another client',
				'question-2': { selectedValue: 'blue', freeformValue: 'cerulean' },
			});
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');
			assert.deepStrictEqual((await carousel.completion.p).answers, {
				'question-1': 'from another client',
				'question-2': { selectedValue: 'blue', freeformValue: 'cerulean' },
			});
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.SessionInputCompleted), false);

			fire({ type: ActionType.SessionTurnComplete, session, turnId });
			await turnPromise;
		}));

		test('input request completion echo applies authoritative answers after local submit', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-local-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.SessionInputRequested,
				session,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: SessionInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}],
				},
			});
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');

			const submittedAnswers = { 'question-1': 'local answer' };
			carousel.data = submittedAnswers;
			carousel.isUsed = true;
			carousel.completion.complete({ answers: submittedAnswers });
			await timeout(10);

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.SessionInputCompleted,
				session,
				requestId: 'input-1',
				response: SessionInputResponseKind.Accept,
				answers: {
					'question-1': {
						state: SessionInputAnswerState.Submitted,
						value: { kind: SessionInputAnswerValueKind.Text, value: 'accepted answer' },
					},
				},
			});
			await timeout(10);

			assert.deepStrictEqual(carousel.data, { 'question-1': 'accepted answer' });
			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls, []);
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.SessionInputCompleted), false);

			fire({ type: ActionType.SessionTurnComplete, session, turnId });
			await turnPromise;
		}));

		test('input request cancellation does not show draft answers as submitted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-cancelled-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.SessionInputRequested,
				session,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: SessionInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}],
					answers: {
						'question-1': {
							state: SessionInputAnswerState.Draft,
							value: { kind: SessionInputAnswerValueKind.Text, value: 'draft answer' },
						},
					},
				},
			});
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.SessionInputCompleted,
				session,
				requestId: 'input-1',
				response: SessionInputResponseKind.Cancel,
			});
			await timeout(10);

			assert.strictEqual(carousel.isUsed, true);
			assert.deepStrictEqual(carousel.data, {});
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');
			assert.strictEqual((await carousel.completion.p).answers, undefined);
			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'input-1' },
			]);
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.SessionInputCompleted), false);

			fire({ type: ActionType.SessionTurnComplete, session, turnId });
			await turnPromise;
		}));
	});

	// ---- Cancellation -----------------------------------------------------

	suite('cancellation', () => {

		test('cancellation resolves the agent invoke', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
		}));

		test('cancellation force-completes outstanding tool invocations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-cancel', toolName: 'bash', displayName: 'Bash' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-cancel', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);

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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			// Cancellation now dispatches session/turnCancelled action
			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'session/turnCancelled'));
		}));

		test('cancellation marks chat session complete', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, chatSession } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			assert.strictEqual(chatSession.isCompleteObs?.get(), true, 'chat session should be marked complete after cancellation');
		}));

		test('cancellation after natural completion does not dispatch turnCancelled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			// Turn completes naturally on its own.
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			// Now the request's cancellation token fires (e.g. ChatService
			// cancelling a long-disposed token, or a stale 'stop' click). We
			// must NOT dispatch turnCancelled for an already-finished turn.
			const beforeCancelCount = agentHostService.dispatchedActions.filter(a => a.action.type === 'session/turnCancelled').length;
			cts.cancel();
			const afterCancelCount = agentHostService.dispatchedActions.filter(a => a.action.type === 'session/turnCancelled').length;
			assert.strictEqual(afterCancelCount, beforeCancelCount, 'turnCancelled should not be dispatched after natural completion');
		}));
	});

	// ---- Error events -------------------------------------------------------

	suite('error events', () => {

		test('error event renders error message and finishes the request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			agentHostService.fireAction({
				action: {
					type: 'session/error',
					session,
					turnId,
					error: { errorType: 'test_error', message: 'Something went wrong' },
				} as SessionAction,
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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Simulate a tool call requiring confirmation via toolCallStart + toolCallReady
			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-1', toolName: 'shell', displayName: 'Shell' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-1',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as SessionAction);

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

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;
		}));

		test('permission_request denied when user skips', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-2', toolName: 'write', displayName: 'Write File' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-2',
				invocationMessage: 'Write to /tmp/test.txt',
			} as SessionAction);

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

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;
		}));

		test('shell permission shows input-style confirmation data with toolInput', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-shell', toolName: 'shell', displayName: 'Shell' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-shell',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as SessionAction);

			await timeout(10);
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			assert.strictEqual(permInvocation.toolSpecificData?.kind, 'input');
			const inputData = permInvocation.toolSpecificData as IChatToolInputInvocationData;
			assert.deepStrictEqual(inputData.rawInput, { input: 'echo hello' });

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;
		}));

		test('read permission shows input-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-perm-read', toolName: 'read_file', displayName: 'Read File' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-perm-read',
				invocationMessage: 'Read file contents', toolInput: '/workspace/file.ts',
			} as SessionAction);

			await timeout(10);
			const permInvocation = collected[0][0] as IChatToolInvocation;

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;
		}));

		test('local confirmation does not race with pending tc.status: no spurious re-confirm before server echo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Regression for a bug where the per-tool-call autorun read both
			// `part$` AND `invocation.state` and used a state-comparison check
			// to detect Running → PendingConfirmation re-confirmation. After
			// the user locally confirmed, `invocation.state` flipped to
			// `Executing` while `tc.status` was still `PendingConfirmation`
			// (server hadn't echoed yet), and the autorun spuriously emitted
			// a third confirmation invocation and dispatched a duplicate
			// `session/toolCallConfirmed`. The fix detects re-confirmation
			// from a `tc.status` *transition*, not from invocation-state
			// comparison.
			//
			// Baseline (bug-free) flow for a tool needing initial confirmation:
			//   toolCallStart      → emit placeholder invocation (count=1)
			//   toolCallReady      → status: Streaming → PendingConfirmation,
			//                        settle placeholder, emit confirm invocation (count=2)
			//   user confirms      → invocation.state: WaitingForConfirmation → Executing
			//                        (count must NOT change — this is the regression)
			//   server echoes      → tc.status: PendingConfirmation → Running (count=2)
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-race', toolName: 'shell', displayName: 'Shell' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-race',
				invocationMessage: 'echo hi', toolInput: 'echo hi',
			} as SessionAction);
			await timeout(10);

			const beforeConfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			const permInvocation = beforeConfirm[beforeConfirm.length - 1];
			assert.strictEqual(permInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);

			// User confirms locally. This synchronously flips the invocation
			// state from WaitingForConfirmation → Executing. The buggy
			// autorun would re-fire here (because invocation.state was a
			// dependency) and, finding tc.status still PendingConfirmation,
			// spuriously emit yet another confirmation invocation.
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			const afterLocalConfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			assert.strictEqual(afterLocalConfirm.length, beforeConfirm.length, 'no spurious invocation should be emitted by local confirm before server echoes');

			// Exactly one toolCallConfirmed dispatch (with approved: true).
			const confirmedDispatches = agentHostService.dispatchedActions.filter(a => {
				if (a.action.type !== 'session/toolCallConfirmed') {
					return false;
				}
				const action = a.action as IToolCallConfirmedAction;
				return action.toolCallId === 'tc-race';
			});
			assert.strictEqual(confirmedDispatches.length, 1, 'exactly one session/toolCallConfirmed should be dispatched');
			assert.strictEqual((confirmedDispatches[0].action as IToolCallConfirmedAction).approved, true);

			// Echo the confirmation so the reducer transitions tc → Running,
			// then complete the turn cleanly.
			agentHostService.fireAction({
				action: confirmedDispatches[0].action,
				serverSeq: 100,
				origin: { clientId: agentHostService.clientId, clientSeq: confirmedDispatches[0].clientSeq },
			});
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-race',
				result: { success: true, pastTenseMessage: 'Ran echo hi', content: [{ type: 'text', text: 'hi\n' }] },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			// Final invariant: still the same number of invocations as right
			// after toolCallReady — no extra invocations from the server echo
			// or completion either.
			const finalInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			assert.strictEqual(finalInvocations.length, beforeConfirm.length, 'no extra invocations across the full turn');
		}));

		test('genuine re-confirmation (Running → PendingConfirmation) emits a fresh confirmation invocation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Companion to the regression test above: the *legitimate* case
			// where the server bounces a tool call back to PendingConfirmation
			// (e.g. result confirmation after an edit). Here we DO want a
			// fresh invocation and a second `session/toolCallConfirmed`
			// dispatch.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-recon', toolName: 'shell', displayName: 'Shell' } as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-recon',
				invocationMessage: 'echo hi', toolInput: 'echo hi',
			} as SessionAction);
			await timeout(10);

			const firstInvocation = (collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[]).pop()!;
			assert.strictEqual(firstInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);

			IChatToolInvocation.confirmWith(firstInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			// Echo the confirmation so tc transitions PendingConfirmation → Running.
			const firstConfirm = agentHostService.dispatchedActions.find(a => {
				if (a.action.type !== 'session/toolCallConfirmed') {
					return false;
				}
				return (a.action as IToolCallConfirmedAction).toolCallId === 'tc-recon';
			})!;
			agentHostService.fireAction({
				action: firstConfirm.action,
				serverSeq: 100,
				origin: { clientId: agentHostService.clientId, clientSeq: firstConfirm.clientSeq },
			});
			await timeout(10);

			const invocationCountAfterRunning = collected.flat().filter(p => p.kind === 'toolInvocation').length;

			// Server bounces the call back to PendingConfirmation via a
			// second `toolCallReady` without `confirmed`. The reducer
			// transitions Running → PendingConfirmation.
			fire({
				type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-recon',
				invocationMessage: 'Confirm execution', toolInput: 'echo hi',
			} as SessionAction);
			await timeout(10);

			// We now expect a *fresh* invocation in WaitingForConfirmation.
			const invocationsAfterReconfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			assert.strictEqual(invocationsAfterReconfirm.length, invocationCountAfterRunning + 1, 'a fresh invocation should be emitted on Running → PendingConfirmation transition');
			const reconfirmInvocation = invocationsAfterReconfirm[invocationsAfterReconfirm.length - 1];
			assert.strictEqual(reconfirmInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
			assert.notStrictEqual(reconfirmInvocation, firstInvocation);

			// User confirms the re-confirmation; expect a second toolCallConfirmed dispatch.
			IChatToolInvocation.confirmWith(reconfirmInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			const allConfirms = agentHostService.dispatchedActions.filter(a => {
				if (a.action.type !== 'session/toolCallConfirmed') {
					return false;
				}
				return (a.action as IToolCallConfirmedAction).toolCallId === 'tc-recon';
			});
			assert.strictEqual(allConfirms.length, 2, 'two toolCallConfirmed dispatches expected (initial + reconfirmation)');

			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-recon',
				result: { success: true, pastTenseMessage: 'Done', content: [{ type: 'text', text: 'hi\n' }] },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
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

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-xyz' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 0);
		});
	});

	// ---- Tool invocation rendering -----------------------------------------

	suite('tool invocation rendering', () => {

		test('bash tool renders as terminal command block with output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-shell', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-shell', invocationMessage: 'Running `echo hello`', toolInput: 'echo hello', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-shell',
				result: { success: true, pastTenseMessage: 'Ran `echo hello`', content: [{ type: 'terminal', resource: 'agenthost-terminal:///tc-shell-term' }, { type: 'text', text: 'hello\n' }] },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-fail', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-fail', invocationMessage: 'Running `bad_cmd`', toolInput: 'bad_cmd', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-fail',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'terminal', resource: 'agenthost-terminal:///tc-fail-term' }, { type: 'text', text: 'command not found: bad_cmd' }], error: { message: 'command not found: bad_cmd' } },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-gen', toolName: 'custom_tool', displayName: 'custom_tool' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-gen', invocationMessage: 'Using "custom_tool"', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-gen',
				result: { success: true, pastTenseMessage: 'Used "custom_tool"' },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-noargs', toolName: 'bash', displayName: 'Bash', toolKind: 'terminal' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-noargs', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-noargs',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'session/toolCallStart', session, turnId, toolCallId: 'tc-view', toolName: 'view', displayName: 'View File' } as SessionAction);
			fire({ type: 'session/toolCallReady', session, turnId, toolCallId: 'tc-view', invocationMessage: 'Reading /tmp/test.txt', confirmed: 'not-needed' } as SessionAction);
			fire({
				type: 'session/toolCallComplete', session, turnId, toolCallId: 'tc-view',
				result: { success: true, pastTenseMessage: 'Read /tmp/test.txt' },
			} as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);

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
							confirmed: 'not-needed' as const, success: true, pastTenseMessage: 'Ran `ls`', content: [{ type: 'terminal' as const, resource: 'agenthost-terminal:///tc-1-term' }, { type: 'text' as const, text: 'file1\nfile2' }],
						}
					}],
					usage: undefined,
				}],
			} as SessionState);

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
			} as SessionState);

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
			} as SessionState);

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
			} as SessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/empty-sess' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 0);
		});
	});

	// ---- Server error handling ----------------------------------------------

	suite('server error handling', () => {

		test('server-side error resolves the agent invoke without throwing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Simulate a server-side error (e.g. sendMessage failure on the server)
			agentHostService.fireAction({
				action: {
					type: 'session/error',
					session,
					turnId,
					error: { errorType: 'connection_error', message: 'connection lost' },
				} as SessionAction,
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

		test('maps model config schema to picker configuration schema', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{
					provider: 'copilot',
					id: 'claude-sonnet-4.5',
					name: 'Claude Sonnet 4.5',
					maxContextWindow: 128000,
					supportsVision: false,
					configSchema: {
						type: 'object',
						properties: {
							thinkingLevel: {
								type: 'string',
								title: 'Thinking Level',
								default: 'medium',
								enum: ['low', 'medium', 'high'],
								enumLabels: ['Low', 'Medium', 'High'],
							},
						},
					},
				},
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.deepStrictEqual(models[0].metadata.configurationSchema?.properties?.thinkingLevel, {
				type: 'string',
				title: 'Thinking Level',
				description: undefined,
				default: 'medium',
				enum: ['low', 'medium', 'high'],
				enumItemLabels: ['Low', 'Medium', 'High'],
				enumDescriptions: undefined,
				readOnly: undefined,
				group: 'navigation',
			});
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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this file',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', uri: URI.file('/workspace/test.ts').toString(), displayName: 'test.ts' },
			]);
		}));

		test('directory variable with file:// URI becomes directory attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this dir',
				variables: {
					variables: [
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'src', value: URI.file('/workspace/src') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'directory', uri: URI.file('/workspace/src').toString(), displayName: 'src' },
			]);
		}));

		test('implicit selection variable becomes selection attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'explain this',
				variables: {
					variables: [
						upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true as const, isSelection: true, uri: URI.file('/workspace/foo.ts'), enabled: true, value: undefined }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'selection', uri: URI.file('/workspace/foo.ts').toString(), displayName: 'selection' },
			]);
		}));

		test('non-file URI variables are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const uri = URI.from({ scheme: 'untitled', path: '/foo' });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'untitled', value: uri }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));

		test('tool variables are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'use tools',
				variables: {
					variables: [
						upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));

		test('mixed variables extracts only supported types', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
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
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', uri: URI.file('/workspace/a.ts').toString(), displayName: 'a.ts' },
				{ type: 'directory', uri: URI.file('/workspace/lib').toString(), displayName: 'lib' },
			]);
		}));

		test('no variables results in no attachments argument', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hello',
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.userMessage.attachments, undefined);
		}));

		// ---- Working-directory rebasing -----------------------------------
		// On the first turn of a worktree-isolated session, the workbench
		// resolves attachments under the original workspace folder, but the
		// agent server has resolved its working directory to a freshly
		// created worktree path. The handler rebases attachment URIs so the
		// agent receives URIs under its own working directory.

		test('rebases file/directory/selection attachments under requested working dir onto resolved working dir', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const requestedDir = URI.file('/source');
			const resolvedDir = URI.file('/worktree');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => requestedDir },
			});
			agentHostService.nextResolvedWorkingDirectory = resolvedDir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'rebase me',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/source/a.ts') }),
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/source/lib') }),
						upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true as const, isSelection: true, uri: URI.file('/source/sub/foo.ts'), enabled: true, value: undefined }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', uri: URI.file('/worktree/a.ts').toString(), displayName: 'a.ts' },
				{ type: 'directory', uri: URI.file('/worktree/lib').toString(), displayName: 'lib' },
				{ type: 'selection', uri: URI.file('/worktree/sub/foo.ts').toString(), displayName: 'selection' },
			]);
		}));

		test('does not rebase when requested and resolved working dirs match', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const dir = URI.file('/source');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => dir },
			});
			agentHostService.nextResolvedWorkingDirectory = dir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'no rebase',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/source/a.ts') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', uri: URI.file('/source/a.ts').toString(), displayName: 'a.ts' },
			]);
		}));

		test('attachments outside the requested working dir pass through unchanged', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const requestedDir = URI.file('/source');
			const resolvedDir = URI.file('/worktree');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => requestedDir },
			});
			agentHostService.nextResolvedWorkingDirectory = resolvedDir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'outside',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'elsewhere.ts', value: URI.file('/elsewhere/elsewhere.ts') }),
					],
				},
			});
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.userMessage.attachments, [
				{ type: 'file', uri: URI.file('/elsewhere/elsewhere.ts').toString(), displayName: 'elsewhere.ts' },
			]);
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
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

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

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-test' });
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), URI.file('/custom/working/dir').toString());
		}));

		test('handler forwards request session config to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'config-test',
				sessionType: 'config-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const { turnPromise, session, turnId, fire } = await startDynamicAgentTurn(chatAgentService, agentHostService, 'config-test', { message: 'Add Agent Host session configuration flow', agentHostSessionConfig: config });
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].config, { ...config, [SessionConfigKey.BranchNameHint]: 'add-agent-host-session-configuration-flow' });
		}));

		test('handler derives deterministic branch name hints from first request text', () => {
			assert.deepStrictEqual([
				getAgentHostBranchNameHint('Add Agent Host session configuration flow'),
				getAgentHostBranchNameHint('  Fix: worktree picker + branch config!  '),
				getAgentHostBranchNameHint('---'),
			], [
				'add-agent-host-session-configuration-flow',
				'fix-worktree-picker-branch-config',
				undefined,
			]);
		});

		test('handler uses registered working directory resolver', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const resolvedWorkingDirectory = URI.file('/resolved/working/dir');
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables, {
				resolve: () => resolvedWorkingDirectory,
			});

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-resolver-test',
				sessionType: 'workdir-resolver-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-resolver-test' });
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), resolvedWorkingDirectory.toString());
		}));

		test('handler passes vscode-agent-host URI as-is to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

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

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-agenthost-test' });
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), agentHostUri.toString());
		}));

		test('list controller includes description in items', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = disposables.add(instantiationService.createInstance(
				AgentHostSessionListController, 'remote-test', 'copilot', agentHostService, 'My Remote Host', 'local'));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-1'), startTime: 1000, modifiedTime: 2000, summary: 'Test session' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, 'My Remote Host');
		});

		test('list controller omits description when undefined', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = disposables.add(instantiationService.createInstance(
				AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined, 'local'));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-2'), startTime: 1000, modifiedTime: 2000, summary: 'Test' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, undefined);
		});

		test('list controller surfaces only working directory in metadata (git state is now per-session state, not summary)', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = disposables.add(instantiationService.createInstance(
				AgentHostSessionListController, 'agent-host-copilot', 'copilot', agentHostService, undefined, 'local'));

			const workingDirectory = URI.file('/repo/work');
			agentHostService.addSession({
				session: AgentSession.uri('copilot', 'sess-git'),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'With git',
				workingDirectory,
			});
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.deepStrictEqual(controller.items[0].metadata, {
				workingDirectoryPath: workingDirectory.fsPath,
			});
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
			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, {
				message: 'Test message',
				agentId: 'connection-test',
			});

			fire({ type: 'session/delta', session, turnId, content: 'Response' } as SessionAction);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			// Turn dispatched via connection.dispatchAction
			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).userMessage.text, 'Test message');
		}));
	});

	// ---- Reconnection to active turn ----------------------------------------

	suite('reconnection to active turn', () => {

		function makeSessionStateWithActiveTurn(sessionUri: string, overrides?: Partial<{ streamingText: string; reasoning: string }>): SessionState {
			const summary: SessionSummary = {
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
				action: { type: 'session/delta', session: sessionUri.toString(), turnId: 'turn-active', partId: 'md-active', content: ' and more' } as SessionAction,
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
				action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' } as SessionAction,
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
				action: { type: 'session/turnComplete', session: sessionUri.toString(), turnId: 'turn-active' } as SessionAction,
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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			// Create and subscribe a session
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-turn' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Hello', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			// Echo + complete the first turn
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
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
				} as SessionAction,
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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-progress' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// Normal turn to create backend session
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-progress';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'auto queued' } } as SessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Stream a response part + delta
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-srv', content: 'Hello ' } } as SessionAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/delta', session, turnId: serverTurnId, partId: 'md-srv', content: 'world' } as SessionAction,
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
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as SessionAction,
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
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-no-dupe' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const serverRequestEvents: { prompt: string }[] = [];
			disposables.add(chatSession.onDidStartServerRequest!(e => serverRequestEvents.push(e)));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// Normal client turn — should NOT fire onDidStartServerRequest
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Client turn', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch = agentHostService.turnActions[0];
			const action = dispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session: action.session, turnId: action.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.strictEqual(serverRequestEvents.length, 0, 'Client-dispatched turns should not trigger onDidStartServerRequest');
		}));

		test('server-initiated turn does not duplicate tool calls on repeated state changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-tool-dedup' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-tool-dedup';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } } as SessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Tool start + ready (auto-confirmed)
			agentHostService.fireAction({
				action: { type: 'session/toolCallStart', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', toolName: 'bash', displayName: 'Bash' } as SessionAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/toolCallReady', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', invocationMessage: 'Running Bash', confirmed: 'not-needed' } as SessionAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(50);

			// Tool complete
			agentHostService.fireAction({
				action: { type: 'session/toolCallComplete', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', result: { success: true, pastTenseMessage: 'Ran Bash' } } as SessionAction,
				serverSeq: 6, origin: undefined,
			});
			await timeout(50);

			// Fire additional state changes that might cause re-processing
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-after', content: 'Done.' } } as SessionAction,
				serverSeq: 7, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as SessionAction,
				serverSeq: 8, origin: undefined,
			});
			await timeout(50);

			// Count tool invocations in progressObs — should be exactly 1
			const progress = chatSession.progressObs!.get();
			const toolInvocations = progress.filter(p => p.kind === 'toolInvocation');
			assert.strictEqual(toolInvocations.length, 1, 'Tool call should not be duplicated');
		}));

		test('server-initiated turn picks up markdown arriving with turnStarted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-md-initial' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Fire turnStarted followed immediately by a response part.
			// In production, these can arrive in rapid succession from the
			// WebSocket, and the immediate reconciliation in
			// _trackServerTurnProgress ensures content already in the state
			// is not missed.
			const serverTurnId = 'server-turn-md-initial';
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: serverTurnId, userMessage: { text: 'queued' } } as SessionAction,
				serverSeq: 3, origin: undefined,
			});
			agentHostService.fireAction({
				action: { type: 'session/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-init', content: 'Initial text' } } as SessionAction,
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
				action: { type: 'session/turnComplete', session, turnId: serverTurnId } as SessionAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(10);

			assert.strictEqual(chatSession.isCompleteObs!.get(), true);
		}));

		test('removes consumed queued message from chat model when server-initiated turn appears', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-queue-removal' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			agentHostService.dispatchedActions.length = 0;

			// First, do a normal turn so the backend session exists.
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Add a queued message to the protocol state so it's tracked.
			agentHostService.fireAction({
				action: { type: 'session/pendingMessageSet', session, kind: 'queued', id: 'q-1', userMessage: { text: 'will be consumed' } } as SessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Now the server consumes it: a server-initiated turn appears
			// and the queued message disappears in the same state change.
			chatService.removePendingRequestCalls.length = 0;
			agentHostService.fireAction({
				action: { type: 'session/turnStarted', session, turnId: 'server-turn-q', userMessage: { text: 'will be consumed' }, queuedMessageId: 'q-1' } as SessionAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(10);

			// The handler should have removed the consumed queued request from the chat model.
			const removedQueueIds = chatService.removePendingRequestCalls.filter(c => c.requestId === 'q-1');
			assert.strictEqual(removedQueueIds.length, 1, 'consumed queued message should be removed from chat model');
		}));

		test('removes steering message from chat model when steering id changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-steering-removal' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			agentHostService.dispatchedActions.length = 0;

			// Backend session is created via a normal turn.
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = action1.session;
			agentHostService.fireAction({ action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ action: { type: 'session/turnComplete', session, turnId: action1.turnId } as SessionAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Set a steering message on the protocol state.
			agentHostService.fireAction({
				action: { type: 'session/pendingMessageSet', session, kind: 'steering', id: 'steer-1', userMessage: { text: 'be more careful' } } as SessionAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);
			chatService.removePendingRequestCalls.length = 0;

			// Steering message is consumed by the agent.
			agentHostService.fireAction({
				action: { type: 'session/pendingMessageRemoved', session, kind: 'steering', id: 'steer-1' } as SessionAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(10);

			const removed = chatService.removePendingRequestCalls.filter(c => c.requestId === 'steer-1');
			assert.strictEqual(removed.length, 1, 'previously-set steering message should be removed from chat model when it is cleared');
		}));
	});

	// ---- Customizations dispatch ------------------------------------------

	suite('customizations', () => {

		test('dispatches activeClientChanged when a new session is created', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			const customizations = observableValue<CustomizationRef[]>('customizations', [
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

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			// The active-client claim is now threaded through createSession
			// rather than dispatched separately, so assert on createSessionCalls.
			const createCall = agentHostService.createSessionCalls.at(-1);
			assert.ok(createCall?.activeClient, 'createSession should carry activeClient');
			assert.strictEqual(createCall!.activeClient!.clientId, agentHostService.clientId);
			assert.ok(Array.isArray(createCall!.activeClient!.tools), 'activeClient.tools should be a defined array');
			assert.strictEqual(createCall!.activeClient!.customizations?.length, 1);
			assert.strictEqual(createCall!.activeClient!.customizations?.[0].uri, 'file:///plugin-a');
		});

		test('re-dispatches activeClientChanged when customizations observable changes', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			const customizations = observableValue<CustomizationRef[]>('customizations', []);

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
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);
			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
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
			const ac = activeClientAction!.action as { activeClient: { customizations?: CustomizationRef[] } };
			assert.strictEqual(ac.activeClient.customizations?.length, 1);
			assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-b');
		});
	});

	// ---- Subagent grouping ----------------------------------------------

	suite('subagent grouping', () => {

		/**
		 * Build a child session state containing a single inner tool call in the running state.
		 */
		function makeChildState(childUri: string, innerToolCallId: string): SessionState {
			const summary: SessionSummary = {
				resource: childUri,
				provider: 'copilot',
				title: 'Subagent',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
			const innerTool: ToolCallState = {
				toolCallId: innerToolCallId,
				toolName: 'read_file',
				displayName: 'Read File',
				status: ToolCallStatus.Running,
				invocationMessage: 'Reading file',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as ToolCallState;
			const activeTurn = createActiveTurn('child-turn-1', { text: 'do work' });
			activeTurn.responseParts.push({ kind: ResponsePartKind.ToolCall, toolCall: innerTool });
			return {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeTurn,
			};
		}

		test('inner subagent tool calls are forwarded with subAgentInvocationId set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Pre-populate the child subagent session state BEFORE the parent tool
			// call fires, so that when the handler subscribes to it the inner tool
			// is already present.
			const parentToolCallId = 'tc-parent-task';
			const childSessionUri = buildSubagentSessionUri(session.toString(), parentToolCallId);
			agentHostService.sessionStates.set(childSessionUri, makeChildState(childSessionUri, 'tc-child-1'));

			// Fire the parent task tool call with toolKind=subagent metadata.
			fire({
				type: 'session/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'do some work', subagentAgentName: 'helper' },
			} as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as SessionAction);

			// Allow the throttler/observation flow to flush.
			await timeout(50);

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			// Flatten all progress emissions and find tool invocations.
			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');

			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);
			const child = toolInvocations.find(t => t.toolCallId === 'tc-child-1');

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent', 'parent should have subagent toolSpecificData');
			assert.strictEqual(parent!.subAgentInvocationId, undefined, 'parent should not have a subAgentInvocationId');

			assert.ok(child, 'inner child tool invocation should be forwarded into parent session progress');
			assert.strictEqual(child!.subAgentInvocationId, parentToolCallId, 'child should be tagged with parent tool call id for grouping');
		}));

		test('inner subagent tool calls fired AFTER parent observation are also grouped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const parentToolCallId = 'tc-parent-task';
			const childSessionUri = buildSubagentSessionUri(session.toString(), parentToolCallId);

			// Fire the parent task tool — this should cause the handler to subscribe
			// to the (still-empty) child subagent session.
			fire({
				type: 'session/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'do work', subagentAgentName: 'helper' },
			} as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as SessionAction);

			// Allow the subscription to be set up.
			await timeout(50);

			// NOW fire the child session lifecycle: turnStarted, then a tool call.
			const childTurnId = 'child-turn-1';
			const childToolCallId = 'tc-child-1';
			const fireChild = (action: SessionAction) => {
				agentHostService.fireAction({ action, serverSeq: 1000, origin: undefined });
			};
			fireChild({
				type: 'session/turnStarted',
				session: childSessionUri,
				turnId: childTurnId,
				userMessage: { text: '' },
			} as SessionAction);
			fireChild({
				type: 'session/toolCallStart', session: childSessionUri, turnId: childTurnId,
				toolCallId: childToolCallId, toolName: 'read_file', displayName: 'Read File',
			} as SessionAction);
			fireChild({
				type: 'session/toolCallReady', session: childSessionUri, turnId: childTurnId,
				toolCallId: childToolCallId, invocationMessage: 'Reading file',
				confirmed: 'not-needed',
			} as SessionAction);

			await timeout(50);

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');

			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);
			const child = toolInvocations.find(t => t.toolCallId === childToolCallId);

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent');
			assert.strictEqual(parent!.subAgentInvocationId, undefined);

			assert.ok(child, 'child tool invocation fired after subscription should be forwarded');
			assert.strictEqual(child!.subAgentInvocationId, parentToolCallId, 'child should be tagged for grouping');
		}));

		test('parent subagent agentName is updated when subagent content arrives later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Repro for the missing-agent-name bug: when the parent task tool
			// fires without `subagentAgentName` in `_meta` (e.g. the agent host
			// did not extract it from args), the renderer should still pick up
			// the agent name once the SDK emits a `subagent_started` event,
			// which lands as a Subagent content block on the parent tool call.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const parentToolCallId = 'tc-parent-task';

			// Parent task tool fires WITHOUT subagentAgentName meta — only description.
			fire({
				type: 'session/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'Exploring codebase structure' },
			} as SessionAction);
			fire({
				type: 'session/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as SessionAction);

			await timeout(50);

			// Now the SDK emits subagent_started → handler dispatches a content
			// change with a Subagent content block carrying the agent name.
			fire({
				type: 'session/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{
					type: ToolResultContentType.Subagent,
					resource: buildSubagentSessionUri(session.toString(), parentToolCallId),
					title: 'Subagent',
					agentName: 'explore',
				}],
			} as SessionAction);

			await timeout(50);

			fire({ type: 'session/turnComplete', session, turnId } as SessionAction);
			await turnPromise;

			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');
			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent', 'parent should have subagent toolSpecificData');
			assert.strictEqual(
				(parent!.toolSpecificData as { kind: 'subagent'; agentName?: string }).agentName,
				'explore',
				'parent toolSpecificData.agentName must be updated from the Subagent content block'
			);
		}));

	});

	// ---- Auth dedupe ------------------------------------------------------

	suite('auth dedupe', () => {

		const protectedAgents = (): AgentInfo[] => [{
			provider: 'copilot',
			displayName: 'Agent Host - Copilot',
			description: 'test',
			models: [],
			protectedResources: [{
				resource: 'https://api.github.com',
				resource_name: 'GitHub',
				authorization_servers: ['https://github.com/login/oauth'],
				scopes_supported: ['read:user'],
				required: true,
			}],
		}];

		function tokenAuthService(tokenRef: { current: string }): Partial<IAuthenticationService> {
			// Always returns whatever token is in tokenRef.current. Returning a session
			// for the exact-scope `getSessions` call short-circuits the superset fallback.
			return {
				onDidChangeSessions: Event.None,
				getOrActivateProviderIdForServer: async () => 'github',
				getSessions: (async (_providerId: string, scopes?: ReadonlyArray<string>) => {
					if (scopes !== undefined) {
						return [{ scopes: [...scopes], accessToken: tokenRef.current }];
					}
					return [];
				}) as unknown as IAuthenticationService['getSessions'],
			};
		}

		test('does not re-authenticate when token unchanged across rootState changes', async () => {
			const tokenRef = { current: 'tok-1' };
			const { agentHostService } = createContribution(disposables, { authServiceOverride: tokenAuthService(tokenRef) });

			// First rootState — kicks off the eager auth pass.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			assert.deepStrictEqual(agentHostService.authenticateCalls, [{ resource: 'https://api.github.com', token: 'tok-1' }]);

			// Repeated rootState changes with the same token must not re-fire authenticate.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 1 });
			await timeout(0);
			assert.deepStrictEqual(agentHostService.authenticateCalls, [{ resource: 'https://api.github.com', token: 'tok-1' }]);
		});

		test('re-authenticates when token rotates, then dedupes again', async () => {
			const tokenRef = { current: 'tok-1' };
			const { agentHostService } = createContribution(disposables, { authServiceOverride: tokenAuthService(tokenRef) });

			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			// Token rotates externally; next rootState change must push it through.
			tokenRef.current = 'tok-2';
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			// Subsequent passes with the new token must dedupe again.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 1 });
			await timeout(0);

			assert.deepStrictEqual(agentHostService.authenticateCalls, [
				{ resource: 'https://api.github.com', token: 'tok-1' },
				{ resource: 'https://api.github.com', token: 'tok-2' },
			]);
		});

		test('skips authenticate when no token is resolvable', async () => {
			const noTokenService: Partial<IAuthenticationService> = {
				onDidChangeSessions: Event.None,
				getOrActivateProviderIdForServer: async () => undefined,
				getSessions: (async () => []) as unknown as IAuthenticationService['getSessions'],
			};
			const { agentHostService } = createContribution(disposables, { authServiceOverride: noTokenService });

			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			assert.deepStrictEqual(agentHostService.authenticateCalls, []);
		});
	});
});
