/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDelayedChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostEnabledSettingId, AgentHostIpcChannels, IAgentCreateSessionConfig, IAgentHostInspectInfo, IAgentHostService, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult, IAgentHostSocketInfo, IConnectionTrackerService } from '../common/agentService.js';
import { AgentSubscriptionManager, type IAgentSubscription } from '../common/state/agentSubscription.js';
import type { CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { ActionEnvelope, INotification, IRootConfigChangedAction, SessionAction, TerminalAction } from '../common/state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceWriteParams, ResourceWriteResult, IStateSnapshot } from '../common/state/sessionProtocol.js';
import { StateComponents, ROOT_STATE_URI, type RootState } from '../common/state/sessionState.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Renderer-side implementation of {@link IAgentHostService} that connects
 * directly to the agent host utility process via MessagePort, bypassing
 * the main process relay. Uses the same `getDelayedChannel` pattern as
 * the pty host so the proxy is usable immediately while the port is acquired.
 */
class AgentHostServiceClient extends Disposable implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	/** Unique identifier for this window, used in action envelope origin tracking. */
	readonly clientId = generateUuid();

	private readonly _clientEventually = new DeferredPromise<MessagePortClient>();
	private readonly _proxy: IAgentService;
	private readonly _connectionTracker: IConnectionTrackerService;
	private readonly _subscriptionManager: AgentSubscriptionManager;

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit = this._onAgentHostExit.event;
	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', true);
	readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	private _authenticationSettled = false;

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

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		// Create a proxy backed by a delayed channel - usable immediately,
		// calls queue until the MessagePort connection is established.
		this._proxy = ProxyChannel.toService<IAgentService>(
			getDelayedChannel(this._clientEventually.p.then(client => client.getChannel(AgentHostIpcChannels.AgentHost)))
		);

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

		if (configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			this._connect();
		}
	}

	private async _connect(): Promise<void> {
		this._logService.info('[AgentHost:renderer] Acquiring MessagePort to agent host...');
		const port = await acquirePort('vscode:createAgentHostMessageChannel', 'vscode:createAgentHostMessageChannelResult');
		this._logService.info('[AgentHost:renderer] MessagePort acquired, creating client...');

		const store = this._register(new DisposableStore());
		const client = store.add(new MessagePortClient(port, `agentHost:window`));
		this._clientEventually.complete(client);

		store.add(this._proxy.onDidAction(e => {
			const revived = revive(e) as ActionEnvelope;
			this._subscriptionManager.receiveEnvelope(revived);
			this._onDidAction.fire(revived);
		}));
		store.add(this._proxy.onDidNotification(e => {
			this._onDidNotification.fire(revive(e));
		}));
		this._logService.info('[AgentHost:renderer] Direct MessagePort connection established');
		this._onAgentHostStart.fire();

		// Subscribe to root state
		this.subscribe(URI.parse(ROOT_STATE_URI)).then(snapshot => {
			this._subscriptionManager.handleRootSnapshot(snapshot.state as RootState, snapshot.fromSeq);
		}).catch(err => {
			this._logService.error('[AgentHost:renderer] Failed to subscribe to root state', err);
		});
	}

	// ---- IAgentService forwarding (no await needed, delayed channel handles queuing) ----

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._proxy.authenticate(params);
	}
	listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._proxy.listSessions();
	}
	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		return this._proxy.createSession(config);
	}
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this._proxy.resolveSessionConfig(params);
	}
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this._proxy.sessionConfigCompletions(params);
	}
	disposeSession(session: URI): Promise<void> {
		return this._proxy.disposeSession(session);
	}
	createTerminal(params: CreateTerminalParams): Promise<void> {
		return this._proxy.createTerminal(params);
	}
	disposeTerminal(terminal: URI): Promise<void> {
		return this._proxy.disposeTerminal(terminal);
	}
	shutdown(): Promise<void> {
		return this._proxy.shutdown();
	}
	subscribe(resource: URI): Promise<IStateSnapshot> {
		return this._proxy.subscribe(resource);
	}
	unsubscribe(resource: URI): void {
		this._proxy.unsubscribe(resource);
	}
	dispatchAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this._proxy.dispatchAction(action, clientId, clientSeq);
	}
	private _nextSeq = 1;
	nextClientSeq(): number {
		return this._nextSeq++;
	}

	get rootState(): IAgentSubscription<RootState> {
		return this._subscriptionManager.rootState;
	}

	getSubscription<T>(kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		return this._subscriptionManager.getSubscription<T>(kind, resource);
	}

	getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		return this._subscriptionManager.getSubscriptionUnmanaged<T>(resource);
	}

	dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		const seq = this._subscriptionManager.dispatchOptimistic(action);
		this.dispatchAction(action, this.clientId, seq);
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

registerSingleton(IAgentHostService, AgentHostServiceClient, InstantiationType.Delayed);
