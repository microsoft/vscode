/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService } from '../common/remoteAgentHostService.js';
import {
	ISSHRemoteAgentHostService,
	SSH_REMOTE_AGENT_HOST_CHANNEL,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConnection,
	type ISSHRemoteAgentHostMainService,
	type ISSHResolvedConfig,
} from '../common/sshRemoteAgentHost.js';

/**
 * Renderer-side implementation of {@link ISSHRemoteAgentHostService} that
 * delegates the actual SSH work to the main process via IPC, then registers
 * the resulting connection with the renderer-local {@link IRemoteAgentHostService}.
 */
export class SSHRemoteAgentHostService extends Disposable implements ISSHRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _mainService: ISSHRemoteAgentHostMainService;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _connections = new Map<string, SSHAgentHostConnectionHandle>();

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._mainService = ProxyChannel.toService<ISSHRemoteAgentHostMainService>(
			mainProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL),
		);

		// When main process fires onDidCloseConnection, clean up the renderer-side handle
		this._register(this._mainService.onDidCloseConnection(localAddress => {
			const handle = this._connections.get(localAddress);
			if (handle) {
				this._connections.delete(localAddress);
				handle.fireClose();
				this._remoteAgentHostService.removeRemoteAgentHost(localAddress).catch(() => { /* best effort */ });
				this._onDidChangeConnections.fire();
			}
		}));
	}

	get connections(): readonly ISSHAgentHostConnection[] {
		return [...this._connections.values()];
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection> {
		this._logService.info('[SSHRemoteAgentHost] Renderer: connect called for ' + config.host);
		const result = await this._mainService.connect(config);
		this._logService.info('[SSHRemoteAgentHost] Renderer: main process returned localAddress=' + result.localAddress);

		// Check if we already have a handle for this address (reconnect case)
		const existing = this._connections.get(result.localAddress);
		if (existing) {
			return existing;
		}

		// Register the SSH-tunneled address with the local remote agent host service.
		// If registration fails, disconnect the main-process tunnel to avoid orphaned sessions.
		try {
			this._logService.info('[SSHRemoteAgentHost] Registering remote agent host at ' + result.localAddress);
			await this._remoteAgentHostService.addRemoteAgentHost({
				address: result.localAddress,
				name: result.name,
				connectionToken: result.connectionToken,
				sshConfigHost: result.sshConfigHost,
			});
		} catch (err) {
			this._mainService.disconnect(result.localAddress).catch(() => { /* best effort */ });
			throw err;
		}

		// Create a renderer-side handle that tears down the main-process
		// tunnel when disposed
		const handle = new SSHAgentHostConnectionHandle(
			result.config,
			result.localAddress,
			result.name,
			() => this._mainService.disconnect(result.localAddress),
		);

		this._connections.set(result.localAddress, handle);
		this._onDidChangeConnections.fire();

		return handle;
	}

	async disconnect(host: string): Promise<void> {
		await this._mainService.disconnect(host);
	}

	async listSSHConfigHosts(): Promise<string[]> {
		return this._mainService.listSSHConfigHosts();
	}

	async resolveSSHConfig(host: string): Promise<ISSHResolvedConfig> {
		return this._mainService.resolveSSHConfig(host);
	}

	async reconnect(sshConfigHost: string, name: string): Promise<ISSHAgentHostConnection> {
		const result = await this._mainService.reconnect(sshConfigHost, name);

		const existing = this._connections.get(result.localAddress);
		if (existing) {
			return existing;
		}

		// Register the new tunnel address
		this._logService.info('[SSHRemoteAgentHost] Reconnect: registering at ' + result.localAddress);
		await this._remoteAgentHostService.addRemoteAgentHost({
			address: result.localAddress,
			name: result.name,
			connectionToken: result.connectionToken,
			sshConfigHost: result.sshConfigHost,
		});

		const handle = new SSHAgentHostConnectionHandle(
			result.config,
			result.localAddress,
			result.name,
			() => this._mainService.disconnect(result.localAddress),
		);

		this._connections.set(result.localAddress, handle);
		this._onDidChangeConnections.fire();

		return handle;
	}
}

/**
 * Lightweight renderer-side handle that represents a connection
 * managed by the main process. Disposal triggers the onDidClose event.
 */
class SSHAgentHostConnectionHandle extends Disposable implements ISSHAgentHostConnection {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	constructor(
		readonly config: ISSHAgentHostConnection['config'],
		readonly localAddress: string,
		readonly name: string,
		disconnectFn: () => Promise<void>,
	) {
		super();

		// When this handle is disposed, tear down the main-process tunnel
		this._register(toDisposable(() => {
			disconnectFn().catch(() => { /* best effort */ });
		}));
	}

	/** Called by the service when the main process signals connection closure. */
	fireClose(): void {
		this._onDidClose.fire();
	}
}
