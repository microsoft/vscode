/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Relay } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDelayedChannel, IChannelServer, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { ipcRenderer } from '../../../base/parts/sandbox/electron-browser/globals.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostAhpJsonlLoggingSettingId, AgentHostByokModelsEnabledSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostIpcChannels, IAgentCreateChatOptions, IAgentCreateSessionConfig, IAgentHostInspectInfo, IAgentHostService, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult, IAgentHostSocketInfo, IConnectionTrackerService, IMcpNotification, AgentHostOTelPolicyIpcChannel, readAgentHostOTelPolicySettings } from '../common/agentService.js';
import { IAgentHostEnablementService } from '../common/agentHostEnablementService.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import type { InitializeResult } from '../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { wrapAgentServiceWithAhpLogging } from './localAhpJsonlLogging.js';
import { AgentSubscriptionManager, isActionEnvelopeRelevantToSubscriptionUris, type IActiveSubscriptionInfo, type IAgentSubscription } from '../common/state/agentSubscription.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { ActionType, type ActionEnvelope, type INotification, type IRootConfigChangedAction, type SessionAction, type ChatAction, type TerminalAction, type ClientAnnotationsAction, type ClientChangesetAction } from '../common/state/sessionActions.js';
import { createRemoteWatchHandle, type IRemoteWatchHandle } from '../common/agentHostFileSystemProvider.js';
import type { CreateResourceWatchParams, CreateResourceWatchResult, ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWriteParams, ResourceWriteResult, IStateSnapshot } from '../common/state/sessionProtocol.js';
import { StateComponents, ROOT_STATE_URI, parseChatUri, type RootState } from '../common/state/sessionState.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_CLIENT_RESOURCE_CHANNEL, AgentHostClientResourceChannel } from '../common/agentHostClientResourceChannel.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, AgentHostClientByokLmChannel } from '../common/agentHostClientByokLmChannel.js';
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, AgentHostClientProxyChannel } from '../common/agentHostClientProxyChannel.js';
import { TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryLevelConfigKey, AgentHostCodexEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyEnabledConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, getAgentHostTerminalAutoApproveRulesConfig, SESSION_SYNC_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, GLOBAL_AUTO_APPROVE_SETTING_ID, AUTO_REPLY_SETTING_ID, PREFER_LONG_CONTEXT_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';

/**
 * Renderer-side implementation of {@link IAgentHostService} that connects
 * directly to the agent host utility process via MessagePort, bypassing
 * the main process relay. Uses the same `getDelayedChannel` pattern as
 * the pty host so the proxy is usable immediately while the port is acquired.
 */
export class LocalAgentHostServiceClient extends Disposable implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	/** Unique identifier for this window, used in action envelope origin tracking. */
	readonly clientId = generateUuid();

	private readonly _clientEventually = new DeferredPromise<MessagePortClient>();
	private readonly _proxy: IAgentService;
	private readonly _ahpLogger: AhpJsonlLogger | undefined;
	private readonly _connectionTracker: IConnectionTrackerService;
	private readonly _subscriptionManager: AgentSubscriptionManager;
	private readonly _subscribedResources = new Map<string, number>();

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit = this._onAgentHostExit.event;
	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _onMcpNotification = this._register(new Relay<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', true);
	readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	private _authenticationSettled = false;
	private _completionTriggerCharactersOnce: Promise<readonly string[]> | undefined;
	private readonly _initializeResult: ISettableObservable<InitializeResult | undefined> = observableValue('agentHostInitializeResult', undefined);

	setAuthenticationPending(pending: boolean): void {
		// Sticky: once the first authentication pass settles, never surface
		// pending again. Subsequent re-auths (account/session changes, reconnect)
		// happen silently in the background and should not flicker the UI.
		if (this._authenticationSettled) {
			return;
		}
		if (!pending) {
			this._authenticationSettled = true;
		}
		this._authenticationPending.set(pending, undefined);
	}

	get initializeResult(): IObservable<InitializeResult | undefined> {
		return this._initializeResult;
	}

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		// Create a proxy backed by a delayed channel - usable immediately,
		// calls queue until the MessagePort connection is established.
		const rawProxy = ProxyChannel.toService<IAgentService>(
			getDelayedChannel(this._clientEventually.p.then(client => client.getChannel(AgentHostIpcChannels.AgentHost)))
		);

		// Optionally wrap the proxy with a logging layer that synthesizes JSON-RPC
		// frames for every request/response/notification on the in-process MessagePort
		// channel, mirroring the AHP transport JSONL logs produced by remote agent hosts.
		this._ahpLogger = this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)
			? this._register(this._instantiationService.createInstance(AhpJsonlLogger, {
				logsHome: environmentService.logsHome,
				connectionId: this.clientId,
				transport: 'local',
			}))
			: undefined;
		this._proxy = this._ahpLogger ? wrapAgentServiceWithAhpLogging(rawProxy, this._ahpLogger) : rawProxy;

		this._connectionTracker = ProxyChannel.toService<IConnectionTrackerService>(
			getDelayedChannel(this._clientEventually.p.then(client => client.getChannel(AgentHostIpcChannels.ConnectionTracker)))
		);

		this._subscriptionManager = this._register(new AgentSubscriptionManager(
			this.clientId,
			() => this.nextClientSeq(),
			msg => this._logService.warn(`[AgentHost:renderer] ${msg}`),
			resource => this.subscribe(resource),
			resource => this.unsubscribe(resource),
		));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)) {
				this._updateTelemetryLevel();
			}
			if (e.affectsConfiguration(SESSION_SYNC_ENABLED_SETTING_ID)) {
				this._updateSessionSyncEnabled();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID)) {
				this._updateTerminalAutoApproveEnabled();
			}
			if (e.affectsConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID)) {
				this._updateGlobalAutoApproveEnabled();
			}
			if (e.affectsConfiguration(AUTO_REPLY_SETTING_ID)) {
				this._updateAutoReplyEnabled();
			}
			if (e.affectsConfiguration(PREFER_LONG_CONTEXT_SETTING_ID)) {
				this._updatePreferLongContextEnabled();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID) || e.affectsConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID)) {
				this._updateTerminalAutoApproveRules();
			}
			if (e.affectsConfiguration(AgentHostCodexAgentEnabledSettingId)) {
				this._updateCodexEnabled();
			}
		}));

		if (agentHostEnablementService.enabled) {
			this._connect();
		}
	}

	private async _connect(): Promise<void> {
		this._logService.info('[AgentHost:renderer] Acquiring MessagePort to agent host...');
		// Forward the enterprise-resolved OTel policy to the main-process starter BEFORE
		// requesting the connection. The main config service does not include the renderer-only
		// managed-settings policy (`AccountPolicyService`), so without this the agent host would
		// be spawned missing managed OTel settings (endpoint/protocol/enabled). Sent first so it
		// is processed (FIFO per sender) before the starter spawns the host on the connection
		// request. See `AgentHostOTelPolicyIpcChannel`.
		ipcRenderer.send(AgentHostOTelPolicyIpcChannel, readAgentHostOTelPolicySettings(this._configurationService));
		const port = await acquirePort('vscode:createAgentHostMessageChannel', 'vscode:createAgentHostMessageChannelResult');
		this._logService.info('[AgentHost:renderer] MessagePort acquired, creating client...');

		const store = this._register(new DisposableStore());
		// Use clientId as the IPC ctx so the agent host can route reverse-RPC
		// calls (vscode-agent-client filesystem reads) back to this renderer
		// via `IPCServer.getChannel(name, c => c.ctx === clientId)`.
		const client = store.add(new MessagePortClient(port, this.clientId));
		registerAgentHostClientChannels(client, this._instantiationService, this._logService, this._ahpLogger, this._configurationService.getValue<boolean>(AgentHostByokModelsEnabledSettingId) === true);

		// The in-process (local) transport does not perform the AHP `initialize`
		// handshake, so synthesize a minimal InitializeResult carrying the only
		// field meaningful to clients here: the terminal command prefix. It is
		// hardcoded to match the host's `BANG_COMMAND_PREFIX` (`!`) — the local
		// host runs the same bundled code, so there is no need for an extra RPC
		// round-trip. Set before `complete(client)` so any session created
		// afterwards observes it.
		this._initializeResult.set({ protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [], terminalCommandPrefix: '!' }, undefined);

		this._clientEventually.complete(client);
		this._updateTelemetryLevel();
		this._updateSessionSyncEnabled();
		this._updateTerminalAutoApproveEnabled();
		this._updateGlobalAutoApproveEnabled();
		this._updateAutoReplyEnabled();
		this._updatePreferLongContextEnabled();
		this._updateTerminalAutoApproveRules();
		this._updateCodexEnabled();

		store.add(this._proxy.onDidAction(e => {
			const revived = revive(e) as ActionEnvelope;
			if (!isActionEnvelopeRelevantToSubscriptionUris(revived, this._subscribedResources.keys())) {
				return;
			}
			if (this._ahpLogger) {
				const frame = { jsonrpc: '2.0' as const, method: 'action', params: e };
				this._ahpLogger.log(frame, 's2c');
			}
			this._subscriptionManager.receiveEnvelope(revived);
			this._onDidAction.fire(revived);
		}));
		store.add(this._proxy.onDidNotification(e => {
			if (this._ahpLogger) {
				const frame = { jsonrpc: '2.0' as const, method: 'notification', params: { notification: e } };
				this._ahpLogger.log(frame, 's2c');
			}
			this._onDidNotification.fire(revive(e));
		}));
		this._onMcpNotification.input = this._proxy.onMcpNotification;
		this._logService.info('[AgentHost:renderer] Direct MessagePort connection established');
		this._onAgentHostStart.fire();

		// Subscribe to root state
		this.subscribe(URI.parse(ROOT_STATE_URI)).then(snapshot => {
			this._subscriptionManager.handleRootSnapshot(snapshot.state as RootState, snapshot.fromSeq);
		}).catch(err => {
			this._logService.error('[AgentHost:renderer] Failed to subscribe to root state', err);
		});
	}

	private _updateTelemetryLevel(): void {
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(getTelemetryLevel(this._configurationService)) },
		}, this.clientId, 0);
	}

	private _updateSessionSyncEnabled(): void {
		const enabled = !!this._configurationService.getValue<boolean>(SESSION_SYNC_ENABLED_SETTING_ID);
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostSessionSyncEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updateTerminalAutoApproveEnabled(): void {
		const enabled = this._configurationService.getValue<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) !== false;
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostTerminalAutoApproveEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updateGlobalAutoApproveEnabled(): void {
		const enabled = this._configurationService.getValue<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID) === true;
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updateAutoReplyEnabled(): void {
		const enabled = this._configurationService.getValue<boolean>(AUTO_REPLY_SETTING_ID) === true;
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostAutoReplyEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updatePreferLongContextEnabled(): void {
		const enabled = this._configurationService.getValue<boolean>(PREFER_LONG_CONTEXT_SETTING_ID) === true;
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostPreferLongContextEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updateCodexEnabled(): void {
		// Disabling only takes effect on the next agent host restart.
		const enabled = this._configurationService.getValue<boolean>(AgentHostCodexAgentEnabledSettingId) === true;
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostCodexEnabledConfigKey]: enabled },
		}, this.clientId, 0);
	}

	private _updateTerminalAutoApproveRules(): void {
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostTerminalAutoApproveRulesConfigKey]: getAgentHostTerminalAutoApproveRulesConfig(this._configurationService) },
		}, this.clientId, 0);
	}

	// ---- IAgentService forwarding (no await needed, delayed channel handles queuing) ----

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._proxy.authenticate(params);
	}
	listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._proxy.listSessions();
	}
	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const promise = this._proxy.createSession(config);
		// When the caller pre-specifies the session URI, a subscribe for
		// that URI can race the in-flight create. Register the promise so
		// `AgentSubscriptionManager.getSubscription` gates the wire-level
		// subscribe on it (avoids transient `AHP_SESSION_NOT_FOUND`).
		// When the server assigns the URI, no caller can subscribe to it
		// ahead of `await createSession()`, so there's no race to track.
		if (config?.session) {
			this._subscriptionManager.trackSessionCreate(config.session, promise);
		}
		return promise;
	}
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this._proxy.resolveSessionConfig(params);
	}
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this._proxy.sessionConfigCompletions(params);
	}
	completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._proxy.completions(params);
	}
	getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._completionTriggerCharactersOnce ??= this._proxy.getCompletionTriggerCharacters();
	}
	disposeSession(session: URI): Promise<void> {
		return this._proxy.disposeSession(session);
	}
	createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
		return this._proxy.createChat(session, chat, options);
	}
	disposeChat(chat: URI): Promise<void> {
		const session = parseChatUri(chat)?.session;
		if (!session) {
			return Promise.resolve();
		}
		return this._proxy.disposeChat(URI.parse(session), chat);
	}
	createTerminal(params: CreateTerminalParams): Promise<void> {
		return this._proxy.createTerminal(params);
	}
	disposeTerminal(terminal: URI): Promise<void> {
		return this._proxy.disposeTerminal(terminal);
	}
	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		return this._proxy.invokeChangesetOperation(params);
	}
	handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		return this._proxy.handleMcpRequest(channel, method, params);
	}
	shutdown(): Promise<void> {
		return this._proxy.shutdown();
	}
	private subscribe(resource: URI): Promise<IStateSnapshot> {
		this._addSubscribedResource(resource);
		return this._proxy.subscribe(resource, this.clientId).catch(err => {
			this._removeSubscribedResource(resource);
			throw err;
		});
	}
	private unsubscribe(resource: URI): void {
		this._removeSubscribedResource(resource);
		this._proxy.unsubscribe(resource, this.clientId);
	}

	private _addSubscribedResource(resource: URI): void {
		const key = resource.toString();
		this._subscribedResources.set(key, (this._subscribedResources.get(key) ?? 0) + 1);
	}

	private _removeSubscribedResource(resource: URI): void {
		const key = resource.toString();
		const count = this._subscribedResources.get(key);
		if (count === undefined) {
			return;
		}
		if (count === 1) {
			this._subscribedResources.delete(key);
		} else {
			this._subscribedResources.set(key, count - 1);
		}
	}
	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this._proxy.dispatchAction(channel, action, clientId, clientSeq);
	}
	private _nextSeq = 1;
	nextClientSeq(): number {
		return this._nextSeq++;
	}

	get rootState(): IAgentSubscription<RootState> {
		return this._subscriptionManager.rootState;
	}

	getSubscription<T>(kind: StateComponents, resource: URI, owner: string): IReference<IAgentSubscription<T>> {
		return this._subscriptionManager.getSubscription<T>(kind, resource, owner);
	}

	getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		return this._subscriptionManager.getSubscriptionUnmanaged<T>(resource);
	}

	getInflightSessionCreate(resource: URI): Promise<unknown> | undefined {
		return this._subscriptionManager.getInflightSessionCreate(resource);
	}

	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		return this._subscriptionManager.getActiveSubscriptions();
	}

	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		const seq = this._subscriptionManager.dispatchOptimistic(channel, action);
		this.dispatchAction(channel, action, this.clientId, seq);
	}

	resourceList(uri: URI): Promise<ResourceListResult> {
		return this._proxy.resourceList(uri);
	}
	resourceRead(uri: URI): Promise<ResourceReadResult> {
		return this._proxy.resourceRead(uri);
	}
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		return this._proxy.resourceWrite(params);
	}
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		return this._proxy.resourceCopy(params);
	}
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		return this._proxy.resourceDelete(params);
	}
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		return this._proxy.resourceMove(params);
	}
	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		return this._proxy.resourceResolve(params);
	}
	resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		return this._proxy.resourceMkdir(params);
	}
	createResourceWatch(params: CreateResourceWatchParams): Promise<CreateResourceWatchResult> {
		return this._proxy.createResourceWatch(params);
	}
	watchResource(params: CreateResourceWatchParams): Promise<IRemoteWatchHandle> {
		return createRemoteWatchHandle({
			createResourceWatch: p => this._proxy.createResourceWatch(p),
			subscribe: uri => this.subscribe(uri),
			unsubscribe: uri => this.unsubscribe(uri),
			onDidAction: this.onDidAction,
		}, params);
	}
	async restartAgentHost(): Promise<void> {
		// Restart is handled by the main process side
	}

	startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		return this._connectionTracker.startWebSocketServer();
	}

	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return this._connectionTracker.getInspectInfo(tryEnable);
	}
}

/**
 * Register the reverse-RPC server channels every in-process renderer exposes to
 * the agent host's {@link UtilityProcessServer}: the filesystem resource bridge
 * ({@link AGENT_HOST_CLIENT_RESOURCE_CHANNEL}), the proxy-resolution bridge
 * ({@link AGENT_HOST_CLIENT_PROXY_CHANNEL}), and the BYOK language-model bridge
 * ({@link AGENT_HOST_CLIENT_BYOK_LM_CHANNEL}). The agent host reaches these via
 * `server.getChannel(name, c => c.ctx === clientId)`.
 */
export function registerAgentHostClientChannels(
	client: IChannelServer,
	instantiationService: IInstantiationService,
	logService: ILogService,
	ahpLogger: AhpJsonlLogger | undefined,
	byokEnabled: boolean,
): void {
	// Serve filesystem reverse-RPCs from the local file service. The agent host
	// registers an authority on its AgentHostClientFileSystemProvider that calls
	// back through this channel.
	client.registerChannel(AGENT_HOST_CLIENT_RESOURCE_CHANNEL, instantiationService.createInstance(AgentHostClientResourceChannel, ahpLogger));
	// Serve proxy-resolution reverse-RPCs from the renderer's request service so
	// the agent host resolves proxies through VS Code's Electron session (system
	// settings / PAC scripts) rather than guessing from environment variables.
	client.registerChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL, instantiationService.createInstance(AgentHostClientProxyChannel));
	// Serve BYOK language-model reverse-RPCs from the renderer LM API, gated
	// behind `chat.agentHost.byokModels.enabled`. When disabled, the node-side
	// proxy + registry are also skipped, so the channel would never be called.

	if (byokEnabled) {
		try {
			client.registerChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, instantiationService.createInstance(AgentHostClientByokLmChannel));
		} catch (err) {
			logService.warn(`[AgentHost:renderer] BYOK language-model bridge not registered for this window. ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
