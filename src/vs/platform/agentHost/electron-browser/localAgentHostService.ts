/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { mark } from '../../../base/common/performance.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDelayedChannel, IChannelClient, IChannelServer, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort, MessagePortAcquisitionError } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { ipcRenderer } from '../../../base/parts/sandbox/electron-browser/globals.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { INotificationService } from '../../notification/common/notification.js';
import { AgentHostIpcChannelTransport } from '../browser/agentHostIpcChannelTransport.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../browser/agentHostProtocolClient.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, AgentHostClientByokLmChannel, NullAgentHostClientByokLmChannel } from '../common/agentHostClientByokLmChannel.js';
import { getAgentHostClientType } from '../common/agentHostClientInfo.js';
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, AgentHostClientProxyChannel } from '../common/agentHostClientProxyChannel.js';
import { LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from '../common/agentHostResourceService.js';
import { identityAgentHostResourceUriMapper } from '../common/agentHostUri.js';
import { AgentHostStartupTelemetry } from '../common/agentHostStartupTelemetry.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import {
	AgentHostAhpJsonlLoggingSettingId,
	type AgentHostDebugLogsArtifactKind,
	AgentHostIpcChannels,
	AgentHostOTelPolicyIpcChannel,
	AgentHostRestartIpcChannel,
	AgentHostWillRestartIpcChannel,
	AgentSession,
	IAgentCreateChatRequestOptions,
	IAgentCreateSessionConfig,
	IAgentHostInspectInfo,
	type IAgentHostDebugLogsArtifact,
	IAgentHostManagementService,
	IAgentHostManagedSettingsDiagnostics,
	IAgentHostNetworkDiagnosticsInfo,
	IAgentHostNetworkFetchResult,
	IAgentHostService,
	IAgentHostSocketInfo,
	IAgentResolveSessionConfigParams,
	IAgentSessionConfigCompletionsParams,
	IAgentSessionMetadata,
	AuthenticateParams,
	AuthenticateResult,
	IMcpNotification,
	readAgentHostOTelPolicySettings,
	type IAgentHostDebugLogsChunk,
} from '../common/agentService.js';
import type { IRemoteWatchHandle } from '../common/agentHostFileSystemProvider.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from '../common/state/agentSubscription.js';
import type { CompletionsParams, CompletionsResult, ContentEncoding, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { Implementation, InitializeResult } from '../common/state/protocol/common/commands.js';
import { NonReconnectableTransportError } from '../common/state/sessionTransport.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import type { CreateResourceWatchParams, CreateResourceWatchResult, ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWriteParams, ResourceWriteResult } from '../common/state/sessionProtocol.js';
import type { ActionEnvelope, ChatAction, ClientAnnotationsAction, ClientChangesetAction, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from '../common/state/sessionActions.js';
import type { ComponentToState, RootState, StateComponents } from '../common/state/sessionState.js';

const LOG_PREFIX = '[AgentHost:renderer]';

function notifyOnFatalAgentHostStartError(notificationService: INotificationService): void {
	notificationService.error(localize(
		'agentHost.startFailed',
		"The Agent Host failed to start. Restart the application to try again. See the logs for details."
	));
}

/**
 * Keeps management-channel calls on the same MessagePort generation as the
 * connected AHP transport.
 */
export class LocalAgentHostManagementConnection extends Disposable {

	private _generation = this._createGeneration();
	private _pending: { readonly generation: DeferredPromise<IChannelClient>; readonly client: IChannelClient } | undefined;

	constructor() {
		super();
		this._register(toDisposable(() => this.closed('Local agent host service was disposed.')));
	}

	client(): Promise<IChannelClient> {
		return this._generation.p;
	}

	acquire<T extends IChannelClient>(client: Promise<T>): Promise<T> {
		const generation = this._generation;
		return client.then(value => {
			if (this._generation === generation) {
				this._pending = { generation, client: value };
			}
			return value;
		});
	}

	connected(): void {
		const pending = this._pending;
		this._pending = undefined;
		if (pending?.generation === this._generation) {
			void this._generation.complete(pending.client);
		}
	}

	reconnecting(): void {
		this._pending = undefined;
		const previous = this._generation;
		this._generation = this._createGeneration();
		void previous.error(new Error('Local agent host connection is reconnecting.'));
	}

	closed(message = 'Local agent host connection closed.'): void {
		this._pending = undefined;
		if (this._generation.isSettled) {
			this._generation = this._createGeneration();
		}
		void this._generation.error(new Error(message));
	}

	private _createGeneration(): DeferredPromise<IChannelClient> {
		const generation = new DeferredPromise<IChannelClient>();
		generation.p.then(undefined, () => { });
		return generation;
	}
}

/**
 * Renderer-side implementation of {@link IAgentHostService} for the local
 * agent host. State and request traffic use AHP over the Protocol channel;
 * management remains on the narrow Management IPC channel.
 */
export class LocalAgentHostServiceClient extends Disposable implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	readonly clientId = generateUuid();
	get resourceUris() { return this._protocolClient?.resourceUris ?? identityAgentHostResourceUriMapper; }

	private readonly _clientStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _managementConnection = this._register(new LocalAgentHostManagementConnection());
	private readonly _ahpLogger: AhpJsonlLogger | undefined;
	private _protocolClient: AgentHostProtocolClient | undefined;
	private _connectStarted = false;
	private _didAcquireInitialMessagePort = false;
	private _didConnectInitially = false;
	private _didStartInitialSessionList = false;
	private _didCompleteInitialSessionList = false;
	private _startupTelemetry: AgentHostStartupTelemetry | undefined;

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit = this._onAgentHostExit.event;
	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', true);
	readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	private _authenticationSettled = false;
	private readonly _noopRootState: IAgentSubscription<RootState> = {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};

	constructor(
		private readonly _clientInfo: Implementation,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._ahpLogger = this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)
			? this._register(this._instantiationService.createInstance(AhpJsonlLogger, {
				logsHome: environmentService.logsHome,
				connectionId: this.clientId,
				transport: 'local',
			}))
			: undefined;

		// The main process tears the agent host down before restarting it; drop the
		// current transport eagerly so the protocol client reconnects instead of
		// treating the port going away as an unexpected failure.
		const onWillRestart = () => {
			if (!this._protocolClient?.reconnectFromClosed()) {
				this._protocolClient?.notifyTransportClosed();
			}
		};
		ipcRenderer.on(AgentHostWillRestartIpcChannel, onWillRestart);
		this._register(toDisposable(() => ipcRenderer.removeListener(AgentHostWillRestartIpcChannel, onWillRestart)));
	}

	startAgentHost(): void {
		if (!this._protocolClient) {
			mark('code/agentHost/willStart');
			this._startupTelemetry = this._register(this._instantiationService.createInstance(
				AgentHostStartupTelemetry,
				getAgentHostClientType(this._clientInfo),
				AgentHostClientConnectionKind.Local,
				() => StopWatch.create(true),
				(callback, timeoutMs) => disposableTimeout(callback, timeoutMs),
			));
			this._protocolClient = this._register(this._instantiationService.createInstance(
				AgentHostProtocolClient,
				LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
				() => this._createTransport(),
				undefined,
				this.clientId,
				this._clientInfo,
			));
			this._register(this._protocolClient.onDidChangeConnectionState(state => this._handleConnectionState(state)));
			this._register(this._protocolClient.onDidFatalClose(() => {
				if (!this._didConnectInitially) {
					notifyOnFatalAgentHostStartError(this._notificationService);
				}
			}));
		}

		void this._connect().catch(error => {
			this._logService.error(`${LOG_PREFIX} Protocol connection failed`, error);
		});
	}

	private async _connect(): Promise<void> {
		if (this._connectStarted) {
			return;
		}
		this._connectStarted = true;
		await this._requireClient().connect();
	}

	private _createTransport(): AgentHostIpcChannelTransport {
		const clientPromise = this._acquireClient();
		return new AgentHostIpcChannelTransport(
			getDelayedChannel(clientPromise.then(client => client.getChannel(AgentHostIpcChannels.Protocol))),
			this._ahpLogger,
			AgentHostClientConnectionKind.Local,
		);
	}

	private _acquireClient(): Promise<MessagePortClient> {
		return this._managementConnection.acquire(this._doAcquireClient());
	}

	private async _doAcquireClient(): Promise<MessagePortClient> {
		this._logService.info(`${LOG_PREFIX} Acquiring MessagePort to agent host...`);
		this._forwardOTelPolicy();
		let port: MessagePort;
		try {
			port = await acquirePort('vscode:createAgentHostMessageChannel', 'vscode:createAgentHostMessageChannelResult');
		} catch (error) {
			if (error instanceof MessagePortAcquisitionError && error.fatal) {
				throw new NonReconnectableTransportError(error.message);
			}
			throw error;
		}
		if (this._store.isDisposed) {
			port.close();
			throw new Error('Local agent host service was disposed during connection.');
		}
		if (!this._didAcquireInitialMessagePort) {
			this._didAcquireInitialMessagePort = true;
			this._startupTelemetry?.messagePortAcquired();
			mark('code/agentHost/didAcquireMessagePort');
		}
		this._logService.info(`${LOG_PREFIX} MessagePort acquired, creating client...`);

		const store = new DisposableStore();
		try {
			const client = store.add(new MessagePortClient(port, this.clientId));
			registerAgentHostClientChannels(
				client,
				this._instantiationService,
				this._logService,
			);
			this._clientStore.value = store;
			return client;
		} catch (error) {
			store.dispose();
			throw error;
		}
	}

	private _forwardOTelPolicy(): void {
		ipcRenderer.send(AgentHostOTelPolicyIpcChannel, readAgentHostOTelPolicySettings(this._configurationService));
	}

	private _handleConnectionState(state: AgentHostClientState): void {
		if (this._store.isDisposed) {
			return;
		}
		if (state === AgentHostClientState.Connected) {
			this._managementConnection.connected();
			this._startupTelemetry?.protocolConnected();
			if (!this._didConnectInitially) {
				this._didConnectInitially = true;
				mark('code/agentHost/didConnect');
			}
			this._logService.info(`${LOG_PREFIX} Protocol connection established; clientId=${this._requireClient().clientId}`);
			this._onAgentHostStart.fire();
		} else if (state === AgentHostClientState.Reconnecting || state === AgentHostClientState.Incompatible || state === AgentHostClientState.Closed) {
			this._clientStore.clear();
			if (state === AgentHostClientState.Reconnecting) {
				this._managementConnection.reconnecting();
			} else {
				this._startupTelemetry?.connectionFailed();
				this._managementConnection.closed(state === AgentHostClientState.Incompatible
					? 'Local agent host protocol is incompatible.'
					: 'Local agent host connection closed.');
			}
			this._onAgentHostExit.fire(0);
		}
	}

	private _requireClient(): AgentHostProtocolClient {
		if (!this._protocolClient) {
			throw new Error('Local agent host is not connected.');
		}
		return this._protocolClient;
	}

	setAuthenticationPending(pending: boolean): void {
		if (this._authenticationSettled) {
			return;
		}
		if (!pending) {
			this._authenticationSettled = true;
			this._startupTelemetry?.authenticationSettled();
		}
		this._authenticationPending.set(pending, undefined);
	}

	get initializeResult(): IObservable<InitializeResult | undefined> {
		return this._protocolClient?.initializeResult ?? constObservable(undefined);
	}

	get rootState(): IAgentSubscription<RootState> {
		return this._protocolClient?.rootState ?? this._noopRootState;
	}

	get onDidAction(): Event<ActionEnvelope> {
		return this._protocolClient?.onDidAction ?? Event.None;
	}

	get onDidNotification(): Event<INotification> {
		return this._protocolClient?.onDidNotification ?? Event.None;
	}

	get onMcpNotification(): Event<IMcpNotification> {
		return this._protocolClient?.onMcpNotification ?? Event.None;
	}

	getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this._requireClient().getSubscription<ComponentToState[T]>(kind, resource, owner);
	}

	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		return this._protocolClient?.getSubscriptionUnmanaged<ComponentToState[T]>(kind, resource);
	}

	getInflightSessionCreate(resource: URI): Promise<unknown> | undefined {
		return this._protocolClient?.getInflightSessionCreate(resource);
	}

	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		return this._protocolClient?.getActiveSubscriptions() ?? [];
	}

	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this._requireClient().dispatch(channel, action);
	}

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._requireClient().authenticate(params);
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		this._startupTelemetry?.sessionListRequested();
		if (!this._didStartInitialSessionList) {
			this._didStartInitialSessionList = true;
			mark('code/agentHost/willListSessions');
		}
		return this._requireClient().listSessions().then(
			sessions => {
				this._startupTelemetry?.sessionListSucceeded();
				if (!this._didCompleteInitialSessionList) {
					this._didCompleteInitialSessionList = true;
					mark('code/agentHost/didListSessions');
				}
				return sessions;
			},
			error => {
				this._startupTelemetry?.sessionListFailed();
				throw error;
			},
		);
	}

	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (config && hasSessionExtensions(config)) {
			if (!config.provider) {
				throw new Error('Cannot create local agent host session without a provider.');
			}
			const session = config.session ?? AgentSession.uri(config.provider, generateUuid());
			const promise = this._getManagementService().createSessionWithExtensions({ ...config, session });
			this._requireClient().trackSessionCreate(session, promise);
			return promise;
		}
		return this._requireClient().createSession(config);
	}

	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this._requireClient().resolveSessionConfig(params);
	}

	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this._requireClient().sessionConfigCompletions(params);
	}

	completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._requireClient().completions(params);
	}

	getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._requireClient().getCompletionTriggerCharacters();
	}

	disposeSession(session: URI): Promise<void> {
		return this._requireClient().disposeSession(session);
	}

	createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions): Promise<void> {
		if (options && hasChatExtensions(options)) {
			return this._getManagementService().createChatWithExtensions(session, chat, options);
		}
		return this._requireClient().createChat(session, chat, options);
	}

	disposeChat(chat: URI): Promise<void> {
		return this._requireClient().disposeChat(chat);
	}

	createTerminal(params: CreateTerminalParams): Promise<void> {
		return this._requireClient().createTerminal(params);
	}

	disposeTerminal(terminal: URI): Promise<void> {
		return this._requireClient().disposeTerminal(terminal);
	}

	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		return this._requireClient().invokeChangesetOperation(params);
	}

	handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		return this._requireClient().handleMcpRequest(channel, method, params);
	}

	resourceList(uri: URI): Promise<ResourceListResult> {
		return this._requireClient().resourceList(uri);
	}

	resourceRead(uri: URI, encoding?: ContentEncoding): Promise<ResourceReadResult> {
		return this._requireClient().resourceRead(uri, encoding);
	}

	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		return this._requireClient().resourceWrite(params);
	}

	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		return this._requireClient().resourceCopy(params);
	}

	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		return this._requireClient().resourceDelete(params);
	}

	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		return this._requireClient().resourceMove(params);
	}

	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		return this._requireClient().resourceResolve(params);
	}

	resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		return this._requireClient().resourceMkdir(params);
	}

	createResourceWatch(params: CreateResourceWatchParams): Promise<CreateResourceWatchResult> {
		return this._requireClient().createResourceWatch(params);
	}

	watchResource(params: CreateResourceWatchParams): Promise<IRemoteWatchHandle> {
		return this._requireClient().watchResource(params);
	}

	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		return this._getManagementService().getNetworkDiagnosticsInfo();
	}

	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._getManagementService().getManagedSettingsDiagnostics();
	}

	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._getManagementService().diagnosticsFetch(url);
	}

	getSessionStateFile(session: URI): Promise<URI | undefined> {
		return this._getManagementService().getSessionStateFile(session);
	}

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
		return this._getManagementService().collectDebugLogs(session, kind, chat);
	}

	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		return this._getManagementService().readDebugLogsChunk(resource, position);
	}

	async restartAgentHost(): Promise<void> {
		this._forwardOTelPolicy();
		ipcRenderer.send(AgentHostRestartIpcChannel);
	}

	startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		return this._getManagementService().startWebSocketServer();
	}

	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return this._getManagementService().getInspectInfo(tryEnable);
	}

	private _getManagementService(): IAgentHostManagementService {
		return ProxyChannel.toService<IAgentHostManagementService>(
			getDelayedChannel(this._managementConnection.client().then(client => client.getChannel(AgentHostIpcChannels.Management)))
		);
	}
}

function hasSessionExtensions(config: IAgentCreateSessionConfig): boolean {
	return config.model !== undefined || config.agent !== undefined || config.importConversation !== undefined;
}

function hasChatExtensions(options: IAgentCreateChatRequestOptions): boolean {
	return options.title !== undefined || options.model !== undefined;
}

/**
 * Registers local-only IPC reverse channels for one renderer connection.
 */
export function registerAgentHostClientChannels(
	client: IChannelServer,
	instantiationService: IInstantiationService,
	logService: ILogService,
): void {
	client.registerChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL, instantiationService.createInstance(AgentHostClientProxyChannel));

	try {
		client.registerChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, instantiationService.createInstance(AgentHostClientByokLmChannel));
	} catch (error) {
		logService.warn(`${LOG_PREFIX} BYOK language-model bridge not registered for this window. ${error instanceof Error ? error.message : String(error)}`);
		client.registerChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, new NullAgentHostClientByokLmChannel());
	}
}
