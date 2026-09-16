/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, type IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, type IAgent, type IAgentCreateSessionConfig } from '../../common/agent.js';
import { AgentHostRemoteTargetStatus, AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetHandle } from '../../common/agentHostRemoteAgents.js';
import { remoteAgentHostSessionTypeId } from '../../common/agentHostSessionType.js';
import { agentHostAuthority } from '../../common/agentHostUri.js';
import type { IAgentConnection } from '../../common/agentService.js';
import { AgentSubscriptionManager, type IActiveSubscriptionInfo, type IAgentSubscription } from '../../common/state/agentSubscription.js';
import { ActionType, isChatAction, type ActionEnvelope, type ChatAction, type ClientAnnotationsAction, type ClientAutomationAction, type ClientAutomationRunAction, type ClientChangesetAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionStatus, StateComponents, TurnState, type ChatState, type ComponentToState, type RootState } from '../../common/state/sessionState.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostProviderService } from '../../node/agentHostProviderService.js';
import type { IAgentHostRemoteAgentsContribution, IAgentHostRemoteAgentsService } from '../../node/agentHostRemoteAgentsService.js';
import { AgentHostRemoteAgentProviderContribution } from '../../node/remoteAgent/remoteAgentProviderContribution.js';
import { MockAgent } from './mockAgent.js';

const remoteCatalog: RootState['agents'][number] = {
	provider: 'copilot',
	displayName: 'Remote Copilot',
	description: 'Copilot on another Agent Host',
	models: [{
		id: 'gpt-remote',
		provider: 'copilot',
		name: 'GPT Remote',
		supportsVision: true,
	}],
};

const downstreamProtectedResource: NonNullable<RootState['agents'][number]['protectedResources']>[number] = {
	resource: 'https://api.example.com',
	resource_name: 'Example API',
	authorization_servers: ['https://login.example.com'],
	required: true,
};

function emptyChatState(resource: URI): ChatState {
	return {
		resource: resource.toString(),
		title: 'Remote chat',
		status: SessionStatus.Idle,
		modifiedAt: new Date(0).toISOString(),
		turns: [],
	};
}

class TestAgentConnection extends mock<IAgentConnection>() {
	private readonly _store = new DisposableStore();
	private readonly _onDidAction = this._store.add(new Emitter<ActionEnvelope>());
	override readonly onDidAction = this._onDidAction.event;
	override readonly onDidNotification = Event.None;
	override readonly onMcpNotification = Event.None;

	private _serverSeq = 0;
	private _clientSeq = 0;
	private _sessionCount = 0;
	private _subscribeCount = 0;
	private readonly _chatStates = new Map<string, ChatState>();
	private readonly _subscriptions: AgentSubscriptionManager;

	override readonly rootState: IAgentSubscription<RootState>;
	readonly createSessionCalls: IAgentCreateSessionConfig[] = [];
	readonly dispatchCalls: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction; clientSeq: number }[] = [];
	readonly disposeSessionCalls: URI[] = [];
	readonly authenticateCalls: Parameters<IAgentConnection['authenticate']>[0][] = [];
	readonly subscriptionErrors: Error[] = [];
	dispatchError: Error | undefined;

	constructor(
		override readonly clientId: string,
		agents: RootState['agents'] = [remoteCatalog],
		private readonly _subscriptionGate?: DeferredPromise<void>,
	) {
		super();
		this._subscriptions = this._store.add(new AgentSubscriptionManager(
			clientId,
			() => ++this._clientSeq,
			() => { },
			async resource => {
				this._subscribeCount++;
				await this._subscriptionGate?.p;
				const subscriptionError = this.subscriptionErrors.shift();
				if (subscriptionError) {
					throw subscriptionError;
				}
				const state = this._chatStates.get(resource.toString());
				if (!state) {
					throw new Error(`Unknown test subscription: ${resource.toString()}`);
				}
				return { resource: resource.toString(), state, fromSeq: this._serverSeq };
			},
			() => { },
		));
		this.rootState = this._subscriptions.rootState;
		this._subscriptions.handleRootSnapshot({ agents: [...agents] }, 0);
		this._store.add(this._onDidAction.event(envelope => this._subscriptions.receiveEnvelope(envelope)));
	}

	setAgents(agents: RootState['agents']): void {
		this._receive(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents });
	}

	setChatState(chat: URI, state: ChatState): void {
		this._chatStates.set(chat.toString(), state);
	}

	get subscribeCount(): number {
		return this._subscribeCount;
	}

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (!config?.provider) {
			throw new Error('Expected a provider');
		}
		this.createSessionCalls.push(config);
		const session = config.session ?? AgentSession.uri(config.provider, `remote-session-${++this._sessionCount}`);
		const chat = URI.parse(buildDefaultChatUri(session));
		this._chatStates.set(chat.toString(), emptyChatState(chat));
		return session;
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this._subscriptions.getSubscription<ComponentToState[T]>(kind, resource, owner);
	}

	override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		return this._subscriptions.getSubscriptionUnmanaged<ComponentToState[T]>(resource);
	}

	override getInflightSessionCreate(): Promise<unknown> | undefined {
		return undefined;
	}

	override getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		return this._subscriptions.getActiveSubscriptions();
	}

	override dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		if (this.dispatchError) {
			throw this.dispatchError;
		}
		const clientSeq = this._subscriptions.dispatchOptimistic(channel, action);
		this.dispatchCalls.push({ channel, action, clientSeq });
	}

	acknowledgeLastDispatch(): void {
		const call = this.dispatchCalls[this.dispatchCalls.length - 1];
		this._receive(call.channel, call.action, { clientId: this.clientId, clientSeq: call.clientSeq });
	}

	sendServerAction(channel: URI, action: ChatAction): void {
		this._receive(channel.toString(), action);
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposeSessionCalls.push(session);
	}

	override async authenticate(params: Parameters<IAgentConnection['authenticate']>[0]) {
		this.authenticateCalls.push(params);
		return { authenticated: true };
	}

	dispose(): void {
		this._store.dispose();
	}

	private _receive(channel: string, action: ActionEnvelope['action'], origin?: ActionEnvelope['origin']): void {
		this._onDidAction.fire({
			channel,
			action,
			serverSeq: ++this._serverSeq,
			origin,
		});
	}
}

async function observeSettlement(promise: Promise<void>): Promise<'resolved' | 'rejected' | 'pending'> {
	const pending = new DeferredPromise<'pending'>();
	const timer = disposableTimeout(() => pending.complete('pending'), 20);
	try {
		return await Promise.race([
			promise.then(() => 'resolved' as const, () => 'rejected' as const),
			pending.p,
		]);
	} finally {
		timer.dispose();
	}
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (predicate()) {
			return;
		}
		await timeout(5);
	}
	throw new Error('Timed out waiting for Remote Agent test state');
}

class TestRemoteTargetHandle extends Disposable implements IAgentHostRemoteTargetHandle {
	private readonly _label;
	readonly label;
	private readonly _status;
	readonly status;
	private readonly _connection;
	readonly connection;
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	constructor(
		readonly connectorId: string,
		readonly targetId: string,
		readonly clientId: string,
		label: string,
		connection: IAgentConnection | undefined,
	) {
		super();
		this._label = observableValue(this, label);
		this.label = this._label;
		this._status = observableValue(this, connection ? AgentHostRemoteTargetStatus.Connected : AgentHostRemoteTargetStatus.Unavailable);
		this.status = this._status;
		this._connection = observableValue<IAgentConnection | undefined>(this, connection);
		this.connection = this._connection;
	}

	setConnection(connection: IAgentConnection | undefined, status = connection ? AgentHostRemoteTargetStatus.Connected : AgentHostRemoteTargetStatus.Reconnecting): void {
		this._connection.set(connection, undefined);
		this._status.set(status, undefined);
	}

	requireConnection(): IAgentConnection {
		const connection = this._connection.get();
		if (!connection) {
			throw new AgentHostRemoteTargetUnavailableError(this.connectorId, this.targetId, this._status.get());
		}
		return connection;
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._onDidDispose.fire();
		super.dispose();
	}
}

class TestRemoteAgentsService implements IAgentHostRemoteAgentsService {
	declare readonly _serviceBrand: undefined;
	readonly enabled = constObservable(true);
	readonly tunnelDiscoveryEnabled = constObservable(false);
	private readonly _targets = observableValue<readonly IAgentHostRemoteTargetHandle[]>(this, []);
	readonly targets = this._targets;

	setTargets(targets: readonly IAgentHostRemoteTargetHandle[]): void {
		this._targets.set(targets, undefined);
	}

	activate() {
		return Disposable.None;
	}

	registerContribution(_contribution: IAgentHostRemoteAgentsContribution) {
		return Disposable.None;
	}
}

suite('RemoteAgent', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createProviderService(): AgentHostProviderService {
		const logService = new NullLogService();
		const authentication = disposables.add(new AgentHostAuthenticationService(logService));
		return disposables.add(new AgentHostProviderService(authentication, logService));
	}

	function createContribution(service: TestRemoteAgentsService, providers: AgentHostProviderService): AgentHostRemoteAgentProviderContribution {
		return disposables.add(new AgentHostRemoteAgentProviderContribution(service, providers, new NullLogService()));
	}

	test('keeps colliding downstream providers distinct and reconciles target availability and catalog removal', async () => {
		const providers = createProviderService();
		providers.registerProvider(new MockAgent('copilot'));
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('11111111-1111-4111-8111-111111111111'));
		const secondConnection = disposables.add(new TestAgentConnection('11111111-1111-4111-8111-111111111111'));
		const first = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', firstConnection.clientId, 'Host B', firstConnection));
		const second = disposables.add(new TestRemoteTargetHandle('fixed', 'host-c', secondConnection.clientId, 'Host C', secondConnection));
		createContribution(remoteAgents, providers);

		remoteAgents.setTargets([first, second]);
		const firstProviderId = remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([first.connectorId, first.targetId])), 'copilot');
		const secondProviderId = remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([second.connectorId, second.targetId])), 'copilot');
		const firstAgent = providers.getProvider(firstProviderId);
		const firstSession = AgentSession.uri(firstProviderId, 'local');
		const firstChat = URI.parse(buildDefaultChatUri(firstSession));
		await firstAgent!.chats.createChat(firstChat, firstSession);
		firstConnection.setAgents([{
			...remoteCatalog,
			models: [{ ...remoteCatalog.models[0], id: 'gpt-updated', name: 'GPT Updated' }],
		}]);
		first.setConnection(undefined);
		firstConnection.setAgents([]);

		assert.deepStrictEqual({
			providers: providers.getProviders().map(provider => provider.id),
			firstRetainedDuringReconnect: providers.getProvider(firstProviderId) === firstAgent,
			firstModels: firstAgent?.models.get().map(model => model.id),
			firstSupportsVision: firstAgent?.models.get().map(model => model.supportsVision),
			modelProviders: providers.getProviders().flatMap(provider => provider.models.get().map(model => model.provider)),
			oldConnectionSubscriptions: firstConnection.getActiveSubscriptions(),
		}, {
			providers: ['copilot', firstProviderId, secondProviderId],
			firstRetainedDuringReconnect: true,
			firstModels: ['gpt-updated'],
			firstSupportsVision: [false],
			modelProviders: [firstProviderId, secondProviderId],
			oldConnectionSubscriptions: [],
		});

		await assert.rejects(firstAgent!.chats.getMessages(firstChat, firstSession), AgentHostRemoteTargetUnavailableError);

		firstConnection.setAgents([{
			...remoteCatalog,
			models: [{ ...remoteCatalog.models[0], id: 'gpt-updated', name: 'GPT Updated' }],
		}]);
		first.setConnection(firstConnection);
		firstConnection.setAgents([]);
		second.dispose();

		assert.deepStrictEqual(
			providers.getProviders().map(provider => provider.id),
			['copilot'],
		);

	});

	test('does not recursively mirror remote providers across a two-host cycle', () => {
		const firstProviders = createProviderService();
		const secondProviders = createProviderService();
		const firstRemoteAgents = new TestRemoteAgentsService();
		const secondRemoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('cycle-a-to-b'));
		const secondConnection = disposables.add(new TestAgentConnection('cycle-b-to-a'));
		const firstTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', firstConnection.clientId, 'Host B', firstConnection));
		const secondTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'host-a', secondConnection.clientId, 'Host A', secondConnection));
		createContribution(firstRemoteAgents, firstProviders);
		createContribution(secondRemoteAgents, secondProviders);
		firstRemoteAgents.setTargets([firstTarget]);
		secondRemoteAgents.setTargets([secondTarget]);
		const firstRemoteProvider = firstProviders.getProviders()[0];
		const secondRemoteProvider = secondProviders.getProviders()[0];

		firstConnection.setAgents([remoteCatalog, {
			...secondRemoteProvider.getDescriptor(),
			models: [...secondRemoteProvider.models.get()],
		}]);
		secondConnection.setAgents([remoteCatalog, {
			...firstRemoteProvider.getDescriptor(),
			models: [...firstRemoteProvider.models.get()],
		}]);

		assert.deepStrictEqual({
			firstProviders: firstProviders.getProviders().map(provider => provider.id),
			secondProviders: secondProviders.getProviders().map(provider => provider.id),
		}, {
			firstProviders: [firstRemoteProvider.id],
			secondProviders: [secondRemoteProvider.id],
		});
	});

	test('namespaces protected resources per target and reverses them for downstream authentication', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const catalog = [{ ...remoteCatalog, protectedResources: [downstreamProtectedResource] }];
		const firstConnection = disposables.add(new TestAgentConnection('auth-client-a', catalog));
		const secondConnection = disposables.add(new TestAgentConnection('auth-client-b', catalog));
		const first = disposables.add(new TestRemoteTargetHandle('fixed', 'auth-host-a', firstConnection.clientId, 'Auth Host A', firstConnection));
		const second = disposables.add(new TestRemoteTargetHandle('fixed', 'auth-host-b', secondConnection.clientId, 'Auth Host B', secondConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([first, second]);
		const [firstAgent, secondAgent] = providers.getProviders();
		const firstResource = firstAgent.getProtectedResources()[0];
		const secondResource = secondAgent.getProtectedResources()[0];

		const authenticated = await providers.authenticate({ resource: firstResource.resource, token: 'secret', expiresIn: 60 });

		assert.deepStrictEqual({
			resourcesAreNamespaced: firstResource.resource !== downstreamProtectedResource.resource
				&& secondResource.resource !== downstreamProtectedResource.resource
				&& firstResource.resource !== secondResource.resource,
			resourceSchemes: [URI.parse(firstResource.resource).scheme, URI.parse(secondResource.resource).scheme],
			firstResource: { ...firstResource, resource: '<namespaced>' },
			secondResource: { ...secondResource, resource: '<namespaced>' },
			authenticated,
			firstAuthentication: firstConnection.authenticateCalls,
			secondAuthentication: secondConnection.authenticateCalls,
		}, {
			resourcesAreNamespaced: true,
			resourceSchemes: [Schemas.https, Schemas.https],
			firstResource: { ...downstreamProtectedResource, resource: '<namespaced>' },
			secondResource: { ...downstreamProtectedResource, resource: '<namespaced>' },
			authenticated: { authenticated: true },
			firstAuthentication: [{ resource: downstreamProtectedResource.resource, token: 'secret', expiresIn: 60 }],
			secondAuthentication: [],
		});

	});

	test('rematerializes resident chat bindings when a provider generation is re-registered', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const progress: ChatAction[] = [];
		disposables.add(providers.registerProviderInitializer(provider => provider.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		})));
		const firstConnection = disposables.add(new TestAgentConnection('generation-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'generation-host', firstConnection.clientId, 'Generation Host', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const firstAgent = providers.getProviders()[0];
		const localSession = AgentSession.uri(firstAgent.id, 'generation-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await firstAgent.chats.createChat(localChat, localSession);
		const remoteChat = firstConnection.getActiveSubscriptions()[0].resource;
		target.setConnection(undefined);

		const secondConnection = disposables.add(new TestAgentConnection('generation-client'));
		const remoteTurnId = 'remote:generation-client:turn:generation-turn';
		secondConnection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			status: SessionStatus.InProgress,
			activeTurn: {
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Queued before registration', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'queued-part', content: 'Queued progress' }],
				usage: { inputTokens: 9, outputTokens: 10 },
			},
		});
		target.setConnection(secondConnection);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');
		secondConnection.setAgents([]);
		assert.deepStrictEqual(providers.getProviders(), []);
		secondConnection.setAgents([remoteCatalog]);
		const secondAgent = providers.getProviders()[0];
		assert.deepStrictEqual(progress, []);

		secondAgent.getOrCreateActiveClient(localChat, localSession, { clientId: 'local-client' });
		assert.deepStrictEqual(progress, [{
			type: ActionType.ChatTurnStarted,
			turnId: 'generation-turn',
			startedAt: '2026-09-15T20:00:00.000Z',
			message: { text: 'Queued before registration', origin: { kind: MessageKind.User } },
		}, {
			type: ActionType.ChatResponsePart,
			turnId: 'generation-turn',
			part: {
				kind: ResponsePartKind.Markdown,
				id: 'remote:generation-client:part:queued-part',
				content: 'Queued progress',
			},
		}, {
			type: ActionType.ChatUsage,
			turnId: 'generation-turn',
			usage: { inputTokens: 9, outputTokens: 10 },
		}]);
		progress.length = 0;

		secondConnection.setAgents([]);
		secondConnection.setAgents([remoteCatalog]);
		const thirdAgent = providers.getProviders()[0];
		assert.deepStrictEqual(progress, []);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');
		secondConnection.sendServerAction(remoteChat, {
			type: ActionType.ChatDelta,
			turnId: remoteTurnId,
			partId: 'queued-part',
			content: ' delivered live',
		});
		await thirdAgent.chats.abort(localChat, localSession);
		await thirdAgent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			newGeneration: secondAgent !== firstAgent,
			thirdGeneration: thirdAgent !== secondAgent,
			progress,
			dispatches: secondConnection.dispatchCalls.map(call => call.action.type),
		}, {
			newGeneration: true,
			thirdGeneration: true,
			progress: [{
				type: ActionType.ChatDelta,
				turnId: 'generation-turn',
				partId: 'remote:generation-client:part:queued-part',
				content: ' delivered live',
			}],
			dispatches: [ActionType.ChatTurnCancelled],
		});
	});

	test('transfers resident chat bindings when a stable target is re-admitted with a replacement handle', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('target-readmission-client'));
		const firstTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'stable-target', firstConnection.clientId, 'Stable Target', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([firstTarget]);
		const firstAgent = providers.getProviders()[0];
		const localSession = AgentSession.uri(firstAgent.id, 'target-readmission-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await firstAgent.chats.createChat(localChat, localSession);
		const remoteSession = firstConnection.createSessionCalls[0].session!;
		const remoteChat = URI.parse(buildDefaultChatUri(remoteSession));

		firstTarget.dispose();
		remoteAgents.setTargets([]);
		assert.deepStrictEqual(providers.getProviders(), []);

		const secondConnection = disposables.add(new TestAgentConnection('target-readmission-client'));
		secondConnection.setChatState(remoteChat, emptyChatState(remoteChat));
		const secondTarget = disposables.add(new TestRemoteTargetHandle('fixed', 'stable-target', secondConnection.clientId, 'Stable Target', secondConnection));
		remoteAgents.setTargets([secondTarget]);
		const secondAgent = providers.getProviders()[0];
		await secondAgent.chats.sendMessage(localChat, 'After target re-admission', undefined, undefined, 'target-readmission-turn');
		await secondAgent.chats.abort(localChat, localSession);
		await secondAgent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			stableProviderId: secondAgent.id,
			newGeneration: secondAgent !== firstAgent,
			dispatches: secondConnection.dispatchCalls.map(call => call.action.type),
		}, {
			stableProviderId: firstAgent.id,
			newGeneration: true,
			dispatches: [ActionType.ChatTurnStarted, ActionType.ChatTurnCancelled],
		});
	});

	test('creates, streams, aborts, restores history, releases, and disposes one workspace-less chat', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const connection = disposables.add(new TestAgentConnection('33333333-3333-4333-8333-333333333333'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', connection.clientId, 'Host B', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'local-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		const progress: { resource: string; type: string; turnId?: string; partId?: string }[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action') {
				const action = signal.action;
				const entry = { resource: signal.resource.toString(), type: action.type };
				switch (action.type) {
					case ActionType.ChatResponsePart:
						progress.push({
							...entry,
							turnId: action.turnId,
							...(action.part.kind === ResponsePartKind.Markdown || action.part.kind === ResponsePartKind.Reasoning ? { partId: action.part.id } : {}),
						});
						break;
					case ActionType.ChatDelta:
					case ActionType.ChatReasoning:
						progress.push({ ...entry, turnId: action.turnId, partId: action.partId });
						break;
					case ActionType.ChatTurnComplete:
					case ActionType.ChatError:
						progress.push({ ...entry, turnId: action.turnId });
						break;
					default:
						progress.push(entry);
				}
			}
		}));

		const created = await agent.chats.createChat(localChat, localSession, { model: { id: 'gpt-remote' } });
		assert.ok(created?.providerData);
		await agent.chats.sendMessage(localChat, 'Hello from A', undefined, undefined, 'local-turn');
		const started = connection.dispatchCalls[0];
		assert.strictEqual(started.action.type, ActionType.ChatTurnStarted);
		const remoteTurnId = started.action.turnId;
		connection.acknowledgeLastDispatch();
		const downstreamChat = URI.parse(started.channel);
		connection.sendServerAction(downstreamChat, {
			type: ActionType.ChatResponsePart,
			turnId: remoteTurnId,
			part: { kind: ResponsePartKind.Markdown, id: 'remote-part', content: '' },
		});
		connection.sendServerAction(downstreamChat, {
			type: ActionType.ChatDelta,
			turnId: remoteTurnId,
			partId: 'remote-part',
			content: 'Hello from B',
		});
		connection.sendServerAction(downstreamChat, {
			type: ActionType.ChatTurnComplete,
			turnId: remoteTurnId,
			duration: 12,
		});

		const history = await agent.chats.getMessages(localChat, localSession);
		await agent.chats.sendMessage(localChat, 'Fail', [], undefined, 'local-error');
		const errorStarted = connection.dispatchCalls[connection.dispatchCalls.length - 1];
		assert.strictEqual(errorStarted.action.type, ActionType.ChatTurnStarted);
		connection.acknowledgeLastDispatch();
		connection.sendServerAction(downstreamChat, {
			type: ActionType.ChatError,
			turnId: errorStarted.action.turnId,
			duration: 4,
			part: {
				kind: ResponsePartKind.Error,
				error: { errorType: 'ScriptedError', message: 'Scripted failure' },
			},
		});
		await agent.chats.sendMessage(localChat, 'Stop', [], undefined, 'local-abort');
		const abortStarted = connection.dispatchCalls[connection.dispatchCalls.length - 1];
		assert.strictEqual(abortStarted.action.type, ActionType.ChatTurnStarted);
		await agent.chats.abort(localChat, localSession);
		const cancelled = connection.dispatchCalls[connection.dispatchCalls.length - 1];
		assert.strictEqual(cancelled.action.type, ActionType.ChatTurnCancelled);
		const subscriptionsBeforeRelease = connection.getActiveSubscriptions();
		await agent.chats.releaseChat(localChat, localSession);
		const subscriptionsAfterRelease = connection.getActiveSubscriptions();
		await agent.materializeChat(localChat, localSession, created.providerData);
		await Promise.resolve();
		const subscriptionsAfterRestore = connection.getActiveSubscriptions();
		await agent.chats.disposeChat(localChat, localSession);

		assert.deepStrictEqual({
			createConfig: {
				provider: connection.createSessionCalls[0].provider,
				model: connection.createSessionCalls[0].model,
				workingDirectories: connection.createSessionCalls[0].workingDirectories,
				sessionProvider: AgentSession.provider(connection.createSessionCalls[0].session!),
				sessionIsNamespaced: AgentSession.id(connection.createSessionCalls[0].session!).startsWith(`remote-${connection.clientId}-`),
			},
			started: {
				channel: started.channel,
				type: started.action.type,
				turnIdIsNamespaced: remoteTurnId !== 'local-turn' && remoteTurnId.endsWith('local-turn'),
				message: started.action.message,
			},
			progress,
			history,
			cancelled: {
				channel: cancelled.channel,
				type: cancelled.action.type,
				turnId: cancelled.action.turnId,
			},
			subscriptionCounts: [
				subscriptionsBeforeRelease.length,
				subscriptionsAfterRelease.length,
				subscriptionsAfterRestore.length,
				connection.getActiveSubscriptions().length,
			],
			disposeSessionCalls: connection.disposeSessionCalls.map(session => session.toString()),
		}, {
			createConfig: {
				provider: 'copilot',
				model: { id: 'gpt-remote' },
				workingDirectories: [],
				sessionProvider: 'copilot',
				sessionIsNamespaced: true,
			},
			started: {
				channel: buildDefaultChatUri(connection.createSessionCalls[0].session!),
				type: ActionType.ChatTurnStarted,
				turnIdIsNamespaced: true,
				message: { text: 'Hello from A', origin: { kind: MessageKind.User }, model: { id: 'gpt-remote' } },
			},
			progress: [{
				resource: localChat.toString(),
				type: ActionType.ChatResponsePart,
				turnId: 'local-turn',
				partId: progress[0].partId,
			}, {
				resource: localChat.toString(),
				type: ActionType.ChatDelta,
				turnId: 'local-turn',
				partId: progress[0].partId,
			}, {
				resource: localChat.toString(),
				type: ActionType.ChatTurnComplete,
				turnId: 'local-turn',
			}, {
				resource: localChat.toString(),
				type: ActionType.ChatError,
				turnId: 'local-error',
			}],
			history: [{
				id: 'local-turn',
				startedAt: started.action.startedAt,
				duration: 12,
				message: { text: 'Hello from A', origin: { kind: MessageKind.User }, model: { id: 'gpt-remote' } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: progress[0].partId, content: 'Hello from B' }],
				usage: undefined,
				state: TurnState.Complete,
			}],
			cancelled: {
				channel: started.channel,
				type: ActionType.ChatTurnCancelled,
				turnId: abortStarted.action.turnId,
			},
			subscriptionCounts: [1, 0, 1, 0],
			disposeSessionCalls: [connection.createSessionCalls[0].session!.toString()],
		});

	});

	test('rejects workspace-backed creation and mismatched provider data', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const connection = disposables.add(new TestAgentConnection('44444444-4444-4444-8444-444444444444'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', connection.clientId, 'Host B', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent: IAgent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'local-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));

		await assert.rejects(
			agent.chats.createChat(localChat, localSession, { workingDirectories: [URI.file('C:\\workspace')] }),
			/workspace-less/,
		);
		await assert.rejects(
			agent.materializeChat(localChat, localSession, JSON.stringify({
				version: 1,
				connectorId: 'fixed',
				targetId: 'other-host',
				provider: 'copilot',
				session: 'copilot:/remote',
				chat: buildDefaultChatUri('copilot:/remote'),
			})),
			/does not belong/,
		);

	});

	test('aborts before the initial subscription is ready without starting a downstream turn', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('55555555-5555-4555-8555-555555555555', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'host-b', connection.clientId, 'Host B', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'local-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);

		const send = agent.chats.sendMessage(localChat, 'Do not send', undefined, undefined, 'cancelled-before-send');
		await agent.chats.abort(localChat, localSession);
		const settlement = await observeSettlement(send);
		subscriptionGate.complete();
		await send;
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			settlement,
			dispatches: connection.dispatchCalls,
		}, {
			settlement: 'resolved',
			dispatches: [],
		});
	});

	test('releasing a binding rejects its pending subscription wait and removes the subscription', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('release-client', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'release-host', connection.clientId, 'Release Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'release-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);

		const send = agent.chats.sendMessage(localChat, 'Pending', undefined, undefined, 'pending-turn');
		await agent.chats.releaseChat(localChat, localSession);
		const settlement = await observeSettlement(send);
		subscriptionGate.complete();

		assert.deepStrictEqual({
			settlement,
			subscriptions: connection.getActiveSubscriptions(),
			dispatches: connection.dispatchCalls,
		}, {
			settlement: 'rejected',
			subscriptions: [],
			dispatches: [],
		});

	});

	test('discards an errored subscription and reacquires on the next operation', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('retry-client', [remoteCatalog], subscriptionGate));
		const originalError = new Error('scripted subscription failure');
		connection.subscriptionErrors.push(originalError);
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'retry-host', connection.clientId, 'Retry Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'retry-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);

		const firstRead = agent.chats.getMessages(localChat, localSession);
		subscriptionGate.complete();
		await assert.rejects(firstRead, error => error === originalError);
		await waitFor(() => connection.getActiveSubscriptions().length === 0);

		const history = await agent.chats.getMessages(localChat, localSession);
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			history,
			subscribeCount: connection.subscribeCount,
		}, {
			history: [],
			subscribeCount: 2,
		});
	});

	test('does not dispatch when the captured connection is released as its subscription becomes ready', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('stale-client', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'stale-host', connection.clientId, 'Stale Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'stale-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const subscription = connection.getSubscriptionUnmanaged(StateComponents.Chat, connection.getActiveSubscriptions()[0].resource);
		assert.ok(subscription);
		disposables.add(subscription.onDidChange(() => target.setConnection(undefined)));

		const send = agent.chats.sendMessage(localChat, 'Do not dispatch', undefined, undefined, 'stale-turn');
		subscriptionGate.complete();
		const settlement = await send.then(() => 'resolved', () => 'rejected');

		assert.deepStrictEqual({
			settlement,
			subscriptions: connection.getActiveSubscriptions(),
			dispatches: connection.dispatchCalls,
		}, {
			settlement: 'rejected',
			subscriptions: [],
			dispatches: [],
		});
	});

	test('retains the active turn when abort dispatch fails so abort can be retried', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const connection = disposables.add(new TestAgentConnection('abort-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'abort-host', connection.clientId, 'Abort Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'abort-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		await agent.chats.sendMessage(localChat, 'Start', undefined, undefined, 'abort-turn');
		connection.dispatchError = new Error('abort dispatch failed');

		await assert.rejects(agent.chats.abort(localChat, localSession), /abort dispatch failed/);
		connection.dispatchError = undefined;
		await agent.chats.abort(localChat, localSession);
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual(connection.dispatchCalls.map(call => {
			const action = call.action;
			return action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatTurnCancelled
				? { type: action.type, turnId: action.turnId }
				: { type: action.type };
		}), [{
			type: ActionType.ChatTurnStarted,
			turnId: `remote:${connection.clientId}:turn:abort-turn`,
		}, {
			type: ActionType.ChatTurnCancelled,
			turnId: `remote:${connection.clientId}:turn:abort-turn`,
		}]);
	});

	test('clears a stale active turn from a replacement connection snapshot', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('snapshot-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'snapshot-host', firstConnection.clientId, 'Snapshot Host', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'snapshot-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));
		await agent.chats.createChat(localChat, localSession);
		await agent.chats.sendMessage(localChat, 'First', undefined, undefined, 'first-turn');
		const remoteChat = URI.parse(firstConnection.dispatchCalls[0].channel);
		target.setConnection(undefined);

		const secondConnection = disposables.add(new TestAgentConnection('snapshot-client'));
		secondConnection.setChatState(remoteChat, emptyChatState(remoteChat));
		target.setConnection(secondConnection);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');
		await agent.chats.sendMessage(localChat, 'Second', undefined, undefined, 'second-turn');
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual(secondConnection.dispatchCalls.map(call => call.action.type === ActionType.ChatTurnStarted ? call.action.turnId : call.action.type), [
			`remote:${secondConnection.clientId}:turn:second-turn`,
		]);
		assert.deepStrictEqual(progress, [{
			type: ActionType.ChatTurnCancelled,
			turnId: 'first-turn',
			duration: 0,
		}]);
	});

	test('restores an active turn from an initialized subscription snapshot', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const connection = disposables.add(new TestAgentConnection('restore-active-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'restore-active-host', connection.clientId, 'Restore Active Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'restore-active-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		const created = await agent.chats.createChat(localChat, localSession);
		assert.ok(created?.providerData);
		const remoteChat = connection.getActiveSubscriptions()[0].resource;
		await agent.chats.releaseChat(localChat, localSession);
		const remoteTurnId = `remote:${connection.clientId}:turn:restored-turn`;
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));
		connection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			status: SessionStatus.InProgress,
			activeTurn: {
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Still running', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'restored-part', content: 'Restored partial response' }],
				usage: { inputTokens: 5, outputTokens: 6 },
			},
		});
		await agent.materializeChat(localChat, localSession, created.providerData);
		await agent.chats.getMessages(localChat, localSession);
		assert.deepStrictEqual(progress, []);

		await agent.chats.abort(localChat, localSession);
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			dispatches: connection.dispatchCalls.map(call => ({
				type: call.action.type,
				turnId: call.action.type === ActionType.ChatTurnCancelled ? call.action.turnId : undefined,
			})),
			progress,
		}, {
			dispatches: [{
				type: ActionType.ChatTurnCancelled,
				turnId: remoteTurnId,
			}],
			progress: [{
				type: ActionType.ChatTurnStarted,
				turnId: 'restored-turn',
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Still running', origin: { kind: MessageKind.User } },
			}, {
				type: ActionType.ChatResponsePart,
				turnId: 'restored-turn',
				part: {
					kind: ResponsePartKind.Markdown,
					id: `remote:${connection.clientId}:part:restored-part`,
					content: 'Restored partial response',
				},
			}, {
				type: ActionType.ChatUsage,
				turnId: 'restored-turn',
				usage: { inputTokens: 5, outputTokens: 6 },
			}],
		});
	});

	test('propagates terminal progress when a replacement snapshot completed the active turn', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('completed-snapshot-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'completed-snapshot-host', firstConnection.clientId, 'Completed Snapshot Host', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'completed-snapshot-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		const terminalProgress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				terminalProgress.push(signal.action);
			}
		}));
		await agent.chats.createChat(localChat, localSession);
		await agent.chats.sendMessage(localChat, 'Complete while disconnected', undefined, undefined, 'completed-turn');
		const started = firstConnection.dispatchCalls[0];
		assert.strictEqual(started.action.type, ActionType.ChatTurnStarted);
		const remoteChat = URI.parse(started.channel);
		target.setConnection(undefined);

		const secondConnection = disposables.add(new TestAgentConnection('completed-snapshot-client'));
		secondConnection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			turns: [{
				id: started.action.turnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				duration: 9,
				message: started.action.message,
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'completed-part', content: 'Completed while disconnected' }],
				usage: { inputTokens: 7, outputTokens: 8 },
				state: TurnState.Complete,
			}],
		});
		target.setConnection(secondConnection);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual(terminalProgress, [{
			type: ActionType.ChatResponsePart,
			turnId: 'completed-turn',
			part: {
				kind: ResponsePartKind.Markdown,
				id: `remote:${secondConnection.clientId}:part:completed-part`,
				content: 'Completed while disconnected',
			},
		}, {
			type: ActionType.ChatUsage,
			turnId: 'completed-turn',
			usage: { inputTokens: 7, outputTokens: 8 },
		}, {
			type: ActionType.ChatTurnComplete,
			turnId: 'completed-turn',
			duration: 9,
		}]);
	});

	test('reconciles a completed readiness snapshot without dispatching another turn start', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('completed-readiness-client', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'completed-readiness-host', connection.clientId, 'Completed Readiness Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'completed-readiness-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const remoteChat = connection.getActiveSubscriptions()[0].resource;
		const remoteTurnId = `remote:${connection.clientId}:turn:completed-readiness-turn`;
		connection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			turns: [{
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				duration: 11,
				message: { text: 'Already completed', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'ready-part', content: 'Already done' }],
				usage: { inputTokens: 1, outputTokens: 2 },
				state: TurnState.Complete,
			}],
		});
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));

		const send = agent.chats.sendMessage(localChat, 'Already completed', undefined, undefined, 'completed-readiness-turn');
		subscriptionGate.complete();
		await send;
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			dispatches: connection.dispatchCalls,
			progress,
		}, {
			dispatches: [],
			progress: [{
				type: ActionType.ChatResponsePart,
				turnId: 'completed-readiness-turn',
				part: {
					kind: ResponsePartKind.Markdown,
					id: `remote:${connection.clientId}:part:ready-part`,
					content: 'Already done',
				},
			}, {
				type: ActionType.ChatUsage,
				turnId: 'completed-readiness-turn',
				usage: { inputTokens: 1, outputTokens: 2 },
			}, {
				type: ActionType.ChatTurnComplete,
				turnId: 'completed-readiness-turn',
				duration: 11,
			}],
		});
	});

	test('reconciles a matching active snapshot received before a later send', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('preexisting-active-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'preexisting-active-host', firstConnection.clientId, 'Preexisting Active Host', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'preexisting-active-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const remoteChat = firstConnection.getActiveSubscriptions()[0].resource;
		target.setConnection(undefined);

		const secondConnection = disposables.add(new TestAgentConnection('preexisting-active-client'));
		const remoteTurnId = `remote:${secondConnection.clientId}:turn:preexisting-active-turn`;
		secondConnection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			status: SessionStatus.InProgress,
			activeTurn: {
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Already active', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'preexisting-part', content: 'Already streaming' }],
				usage: { inputTokens: 12, outputTokens: 13 },
			},
		});
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));
		target.setConnection(secondConnection);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');

		await agent.chats.sendMessage(localChat, 'Already active', undefined, undefined, 'preexisting-active-turn');
		await agent.chats.abort(localChat, localSession);
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			dispatches: secondConnection.dispatchCalls.map(call => call.action.type),
			progress,
		}, {
			dispatches: [ActionType.ChatTurnCancelled],
			progress: [{
				type: ActionType.ChatTurnStarted,
				turnId: 'preexisting-active-turn',
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Already active', origin: { kind: MessageKind.User } },
			}, {
				type: ActionType.ChatResponsePart,
				turnId: 'preexisting-active-turn',
				part: {
					kind: ResponsePartKind.Markdown,
					id: `remote:${secondConnection.clientId}:part:preexisting-part`,
					content: 'Already streaming',
				},
			}, {
				type: ActionType.ChatUsage,
				turnId: 'preexisting-active-turn',
				usage: { inputTokens: 12, outputTokens: 13 },
			}],
		});
	});

	test('reconciles a matching completed snapshot received before a later send', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const firstConnection = disposables.add(new TestAgentConnection('preexisting-complete-client'));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'preexisting-complete-host', firstConnection.clientId, 'Preexisting Complete Host', firstConnection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'preexisting-complete-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const remoteChat = firstConnection.getActiveSubscriptions()[0].resource;
		target.setConnection(undefined);

		const secondConnection = disposables.add(new TestAgentConnection('preexisting-complete-client'));
		const remoteTurnId = `remote:${secondConnection.clientId}:turn:preexisting-complete-turn`;
		secondConnection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			turns: [{
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				duration: 14,
				message: { text: 'Already complete', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'complete-part', content: 'Already completed' }],
				usage: { inputTokens: 14, outputTokens: 15 },
				state: TurnState.Complete,
			}],
		});
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));
		target.setConnection(secondConnection);
		await waitFor(() => secondConnection.getActiveSubscriptions()[0]?.status === 'snapshot');

		await agent.chats.sendMessage(localChat, 'Already complete', undefined, undefined, 'preexisting-complete-turn');
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			dispatches: secondConnection.dispatchCalls,
			progress,
		}, {
			dispatches: [],
			progress: [{
				type: ActionType.ChatResponsePart,
				turnId: 'preexisting-complete-turn',
				part: {
					kind: ResponsePartKind.Markdown,
					id: `remote:${secondConnection.clientId}:part:complete-part`,
					content: 'Already completed',
				},
			}, {
				type: ActionType.ChatUsage,
				turnId: 'preexisting-complete-turn',
				usage: { inputTokens: 14, outputTokens: 15 },
			}, {
				type: ActionType.ChatTurnComplete,
				turnId: 'preexisting-complete-turn',
				duration: 14,
			}],
		});
	});

	test('treats a matching readiness snapshot turn as already dispatched', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('matching-snapshot-client', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'matching-snapshot-host', connection.clientId, 'Matching Snapshot Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'matching-snapshot-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const remoteChat = connection.getActiveSubscriptions()[0].resource;
		const remoteTurnId = `remote:${connection.clientId}:turn:matching-turn`;
		connection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			status: SessionStatus.InProgress,
			activeTurn: {
				id: remoteTurnId,
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Already sent', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'snapshot-part', content: 'Restored response' }],
				usage: { inputTokens: 3, outputTokens: 4 },
			},
		});
		const progress: ChatAction[] = [];
		disposables.add(agent.onDidChatProgress(signal => {
			if (signal.kind === 'action' && isChatAction(signal.action)) {
				progress.push(signal.action);
			}
		}));

		const send = agent.chats.sendMessage(localChat, 'Already sent', undefined, undefined, 'matching-turn');
		assert.deepStrictEqual(progress, []);
		subscriptionGate.complete();
		await send;
		await agent.chats.abort(localChat, localSession);
		await agent.chats.releaseChat(localChat, localSession);

		assert.deepStrictEqual({
			dispatches: connection.dispatchCalls.map(call => ({
				type: call.action.type,
				turnId: call.action.type === ActionType.ChatTurnCancelled ? call.action.turnId : undefined,
			})),
			progress,
		}, {
			dispatches: [{
				type: ActionType.ChatTurnCancelled,
				turnId: remoteTurnId,
			}],
			progress: [{
				type: ActionType.ChatResponsePart,
				turnId: 'matching-turn',
				part: {
					kind: ResponsePartKind.Markdown,
					id: `remote:${connection.clientId}:part:snapshot-part`,
					content: 'Restored response',
				},
			}, {
				type: ActionType.ChatUsage,
				turnId: 'matching-turn',
				usage: { inputTokens: 3, outputTokens: 4 },
			}],
		});
	});

	test('rejects a send when the readiness snapshot contains a conflicting active turn', async () => {
		const providers = createProviderService();
		const remoteAgents = new TestRemoteAgentsService();
		const subscriptionGate = new DeferredPromise<void>();
		const connection = disposables.add(new TestAgentConnection('conflicting-snapshot-client', [remoteCatalog], subscriptionGate));
		const target = disposables.add(new TestRemoteTargetHandle('fixed', 'conflicting-snapshot-host', connection.clientId, 'Conflicting Snapshot Host', connection));
		createContribution(remoteAgents, providers);
		remoteAgents.setTargets([target]);
		const agent = providers.getProviders()[0];
		const localSession = AgentSession.uri(agent.id, 'conflicting-snapshot-session');
		const localChat = URI.parse(buildDefaultChatUri(localSession));
		await agent.chats.createChat(localChat, localSession);
		const remoteChat = connection.getActiveSubscriptions()[0].resource;
		connection.setChatState(remoteChat, {
			...emptyChatState(remoteChat),
			status: SessionStatus.InProgress,
			activeTurn: {
				id: `remote:${connection.clientId}:turn:other-turn`,
				startedAt: '2026-09-15T20:00:00.000Z',
				message: { text: 'Other turn', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			},
		});

		const send = agent.chats.sendMessage(localChat, 'Conflicting send', undefined, undefined, 'requested-turn');
		subscriptionGate.complete();

		await assert.rejects(send, /active turn/);
		await agent.chats.releaseChat(localChat, localSession);
		assert.deepStrictEqual(connection.dispatchCalls, []);
	});
});
