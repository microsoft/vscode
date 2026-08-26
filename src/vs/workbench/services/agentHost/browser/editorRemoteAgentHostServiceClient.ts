/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Renderer-side `IAgentHostService` that talks to the agent host running on
// the connected remote, via the remote agent's existing IPC pipe. The
// underlying `AgentHostProtocolClient` is created eagerly so callers
// can subscribe to `rootState` etc. immediately; the actual transport
// connection (and AHP handshake) happens asynchronously in the background.

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable, observableValue, constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AgentHostIpcChannels, IAgentCreateChatRequestOptions, IAgentCreateSessionConfig, IAgentHostInspectInfo, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostService, IAgentHostSocketInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult, IMcpNotification, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostIpcChannelTransport } from '../../../../platform/agentHost/browser/agentHostIpcChannelTransport.js';
import { AgentHostClientConnectionKind } from '../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import type { CompletionsParams, CompletionsResult, ContentEncoding, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import type { ActionEnvelope, INotification, IRootConfigChangedAction, SessionAction, TerminalAction, ClientAnnotationsAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import type { IRemoteWatchHandle } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import type { CreateResourceWatchParams, CreateResourceWatchResult, ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWriteParams, ResourceWriteResult } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ComponentToState, RootState, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../../../../platform/agentHost/common/agentHostClientInfo.js';
import { agentHostAuthority, identityAgentHostResourceUriMapper } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostFileSystemService } from '../common/agentHostFileSystemService.js';

const REMOTE_NOT_SUPPORTED = (op: string) => new Error(`${op} is not supported when the agent host runs on a remote.`);
const LOG_PREFIX = '[AgentHost:remote]';

/**
 * Connects the renderer to the agent host that the remote server has
 * already started, by proxying AHP frames over the remote agent's IPC pipe.
 *
 * Local-only methods on {@link IAgentHostService} (`restartAgentHost`,
 * `startWebSocketServer`, `getInspectInfo`) are stubbed — the lifecycle of
 * the agent host is owned by whoever spawned it on the remote.
 */
export class EditorRemoteAgentHostServiceClient extends Disposable implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit: Event<number> = this._onAgentHostExit.event;

	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart: Event<void> = this._onAgentHostStart.event;

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', true);
	readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	private _authenticationSettled = false;

	private readonly _protocolClient: AgentHostProtocolClient | undefined;
	get resourceUris() { return this._protocolClient?.resourceUris ?? identityAgentHostResourceUriMapper; }
	private readonly _noopRootState: IAgentSubscription<RootState> = {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
	private _connectStarted = false;

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAgentHostFileSystemService agentHostFileSystemService: IAgentHostFileSystemService,
	) {
		super();

		const connection = this._remoteAgentService.getConnection();
		this._logService.info(`${LOG_PREFIX} Initializing (remoteAuthority=${connection?.remoteAuthority ?? 'none'})`);

		if (!connection) {
			this._logService.warn(`${LOG_PREFIX} No remote agent connection available. Not connecting.`);
			this.setAuthenticationPending(false);
			return;
		}

		// Create the protocol client eagerly so consumers can subscribe to
		// rootState etc. before the AHP handshake completes. The transport's
		// `connect()` will be awaited by `_connect()` below.
		const createTransport = () => new AgentHostIpcChannelTransport(connection.getChannel(AgentHostIpcChannels.RemoteProxy), undefined, AgentHostClientConnectionKind.RemoteExtensionHost);
		const address = `vscode-remote://${connection.remoteAuthority}`;
		const clientInfo = environmentService.isSessionsWindow ? agentsWindowAgentHostClientInfo : editorWindowAgentHostClientInfo;
		this._protocolClient = this._register(instantiationService.createInstance(AgentHostProtocolClient, address, createTransport, undefined, undefined, clientInfo));
		// Resources this client hands out (e.g. debug-log artifacts) are stamped with the
		// address-derived authority, so register it for reads. The ambient `local` authority
		// registered elsewhere covers a different URI namespace.
		this._register(agentHostFileSystemService.registerAuthority(agentHostAuthority(address), this._protocolClient));
		this._register(this._protocolClient.onDidClose(() => {
			this._logService.info(`${LOG_PREFIX} Protocol client closed`);
			this._onAgentHostExit.fire(0);
		}));
		this._register(this._protocolClient.onDidChangeConnectionState(state => {
			if (state === AgentHostClientState.Connected) {
				this._logService.info(`${LOG_PREFIX} Connected; clientId=${this._protocolClient?.clientId}`);
				this._onAgentHostStart.fire();
			}
		}));

		this._register(autorun(reader => {
			if (agentHostEnablementService.enabled.read(reader)) {
				this.startAgentHost();
			}
		}));
	}

	private async _connect(): Promise<void> {
		if (this._connectStarted || !this._protocolClient) {
			return;
		}
		this._connectStarted = true;
		this._logService.info(`${LOG_PREFIX} Connecting to remote agent host...`);
		await this._remoteAgentService.getRawEnvironment();
		await this._protocolClient.connect();
	}

	private _requireClient(): AgentHostProtocolClient {
		if (!this._protocolClient) {
			throw new Error('Remote agent host is not enabled or no remote connection is available.');
		}
		return this._protocolClient;
	}

	// ---- IAgentHostService local-only surface (stubs) -----------------------

	setAuthenticationPending(pending: boolean): void {
		if (this._authenticationSettled) {
			return;
		}
		if (!pending) {
			this._authenticationSettled = true;
		}
		this._authenticationPending.set(pending, undefined);
	}

	startAgentHost(): void {
		this._connect().catch(err => this._logService.warn(`${LOG_PREFIX} Connect failed`, err));
	}

	async restartAgentHost(): Promise<void> {
		// The remote owns the agent host process lifecycle.
	}

	async startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		throw REMOTE_NOT_SUPPORTED('startWebSocketServer');
	}

	async getInspectInfo(_tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return undefined;
	}

	// ---- IAgentConnection delegation ---------------------------------------
	// All getters delegate directly to the eagerly-created protocol client so
	// `AgentHostContribution` can subscribe synchronously in its constructor.

	get clientId(): string {
		return this._protocolClient?.clientId ?? '';
	}

	get initializeResult(): IObservable<InitializeResult | undefined> {
		return this._protocolClient?.initializeResult ?? constObservable(undefined);
	}

	get rootState(): IAgentSubscription<RootState> {
		return this._protocolClient?.rootState ?? this._noopRootState;
	}

	get onDidNotification(): Event<INotification> {
		return this._protocolClient?.onDidNotification ?? Event.None;
	}

	get onDidAction(): Event<ActionEnvelope> {
		return this._protocolClient?.onDidAction ?? Event.None;
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

	dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this._protocolClient?.dispatch(channel, action);
	}

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._requireClient().authenticate(params);
	}

	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		return this._requireClient().getNetworkDiagnosticsInfo();
	}

	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._requireClient().getManagedSettingsDiagnostics();
	}

	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._requireClient().diagnosticsFetch(url);
	}

	getSessionStateFile(session: URI): Promise<URI | undefined> {
		return this._requireClient().getSessionStateFile(session);
	}

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
		return this._requireClient().collectDebugLogs(session, kind, chat);
	}

	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		return this._requireClient().readDebugLogsChunk(resource, position);
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._requireClient().listSessions();
	}

	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
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
}
