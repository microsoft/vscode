/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { getDelayedChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostEnabledSettingId, AgentHostIpcChannels, IAgentAttachment, IAgentCreateSessionConfig, IAgentDescriptor, IAgentHostService, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentService, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../common/agentService.js';

/**
 * Renderer-side implementation of {@link IAgentHostService} that connects
 * directly to the agent host utility process via MessagePort, bypassing
 * the main process relay. Uses the same `getDelayedChannel` pattern as
 * the pty host so the proxy is usable immediately while the port is acquired.
 */
class AgentHostServiceClient extends Disposable implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _clientEventually = new DeferredPromise<MessagePortClient>();
	private readonly _proxy: IAgentService;

	private readonly _onAgentHostExit = this._register(new Emitter<number>());
	readonly onAgentHostExit = this._onAgentHostExit.event;
	private readonly _onAgentHostStart = this._register(new Emitter<void>());
	readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

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

		store.add(this._proxy.onDidSessionProgress(e => {
			// Events from ProxyChannel don't auto-revive nested URIs -- revive the session URI
			this._onDidSessionProgress.fire({ ...e, session: URI.revive(e.session) });
		}));
		this._logService.info('[AgentHost:renderer] Direct MessagePort connection established');
		this._onAgentHostStart.fire();
	}

	// ---- IAgentService forwarding (no await needed, delayed channel handles queuing) ----

	setAuthToken(token: string): Promise<void> {
		return this._proxy.setAuthToken(token);
	}
	listAgents(): Promise<IAgentDescriptor[]> {
		return this._proxy.listAgents();
	}
	listModels(): Promise<IAgentModelInfo[]> {
		return this._proxy.listModels();
	}
	listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._proxy.listSessions();
	}
	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		return this._proxy.createSession(config);
	}
	sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		return this._proxy.sendMessage(session, prompt, attachments);
	}
	getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		return this._proxy.getSessionMessages(session);
	}
	disposeSession(session: URI): Promise<void> {
		return this._proxy.disposeSession(session);
	}
	abortSession(session: URI): Promise<void> {
		return this._proxy.abortSession(session);
	}
	shutdown(): Promise<void> {
		return this._proxy.shutdown();
	}
	async restartAgentHost(): Promise<void> {
		// Restart is handled by the main process side
	}
}

registerSingleton(IAgentHostService, AgentHostServiceClient, InstantiationType.Delayed);
