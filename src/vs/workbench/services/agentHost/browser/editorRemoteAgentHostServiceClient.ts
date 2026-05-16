/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Renderer-side `IAgentHostService` that talks to the agent host running on
// the connected remote, via the remote agent's existing IPC pipe. The
// underlying `RemoteAgentHostProtocolClient` is created eagerly so callers
// can subscribe to `rootState` etc. immediately; the actual transport
// connection (and AHP handshake) happens asynchronously in the background.

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AgentHostEnabledSettingId, AgentHostIpcChannels, IAgentCreateSessionConfig, IAgentHostInspectInfo, IAgentHostService, IAgentHostSocketInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../../../../platform/agentHost/common/agentService.js';
import { AgentHostIpcChannelTransport } from '../../../../platform/agentHost/browser/agentHostIpcChannelTransport.js';
import { RemoteAgentHostProtocolClient } from '../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import type { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import type { ActionEnvelope, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceWriteParams, ResourceWriteResult } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ComponentToState, RootState, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';

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

	private readonly _protocolClient: RemoteAgentHostProtocolClient | undefined;
	private _connectStarted = false;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const enabled = configurationService.getValue<boolean>(AgentHostEnabledSettingId);
		const connection = remoteAgentService.getConnection();
		this._logService.info(`${LOG_PREFIX} Initializing (enabled=${enabled}, remoteAuthority=${connection?.remoteAuthority ?? 'none'})`);

		if (!enabled) {
			this._logService.info(`${LOG_PREFIX} Disabled via "${AgentHostEnabledSettingId}". Not connecting.`);
			this.setAuthenticationPending(false);
			return;
		}
		if (!connection) {
			this._logService.warn(`${LOG_PREFIX} No remote agent connection available. Not connecting.`);
			this.setAuthenticationPending(false);
			return;
		}

		// Create the protocol client eagerly so consumers can subscribe to
		// rootState etc. before the AHP handshake completes. The transport's
		// `connect()` will be awaited by `_connect()` below.
		const channel = connection.getChannel(AgentHostIpcChannels.RemoteProxy);
		const transport = new AgentHostIpcChannelTransport(channel);
		const address = `vscode-remote://${connection.remoteAuthority}`;
		this._protocolClient = this._register(instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport, undefined));
		this._register(this._protocolClient.onDidClose(() => {
			this._logService.info(`${LOG_PREFIX} Protocol client closed`);
			this._onAgentHostExit.fire(0);
		}));

		// Kick off the connect in the background. Failures are logged; callers
		// that need a connected client (e.g. session creation) will see the
		// failure surface as a rejected promise from the protocol client.
		this._connect().catch(err => this._logService.warn(`${LOG_PREFIX} Connect failed`, err));
	}

	private async _connect(): Promise<void> {
		if (this._connectStarted || !this._protocolClient) {
			return;
		}
		this._connectStarted = true;
		this._logService.info(`${LOG_PREFIX} Connecting to remote agent host...`);
		await this._protocolClient.connect();
		this._logService.info(`${LOG_PREFIX} Connected; clientId=${this._protocolClient.clientId}`);
		this._onAgentHostStart.fire();
	}

	private _requireClient(): RemoteAgentHostProtocolClient {
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

	get rootState(): IAgentSubscription<RootState> {
		return this._requireClient().rootState;
	}

	get onDidNotification(): Event<INotification> {
		return this._protocolClient?.onDidNotification ?? Event.None;
	}

	get onDidAction(): Event<ActionEnvelope> {
		return this._protocolClient?.onDidAction ?? Event.None;
	}

	getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this._requireClient().getSubscription<ComponentToState[T]>(kind, resource);
	}

	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		return this._protocolClient?.getSubscriptionUnmanaged<ComponentToState[T]>(kind, resource);
	}

	dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		this._protocolClient?.dispatch(action);
	}

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._requireClient().authenticate(params);
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

	createTerminal(params: CreateTerminalParams): Promise<void> {
		return this._requireClient().createTerminal(params);
	}

	disposeTerminal(terminal: URI): Promise<void> {
		return this._requireClient().disposeTerminal(terminal);
	}

	resourceList(uri: URI): Promise<ResourceListResult> {
		return this._requireClient().resourceList(uri);
	}

	resourceRead(uri: URI): Promise<ResourceReadResult> {
		return this._requireClient().resourceRead(uri);
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
}
