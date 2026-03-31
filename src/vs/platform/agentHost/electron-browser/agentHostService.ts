/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDelayedChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostEnabledSettingId, AgentHostIpcChannels, IAgentCreateSessionConfig, IAgentDescriptor, IAgentHostService, IAgentService, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult, IResourceMetadata } from '../common/agentService.js';
import type { IActionEnvelope, INotification, ISessionAction } from '../common/state/sessionActions.js';
import type { IBrowseDirectoryResult, IFetchContentResult, IStateSnapshot, IWriteFileParams, IWriteFileResult } from '../common/state/sessionProtocol.js';
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

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit = this._onAgentHostExit.event;
	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _onDidAction = this._register(new Emitter<IActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

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
			this._onDidAction.fire(revive(e));
		}));
		store.add(this._proxy.onDidNotification(e => {
			this._onDidNotification.fire(revive(e));
		}));
		this._logService.info('[AgentHost:renderer] Direct MessagePort connection established');
		this._onAgentHostStart.fire();
	}

	// ---- IAgentService forwarding (no await needed, delayed channel handles queuing) ----

	getResourceMetadata(): Promise<IResourceMetadata> {
		return this._proxy.getResourceMetadata();
	}
	authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		return this._proxy.authenticate(params);
	}
	listAgents(): Promise<IAgentDescriptor[]> {
		return this._proxy.listAgents();
	}
	refreshModels(): Promise<void> {
		return this._proxy.refreshModels();
	}
	listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._proxy.listSessions();
	}
	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		return this._proxy.createSession(config);
	}
	disposeSession(session: URI): Promise<void> {
		return this._proxy.disposeSession(session);
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
	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void {
		this._proxy.dispatchAction(action, clientId, clientSeq);
	}
	private _nextSeq = 1;
	nextClientSeq(): number {
		return this._nextSeq++;
	}
	browseDirectory(uri: URI): Promise<IBrowseDirectoryResult> {
		return this._proxy.browseDirectory(uri);
	}
	fetchContent(uri: URI): Promise<IFetchContentResult> {
		return this._proxy.fetchContent(uri);
	}
	writeFile(params: IWriteFileParams): Promise<IWriteFileResult> {
		return this._proxy.writeFile(params);
	}
	async restartAgentHost(): Promise<void> {
		// Restart is handled by the main process side
	}
}

registerSingleton(IAgentHostService, AgentHostServiceClient, InstantiationType.Delayed);
