/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType } from '../common/remoteAgentHostService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IQuickInputService } from '../../quickinput/common/quickInput.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../common/agentService.js';
import { SSHRelayTransport } from './sshRelayTransport.js';
import { RemoteAgentHostProtocolClient } from '../browser/remoteAgentHostProtocolClient.js';
import {
	ISSHRemoteAgentHostService,
	SSH_REMOTE_AGENT_HOST_CHANNEL,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConnection,
	type ISSHConnectResult,
	type ISSHKeyboardInteractiveRequest,
	type ISSHRemoteAgentHostMainService,
	type ISSHResolvedConfig,
	type ISSHConnectProgress,
} from '../common/sshRemoteAgentHost.js';

export const ISSHRelayClientFactory = createDecorator<ISSHRelayClientFactory>('sshRelayClientFactory');

export interface ISSHRelayClientFactory {
	readonly _serviceBrand: undefined;
	createClient(mainService: ISSHRemoteAgentHostMainService, connectionId: string, address: string): RemoteAgentHostProtocolClient;
}

export class SSHRelayClientFactory implements ISSHRelayClientFactory {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) { }

	createClient(mainService: ISSHRemoteAgentHostMainService, connectionId: string, address: string): RemoteAgentHostProtocolClient {
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
			AhpJsonlLogger,
			{ logsHome: this._environmentService.logsHome, connectionId, transport: 'ssh' },
		) : undefined;
		const transport = this._instantiationService.createInstance(SSHRelayTransport, connectionId, mainService, logger);
		return this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport);
	}
}

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

	readonly onDidReportConnectProgress: Event<ISSHConnectProgress>;

	private readonly _connections = new Map<string, SSHAgentHostConnectionHandle>();

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISSHRelayClientFactory private readonly _relayClientFactory: ISSHRelayClientFactory,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();

		this._mainService = ProxyChannel.toService<ISSHRemoteAgentHostMainService>(
			sharedProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL),
		);

		this.onDidReportConnectProgress = this._mainService.onDidReportConnectProgress;

		// When shared process fires onDidCloseConnection, clean up the renderer-side handle.
		// Do NOT remove the configured entry — it stays in settings so startup reconnect
		// can re-establish the SSH tunnel on next launch.
		this._register(this._mainService.onDidCloseConnection(connectionId => {
			const handle = this._connections.get(connectionId);
			if (handle) {
				this._connections.delete(connectionId);
				handle.fireClose();
				handle.dispose();
				this._onDidChangeConnections.fire();
			}
		}));

		// Bridge keyboard-interactive prompts from the shared process to the
		// quick input UI so password / 2FA fallbacks work for SSH config hosts
		// where key-based auth fails.
		this._register(this._mainService.onDidRequestKeyboardInteractive(request => {
			this._handleKeyboardInteractiveRequest(request);
		}));
	}

	get connections(): readonly ISSHAgentHostConnection[] {
		return [...this._connections.values()];
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection> {
		const augmentedConfig = this._augmentConfig(config);
		this._logService.info(`[SSHRemoteAgentHost] Connecting to ${config.host}`);
		const result = await this._mainService.connect(augmentedConfig);
		this._logService.trace(`[SSHRemoteAgentHost] SSH tunnel established, connectionId=${result.connectionId}`);
		return this._setupConnection(result);
	}

	async disconnect(host: string): Promise<void> {
		await this._mainService.disconnect(host);
	}

	async listSSHConfigHosts(): Promise<string[]> {
		return this._mainService.listSSHConfigHosts();
	}

	async ensureUserSSHConfig(): Promise<URI> {
		return this._mainService.ensureUserSSHConfig();
	}

	async listSSHConfigFiles(): Promise<URI[]> {
		return this._mainService.listSSHConfigFiles();
	}

	async resolveSSHConfig(host: string): Promise<ISSHResolvedConfig> {
		return this._mainService.resolveSSHConfig(host);
	}

	async reconnect(sshConfigHost: string, name: string): Promise<ISSHAgentHostConnection> {
		const commandOverride = this._getRemoteAgentHostCommand();
		const agentForward = this._isSSHAgentForwardingEnabled();
		this._logService.info(`[SSHRemoteAgentHost] Reconnecting to ${sshConfigHost}`);
		const result = await this._mainService.reconnect(sshConfigHost, name, commandOverride, agentForward);
		return this._setupConnection(result);
	}

	/**
	 * Build the renderer-side handle, do the protocol handshake, and register
	 * with IRemoteAgentHostService. Any failure after the shared-process tunnel
	 * was established tears it back down so we don't leak it.
	 */
	private async _setupConnection(result: ISSHConnectResult): Promise<ISSHAgentHostConnection> {
		const existing = this._connections.get(result.connectionId);
		if (existing) {
			this._logService.trace('[SSHRemoteAgentHost] Returning existing connection handle');
			return existing;
		}

		let protocolClient: RemoteAgentHostProtocolClient | undefined;
		let handle: SSHAgentHostConnectionHandle | undefined;
		let registeredHandle = false;
		try {
			protocolClient = this._createRelayClient(result);
			await protocolClient.connect();
			this._logService.trace('[SSHRemoteAgentHost] Protocol handshake completed');

			handle = new SSHAgentHostConnectionHandle(
				result.config,
				result.address,
				result.name,
				() => this._mainService.disconnect(result.connectionId),
			);

			this._connections.set(result.connectionId, handle);
			registeredHandle = true;
			this._onDidChangeConnections.fire();

			await this._remoteAgentHostService.addManagedConnection({
				name: result.name,
				connectionToken: result.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.SSH,
					address: result.address,
					sshConfigHost: result.sshConfigHost,
					hostName: result.config.host,
					user: result.config.username || undefined,
					port: result.config.port,
				},
			}, protocolClient, this._createTransportDisposable(result.connectionId, handle));

			return handle;
		} catch (err) {
			this._logService.error('[SSHRemoteAgentHost] Connection setup failed', err);
			if (registeredHandle && this._connections.get(result.connectionId) === handle) {
				this._connections.delete(result.connectionId);
				this._onDidChangeConnections.fire();
			}
			handle?.dispose();
			protocolClient?.dispose();
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
			throw err;
		}
	}

	/**
	 * Build a disposable that the {@link IRemoteAgentHostService} will own
	 * for the lifetime of this entry. When the entry is removed (either by
	 * the user via "Remove Remote" or by config reconciliation), this runs
	 * and tears down the renderer-side handle and the shared-process SSH
	 * tunnel together. Without this hookup, the SSH tunnel would leak and
	 * the next `connect()` would silently reuse it.
	 */
	private _createTransportDisposable(connectionId: string, handle: SSHAgentHostConnectionHandle): IDisposable {
		return toDisposable(() => {
			// Drop the renderer-side handle map entry first so a concurrent
			// `connect()` for the same key doesn't latch onto a being-torn-down
			// connection.
			if (this._connections.get(connectionId) === handle) {
				this._connections.delete(connectionId);
				this._onDidChangeConnections.fire();
			}
			// Mark the handle as already closed-from-main so disposing it
			// doesn't kick off a redundant second disconnect IPC. The actual
			// disconnect is initiated below.
			handle.fireClose();
			handle.dispose();
			this._mainService.disconnect(connectionId).catch(() => { /* best effort */ });
		});
	}

	private _createRelayClient(result: { connectionId: string; address: string }): RemoteAgentHostProtocolClient {
		return this._relayClientFactory.createClient(this._mainService, result.connectionId, result.address);
	}

	private _augmentConfig(config: ISSHAgentHostConfig): ISSHAgentHostConfig {
		const result = { ...config };
		const commandOverride = this._getRemoteAgentHostCommand();
		if (commandOverride) {
			result.remoteAgentHostCommand = commandOverride;
		}
		// Agent forwarding requires both the global setting (security opt-in)
		// and the per-host SSH config `ForwardAgent yes` to be enabled.
		if (this._isSSHAgentForwardingEnabled() && config.agentForward) {
			result.agentForward = true;
		}
		return result;
	}

	private _getRemoteAgentHostCommand(): string | undefined {
		return this._configurationService.getValue<string>('chat.sshRemoteAgentHostCommand') || undefined;
	}

	private _isSSHAgentForwardingEnabled(): boolean | undefined {
		return this._configurationService.getValue<boolean>('chat.agentHost.forwardSSHAgent') || undefined;
	}

	/**
	 * Show a quick-input prompt for each entry in a keyboard-interactive
	 * challenge and forward the responses (or cancel) back to the main service.
	 *
	 * The renderer collects all prompts up front before responding so the
	 * server gets a single batched answer set, matching how OpenSSH presents
	 * keyboard-interactive challenges.
	 */
	private async _handleKeyboardInteractiveRequest(request: ISSHKeyboardInteractiveRequest): Promise<void> {
		this._logService.info(`[SSHRemoteAgentHost] Keyboard-interactive prompt for ${request.displayHost} (${request.prompts.length} prompt(s))`);

		// Honor cancellation if the underlying connect attempt fails or
		// completes while we're still gathering responses. Pass the
		// CancellationToken into quickInput so an in-flight prompt is
		// dismissed immediately rather than lingering on screen.
		const cts = new CancellationTokenSource();
		const cancelListener = this._mainService.onDidCancelKeyboardInteractive(requestId => {
			if (requestId === request.requestId) {
				cts.cancel();
			}
		});

		try {
			if (request.prompts.length === 0) {
				await this._mainService.respondKeyboardInteractive(request.requestId, []);
				return;
			}

			const responses: string[] = [];
			for (let i = 0; i < request.prompts.length; i++) {
				if (cts.token.isCancellationRequested) {
					return;
				}
				const prompt = request.prompts[i];
				// Trim trailing whitespace/colons from the server-supplied
				// prompt for a cleaner title (e.g. "Password: " -> "Password").
				const cleanedPrompt = prompt.prompt.replace(/[\s:]+$/, '');
				const title = request.prompts.length > 1
					? `${request.displayHost} (${i + 1}/${request.prompts.length})`
					: request.displayHost;
				const value = await this._quickInputService.input({
					title,
					prompt: cleanedPrompt || localize('sshKbiDefaultPrompt', "Authentication required for {0}@{1}", request.username, request.displayHost),
					password: !prompt.echo,
					ignoreFocusLost: true,
				}, cts.token);
				if (cts.token.isCancellationRequested) {
					return;
				}
				if (value === undefined) {
					// User cancelled — submit empty responses to fail this attempt.
					await this._mainService.respondKeyboardInteractive(request.requestId, undefined);
					return;
				}
				responses.push(value);
			}

			if (cts.token.isCancellationRequested) {
				return;
			}
			await this._mainService.respondKeyboardInteractive(request.requestId, responses);
		} catch (err) {
			this._logService.error('[SSHRemoteAgentHost] Failed handling keyboard-interactive prompt', err);
			// Best effort: tell the main service to give up on this attempt
			// so the SSH connect promise rejects rather than hanging.
			try {
				await this._mainService.respondKeyboardInteractive(request.requestId, undefined);
			} catch { /* swallow */ }
		} finally {
			cancelListener.dispose();
			cts.dispose();
		}
	}
}

/**
 * Lightweight renderer-side handle that represents a connection
 * managed by the main process.
 */
class SSHAgentHostConnectionHandle extends Disposable implements ISSHAgentHostConnection {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _closedByMain = false;

	constructor(
		readonly config: ISSHAgentHostConnection['config'],
		readonly localAddress: string,
		readonly name: string,
		disconnectFn: () => Promise<void>,
	) {
		super();

		// When this handle is disposed, tear down the main-process tunnel
		// (skip if already closed from the main process side)
		this._register(toDisposable(() => {
			if (!this._closedByMain) {
				disconnectFn().catch(() => { /* best effort */ });
			}
		}));
	}

	/** Called by the service when the main process signals connection closure. */
	fireClose(): void {
		this._closedByMain = true;
		this._onDidClose.fire();
	}
}
