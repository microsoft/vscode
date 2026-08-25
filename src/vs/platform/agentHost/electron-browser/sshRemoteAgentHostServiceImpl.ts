/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { INotificationService, Severity } from '../../notification/common/notification.js';
import { toAction } from '../../../base/common/actions.js';
import { IProductService } from '../../product/common/productService.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../common/remoteAgentHostService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IQuickInputService } from '../../quickinput/common/quickInput.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../common/agentService.js';
import type { AgentHostServerType } from '../common/agentHostEndpointRegistry.js';
import { IRemoteAgentHostLocationPreferenceService } from '../common/remoteAgentHostLocationPreference.js';
import { promptRemoteAgentHostLocationPreference } from '../common/remoteAgentHostLocationPreferenceDialog.js';
import { SSHRelayTransport } from './sshRelayTransport.js';
import { AgentHostProtocolClient } from '../browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../common/agentHostClientInfo.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import {
	ISSHRemoteAgentHostService,
	SSH_REMOTE_AGENT_HOST_CHANNEL,
	computeSSHConnectionKey,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConnection,
	type ISSHConnectResult,
	type ISSHEndpointCandidate,
	type ISSHEndpointSelection,
	type ISSHEndpointSelectionRequest,
	type ISSHHostKeyVerificationRequest,
	type ISSHHostKeysAnnouncement,
	type ISSHKeyboardInteractiveRequest,
	type ISSHRemoteAgentHostMainService,
	type ISSHResolvedConfig,
	type ISSHConnectProgress,
} from '../common/sshRemoteAgentHost.js';
import { ISSHHostKeyTrustService } from '../common/sshHostKeyTrust.js';
import { decideHostKeyTrust, type SSHHostKeyDenial } from '../common/sshHostKeyPolicy.js';

/**
 * Human-readable name for a host key algorithm, matching how OpenSSH labels
 * them in its own prompts (e.g. "ED25519 key fingerprint is ...").
 */
export function describeHostKeyType(keyType: string): string {
	switch (keyType) {
		case 'ssh-ed25519': return 'ED25519';
		case 'ssh-rsa':
		case 'rsa-sha2-256':
		case 'rsa-sha2-512': return 'RSA';
		case 'ssh-dss': return 'DSA';
		case 'ecdsa-sha2-nistp256':
		case 'ecdsa-sha2-nistp384':
		case 'ecdsa-sha2-nistp521': return 'ECDSA';
		default: return keyType;
	}
}

export const ISSHRelayClientFactory = createDecorator<ISSHRelayClientFactory>('sshRelayClientFactory');

export interface ISSHRelayClientFactory {
	readonly _serviceBrand: undefined;
	createClient(mainService: ISSHRemoteAgentHostMainService, connectionId: string, address: string): AgentHostProtocolClient;
}

export class SSHRelayClientFactory implements ISSHRelayClientFactory {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) { }

	createClient(mainService: ISSHRemoteAgentHostMainService, connectionId: string, address: string): AgentHostProtocolClient {
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
			AhpJsonlLogger,
			{ logsHome: this._environmentService.logsHome, connectionId, transport: 'ssh' },
		) : undefined;
		const transport = this._instantiationService.createInstance(SSHRelayTransport, connectionId, mainService, logger);
		return this._instantiationService.createInstance(AgentHostProtocolClient, address, transport, undefined, undefined, agentsWindowAgentHostClientInfo);
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

	/**
	 * The server type ('editor' or 'standalone') of the last successfully
	 * established connection for a given (stable) connection address.
	 * Deliberately NOT cleared when a connection closes (see
	 * `onDidCloseConnection` below) — it needs to survive disconnect cleanup
	 * so a later automatic reconnect can detect an editor→standalone
	 * failover and surface a one-time notification. Only ever updated after
	 * a connection has fully and successfully registered.
	 */
	private readonly _lastConnectedServerTypeByAddress = new Map<string, AgentHostServerType>();

	/**
	 * The host key that authenticated the most recent session for a given
	 * connection key. Used to decide whether an `UpdateHostKeys` announcement
	 * may be trusted (see {@link _handleAnnouncedHostKeys}). Bounded by the
	 * number of distinct SSH hosts, and each entry is overwritten on reconnect.
	 */
	private readonly _sessionHostKeys = new Map<string, { keyType: string; fingerprint: string }>();

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISSHRelayClientFactory private readonly _relayClientFactory: ISSHRelayClientFactory,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IRemoteAgentHostLocationPreferenceService private readonly _locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IProductService private readonly _productService: IProductService,
		@ISSHHostKeyTrustService private readonly _hostKeyTrustService: ISSHHostKeyTrustService,
	) {
		super();

		this._mainService = ProxyChannel.toService<ISSHRemoteAgentHostMainService>(
			sharedProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL),
		);

		this.onDidReportConnectProgress = this._mainService.onDidReportConnectProgress;

		// When shared process fires onDidCloseConnection, clean up the renderer-side handle.
		// Do NOT remove the configured entry — it stays persisted so startup reconnect
		// can re-establish the SSH tunnel on next launch.
		this._register(this._mainService.onDidCloseConnection(connectionId => {
			this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: connectionId=${connectionId}`);
			const handle = this._connections.get(connectionId);
			if (handle) {
				this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: found handle for ${connectionId}, cleaning up`);
				this._connections.delete(connectionId);
				handle.fireClose();
				handle.dispose();
				this._onDidChangeConnections.fire();

				// Defense-in-depth: also signal the protocol client directly. The
				// SSHRelayTransport normally observes `onDidRelayClose` (fired from
				// the same shared-process code path as this event) and calls back
				// into the client. If that IPC delivery is missed for any reason,
				// the renderer-side client would stay in `Connected` until its
				// liveness watchdog fires — which can take hours when the
				// renderer is backgrounded and Chromium throttles `setTimeout`.
				// Use the handle's address (e.g., "ssh:macbook-air") since
				// RemoteAgentHostService keys its clients by address, not connectionId.
				this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: notifying protocol client for ${handle.localAddress}`);
				this._remoteAgentHostService.notifyConnectionClosed(handle.localAddress);
			} else {
				this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: no renderer-side handle for ${connectionId} (already cleaned up?)`);
			}
		}));

		// Bridge keyboard-interactive prompts from the shared process to the
		// quick input UI so password / 2FA fallbacks work for SSH config hosts
		// where key-based auth fails.
		this._register(this._mainService.onDidRequestKeyboardInteractive(request => {
			this._handleKeyboardInteractiveRequest(request);
		}));

		// Bridge endpoint-selection requests (multiple live remote agent
		// hosts found on the remote) to the stored per-host location
		// preference, prompting with the shared preference modal only when
		// no preference is stored and an editor-owned endpoint is live.
		this._register(this._mainService.onDidRequestEndpointSelection(request => {
			this._handleEndpointSelectionRequest(request);
		}));

		// Verify server host keys. Without this the shared process would accept
		// any key from any server, so this is what actually makes SSH agent
		// host connections resistant to impersonation.
		this._register(this._mainService.onDidRequestHostKeyVerification(request => {
			this._trackHostKeyVerification(this._handleHostKeyVerificationRequest(request));
		}));

		// Learn host keys a server proves it owns over an already-authenticated
		// connection (OpenSSH's UpdateHostKeys), so a legitimate key rotation
		// is picked up silently rather than becoming a hard failure later.
		this._register(this._mainService.onDidAnnounceHostKeys(announcement => {
			this._handleAnnouncedHostKeys(announcement);
		}));
	}

	get connections(): readonly ISSHAgentHostConnection[] {
		return [...this._connections.values()];
	}

	async connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const augmentedConfig = this._augmentConfig(config);
		this._logService.info(`[SSHRemoteAgentHost] Connecting to ${config.host}`);
		const result = await this._mainService.connect(augmentedConfig);
		this._logService.trace(`[SSHRemoteAgentHost] SSH tunnel established, connectionId=${result.connectionId}`);
		return this._setupConnection(result, config.userInitiated ?? true);
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

	async reconnect(sshConfigHost: string, name: string, userInitiated?: boolean): Promise<ISSHAgentHostConnection> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const commandOverride = this._getRemoteAgentHostCommand();
		const agentForward = this._isSSHAgentForwardingEnabled();
		const preferredAgentLocation = this._locationPreferenceService.getPreference(computeSSHConnectionKey({ sshConfigHost }));
		this._logService.info(`[SSHRemoteAgentHost] Reconnecting to ${sshConfigHost} (userInitiated=${userInitiated ?? true})`);
		const result = await this._mainService.reconnect(sshConfigHost, name, commandOverride, agentForward, userInitiated, preferredAgentLocation);
		return this._setupConnection(result, userInitiated ?? true);
	}

	/**
	 * Build the renderer-side handle, do the protocol handshake, and register
	 * with IRemoteAgentHostService. Any failure after the shared-process tunnel
	 * was established tears it back down so we don't leak it.
	 */
	private async _setupConnection(result: ISSHConnectResult, userInitiated: boolean): Promise<ISSHAgentHostConnection> {
		const existing = this._connections.get(result.connectionId);
		if (existing) {
			// Reuse the existing handle only if the managed entry is still
			// in a usable state. After a `reconnect` that replaced the
			// underlying SSH relay (e.g. following a CLI-driven server
			// upgrade), the previous protocol client is bound to a
			// torn-down transport and — if its handshake had failed with
			// `incompatible` — will never re-handshake on its own. Drop
			// the stale local state and fall through to a fresh
			// handshake; the subsequent `addManagedConnection` call
			// disposes the stale protocol client by replacing the entry.
			if (this._remoteAgentHostService.getConnection(result.address)) {
				this._logService.trace('[SSHRemoteAgentHost] Returning existing connection handle');
				return existing;
			}
			this._logService.info(`[SSHRemoteAgentHost] Replacing stale connection handle for ${result.address}`);
			this._connections.delete(result.connectionId);
			// Mark closed-by-main so disposing the handle does NOT call
			// disconnect() — the main service kept the SSH client alive
			// across `replaceRelay`, and we'd kill the brand-new tunnel
			// otherwise.
			existing.fireClose();
			existing.dispose();
			this._onDidChangeConnections.fire();
		}
		let registeredHandle = false;
		const protocolClient = this._createRelayClient(result);
		let status = RemoteAgentHostConnectionStatus.connected;
		let connectError: unknown;
		try {
			await protocolClient.connect();
			this._logService.trace('[SSHRemoteAgentHost] Protocol handshake completed');
		} catch (err) {
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
				this._logService.error('[SSHRemoteAgentHost] Connection setup failed', err);
				protocolClient.dispose();
				this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
				throw err;
			}
			this._logService.warn(`[SSHRemoteAgentHost] Incompatible with ${result.address}: ${incompatible.message}`);
			status = incompatible;
			connectError = err;
		}

		const handle = new SSHAgentHostConnectionHandle(
			result.config,
			result.address,
			result.name,
			result.serverType,
			result.instanceId,
			result.primary,
			result.lifecycle,
			() => this._mainService.disconnect(result.connectionId),
		);

		try {
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
			}, protocolClient, this._createTransportDisposable(result.connectionId, handle), status);
		} catch (err) {
			this._logService.error('[SSHRemoteAgentHost] Connection setup failed', err);
			if (registeredHandle && this._connections.get(result.connectionId) === handle) {
				this._connections.delete(result.connectionId);
				this._onDidChangeConnections.fire();
			}
			handle.dispose();
			protocolClient.dispose();
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
			throw err;
		}

		if (connectError) {
			throw connectError;
		}

		// Only track/notify for a fully successful setup — an incompatible
		// handshake (connectError above) still registers a managed entry
		// but isn't a usable connection, so it must not count as "reconnect
		// succeeded" for failover-detection purposes.
		this._recordEndpointSelection(result, userInitiated);

		return handle;
	}

	/**
	 * Update the last-known server type for {@link result.address}, and — if
	 * this was an automatic/background reconnect (`userInitiated === false`)
	 * that moved this stable remote address from a previously connected
	 * `editor`-owned endpoint to a newly selected `standalone` endpoint —
	 * surface a single informational notification. Never fires for the
	 * initial connect to a remote (no prior recorded server type), a
	 * user-initiated reconnect, or a same-kind transition
	 * (editor→editor/standalone→standalone).
	 */
	private _recordEndpointSelection(result: ISSHConnectResult, userInitiated: boolean): void {
		if (!result.serverType) {
			return;
		}
		const previousServerType = this._lastConnectedServerTypeByAddress.get(result.address);
		const isUnattendedFailoverFromEditor = userInitiated === false
			&& previousServerType === 'editor'
			&& result.serverType === 'standalone';
		this._lastConnectedServerTypeByAddress.set(result.address, result.serverType);
		if (isUnattendedFailoverFromEditor) {
			this._notificationService.info(localize(
				'sshEditorAgentHostReplacedByStandalone',
				"The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted."
			));
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

	private _createRelayClient(result: { connectionId: string; address: string }): AgentHostProtocolClient {
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
		// Thread the stored per-host location preference through to the main
		// process so `selectEndpoint` can honor it directly — without ever
		// emitting an endpoint-selection request — for both user-initiated
		// and silent/background connects (see `ISSHAgentHostConfig.preferredAgentLocation`).
		const preferredAgentLocation = this._locationPreferenceService.getPreference(computeSSHConnectionKey(config));
		if (preferredAgentLocation) {
			result.preferredAgentLocation = preferredAgentLocation;
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
					// User cancelled — abort the owning connection attempt.
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

	/**
	 * Decide whether to trust a server's host key, and tell the shared process.
	 *
	 * Policy lives in {@link decideHostKeyTrust}; this method owns the UI and
	 * the storage writes. Every path must respond exactly once — the SSH
	 * handshake is suspended until it hears back.
	 */
	/**
	 * Hook for observing when a host key verification has fully settled.
	 * Overridden by tests so they can await the real operation instead of
	 * sleeping for a fixed interval, which is load-dependent and flaky —
	 * particularly for the cases that assert *nothing* happened.
	 */
	protected _trackHostKeyVerification(handled: Promise<void>): void {
		void handled;
	}

	private async _handleHostKeyVerificationRequest(request: ISSHHostKeyVerificationRequest): Promise<void> {
		this._logService.info(`[SSHRemoteAgentHost] Host key verification for ${request.displayHost}: ${request.keyType} ${request.fingerprint} (known_hosts: ${request.knownHostsMatch})`);

		const cts = new CancellationTokenSource();
		const cancelListener = this._mainService.onDidCancelHostKeyVerification(requestId => {
			if (requestId === request.requestId) {
				cts.cancel();
			}
		});

		try {
			const decision = decideHostKeyTrust(request, this._hostKeyTrustService.getTrustedKeys(request.host, request.port));
			this._logService.info(`[SSHRemoteAgentHost] Host key decision for ${request.displayHost}: ${decision.kind} (${decision.reason})`);

			let trusted: boolean;
			switch (decision.kind) {
				case 'trust':
					if (decision.persist) {
						this._trustHostKey(request);
					}
					trusted = true;
					break;
				case 'deny':
					this._reportHostKeyDenied(request, decision);
					trusted = false;
					break;
				case 'prompt': {
					trusted = await this._promptForHostKey(request, decision.reason, cts.token);
					if (cts.token.isCancellationRequested) {
						return;
					}
					if (trusted) {
						this._trustHostKey(request);
					}
					break;
				}
			}

			if (cts.token.isCancellationRequested) {
				return;
			}
			// Remember which host key actually authenticated this session, so
			// a later UpdateHostKeys announcement can be checked against it.
			this._sessionHostKeys.set(request.connectionKey, { keyType: request.keyType, fingerprint: request.fingerprint });
			await this._mainService.respondHostKeyVerification(request.requestId, trusted);
		} catch (err) {
			this._logService.error('[SSHRemoteAgentHost] Failed handling host key verification', err);
			// Fail closed: an error here must never become a way to connect to
			// an unverified server.
			try {
				await this._mainService.respondHostKeyVerification(request.requestId, false);
			} catch { /* swallow */ }
		} finally {
			cancelListener.dispose();
			cts.dispose();
		}
	}

	private _trustHostKey(request: ISSHHostKeyVerificationRequest): void {
		this._hostKeyTrustService.trustHostKey(request.host, request.port, {
			keyType: request.keyType,
			fingerprint: request.fingerprint,
			addedAt: Date.now(),
			...(request.displayHost !== request.host ? { alias: request.displayHost } : undefined),
		});
	}

	/**
	 * Ask the user whether to trust an unrecognized host key, echoing OpenSSH's
	 * wording so it is recognizable to anyone who has used `ssh` directly.
	 * Cancel is the default so the safe answer is the one you get by dismissing.
	 *
	 * Uses a custom dialog so the prompt can be dismissed programmatically when
	 * the connection dies underneath it — a native dialog cannot be, and would
	 * strand the user with a question about a connection that no longer exists.
	 * Answering a stale prompt was always safe (the caller re-checks
	 * cancellation before acting), but leaving it on screen is confusing.
	 */
	private async _promptForHostKey(request: ISSHHostKeyVerificationRequest, reason: 'unknown' | 'ca-only', token: CancellationToken): Promise<boolean> {
		if (token.isCancellationRequested) {
			return false;
		}

		const detail = reason === 'ca-only'
			? localize(
				'sshHostKeyCaOnlyDetail',
				"{0} key fingerprint is {1}.\n\nThis host is configured to use a certificate authority, but certificate-based host keys cannot be verified here, so this key cannot be checked against it.",
				describeHostKeyType(request.keyType), request.fingerprint)
			: localize(
				'sshHostKeyUnknownDetail',
				"{0} key fingerprint is {1}.\n\nVerify this fingerprint matches the host before continuing.",
				describeHostKeyType(request.keyType), request.fingerprint);

		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message: localize('sshHostKeyUnknownMessage', "The authenticity of host '{0}' can't be established.", request.displayHost),
			detail,
			primaryButton: localize('sshHostKeyConnect', "&&Connect"),
			cancelButton: localize('sshHostKeyCancel', "Cancel"),
			custom: { icon: Codicon.shield },
			// Cancellation resolves the dialog as if Cancel was pressed, which
			// is also the answer we want for a connection that is already gone.
			token,
		});
		return confirmed;
	}

	/**
	 * Explain a refusal. A changed or revoked key gets an error notification
	 * with no "trust anyway" affordance — recovering requires explicitly
	 * forgetting the host, so a possible impersonation cannot be dismissed
	 * with a single reflexive click.
	 */
	private _reportHostKeyDenied(request: ISSHHostKeyVerificationRequest, denial: SSHHostKeyDenial): void {
		if (denial.reason === 'not-user-initiated') {
			// A background reconnect: log it, but do not interrupt with UI the
			// user did not ask for. Connecting manually surfaces the prompt.
			this._logService.warn(`[SSHRemoteAgentHost] Declining unknown host key for ${request.displayHost} during a background reconnect; connect manually to review it.`);
			return;
		}

		if (denial.reason === 'strict-yes') {
			this._notificationService.error(localize(
				'sshHostKeyStrictUnknown',
				"Can't connect to '{0}': its host key is not known, and StrictHostKeyChecking is set to \"yes\" in your SSH configuration.",
				request.displayHost));
			return;
		}

		// Forgetting our stored key only helps when our store is what
		// disagreed. A revoked marker, or a conflicting `known_hosts` entry,
		// lives in the user's own files and would keep winning afterwards — so
		// offering the action there would send them in circles.
		if (denial.reason !== 'mismatch') { // 'revoked'
			this._notificationService.error(localize(
				'sshHostKeyRevoked',
				"Host key verification failed for '{0}'. This host's {1} key has been marked as revoked in your known_hosts file. Remove the @revoked line from known_hosts if this key should be trusted again.",
				request.displayHost, describeHostKeyType(request.keyType)));
			return;
		}

		if (denial.source === 'known-hosts') {
			this._notificationService.error(localize(
				'sshHostKeyChangedKnownHosts',
				"Host key verification failed for '{0}'. Its {1} host key does not match the entry in your known_hosts file, which could mean someone is impersonating the host — or that the host was legitimately rebuilt. Received {2}. Update or remove the known_hosts entry if this change was expected.",
				request.displayHost, describeHostKeyType(request.keyType), request.fingerprint));
			return;
		}

		this._notificationService.notify({
			severity: Severity.Error,
			message: localize(
				'sshHostKeyChanged',
				"Host key verification failed for '{0}'. Its {1} host key has changed, which could mean someone is impersonating the host — or that the host was legitimately rebuilt. Received {2}.",
				request.displayHost, describeHostKeyType(request.keyType), request.fingerprint),
			actions: {
				primary: [toAction({
					id: 'sshHostKey.forget',
					label: localize('sshHostKeyForgetAction', "Forget Saved Host Key"),
					run: () => this._hostKeyTrustService.forgetHost(request.host, request.port),
				})],
			},
		});
	}

	/**
	 * Persist host keys the server proved it owns, so a legitimate key
	 * rotation is invisible to the user instead of a hard failure on the next
	 * connect.
	 *
	 * ssh2 verifies the `hostkeys-prove` signatures before surfacing these,
	 * but that only proves the keys belong to *whoever we are currently
	 * talking to* — it says nothing about whether that party is the real host.
	 * So we additionally require that the host key which authenticated this
	 * very session is itself currently trusted. This mirrors OpenSSH, whose
	 * `UpdateHostKeys` documentation states additional host keys are accepted
	 * only "if the key used to authenticate the host was already trusted or
	 * explicitly accepted by the user".
	 *
	 * Without that check, a session accepted through
	 * `StrictHostKeyChecking=no` — where we deliberately did not verify
	 * anything — could announce keys that overwrite the user's genuine stored
	 * key, leaving an impostor's key trusted once strict checking is restored.
	 */
	private _handleAnnouncedHostKeys(announcement: ISSHHostKeysAnnouncement): void {
		const existing = this._hostKeyTrustService.getTrustedKeys(announcement.host, announcement.port);
		if (!existing.length) {
			// Only extend trust we already have. Recording keys for a host the
			// user has never accepted would turn an announcement into a way to
			// establish trust without any verification at all.
			return;
		}

		const sessionKey = this._sessionHostKeys.get(announcement.connectionKey);
		if (!sessionKey || !existing.some(e => e.keyType === sessionKey.keyType && e.fingerprint === sessionKey.fingerprint)) {
			this._logService.warn(`[SSHRemoteAgentHost] Ignoring announced host keys for ${announcement.host}: the key that authenticated this session is not itself trusted`);
			return;
		}

		for (const key of announcement.keys) {
			if (!existing.some(e => e.keyType === key.keyType && e.fingerprint === key.fingerprint)) {
				this._logService.info(`[SSHRemoteAgentHost] Learned rotated ${key.keyType} host key for ${announcement.host}: ${key.fingerprint}`);
				this._hostKeyTrustService.trustHostKey(announcement.host, announcement.port, {
					keyType: key.keyType,
					fingerprint: key.fingerprint,
					addedAt: Date.now(),
				});
			}
		}
	}

	/**
	 * Resolve which live remote agent host endpoint (or "start a new one")
	 * to connect to and forward the choice (or cancellation) back to the
	 * main service. Consults the stored per-host {@link IRemoteAgentHostLocationPreferenceService}
	 * preference for `request.connectionKey` first; only opens the shared
	 * preference modal ({@link promptRemoteAgentHostLocationPreference})
	 * when no preference is stored and an `editor`-owned endpoint is live,
	 * since otherwise there's no ambiguity worth interrupting the user for.
	 */
	private async _handleEndpointSelectionRequest(request: ISSHEndpointSelectionRequest): Promise<void> {
		this._logService.info(`[SSHRemoteAgentHost] Endpoint selection requested for ${request.displayHost} (${request.candidates.length} candidate(s))`);

		const cts = new CancellationTokenSource();
		const cancelListener = this._mainService.onDidCancelEndpointSelection(requestId => {
			if (requestId === request.requestId) {
				cts.cancel();
			}
		});

		try {
			const selection = await this._resolveEndpointSelection(request, cts.token);
			await this._mainService.respondEndpointSelection(request.requestId, selection);
		} catch (err) {
			this._logService.error('[SSHRemoteAgentHost] Failed handling endpoint selection prompt', err);
			try {
				await this._mainService.respondEndpointSelection(request.requestId, undefined);
			} catch { /* swallow */ }
		} finally {
			cancelListener.dispose();
			cts.dispose();
		}
	}

	/**
	 * Apply the preference-resolution rules described on
	 * {@link _handleEndpointSelectionRequest}. Returns `undefined` only when
	 * the shared preference modal was shown and the user cancelled it.
	 */
	private async _resolveEndpointSelection(request: ISSHEndpointSelectionRequest, token: CancellationToken): Promise<ISSHEndpointSelection | undefined> {
		const hasLiveEditor = request.candidates.some(candidate => candidate.type === 'editor');
		const preference = this._locationPreferenceService.getPreference(request.connectionKey);

		if (preference === 'editor') {
			// Explicit consent to run in an editor. If none is live right
			// now, fall back to a dedicated selection without touching the
			// saved preference — see the class-level comment on
			// `_lastConnectedServerTypeByAddress` for why a future connect
			// should still be able to prefer an editor again.
			return hasLiveEditor ? this._deterministicSelection(request.candidates, 'editor') : this._dedicatedSelection(request.candidates);
		}

		if (preference === 'dedicated') {
			return this._dedicatedSelection(request.candidates);
		}

		if (!hasLiveEditor) {
			// No stored preference and no editor to disambiguate against —
			// nothing here can steal a session from another open window,
			// so resolve silently without prompting.
			return this._dedicatedSelection(request.candidates);
		}

		const chosen = await promptRemoteAgentHostLocationPreference(this._dialogService, request.displayHost, this._productService.nameShort, undefined, token);
		if (token.isCancellationRequested || !chosen) {
			return undefined;
		}
		this._locationPreferenceService.setPreference(request.connectionKey, chosen);
		return chosen === 'editor' ? this._deterministicSelection(request.candidates, 'editor') : this._dedicatedSelection(request.candidates);
	}

	/** Reuse a live standalone endpoint if one exists, or spawn a new dedicated one. */
	private _dedicatedSelection(candidates: readonly ISSHEndpointCandidate[]): ISSHEndpointSelection {
		return this._deterministicSelection(candidates, 'standalone') ?? { kind: 'spawn' };
	}

	/**
	 * Pick the candidate of `type` deterministically when several are live,
	 * by sorting on `instanceId` so every renderer resolving the same
	 * request (e.g. multiple open editor windows) converges on the same
	 * choice without needing to coordinate.
	 */
	private _deterministicSelection(candidates: readonly ISSHEndpointCandidate[], type: AgentHostServerType): ISSHEndpointSelection | undefined {
		const matching = candidates.filter(candidate => candidate.type === type);
		if (matching.length === 0) {
			return undefined;
		}
		const [chosen] = matching.slice().sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
		return { kind: 'candidate', type: chosen.type, pid: chosen.pid, instanceId: chosen.instanceId };
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
		readonly serverType: ISSHAgentHostConnection['serverType'],
		readonly instanceId: ISSHAgentHostConnection['instanceId'],
		readonly primary: ISSHAgentHostConnection['primary'],
		readonly lifecycle: ISSHAgentHostConnection['lifecycle'],
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
