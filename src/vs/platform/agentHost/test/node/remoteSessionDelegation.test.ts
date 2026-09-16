/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, type IReference } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import type { IProductService } from '../../../product/common/productService.js';
import { AgentSession, type IAgent, type IAgentCreateSessionConfig, type IAgentSessionMetadata } from '../../common/agent.js';
import { AgentHostRemoteTargetStatus, AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetHandle } from '../../common/agentHostRemoteAgents.js';
import { AgentHostProtocolClientCore } from '../../common/agentHostProtocolClient.js';
import { AgentHostRemoteAgentsEnabledConfigKey } from '../../common/agentHostSchema.js';
import type { IAgentHostChatContributionContext } from '../../common/agentHostChatContributionsService.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta, type IAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { remoteAgentHostSessionTypeId } from '../../common/agentHostSessionType.js';
import { agentHostAuthority } from '../../common/agentHostUri.js';
import type { IAgentConnection, IAgentService } from '../../common/agentService.js';
import { buildOpenSessionLinkUri } from '../../common/openSessionLink.js';
import type { IRemoteAgentHostReconnectPolicy } from '../../common/reconnectPolicy.js';
import { DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY, type ISessionDatabase, type ISessionDataService, type IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import type { IAgentSubscription } from '../../common/state/agentSubscription.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import { ActionType, type ChatAction, type ClientAnnotationsAction, type ClientAutomationAction, type ClientAutomationRunAction, type ClientChangesetAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../../common/state/sessionActions.js';
import { SessionInputRequestKind, type SessionState, type SessionToolClientExecutionRequest, type SessionToolConfirmationRequest } from '../../common/state/protocol/channels-session/state.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, MessageKind, readSessionCreationReference, readSessionSpawnDepth, SessionLifecycle, SessionStatus, StateComponents, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, withSessionCreationReference, withSessionSpawnDepth, type ComponentToState, type Message, type RootState } from '../../common/state/sessionState.js';
import type { TunnelAgentHostDiscoveryState } from '../../common/tunnelAgentHostDiscovery.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import type { IAgentHostRemoteAgentsContribution, IAgentHostRemoteAgentsService } from '../../node/agentHostRemoteAgentsService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostStorageService } from '../../node/agentHostStorageService.js';
import type { IAgentHostTurnService } from '../../node/agentHostTurnService.js';
import { RemoteSessionDelegationContribution } from '../../node/chatContributions/remoteSessionDelegation/remoteSessionDelegationContribution.js';
import { CREATE_REMOTE_SESSION_TOOL_NAME, RemoteSessionDelegationService, toRemoteSessionTargetHandle, type IRemoteSessionDelegationSource } from '../../node/chatContributions/remoteSessionDelegation/remoteSessionDelegationService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { MAX_SESSION_SPAWN_DEPTH, SessionCreationBudget, type IAgentHostSessionToolCallbacks, type IAgentServiceSessionServerToolAccessor } from '../../node/shared/sessionServerTools.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { getTestAgentHostManagedSettingsService, getTestAgentHostProviderService, getTestAgentHostRemoteAgentsService, getTestAgentServiceComposition, createTestAgentService } from './agentServiceTestUtils.js';
import { remoteTarget, TestAgentHostRemoteTargetConnector } from './agentHostRemoteTargetsTestUtils.js';
import { MockAgent } from './mockAgent.js';
import { NodeWebSocketClientTransport } from './nodeWebSocketClientTransport.js';
import { ScriptedRemoteAgentHostServer } from './scriptedRemoteAgentHostServer.js';

class TestSubscription<T> implements IAgentSubscription<T> {
	private readonly _onDidChange = this._store.add(new Emitter<T>());
	private readonly _onDidError = this._store.add(new Emitter<Error>());

	readonly onDidChange = this._onDidChange.event;
	readonly onDidError = this._onDidError.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(
		private readonly _store: DisposableStore,
		private _value: T,
	) { }

	get value(): T {
		return this._value;
	}

	get verifiedValue(): T {
		return this._value;
	}

	set(value: T): void {
		this._value = value;
		this._onDidChange.fire(value);
	}

	fail(error: Error): void {
		this._onDidError.fire(error);
	}
}

class TestDelegationConnection extends mock<IAgentConnection>() {
	private readonly _store = new DisposableStore();
	private readonly _sessions = new Map<string, TestSubscription<SessionState>>();
	private _activeSubscriptionReferences = 0;
	private _applyActiveClientActions = true;

	override readonly resourceUris = {
		toAgentHost: (resource: URI) => resource,
		fromAgentHost: (resource: URI) => resource,
	};
	override readonly onDidNotification = Event.None;
	override readonly onDidAction = Event.None;
	override readonly onMcpNotification = Event.None;
	override readonly rootState: TestSubscription<RootState>;
	readonly dispatches: Array<{ readonly channel: string; readonly action: SessionAction | ChatAction }> = [];
	subscriptionAcquireCount = 0;

	constructor(
		override readonly clientId: string,
		agents: RootState['agents'],
	) {
		super();
		this.rootState = new TestSubscription(this._store, { agents });
	}

	addSession(session: URI, provider = 'copilot'): void {
		const state: SessionState = {
			provider,
			title: 'Remote source',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
		};
		this._sessions.set(session.toString(), new TestSubscription<SessionState>(this._store, state));
	}

	setInputNeeded(session: URI, request: SessionToolClientExecutionRequest | undefined): void {
		const subscription = this._requireSession(session);
		subscription.set({ ...subscription.value, inputNeeded: request ? [request] : [] });
	}

	setApplyActiveClientActions(value: boolean): void {
		this._applyActiveClientActions = value;
	}

	failSessionSubscription(session: URI, error: Error): void {
		const subscription = this._requireSession(session);
		this._sessions.set(session.toString(), new TestSubscription<SessionState>(this._store, {
			...subscription.value,
			activeClients: [],
		}));
		subscription.fail(error);
	}

	get activeSubscriptionReferences(): number {
		return this._activeSubscriptionReferences;
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		assert.strictEqual(kind, StateComponents.Session);
		const subscription = this._requireSession(resource);
		this.subscriptionAcquireCount++;
		this._activeSubscriptionReferences++;
		let disposed = false;
		return {
			object: subscription as unknown as IAgentSubscription<ComponentToState[T]>,
			dispose: () => {
				if (!disposed) {
					disposed = true;
					this._activeSubscriptionReferences--;
				}
			},
		};
	}

	override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		return this._sessions.get(resource.toString()) as IAgentSubscription<ComponentToState[T]> | undefined;
	}

	override dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		if (action.type === ActionType.SessionActiveClientSet) {
			this.dispatches.push({ channel, action });
			if (!this._applyActiveClientActions) {
				return;
			}
			const subscription = this._requireSession(URI.parse(channel));
			subscription.set({ ...subscription.value, activeClients: [action.activeClient] });
			return;
		}
		if (action.type === ActionType.ChatToolCallComplete) {
			this.dispatches.push({ channel, action });
		}
	}

	async waitForCompletionCount(expected: number): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (this.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length >= expected) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 0));
		}
		throw new Error(`Timed out waiting for ${expected} client tool completions.`);
	}

	override async resourceRead(): Promise<never> {
		throw new Error('Unexpected referenced tool input');
	}

	dispose(): void {
		this._store.dispose();
	}

	private _requireSession(session: URI): TestSubscription<SessionState> {
		const subscription = this._sessions.get(session.toString());
		if (!subscription) {
			throw new Error(`Unknown test session: ${session.toString()}`);
		}
		return subscription;
	}
}

class TestRemoteTargetHandle extends Disposable implements IAgentHostRemoteTargetHandle {
	readonly label = observableValue(this, this.targetId);
	readonly status = observableValue(this, AgentHostRemoteTargetStatus.Connected);
	readonly connection = observableValue<IAgentConnection | undefined>(this, undefined);
	readonly onDidDispose = Event.None;

	constructor(
		readonly connectorId: string,
		readonly targetId: string,
		readonly clientId: string,
		connection: IAgentConnection,
	) {
		super();
		this.connection.set(connection, undefined);
	}

	requireConnection(): IAgentConnection {
		const connection = this.connection.get();
		if (!connection) {
			throw new AgentHostRemoteTargetUnavailableError(this.connectorId, this.targetId, this.status.get());
		}
		return connection;
	}

	setUnavailable(): void {
		this.status.set(AgentHostRemoteTargetStatus.Unavailable, undefined);
		this.connection.set(undefined, undefined);
	}
}

class TestRemoteAgentsService implements IAgentHostRemoteAgentsService {
	declare readonly _serviceBrand: undefined;
	readonly enabled = observableValue(this, true);
	readonly tunnelDiscoveryEnabled = observableValue(this, false);
	readonly tunnelDiscoveryState = observableValue<TunnelAgentHostDiscoveryState>(this, { kind: 'disabled' });
	readonly targets = observableValue<readonly IAgentHostRemoteTargetHandle[]>(this, []);

	async refreshTunnelDiscovery(): Promise<void> { }

	activate() {
		return Disposable.None;
	}

	registerContribution(_contribution: IAgentHostRemoteAgentsContribution) {
		return Disposable.None;
	}
}

class TestProviderService extends mock<IAgentHostProviderService>() {
	private readonly _providers = new Map<string, MockAgent>();
	override readonly agents = observableValue<readonly IAgent[]>(this, []);

	add(provider: MockAgent): void {
		this._providers.set(provider.id, provider);
		this.agents.set([...this._providers.values()], undefined);
	}

	remove(provider: string): void {
		this._providers.delete(provider);
		this.agents.set([...this._providers.values()], undefined);
	}

	override getProvider(provider: string): MockAgent | undefined {
		return this._providers.get(provider);
	}
}

class TestAgentService extends mock<IAgentService>() {
	readonly createCalls: IAgentCreateSessionConfig[] = [];
	readonly deleteCalls: URI[] = [];
	readonly deletedSessions: URI[] = [];
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	private _createGate: DeferredPromise<void> | undefined;
	private _deleteGate: DeferredPromise<void> | undefined;
	private _deleteError: Error | undefined;
	private _persistentDeleteError: Error | undefined;
	private _deleteAfterSideEffectError: Error | undefined;
	private _createCrash: Error | undefined;

	delayCreate(): DeferredPromise<void> {
		return this._createGate = new DeferredPromise<void>();
	}

	crashAfterNextDownstreamCreate(error: Error): void {
		this._createCrash = error;
	}

	failNextDelete(error: Error): void {
		this._deleteError = error;
	}

	delayDelete(): DeferredPromise<void> {
		return this._deleteGate = new DeferredPromise<void>();
	}

	failNextDeleteAfterSideEffect(error: Error): void {
		this._deleteAfterSideEffectError = error;
	}

	setDeleteError(error: Error | undefined): void {
		this._persistentDeleteError = error;
	}

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (!config?.session) {
			throw new Error('Expected a planned session URI');
		}
		this.createCalls.push(config);
		await this._createGate?.p;
		if (this._createCrash) {
			const error = this._createCrash;
			this._createCrash = undefined;
			throw error;
		}
		this._sessions.set(config.session.toString(), {
			session: config.session,
			startTime: 0,
			modifiedTime: 0,
			status: SessionStatus.Idle,
		});
		return config.session;
	}

	override async disposeSession(session: URI): Promise<void> {
		this.deleteCalls.push(session);
		if (this._persistentDeleteError) {
			throw this._persistentDeleteError;
		}
		if (this._deleteError) {
			const error = this._deleteError;
			this._deleteError = undefined;
			throw error;
		}
		const deleteGate = this._deleteGate;
		this._deleteGate = undefined;
		await deleteGate?.p;
		if (this._sessions.delete(session.toString())) {
			this.deletedSessions.push(session);
		}
		if (this._deleteAfterSideEffectError) {
			const error = this._deleteAfterSideEffectError;
			this._deleteAfterSideEffectError = undefined;
			throw error;
		}
	}

	getSession(session: URI): IAgentSessionMetadata | undefined {
		return this._sessions.get(session.toString());
	}
}

class TestTurnService extends mock<IAgentHostTurnService>() {
	readonly starts: Array<{ readonly chat: URI; readonly message: Message }> = [];
	private readonly _acceptanceGates: DeferredPromise<boolean>[] = [];
	private _accepted = true;

	delayAcceptance(): DeferredPromise<boolean> {
		const gate = new DeferredPromise<boolean>();
		this._acceptanceGates.push(gate);
		return gate;
	}

	setAccepted(accepted: boolean): void {
		this._accepted = accepted;
	}

	override async startTurnMessage(chat: URI, message: Message) {
		this.starts.push({ chat, message });
		return { kind: 'accepted' } as const;
	}

	async startPrompt(chat: URI, message: Message): Promise<boolean> {
		this.starts.push({ chat, message });
		return this._acceptanceGates.shift()?.p ?? this._accepted;
	}
}

class TestSessionToolCallbacks extends mock<IAgentHostSessionToolCallbacks>() {
	declare readonly _serviceBrand: undefined;
	override readonly sessionCreationBudget: SessionCreationBudget;
	override readonly accessor: IAgentServiceSessionServerToolAccessor;
	readonly restoreCalls: URI[] = [];
	private readonly _coldSessions = new Set<string>();
	private _hideAcceptedPromptBehindHistory = false;

	constructor(
		agentService: TestAgentService,
		turnService: TestTurnService,
		stateManager: AgentHostStateManager,
		sessionCreationBudget = new SessionCreationBudget(),
	) {
		super();
		this.sessionCreationBudget = sessionCreationBudget;
		const owner = this;
		this.accessor = new class extends mock<IAgentServiceSessionServerToolAccessor>() {
			override readonly createSession = (config: IAgentCreateSessionConfig): Promise<URI> => agentService.createSession(config);

			override readonly getSession = async (session: URI): Promise<IAgentSessionMetadata | undefined> => agentService.getSession(session);
			override readonly restoreSession = async (session: URI): Promise<void> => {
				owner.restoreCalls.push(session);
				owner._coldSessions.delete(session.toString());
			};

			override readonly startPrompt = (_session: URI, chat: URI, prompt: string, delegation?: IAgentMessageDelegationMeta): Promise<boolean> => {
				return turnService.startPrompt(chat, {
					text: prompt,
					origin: { kind: MessageKind.Agent },
					...(delegation ? { _meta: toAgentMessageDelegationMeta(delegation) } : {}),
				});
			};

			override readonly deleteSession = async (session: URI): Promise<void> => {
				await agentService.disposeSession(session);
			};

			override readonly getChatContext = async (session: URI) => {
				if (owner._coldSessions.has(session.toString())) {
					return undefined;
				}
				const chat = buildDefaultChatUri(session);
				const start = turnService.starts.find(candidate => candidate.chat.toString() === chat);
				return {
					turns: [],
					...(!owner._hideAcceptedPromptBehindHistory && start ? { activeTurn: { message: start.message, responseParts: [] } } : {}),
					hasMoreHistory: owner._hideAcceptedPromptBehindHistory,
				};
			};

			override readonly setSessionSpawnDepth = (session: URI, depth: number): void => {
				const summary = stateManager.getSessionSummary(session.toString());
				if (summary) {
					stateManager.dispatchServerAction(session.toString(), {
						type: ActionType.SessionMetaChanged,
						_meta: withSessionSpawnDepth(summary._meta, depth),
					});
				}
			};
		}();
	}

	markSessionCold(session: URI): void {
		this._coldSessions.add(session.toString());
	}

	hideAcceptedPromptBehindHistory(): void {
		this._hideAcceptedPromptBehindHistory = true;
	}
}

class FailResultDatabase extends TestSessionDatabase {
	private _failed = false;

	override setMetadataValuesIfAbsent(key: string, values: Readonly<Record<string, string>>, copies?: Readonly<Record<string, string>>): Promise<boolean> {
		if (!this._failed && key.includes('.result.')) {
			this._failed = true;
			return Promise.reject(new Error('simulated result persistence failure'));
		}
		return super.setMetadataValuesIfAbsent(key, values, copies);
	}
}

class FailPromptAcceptedProgressDatabase extends TestSessionDatabase {
	private _failed = false;

	override setMetadata(key: string, value: string): Promise<void> {
		if (!this._failed && key.includes('.progress.') && value.includes('"phase":"promptAccepted"')) {
			this._failed = true;
			return Promise.reject(new Error('simulated promptAccepted persistence failure'));
		}
		return super.setMetadata(key, value);
	}
}

class ResultTrackingDatabase extends TestSessionDatabase {
	readonly terminalResults = new Map<string, string>();

	override async setMetadataValuesIfAbsent(key: string, values: Readonly<Record<string, string>>, copies?: Readonly<Record<string, string>>): Promise<boolean> {
		const stored = await super.setMetadataValuesIfAbsent(key, values, copies);
		if (stored && key.includes('.result.')) {
			this.terminalResults.set(key, values[key]);
		}
		return stored;
	}
}

class CleanupReplayTrackingDatabase extends TestSessionDatabase {
	readonly replayStarted = new DeferredPromise<void>();
	private _isTrackingReplay = false;

	trackReplay(): void {
		this._isTrackingReplay = true;
	}

	override async getMetadataObject<T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> {
		const result = await super.getMetadataObject(obj);
		if (this._isTrackingReplay && Object.entries(result).some(([key, value]) =>
			key.includes('.progress.') && value?.includes('"phase":"cleanupPending"')
		)) {
			this.replayStarted.complete();
		}
		return result;
	}
}

class ClaimTrackingDatabase extends TestSessionDatabase {
	invocationClaims = 0;

	override setMetadataValuesIfAbsent(key: string, values: Readonly<Record<string, string>>, copies?: Readonly<Record<string, string>>): Promise<boolean> {
		if (key.includes('.invocation.')) {
			this.invocationClaims++;
		}
		return super.setMetadataValuesIfAbsent(key, values, copies);
	}
}

class TestMappedSessionDataService implements ISessionDataService {
	declare readonly _serviceBrand: undefined;
	readonly onWillDeleteSessionData = Event.None;
	private readonly _databases = new Map<string, ISessionDatabase>();

	setDatabase(session: URI, database: ISessionDatabase): void {
		this._databases.set(session.toString(), database);
	}

	getSessionDataDir(session: URI): URI {
		return URI.from({ scheme: 'inmemory', path: `/session-data/${AgentSession.id(session)}` });
	}

	getSessionDataDirById(sessionId: string): URI {
		return URI.from({ scheme: 'inmemory', path: `/session-data/${sessionId}` });
	}

	openDatabase(session: URI): IReference<ISessionDatabase> {
		const key = session.toString();
		let database = this._databases.get(key);
		if (!database) {
			database = new TestSessionDatabase();
			this._databases.set(key, database);
		}
		return { object: database, dispose() { } };
	}

	async tryOpenDatabase(session: URI): Promise<IReference<ISessionDatabase> | undefined> {
		const database = this._databases.get(session.toString());
		return database ? { object: database, dispose() { } } : undefined;
	}

	async deleteSessionData(session: URI): Promise<void> {
		this._databases.delete(session.toString());
	}

	async cleanupOrphanedData(): Promise<void> { }
	async whenIdle(): Promise<void> { }
}

class TestDeletingSessionDataService extends TestMappedSessionDataService {
	private readonly _onWillDeleteSessionData = new Emitter<IWillDeleteSessionDataEvent>();
	override readonly onWillDeleteSessionData = this._onWillDeleteSessionData.event;

	override async deleteSessionData(session: URI): Promise<void> {
		const pending: Promise<unknown>[] = [];
		this._onWillDeleteSessionData.fire({
			session,
			workingDirectories: undefined,
			waitUntil: promise => pending.push(promise),
		});
		await Promise.allSettled(pending);
		await super.deleteSessionData(session);
	}

	dispose(): void {
		this._onWillDeleteSessionData.dispose();
	}
}

interface ITestStorageBacking {
	data: Record<string, unknown>;
}

class TestPersistentAgentHostStorageService implements IAgentHostStorageService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	readonly loadError = undefined;
	private readonly _data: Record<string, unknown>;

	constructor(private readonly _backing: ITestStorageBacking) {
		this._data = { ..._backing.data };
	}

	get<T>(key: string): T | undefined {
		return this._data[key] as T | undefined;
	}

	set<T>(key: string, value: T): void {
		this._data[key] = value;
	}

	async setAndFlush<T>(key: string, value: T): Promise<void> {
		this.set(key, value);
		this._backing.data = { ...this._data };
	}

	delete(key: string): void {
		delete this._data[key];
		this._backing.data = { ...this._data };
	}

	async whenIdle(): Promise<void> { }
}

suite('RemoteSessionDelegation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function waitFor(predicate: () => boolean, label = 'remote delegation state'): Promise<void> {
		for (let attempt = 0; attempt < 1000; attempt++) {
			if (predicate()) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		throw new Error(`Timed out waiting for ${label}.`);
	}

	async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
		return Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`Timed out during ${label}.`)), 5000)),
		]);
	}

	function createFixture(
		database: ISessionDatabase = new TestSessionDatabase(),
		sessionCreationBudget = new SessionCreationBudget(),
		sessionDataService: ISessionDataService = createSessionDataService(database),
	) {
		const sourceConnection = disposables.add(new TestDelegationConnection('host-a-on-b', [{
			provider: 'copilot',
			displayName: 'Host B Copilot',
			description: 'Source provider',
			models: [],
		}]));
		const destinationConnection = disposables.add(new TestDelegationConnection('host-a-on-c', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}]));
		const sourceTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', sourceConnection.clientId, sourceConnection));
		const destinationTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'host-c', destinationConnection.clientId, destinationConnection));
		const remoteAgents = new TestRemoteAgentsService();
		remoteAgents.targets.set([sourceTarget, destinationTarget], undefined);
		const providerService = new TestProviderService();
		const destinationProvider = new MockAgent(remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([destinationTarget.connectorId, destinationTarget.targetId])), 'copilot'));
		providerService.add(destinationProvider);
		const agentService = new TestAgentService();
		const turnService = new TestTurnService();
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionToolCallbacks = new TestSessionToolCallbacks(agentService, turnService, stateManager, sessionCreationBudget);
		const storageBacking: ITestStorageBacking = { data: {} };
		const storageService = new TestPersistentAgentHostStorageService(storageBacking);
		const sourceSession = AgentSession.uri(
			remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([sourceTarget.connectorId, sourceTarget.targetId])), 'copilot'),
			'source',
		);
		const downstreamSession = AgentSession.uri('copilot', 'downstream-source');
		sourceConnection.addSession(downstreamSession);
		const source: IRemoteSessionDelegationSource = {
			session: sourceSession,
			chat: URI.parse(buildDefaultChatUri(sourceSession)),
			connectorId: sourceTarget.connectorId,
			targetId: sourceTarget.targetId,
			downstreamSession,
			spawnDepth: 0,
		};
		const createService = (
			callbacks: IAgentHostSessionToolCallbacks = sessionToolCallbacks,
			durableStorage: IAgentHostStorageService = storageService,
		) => disposables.add(new RemoteSessionDelegationService(
			sessionDataService,
			durableStorage,
			remoteAgents,
			providerService,
			callbacks,
			stateManager,
			new NullLogService(),
		));
		const request = (
			toolCallId: string,
			overrides: Partial<{ target: string; provider: string; prompt: string }> = {},
			confirmed = ToolCallConfirmationReason.UserAction,
		): SessionToolClientExecutionRequest => ({
			id: `client:${toolCallId}`,
			kind: SessionInputRequestKind.ToolClientExecution,
			chat: buildDefaultChatUri(downstreamSession),
			turnId: 'source-turn',
			clientId: sourceConnection.clientId,
			toolCall: {
				status: ToolCallStatus.Running,
				toolCallId,
				toolName: CREATE_REMOTE_SESSION_TOOL_NAME,
				displayName: 'Create Remote Session',
				invocationMessage: 'Creating remote session',
				confirmed,
				contributor: { kind: ToolCallContributorKind.Client, clientId: sourceConnection.clientId },
				toolInput: JSON.stringify({
					target: toRemoteSessionTargetHandle(destinationTarget.connectorId, destinationTarget.targetId),
					provider: 'copilot',
					prompt: 'Delegate this task to Host C',
					...overrides,
				}),
			},
		});
		const registerSource = (spawnDepth = 0) => stateManager.createSession({
			resource: source.session.toString(),
			provider: AgentSession.provider(source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, spawnDepth),
		});
		return {
			sourceConnection,
			sourceTarget,
			destinationTarget,
			destinationProvider,
			providerService,
			remoteAgents,
			agentService,
			turnService,
			sessionToolCallbacks,
			storageBacking,
			storageService,
			stateManager,
			sessionDataService,
			database,
			source,
			createService,
			request,
			registerSource,
		};
	}

	test('keeps failed or tombstoned restore hydration metadata-only and does not execute a pending request', async () => {
		const fixture = createFixture();
		await fixture.database.setMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, JSON.stringify({
			version: 1,
			connectorId: fixture.source.connectorId,
			targetId: fixture.source.targetId,
			provider: AgentSession.provider(fixture.source.downstreamSession),
			session: fixture.source.downstreamSession.toString(),
			chat: buildDefaultChatUri(fixture.source.downstreamSession),
		}));
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('restored-pending'));
		const context = new class extends mock<IAgentHostChatContributionContext>() {
			override readonly contributionId = 'remoteSessionDelegation';
		}();
		const contribution = disposables.add(new RemoteSessionDelegationContribution(
			context,
			fixture.sessionDataService,
			fixture.storageService,
			fixture.remoteAgents,
			fixture.providerService,
			fixture.sessionToolCallbacks,
			fixture.stateManager,
			new NullLogService(),
		));

		await contribution.onHydrateChat?.({
			session: fixture.source.session.toString(),
			chat: fixture.source.chat.toString(),
		}, {});
		await new Promise(resolve => setTimeout(resolve, 0));

		const state = fixture.sourceConnection.getSubscriptionUnmanaged(StateComponents.Session, fixture.source.downstreamSession)?.value;
		assert.deepStrictEqual({
			tools: state && !(state instanceof Error) ? state.activeClients.flatMap(client => client.tools.map(tool => tool.name)) : [],
			createCalls: fixture.agentService.createCalls.length,
			completions: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			tools: [],
			createCalls: 0,
			completions: 0,
		});
	});

	test('rehydrates persisted source depth before enabling execution', async () => {
		const fixture = createFixture();
		await fixture.database.setMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, JSON.stringify({
			version: 1,
			connectorId: fixture.source.connectorId,
			targetId: fixture.source.targetId,
			provider: AgentSession.provider(fixture.source.downstreamSession),
			session: fixture.source.downstreamSession.toString(),
			chat: buildDefaultChatUri(fixture.source.downstreamSession),
		}));
		await fixture.database.setMetadata(REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY, '2');
		const context = new class extends mock<IAgentHostChatContributionContext>() {
			override readonly contributionId = 'remoteSessionDelegation';
		}();
		const contribution = disposables.add(new RemoteSessionDelegationContribution(
			context,
			fixture.sessionDataService,
			fixture.storageService,
			fixture.remoteAgents,
			fixture.providerService,
			fixture.sessionToolCallbacks,
			fixture.stateManager,
			new NullLogService(),
		));

		const hydrationContext = {
			session: fixture.source.session.toString(),
			chat: fixture.source.chat.toString(),
		};
		await contribution.onHydrateChat?.(hydrationContext, {});
		assert.strictEqual(fixture.sourceConnection.activeSubscriptionReferences, 0);
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Restored source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		await contribution.onDidHydrateChat?.(hydrationContext);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-restored-depth'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		assert.deepStrictEqual({
			sourceDepth: readSessionSpawnDepth(fixture.stateManager.getSessionSummary(fixture.source.session.toString())?._meta),
			childDepth: readSessionSpawnDepth(fixture.agentService.createCalls[0]?._meta),
		}, {
			sourceDepth: 2,
			childDepth: 3,
		});
	});

	test('does not reset an ambiguously missing delegated source depth to zero', async () => {
		const fixture = createFixture();
		await fixture.database.setMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, JSON.stringify({
			version: 1,
			connectorId: fixture.source.connectorId,
			targetId: fixture.source.targetId,
			provider: AgentSession.provider(fixture.source.downstreamSession),
			session: fixture.source.downstreamSession.toString(),
			chat: buildDefaultChatUri(fixture.source.downstreamSession),
		}));
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Restored delegated source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionCreationReference(undefined, {
				session: 'copilot:/parent',
				chat: buildDefaultChatUri('copilot:/parent'),
			}),
		});
		const context = new class extends mock<IAgentHostChatContributionContext>() {
			override readonly contributionId = 'remoteSessionDelegation';
		}();
		const contribution = disposables.add(new RemoteSessionDelegationContribution(
			context,
			fixture.sessionDataService,
			fixture.storageService,
			fixture.remoteAgents,
			fixture.providerService,
			fixture.sessionToolCallbacks,
			fixture.stateManager,
			new NullLogService(),
		));

		await assert.rejects(contribution.onDidHydrateChat?.({
			session: fixture.source.session.toString(),
			chat: fixture.source.chat.toString(),
		}) ?? Promise.resolve(), /spawn depth/);
		assert.deepStrictEqual({
			persistedDepth: await fixture.database.getMetadata(REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY),
			subscriptions: fixture.sourceConnection.activeSubscriptionReferences,
		}, {
			persistedDepth: undefined,
			subscriptions: 0,
		});
	});

	test('rejects execution while the source state is absent', async () => {
		const fixture = createFixture();
		const service = fixture.createService();
		await assert.rejects(service.ensureSource(fixture.source), /not resident/);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			subscriptions: fixture.sourceConnection.activeSubscriptionReferences,
		}, {
			createCalls: 0,
			subscriptions: 0,
		});
	});

	test('releases the source subscription on residency eviction and recreates it', async () => {
		const fixture = createFixture();
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Resident source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.stateManager.removeSession(fixture.source.session.toString());
		await new Promise(resolve => setTimeout(resolve, 0));
		const referencesAfterEviction = fixture.sourceConnection.activeSubscriptionReferences;
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Rehydrated source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		await service.ensureSource(fixture.source);

		assert.deepStrictEqual({
			referencesAfterEviction,
			activeReferences: fixture.sourceConnection.activeSubscriptionReferences,
			acquires: fixture.sourceConnection.subscriptionAcquireCount,
		}, {
			referencesAfterEviction: 0,
			activeReferences: 1,
			acquires: 2,
		});
	});

	test('retries publication against the replacement binding generation', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.sourceConnection.setApplyActiveClientActions(false);
		const service = fixture.createService();
		const publication = service.ensureSource(fixture.source);
		await waitFor(() => fixture.sourceConnection.subscriptionAcquireCount === 1, 'initial source publication');
		const replacement = disposables.add(new TestDelegationConnection(fixture.sourceConnection.clientId, [{
			provider: 'copilot',
			displayName: 'Host B Copilot',
			description: 'Source provider',
			models: [],
		}]));
		replacement.addSession(fixture.source.downstreamSession);
		fixture.sourceTarget.connection.set(replacement, undefined);

		await withTimeout(publication, 'replacement source publication');

		assert.deepStrictEqual({
			originalReferences: fixture.sourceConnection.activeSubscriptionReferences,
			replacementReferences: replacement.activeSubscriptionReferences,
		}, {
			originalReferences: 0,
			replacementReferences: 1,
		});
	});

	test('publishes the broker tool and deduplicates duplicate and restarted delivery', async () => {
		const fixture = createFixture(disposables.add(await SessionDatabase.open(':memory:')));
		fixture.registerSource();
		const first = fixture.createService();
		await first.ensureSource(fixture.source);

		const session = fixture.sourceConnection.getSubscriptionUnmanaged(StateComponents.Session, fixture.source.downstreamSession)?.value;
		if (!session || session instanceof Error) {
			throw new Error('Expected source session state');
		}
		const tool = session.activeClients[0]?.tools.find(candidate => candidate.name === CREATE_REMOTE_SESSION_TOOL_NAME);
		assert.ok(tool);
		assert.match(tool.description ?? '', /^Create a persistent agent session/);
		assert.match(tool.description ?? '', /Do not use/);
		assert.match(tool.description ?? '', /same tool invocation/);

		const request = fixture.request('call-1');
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, {
			...request,
			clientId: 'another-client',
			toolCall: {
				...request.toolCall,
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'another-client' },
			},
		});
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(fixture.agentService.createCalls.length, 0);

		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		await fixture.sourceConnection.waitForCompletionCount(1);

		first.dispose();
		fixture.destinationTarget.setUnavailable();
		fixture.providerService.remove(fixture.destinationProvider.id);
		const second = fixture.createService();
		await second.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		await fixture.sourceConnection.waitForCompletionCount(2);

		const completions = fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			prompts: fixture.turnService.starts.map(start => ({
				chat: start.chat.toString(),
				text: start.message.text,
				origin: start.message.origin.kind,
				delegation: readAgentMessageDelegationMeta(start.message),
			})),
			completionResults: completions.map(completion => completion.action.type === ActionType.ChatToolCallComplete ? completion.action.result : undefined),
		}, {
			createCalls: 1,
			prompts: [{
				chat: buildDefaultChatUri(fixture.agentService.createCalls[0].session!),
				text: 'Delegate this task to Host C',
				origin: MessageKind.Agent,
				delegation: {
					sourceSession: fixture.source.session.toString(),
					sourceChat: fixture.source.chat.toString(),
				},
			}],
			completionResults: [completions[0].action.type === ActionType.ChatToolCallComplete ? completions[0].action.result : undefined, completions[0].action.type === ActionType.ChatToolCallComplete ? completions[0].action.result : undefined],
		});
	});

	test('recovers the planned child after result persistence fails without creating another', async () => {
		const fixture = createFixture(new FailResultDatabase());
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-ambiguous'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		first.dispose();
		fixture.sessionToolCallbacks.markSessionCold(fixture.agentService.createCalls[0].session!);
		fixture.sessionToolCallbacks.hideAcceptedPromptBehindHistory();
		fixture.destinationTarget.setUnavailable();
		fixture.providerService.remove(fixture.destinationProvider.id);
		const second = fixture.createService();
		await second.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-ambiguous'));
		await fixture.sourceConnection.waitForCompletionCount(2);

		const completions = fixture.sourceConnection.dispatches
			.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete)
			.map(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete ? dispatch.action.result : undefined);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			promptCount: fixture.turnService.starts.length,
			restoreCalls: fixture.sessionToolCallbacks.restoreCalls.map(session => session.toString()),
			firstError: completions[0]?.error,
			recoveredSuccess: completions[1]?.success,
			recoveredSession: completions[1]?.structuredContent?.session,
		}, {
			createCalls: 1,
			promptCount: 1,
			restoreCalls: [fixture.agentService.createCalls[0].session!.toString()],
			firstError: { message: 'simulated result persistence failure', code: 'remoteSessionResultPersistenceFailed' },
			recoveredSuccess: true,
			recoveredSession: fixture.agentService.createCalls[0].session?.toString(),
		});
	});

	test('does not recreate after crashing between downstream child creation and local registration', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.agentService.crashAfterNextDownstreamCreate(new CancellationError());
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		const request = fixture.request('call-create-crash');
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		await fixture.sourceConnection.waitForCompletionCount(1);

		first.dispose();
		const second = fixture.createService();
		await second.ensureSource(fixture.source);
		await fixture.sourceConnection.waitForCompletionCount(2);

		const completions = fixture.sourceConnection.dispatches
			.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete)
			.map(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete ? dispatch.action.result : undefined);
		const plannedSession = fixture.agentService.createCalls[0].session!;
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.map(call => call.session?.toString()),
			locallyRegistered: fixture.agentService.getSession(plannedSession) !== undefined,
			replayError: completions[1]?.error,
		}, {
			createCalls: [plannedSession.toString()],
			locallyRegistered: false,
			replayError: {
				message: 'The previous create_remote_session child creation has an unknown outcome and will not be retried.',
				code: 'remoteSessionCreationOutcomeUnknown',
			},
		});
	});

	test('commits the breadth budget before persisting accepted prompt progress', async () => {
		const budget = new SessionCreationBudget(1);
		const fixture = createFixture(new FailPromptAcceptedProgressDatabase(), budget);
		fixture.registerSource();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-accepted-progress-failure'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		let nextClaimError: string | undefined;
		try {
			budget.claim('copilot:/different-child').dispose();
		} catch (error) {
			nextClaimError = error instanceof Error ? error.message : String(error);
		}
		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			promptCount: fixture.turnService.starts.length,
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
			nextClaimError,
		}, {
			promptCount: 1,
			error: {
				message: 'simulated promptAccepted persistence failure',
				code: 'remoteSessionProgressPersistenceFailed',
			},
			nextClaimError: 'Refusing to create more than 1 sessions from server tools in this process.',
		});
	});

	test('does not report success before initial prompt admission completes', async () => {
		const fixture = createFixture();
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const acceptance = fixture.turnService.delayAcceptance();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-admission'));
		await waitFor(() => fixture.turnService.starts.length === 1, 'initial prompt dispatch');
		await new Promise(resolve => setTimeout(resolve, 0));
		const completionsBeforeAcceptance = fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length;
		acceptance.complete(true);
		await fixture.sourceConnection.waitForCompletionCount(1);

		assert.strictEqual(completionsBeforeAcceptance, 0);
	});

	test('deletes the planned child when initial prompt admission is rejected', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.turnService.setAccepted(false);
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-rejected'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			error: {
				message: 'The initial prompt for create_remote_session was rejected before provider execution.',
				code: 'remoteSessionPromptRejected',
			},
		});
	});

	test('keeps failed child cleanup pending and retries it before persisting failure', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.turnService.setAccepted(false);
		fixture.agentService.failNextDelete(new Error('temporary child deletion failure'));
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-cleanup-retry'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		first.dispose();
		const second = fixture.createService();
		await second.ensureSource(fixture.source);
		await fixture.sourceConnection.waitForCompletionCount(2);

		const completions = fixture.sourceConnection.dispatches
			.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete)
			.map(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete ? dispatch.action.result : undefined);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			deleteCalls: fixture.agentService.deleteCalls.map(session => session.toString()),
			firstError: completions[0]?.error,
			retriedError: completions[1]?.error,
		}, {
			createCalls: 1,
			deleteCalls: [
				fixture.agentService.createCalls[0].session?.toString(),
				fixture.agentService.createCalls[0].session?.toString(),
			],
			firstError: {
				message: 'Failed to clean up create_remote_session child after The initial prompt for create_remote_session was rejected before provider execution.: temporary child deletion failure',
				code: 'remoteSessionCleanupFailed',
			},
			retriedError: {
				message: 'The initial prompt for create_remote_session was rejected before provider execution.',
				code: 'remoteSessionPromptRejected',
			},
		});
	});

	test('recovers pending child cleanup without replaying the acknowledged request', async () => {
		const database = new ResultTrackingDatabase();
		const fixture = createFixture(database);
		fixture.registerSource();
		fixture.turnService.setAccepted(false);
		fixture.agentService.setDeleteError(new Error('persistent child deletion failure'));
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-cleanup-no-replay'));
		await fixture.sourceConnection.waitForCompletionCount(1);
		const terminalResultCountBeforeRecovery = database.terminalResults.size;
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, undefined);
		first.dispose();

		fixture.agentService.setDeleteError(undefined);
		const second = fixture.createService();
		await second.ensureSource(fixture.source);
		await second.whenIdle();

		const terminalResults = Array.from(database.terminalResults.values(), value => JSON.parse(value));
		assert.deepStrictEqual({
			deleteCalls: fixture.agentService.deleteCalls.map(session => session.toString()),
			childExists: fixture.agentService.getSession(fixture.agentService.createCalls[0].session!) !== undefined,
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
			terminalResultCountBeforeRecovery,
			terminalResults,
		}, {
			deleteCalls: [
				fixture.agentService.createCalls[0].session?.toString(),
				fixture.agentService.createCalls[0].session?.toString(),
			],
			childExists: false,
			completionCount: 1,
			terminalResultCountBeforeRecovery: 0,
			terminalResults: [{
				version: 2,
				kind: 'failure',
				error: {
					message: 'The initial prompt for create_remote_session was rejected before provider execution.',
					code: 'remoteSessionPromptRejected',
				},
			}],
		});
	});

	test('retries partial child deletion idempotently before persisting the terminal result', async () => {
		const database = new ResultTrackingDatabase();
		const fixture = createFixture(database);
		fixture.registerSource();
		fixture.turnService.setAccepted(false);
		fixture.agentService.failNextDeleteAfterSideEffect(new Error('deletion failed after removing the child'));
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-partial-cleanup'));
		await fixture.sourceConnection.waitForCompletionCount(1);
		await service.whenIdle();

		assert.deepStrictEqual({
			deleteCalls: fixture.agentService.deleteCalls.map(session => session.toString()),
			childExists: fixture.agentService.getSession(fixture.agentService.createCalls[0].session!) !== undefined,
			terminalResults: Array.from(database.terminalResults.values(), value => JSON.parse(value)),
		}, {
			deleteCalls: [
				fixture.agentService.createCalls[0].session?.toString(),
				fixture.agentService.createCalls[0].session?.toString(),
			],
			childExists: false,
			terminalResults: [{
				version: 2,
				kind: 'failure',
				error: {
					message: 'The initial prompt for create_remote_session was rejected before provider execution.',
					code: 'remoteSessionPromptRejected',
				},
			}],
		});
	});

	test('cancels in-flight creation and awaits child cleanup when the request is removed', async () => {
		const fixture = createFixture();
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const creation = fixture.agentService.delayCreate();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-cancel'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, undefined);
		creation.complete();
		await waitFor(() => fixture.agentService.deleteCalls.length === 1, 'cancelled child cleanup');

		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			promptCount: fixture.turnService.starts.length,
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			promptCount: 0,
			completionCount: 0,
		});
	});

	test('generation-fences an in-flight prompt and awaits cleanup on disposal', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		const acceptance = fixture.turnService.delayAcceptance();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-dispose'));
		await waitFor(() => fixture.turnService.starts.length === 1, 'initial prompt dispatch');
		service.dispose();
		acceptance.complete(true);
		await service.whenIdle();

		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			completionCount: 0,
		});
	});

	test('does not retry failed cleanup after service disposal', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.agentService.setDeleteError(new Error('persistent child deletion failure'));
		const acceptance = fixture.turnService.delayAcceptance();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-dispose-cleanup-failure'));
		await waitFor(() => fixture.turnService.starts.length === 1, 'initial prompt dispatch');
		service.dispose();
		acceptance.complete(false);
		await withTimeout(service.whenIdle(), 'disposed failed cleanup');
		await timeout(150);

		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			completionCount: 0,
		});
	});

	test('reconnect replay resumes the durable plan with the replacement binding token', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		const firstAcceptance = fixture.turnService.delayAcceptance();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		const request = fixture.request('call-reconnect-generation');
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		await waitFor(() => fixture.turnService.starts.length === 1, 'first-generation prompt');

		const replacement = disposables.add(new TestDelegationConnection(fixture.sourceConnection.clientId, [{
			provider: 'copilot',
			displayName: 'Host B Copilot',
			description: 'Source provider',
			models: [],
		}]));
		replacement.addSession(fixture.source.downstreamSession);
		replacement.setInputNeeded(fixture.source.downstreamSession, request);
		fixture.sourceTarget.connection.set(replacement, undefined);
		await new Promise(resolve => setTimeout(resolve, 0));
		const startsBeforeOldGenerationSettled = fixture.turnService.starts.length;
		firstAcceptance.complete(false);
		await replacement.waitForCompletionCount(1);

		const completion = replacement.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			startsBeforeOldGenerationSettled,
			createdSessions: fixture.agentService.createCalls.map(call => call.session?.toString()),
			deletedSessions: fixture.agentService.deleteCalls.map(session => session.toString()),
			promptCount: fixture.turnService.starts.length,
			success: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.success : undefined,
		}, {
			startsBeforeOldGenerationSettled: 1,
			createdSessions: [
				fixture.agentService.createCalls[0].session?.toString(),
				fixture.agentService.createCalls[0].session?.toString(),
			],
			deletedSessions: [fixture.agentService.createCalls[0].session?.toString()],
			promptCount: 2,
			success: true,
		});
	});

	test('session deletion waits for in-flight child cleanup', async () => {
		const sessionDataService = disposables.add(new TestDeletingSessionDataService());
		const fixture = createFixture(new TestSessionDatabase(), new SessionCreationBudget(), sessionDataService);
		fixture.registerSource();
		const creation = fixture.agentService.delayCreate();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-delete'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		const deletion = sessionDataService.deleteSessionData(fixture.source.session);
		creation.complete();
		await deletion;

		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			promptCount: fixture.turnService.starts.length,
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			promptCount: 0,
			completionCount: 0,
		});
	});

	test('session deletion waits for a successor cleanup attempt before deleting source data', async () => {
		const sessionDataService = disposables.add(new TestDeletingSessionDataService());
		const fixture = createFixture(new TestSessionDatabase(), new SessionCreationBudget(), sessionDataService);
		fixture.registerSource();
		const creation = fixture.agentService.delayCreate();
		const cleanupRetry = fixture.agentService.delayDelete();
		fixture.agentService.failNextDelete(new Error('temporary child deletion failure'));
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-delete-cleanup-retry'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		let deletionCompleted = false;
		const deletion = (async () => {
			await sessionDataService.deleteSessionData(fixture.source.session);
			deletionCompleted = true;
		})();
		creation.complete();
		await waitFor(() => deletionCompleted || fixture.agentService.deleteCalls.length === 2, 'source deletion or child cleanup retry');
		const child = fixture.agentService.createCalls[0].session!;
		const whileRetryBlocked = {
			deletionCompleted,
			deleteCallCount: fixture.agentService.deleteCalls.length,
			childExists: fixture.agentService.getSession(child) !== undefined,
		};
		const successorCleanup = fixture.agentService.delayDelete();
		fixture.agentService.failNextDeleteAfterSideEffect(new AgentHostRemoteTargetUnavailableError(
			fixture.destinationTarget.connectorId,
			fixture.destinationTarget.targetId,
			AgentHostRemoteTargetStatus.Unavailable,
		));
		fixture.destinationTarget.connection.set(disposables.add(new TestDelegationConnection('host-a-on-c-successor', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}])), undefined);
		cleanupRetry.complete();
		await waitFor(() => deletionCompleted || fixture.agentService.deleteCalls.length === 3, 'source deletion or successor child cleanup');
		const whileSuccessorBlocked = {
			deletionCompleted,
			deleteCallCount: fixture.agentService.deleteCalls.length,
			childExists: fixture.agentService.getSession(child) !== undefined,
		};
		successorCleanup.complete();
		await deletion;
		const sourceDatabase = await sessionDataService.tryOpenDatabase(fixture.source.session);
		sourceDatabase?.dispose();

		assert.deepStrictEqual({
			whileRetryBlocked,
			whileSuccessorBlocked,
			deletionCompleted,
			sourceDataExists: sourceDatabase !== undefined,
			childExists: fixture.agentService.getSession(child) !== undefined,
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			deletedSessions: fixture.agentService.deletedSessions.map(session => session.toString()),
			promptCount: fixture.turnService.starts.length,
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			whileRetryBlocked: {
				deletionCompleted: false,
				deleteCallCount: 2,
				childExists: true,
			},
			whileSuccessorBlocked: {
				deletionCompleted: false,
				deleteCallCount: 3,
				childExists: false,
			},
			deletionCompleted: true,
			sourceDataExists: false,
			childExists: false,
			deleted: [
				child.toString(),
				child.toString(),
				child.toString(),
			],
			deletedSessions: [child.toString()],
			promptCount: 0,
			completionCount: 0,
		});
	});

	test('source deletion does not wait for offline cleanup and resumes when the destination reconnects', async () => {
		const sessionDataService = disposables.add(new TestDeletingSessionDataService());
		const fixture = createFixture(new TestSessionDatabase(), new SessionCreationBudget(), sessionDataService);
		fixture.registerSource();
		const creation = fixture.agentService.delayCreate();
		fixture.agentService.setDeleteError(new AgentHostRemoteTargetUnavailableError(
			fixture.destinationTarget.connectorId,
			fixture.destinationTarget.targetId,
			AgentHostRemoteTargetStatus.Unavailable,
		));
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-delete-offline-cleanup'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		fixture.destinationTarget.setUnavailable();
		let deletionCompleted = false;
		const deletion = sessionDataService.deleteSessionData(fixture.source.session).then(() => {
			deletionCompleted = true;
		});
		creation.complete();
		await waitFor(() => fixture.agentService.deleteCalls.length > 0, 'initial child cleanup');
		await timeout(150);
		const whileDestinationOffline = {
			deletionCompleted,
			deleteCallCount: fixture.agentService.deleteCalls.length,
		};

		fixture.agentService.setDeleteError(undefined);
		fixture.destinationTarget.status.set(AgentHostRemoteTargetStatus.Connected, undefined);
		fixture.destinationTarget.connection.set(disposables.add(new TestDelegationConnection('host-a-on-c-recovered', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}])), undefined);
		await withTimeout(deletion, 'offline source deletion');
		await withTimeout(service.whenIdle(), 'recovered child cleanup');
		const child = fixture.agentService.createCalls[0].session!;
		const sourceDatabase = await sessionDataService.tryOpenDatabase(fixture.source.session);
		sourceDatabase?.dispose();

		assert.deepStrictEqual({
			whileDestinationOffline,
			sourceDataExists: sourceDatabase !== undefined,
			childExists: fixture.agentService.getSession(child) !== undefined,
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			whileDestinationOffline: {
				deletionCompleted: true,
				deleteCallCount: 1,
			},
			sourceDataExists: false,
			childExists: false,
			deleted: [
				child.toString(),
				child.toString(),
			],
			completionCount: 0,
		});
	});

	test('recovers offline cleanup after source deletion and service restart', async () => {
		const sessionDataService = disposables.add(new TestDeletingSessionDataService());
		const fixture = createFixture(new TestSessionDatabase(), new SessionCreationBudget(), sessionDataService);
		fixture.registerSource();
		const creation = fixture.agentService.delayCreate();
		fixture.agentService.setDeleteError(new AgentHostRemoteTargetUnavailableError(
			fixture.destinationTarget.connectorId,
			fixture.destinationTarget.targetId,
			AgentHostRemoteTargetStatus.Unavailable,
		));
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-delete-offline-restart-cleanup'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		fixture.destinationTarget.setUnavailable();
		const deletion = sessionDataService.deleteSessionData(fixture.source.session);
		creation.complete();
		await withTimeout(deletion, 'offline source deletion');
		await waitFor(() => fixture.agentService.deleteCalls.length === 1, 'initial child cleanup');
		first.dispose();

		const second = fixture.createService(
			fixture.sessionToolCallbacks,
			new TestPersistentAgentHostStorageService(fixture.storageBacking),
		);
		fixture.agentService.setDeleteError(undefined);
		fixture.destinationTarget.status.set(AgentHostRemoteTargetStatus.Connected, undefined);
		fixture.destinationTarget.connection.set(disposables.add(new TestDelegationConnection('host-a-on-c-restarted', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}])), undefined);
		await withTimeout(second.whenIdle(), 'restarted child cleanup');
		const child = fixture.agentService.createCalls[0].session!;
		const sourceDatabase = await sessionDataService.tryOpenDatabase(fixture.source.session);
		sourceDatabase?.dispose();

		assert.deepStrictEqual({
			sourceDataExists: sourceDatabase !== undefined,
			childExists: fixture.agentService.getSession(child) !== undefined,
			deleteCalls: fixture.agentService.deleteCalls.map(session => session.toString()),
			deletedSessions: fixture.agentService.deletedSessions.map(session => session.toString()),
			completionCount: fixture.sourceConnection.dispatches.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete).length,
		}, {
			sourceDataExists: false,
			childExists: false,
			deleteCalls: [
				child.toString(),
				child.toString(),
			],
			deletedSessions: [child.toString()],
			completionCount: 0,
		});
	});

	test('releases the source while startup cleanup replay is offline and deletes the child once after reconnect', async () => {
		const database = new CleanupReplayTrackingDatabase();
		const sessionDataService = disposables.add(new TestDeletingSessionDataService());
		const fixture = createFixture(database, new SessionCreationBudget(), sessionDataService);
		sessionDataService.setDatabase(fixture.source.session, database);
		fixture.registerSource();
		const acceptance = fixture.turnService.delayAcceptance();
		const request = fixture.request('call-startup-replay-offline-cleanup');
		const unavailable = new AgentHostRemoteTargetUnavailableError(
			fixture.destinationTarget.connectorId,
			fixture.destinationTarget.targetId,
			AgentHostRemoteTargetStatus.Unavailable,
		);
		fixture.agentService.setDeleteError(unavailable);
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, request);
		await waitFor(() => fixture.turnService.starts.length === 1, 'initial prompt dispatch');
		fixture.destinationTarget.setUnavailable();
		acceptance.complete(false);
		await fixture.sourceConnection.waitForCompletionCount(1);
		await waitFor(() => fixture.agentService.deleteCalls.length === 1, 'initial child cleanup');
		first.dispose();

		database.trackReplay();
		const second = fixture.createService(
			fixture.sessionToolCallbacks,
			new TestPersistentAgentHostStorageService(fixture.storageBacking),
		);
		await second.ensureSource(fixture.source);
		await database.replayStarted.p;
		await timeout(0);
		await withTimeout(sessionDataService.deleteSessionData(fixture.source.session), 'source deletion racing offline startup replay');
		const deleteCallCountBeforeReconnect = fixture.agentService.deleteCalls.length;

		fixture.agentService.setDeleteError(undefined);
		fixture.destinationTarget.status.set(AgentHostRemoteTargetStatus.Connected, undefined);
		fixture.destinationTarget.connection.set(disposables.add(new TestDelegationConnection('host-a-on-c-startup-replay-recovered', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}])), undefined);
		await withTimeout(second.whenIdle(), 'startup replay child cleanup after reconnect');
		const child = fixture.agentService.createCalls[0].session!;

		assert.deepStrictEqual({
			deleteCallCountBeforeReconnect,
			deleteCallsAfterReconnect: fixture.agentService.deleteCalls.slice(deleteCallCountBeforeReconnect).map(session => session.toString()),
			deletedSessions: fixture.agentService.deletedSessions.map(session => session.toString()),
			childExists: fixture.agentService.getSession(child) !== undefined,
		}, {
			deleteCallCountBeforeReconnect: 1,
			deleteCallsAfterReconnect: [child.toString()],
			deletedSessions: [child.toString()],
			childExists: false,
		});
	});

	test('recreates a recoverable source subscription and processes replay', async () => {
		const fixture = createFixture();
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.failSessionSubscription(fixture.source.downstreamSession, new Error('temporary subscription failure'));
		await waitFor(() => fixture.sourceConnection.subscriptionAcquireCount === 2, 'replacement source subscription');
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-replayed'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		assert.deepStrictEqual({
			acquires: fixture.sourceConnection.subscriptionAcquireCount,
			createCalls: fixture.agentService.createCalls.length,
		}, {
			acquires: 2,
			createCalls: 1,
		});
	});

	test('fails source publication explicitly on a terminal subscription error', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		fixture.sourceConnection.setApplyActiveClientActions(false);
		const service = fixture.createService();
		const publication = service.ensureSource(fixture.source);
		await waitFor(() => fixture.sourceConnection.subscriptionAcquireCount === 1, 'source subscription');
		fixture.sourceConnection.failSessionSubscription(
			fixture.source.downstreamSession,
			new ProtocolError(AhpErrorCodes.SessionNotFound, 'source was deleted'),
		);

		await assert.rejects(publication, /source was deleted/);
	});

	test('fails an in-flight request explicitly after a terminal subscription error', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		const creation = fixture.agentService.delayCreate();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-terminal'));
		await waitFor(() => fixture.agentService.createCalls.length === 1, 'child creation');
		fixture.sourceConnection.failSessionSubscription(
			fixture.source.downstreamSession,
			new ProtocolError(AhpErrorCodes.SessionNotFound, 'source was deleted'),
		);
		creation.complete();
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			deleted: fixture.agentService.deleteCalls.map(session => session.toString()),
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
		}, {
			deleted: [fixture.agentService.createCalls[0].session?.toString()],
			error: {
				message: 'Source session subscription failed: source was deleted',
				code: 'remoteSessionSourceSubscriptionFailed',
			},
		});
	});

	test('requires create_session confirmation before claiming an invocation', async () => {
		const database = new ClaimTrackingDatabase();
		const fixture = createFixture(database);
		fixture.stateManager.createSession({
			resource: fixture.source.session.toString(),
			provider: AgentSession.provider(fixture.source.session)!,
			title: 'Source',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withSessionSpawnDepth(undefined, 0),
		});
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(
			fixture.source.downstreamSession,
			fixture.request('call-unconfirmed', {}, ToolCallConfirmationReason.NotNeeded),
		);
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			invocationClaims: database.invocationClaims,
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
		}, {
			createCalls: 0,
			invocationClaims: 0,
			error: {
				message: 'Creating a remote session requires confirmation.',
				code: 'remoteSessionConfirmationRequired',
			},
		});
	});

	test('accepts create_session confirmation granted by a setting', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(
			fixture.source.downstreamSession,
			fixture.request('call-setting-confirmed', {}, ToolCallConfirmationReason.Setting),
		);
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			success: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.success : undefined,
		}, {
			createCalls: 1,
			success: true,
		});
	});

	test('shares the create_session breadth budget before claiming an invocation', async () => {
		const database = new ClaimTrackingDatabase();
		const budget = new SessionCreationBudget(1);
		const exhausted = budget.claim();
		exhausted.commit();
		const fixture = createFixture(database, budget);
		fixture.registerSource();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-budget'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls.length,
			invocationClaims: database.invocationClaims,
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
		}, {
			createCalls: 0,
			invocationClaims: 0,
			error: {
				message: 'Refusing to create more than 1 sessions from server tools in this process.',
				code: 'remoteSessionDelegationLimit',
			},
		});
	});

	test('enforces the breadth budget while resuming a persisted child plan', async () => {
		const fixture = createFixture(new FailResultDatabase(), new SessionCreationBudget(1));
		fixture.registerSource();
		const first = fixture.createService();
		await first.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-resume-budget'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		first.dispose();
		const resumedBudget = new SessionCreationBudget(1);
		const unrelated = resumedBudget.claim('copilot:/unrelated');
		unrelated.commit();
		const resumedCallbacks = new TestSessionToolCallbacks(
			fixture.agentService,
			fixture.turnService,
			fixture.stateManager,
			resumedBudget,
		);
		const second = fixture.createService(resumedCallbacks);
		await second.ensureSource(fixture.source);
		await fixture.sourceConnection.waitForCompletionCount(2);

		const completions = fixture.sourceConnection.dispatches
			.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete)
			.map(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete ? dispatch.action.result : undefined);
		assert.deepStrictEqual({
			promptCount: fixture.turnService.starts.length,
			firstError: completions[0]?.error,
			resumedError: completions[1]?.error,
		}, {
			promptCount: 1,
			firstError: { message: 'simulated result persistence failure', code: 'remoteSessionResultPersistenceFailed' },
			resumedError: {
				message: 'Refusing to create more than 1 sessions from server tools in this process.',
				code: 'remoteSessionDelegationLimit',
			},
		});
	});

	test('reports unavailable targets and providers without creating a session', async () => {
		const fixture = createFixture();
		fixture.registerSource();
		const service = fixture.createService();
		await service.ensureSource(fixture.source);

		fixture.destinationTarget.setUnavailable();
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-target'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		service.dispose();
		fixture.destinationTarget.status.set(AgentHostRemoteTargetStatus.Connected, undefined);
		fixture.destinationTarget.connection.set(disposables.add(new TestDelegationConnection('host-a-on-c-2', [{
			provider: 'copilot',
			displayName: 'Host C Copilot',
			description: 'Destination provider',
			models: [],
		}])), undefined);
		const restarted = fixture.createService();
		await restarted.ensureSource(fixture.source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-target'));
		await fixture.sourceConnection.waitForCompletionCount(2);

		fixture.providerService.remove(fixture.destinationProvider.id);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-provider'));
		await fixture.sourceConnection.waitForCompletionCount(3);

		const failures = fixture.sourceConnection.dispatches
			.filter(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete)
			.map(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete ? dispatch.action.result.error : undefined);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls,
			failures,
		}, {
			createCalls: [],
			failures: [
				{ message: 'Remote target is unavailable: fixed/host-c.', code: 'remoteTargetUnavailable' },
				{ message: 'Remote target is unavailable: fixed/host-c.', code: 'remoteTargetUnavailable' },
				{ message: 'Remote provider is unavailable on the admitted target: copilot.', code: 'remoteProviderUnavailable' },
			],
		});
	});

	test('enforces the shared session spawn-depth limit before creation', async () => {
		const fixture = createFixture();
		fixture.registerSource(MAX_SESSION_SPAWN_DEPTH);
		const source = { ...fixture.source, spawnDepth: MAX_SESSION_SPAWN_DEPTH };
		const service = fixture.createService();
		await service.ensureSource(source);
		fixture.sourceConnection.setInputNeeded(fixture.source.downstreamSession, fixture.request('call-depth'));
		await fixture.sourceConnection.waitForCompletionCount(1);

		const completion = fixture.sourceConnection.dispatches.find(dispatch => dispatch.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			createCalls: fixture.agentService.createCalls,
			error: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error : undefined,
		}, {
			createCalls: [],
			error: {
				message: `Refusing to create a remote session: recursion limit reached (max spawn depth ${MAX_SESSION_SPAWN_DEPTH}).`,
				code: 'remoteSessionDelegationLimit',
			},
		});
	});

	test('brokers A to B delegation onto C once across duplicate delivery and reconnect', async function () {
		this.timeout(30_000);
		const logService = new NullLogService();
		const connectorId = 'delegation-fixed';
		const sourceTargetId = 'host-b';
		const destinationTargetId = 'host-c';
		const destinationHandle = toRemoteSessionTargetHandle(connectorId, destinationTargetId);
		const response = {
			startedAt: '2026-09-15T20:00:00.000Z',
			partId: 'scripted-part',
			content: 'done',
			duration: 7,
		};
		const hostB = disposables.add(await ScriptedRemoteAgentHostServer.create({
			agents: [{
				provider: 'copilot',
				displayName: 'Host B Copilot',
				description: 'Source provider',
				models: [],
			}],
		}, logService, response, {
			name: CREATE_REMOTE_SESSION_TOOL_NAME,
			displayName: 'Create Remote Session',
			toolCallId: 'create-remote-session-call',
			requiresConfirmation: true,
			input: JSON.stringify({
				target: destinationHandle,
				provider: 'copilot',
				prompt: 'Run this once on Host C',
			}),
		}));
		const hostC = disposables.add(await ScriptedRemoteAgentHostServer.create({
			agents: [{
				provider: 'copilot',
				displayName: 'Host C Copilot',
				description: 'Destination provider',
				models: [],
			}],
		}, logService, response));
		const fileService = disposables.add(new FileService(logService));
		const sessionDataService = new TestMappedSessionDataService();
		const productService: IProductService = { ...product, _serviceBrand: undefined };
		const hostA = disposables.add(createTestAgentService(
			logService,
			fileService,
			sessionDataService,
			productService,
			createNoopGitService(),
		));
		const remoteAgents = getTestAgentHostRemoteAgentsService(hostA);
		const reconnectPolicy: IRemoteAgentHostReconnectPolicy = {
			autoRestore: true,
			initialDelayMs: 0,
			maxDelayMs: 0,
			maxAttempts: 3,
		};
		const clientReconnectPolicy: IRemoteAgentHostReconnectPolicy = {
			autoRestore: false,
			initialDelayMs: 0,
			maxDelayMs: 0,
			maxAttempts: 0,
		};
		const connector = new TestAgentHostRemoteTargetConnector(connectorId, async (target, options) => {
			const address = target.targetId === sourceTargetId ? hostB.address : hostC.address;
			const transportFactory = await NodeWebSocketClientTransport.createFactory(address, undefined, logService);
			return new AgentHostProtocolClientCore(address, transportFactory, {
				clientId: options.clientId,
				reconnectPolicy: clientReconnectPolicy,
			}, logService);
		}, reconnectPolicy);
		disposables.add(remoteAgents.registerContribution({
			activate: context => {
				context.registerTargetConnector(connector);
				return Disposable.None;
			},
		}));
		connector.setTargets([
			remoteTarget('host-b-internal', sourceTargetId, 'Host B'),
			remoteTarget('host-c-internal', destinationTargetId, 'Host C'),
		]);
		getTestAgentHostManagedSettingsService(hostA).setClientRemoteAgentHostsEnabled('test-client', true);
		getTestAgentServiceComposition(hostA).configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });

		const sourceProvider = remoteAgentHostSessionTypeId(toRemoteSessionTargetHandle(connectorId, sourceTargetId), 'copilot');
		const destinationProvider = remoteAgentHostSessionTypeId(destinationHandle, 'copilot');
		const providerService = getTestAgentHostProviderService(hostA);
		await waitFor(() => !!providerService.getProvider(sourceProvider) && !!providerService.getProvider(destinationProvider), 'remote provider registration');
		let completedTurns = 0;
		let relayedConfirmation: SessionToolConfirmationRequest | undefined;
		disposables.add(hostA.onDidAction(envelope => {
			if (envelope.action.type === ActionType.ChatTurnComplete) {
				completedTurns++;
			} else if (envelope.action.type === ActionType.SessionInputNeededSet
				&& envelope.action.request.kind === SessionInputRequestKind.ToolConfirmation) {
				relayedConfirmation = envelope.action.request;
			}
		}));

		const sourceSession = AgentSession.uri(sourceProvider, 'host-a-source');
		try {
			await withTimeout(hostA.createSession({ provider: sourceProvider, session: sourceSession, workingDirectories: [] }), 'source session creation');
		} catch (error) {
			throw new Error(`${error instanceof Error ? error.message : String(error)} B creates=${hostB.createSessionCalls.length}; targets=${remoteAgents.targets.get().map(target => `${target.targetId}:${target.status.get()}`).join(',')}`);
		}
		const sourceChat = buildDefaultChatUri(sourceSession);
		hostA.dispatchAction(sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-turn',
			startedAt: response.startedAt,
			message: { text: 'Delegate to Host C', origin: { kind: MessageKind.User } },
		}, 'test-client', 1);
		await waitFor(() => relayedConfirmation !== undefined, 'relayed tool confirmation');
		const confirmation = relayedConfirmation;
		if (!confirmation) {
			throw new Error('Expected a relayed tool confirmation');
		}
		const beforeApproval = {
			hostBResults: hostB.receivedClientToolResults.length,
			hostCCreateCount: hostC.createSessionCalls.length,
			hostCTurnCount: hostC.receivedTurnStartedActions.length,
		};
		hostA.dispatchAction(confirmation.chat, {
			type: ActionType.ChatToolCallConfirmed,
			turnId: confirmation.turnId,
			toolCallId: confirmation.toolCall.toolCallId,
			approved: true,
			confirmed: ToolCallConfirmationReason.UserAction,
		}, 'test-client', 2);

		try {
			await waitFor(() => hostB.receivedClientToolResults.length === 1 && hostC.receivedTurnStartedActions.length === 1 && completedTurns >= 2, 'initial delegation');
		} catch (error) {
			throw new Error(`${error instanceof Error ? error.message : String(error)} B turns=${hostB.receivedTurnStartedActions.length}; B tools=${hostB.advertisedClientTools.join(',')}; B results=${hostB.receivedClientToolResults.length}; C creates=${hostC.createSessionCalls.length}; C turns=${hostC.receivedTurnStartedActions.length}`);
		}
		hostB.replayClientToolInvocation();
		await waitFor(() => hostB.receivedClientToolResults.length === 2, 'duplicate delegation result');

		const sourceTarget = remoteAgents.targets.get().find(target => target.connectorId === connectorId && target.targetId === sourceTargetId);
		if (!sourceTarget) {
			throw new Error('Expected source target');
		}
		const sourceCreateCount = connector.createCalls.length;
		hostB.disconnectClients();
		try {
			await waitFor(() => sourceTarget.status.get() === AgentHostRemoteTargetStatus.Connected && connector.createCalls.length > sourceCreateCount, 'source target reconnect');
		} catch (error) {
			throw new Error(`${error instanceof Error ? error.message : String(error)} status=${sourceTarget.status.get()}; connections=${hostB.activeConnectionCount}; connectorCreates=${connector.createCalls.length}`);
		}
		hostB.replayClientToolInvocation();
		await waitFor(() => hostB.receivedClientToolResults.length === 3, 'replayed delegation result');

		const result = hostB.receivedClientToolResults[0].structuredContent;
		const delegatedSession = typeof result?.session === 'string' ? result.session : undefined;
		const delegatedChat = typeof result?.chat === 'string' ? result.chat : undefined;
		const openLink = typeof result?.openLink === 'string' ? result.openLink : undefined;
		if (!delegatedSession || !delegatedChat || !openLink) {
			throw new Error('Expected a structured create_remote_session result');
		}
		const sessions = await hostA.listSessions();
		const stateManager = getTestAgentServiceComposition(hostA).stateManager;
		const delegatedSummary = stateManager.getSessionSummary(delegatedSession);
		const delegatedState = stateManager.getChatState(delegatedChat);
		const delegatedMessage = delegatedState?.turns[0]?.message ?? delegatedState?.activeTurn?.message;
		const delegatedDatabase = await sessionDataService.tryOpenDatabase(URI.parse(delegatedSession));
		const persistedSpawnDepth = await delegatedDatabase?.object.getMetadata(REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY);
		delegatedDatabase?.dispose();
		assert.deepStrictEqual({
			delegatedSession,
			delegatedChat,
			openLink,
			creationReference: readSessionCreationReference(delegatedSummary?._meta),
			spawnDepth: readSessionSpawnDepth(delegatedSummary?._meta),
			persistedSpawnDepth,
			delegation: delegatedMessage ? readAgentMessageDelegationMeta(delegatedMessage) : undefined,
			relayedConfirmation: {
				chat: confirmation.chat,
				turnId: confirmation.turnId,
				toolCallIdIsNamespaced: confirmation.toolCall.toolCallId !== 'create-remote-session-call',
				status: confirmation.toolCall.status,
			},
			beforeApproval,
			resultReplay: hostB.receivedClientToolResults.every(candidate => equals(candidate, hostB.receivedClientToolResults[0])),
			hostASessions: sessions
				.filter(session => session.session.toString() === sourceSession.toString() || session.session.toString() === delegatedSession)
				.map(session => ({ session: session.session.toString(), provider: AgentSession.provider(session.session) }))
				.sort((left, right) => left.session.localeCompare(right.session)),
			hostCCreateCount: hostC.createSessionCalls.length,
			hostCPrompts: hostC.receivedTurnStartedActions.map(action => action.message.text),
		}, {
			delegatedSession,
			delegatedChat: buildDefaultChatUri(delegatedSession),
			openLink: buildOpenSessionLinkUri(delegatedSession),
			creationReference: {
				session: sourceSession.toString(),
				chat: sourceChat,
			},
			spawnDepth: 1,
			persistedSpawnDepth: '1',
			delegation: {
				sourceSession: sourceSession.toString(),
				sourceChat,
			},
			relayedConfirmation: {
				chat: sourceChat,
				turnId: 'source-turn',
				toolCallIdIsNamespaced: true,
				status: ToolCallStatus.PendingConfirmation,
			},
			beforeApproval: {
				hostBResults: 0,
				hostCCreateCount: 0,
				hostCTurnCount: 0,
			},
			resultReplay: true,
			hostASessions: [
				{ session: sourceSession.toString(), provider: sourceProvider },
				{ session: delegatedSession, provider: destinationProvider },
			].sort((left, right) => left.session.localeCompare(right.session)),
			hostCCreateCount: 1,
			hostCPrompts: ['Run this once on Host C'],
		});
		await sessionDataService.whenIdle();
		await new Promise(resolve => setTimeout(resolve, 0));
	});
});
