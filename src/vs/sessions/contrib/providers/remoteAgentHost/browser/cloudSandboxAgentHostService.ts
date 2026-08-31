/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { WebPubSubRelayTransport } from '../../../../../platform/agentHost/browser/webPubSubRelayTransport.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import {
	buildWpsUrl,
	cloudSandboxAddress,
	CloudSandboxEnabledSettingId,
	ICloudSandboxAgentHostService,
	ICloudSandboxConnectOptions,
	ICloudSandboxApiService,
	isCloudSandboxSealedToken,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CloudSandboxCredentialRefresher, MAX_WAKING_DELAY_MS, type ICloudSandboxCreds } from './cloudSandboxCredentialRefresh.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/** Maximum number of `/connect` "waking" retries before giving up. */
const MAX_WAKING_RETRIES = 20;

/**
 * Maximum number of `/connect` re-mints while the sealed token is missing, sized to cover the
 * backend's own registration retry cycle.
 */
export const MAX_SEALED_TOKEN_RETRIES = 12;

/** Delay between `/connect` re-mints while waiting for complete credentials. */
const SEALED_TOKEN_RETRY_DELAY_MS = 5_000;

/**
 * Renderer-side coordinator for Copilot cloud sandbox connections.
 *
 * Mirrors {@link WebTunnelAgentHostService}: establishes a connection
 * out-of-band (mint creds → open a {@link WebPubSubRelayTransport} → drive the
 * AHP handshake) and hands the pre-connected {@link AgentHostProtocolClient}
 * to {@link IRemoteAgentHostService.addManagedConnection}, so the existing
 * remote-agent-host contribution surfaces it as a native, interactive session.
 */
export class CloudSandboxAgentHostService extends Disposable implements ICloudSandboxAgentHostService {
	declare readonly _serviceBrand: undefined;

	/** Credential-refresh scheduler per connection address, disposed when the connection is gone. */
	private readonly _managed = this._register(new DisposableMap<string>());

	/** Current Web PubSub credentials per connection address, including the sealed GitHub token. */
	private readonly _creds = new Map<string, ICloudSandboxCreds>();

	/** Overridable so tests can exercise the re-mint loop without waiting on real delays. */
	protected readonly sealedTokenRetryDelayMs: number = SEALED_TOKEN_RETRY_DELAY_MS;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// Stop refreshing credentials once a connection is gone.
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			for (const address of [...this._managed.keys()]) {
				if (!this._remoteAgentHostService.connections.some(c => c.address === address)) {
					this._managed.deleteAndDispose(address);
					this._creds.delete(address);
				}
			}
		}));
	}

	getSealedGitHubToken(environmentId: string): string | undefined {
		return this._creds.get(cloudSandboxAddress(environmentId))?.token.encrypted_github_token;
	}

	async connect(options: ICloudSandboxConnectOptions, token: CancellationToken): Promise<string> {
		if (!this._configurationService.getValue<boolean>(CloudSandboxEnabledSettingId)) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const address = cloudSandboxAddress(options.environmentId);

		// Reuse an existing live connection for this environment.
		const existing = this._remoteAgentHostService.getConnection(address);
		if (existing) {
			this._logService.trace(`${LOG_PREFIX} Reusing existing connection for ${address}`);
			return address;
		}

		this._logService.info(`${LOG_PREFIX} Connecting to sandbox environment ${options.environmentId}`);

		// Asked once: Mission Control blocks on the compute resume before replying, so its answer
		// already reflects that attempt and re-asking only repeats the wait. `202 waking` is the one
		// retried case, polled inside the mint against Mission Control's own Retry-After.
		const clientToken = await this._mintWithWaking(options, token);

		// A token only means Mission Control believes the environment is online — a sandbox deleted
		// minutes ago still has a fresh heartbeat, so one is minted for a host that is already gone.
		// The handshake's liveness watchdog settles that case.
		return await this._establish(options, address, clientToken, token);
	}

	/**
	 * Open the relay with an already-minted token, drive the AHP handshake, and register the
	 * connection.
	 */
	protected async _establish(options: ICloudSandboxConnectOptions, address: string, clientToken: ICloudSandboxClientToken, token: CancellationToken): Promise<string> {
		// Mutable holder read by the transport factory: the protocol client re-invokes the factory to
		// soft-reconnect, picking up whatever credentials the refresh scheduler last wrote.
		const creds: ICloudSandboxCreds = { token: clientToken };
		// Three per-client relay lanes: publish to `to_host`; receive replies on `to_client` and
		// unsolicited session state on `broadcast`. `groupValidation` drops inbound frames whose
		// group name doesn't carry our own client id.
		// Each soft reconnect gets a transport-owned logger keyed by connection id.
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		const transportFactory = (): IProtocolTransport => new WebPubSubRelayTransport({
			url: buildWpsUrl(creds.token),
			toHostGroup: creds.token.groups.to_host,
			joinGroups: [creds.token.groups.broadcast, creds.token.groups.to_client],
			groupValidation: { expected: { cid: creds.token.client_id } },
			ahpLogger: ahpLoggingEnabled
				? this._instantiationService.createInstance(AhpJsonlLogger, {
					logsHome: this._environmentService.logsHome,
					connectionId: clientToken.client_id,
					transport: 'webpubsub',
				})
				: undefined,
		});

		// Mission Control mints the client id and binds the relay lane to it, so the AHP identity
		// must match or the host rejects requests on that lane.
		const protocolClient = this._instantiationService.createInstance(
			AgentHostProtocolClient, address, transportFactory, { clientId: clientToken.client_id, clientInfo: editorWindowAgentHostClientInfo },
		);

		let status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected;
		let connectError: unknown;
		try {
			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);
		} catch (err) {
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
				protocolClient.dispose();
				throw err;
			}
			this._logService.warn(`${LOG_PREFIX} Incompatible with ${address}: ${incompatible.message}`);
			status = incompatible;
			connectError = err;
		}

		// Push the sealed GitHub token so the host can call api.github.com on the agent's behalf.
		// Only a `copilot-sealed.v1.` envelope is forwarded; a plaintext bearer is refused.
		if (!connectError && clientToken.encrypted_github_token) {
			if (!isCloudSandboxSealedToken(clientToken.encrypted_github_token)) {
				this._logService.error(`${LOG_PREFIX} Refusing to forward a non-sealed token to ${address}; Mission Control did not return a copilot-sealed envelope.`);
			} else {
				try {
					await protocolClient.authenticate({
						resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
						token: clientToken.encrypted_github_token,
					});
				} catch (err) {
					this._logService.warn(`${LOG_PREFIX} Sealed-token authenticate failed for ${address}`, err);
				}
			}
		} else if (!connectError) {
			// Without an envelope every later request answers `-32007 AuthRequired`.
			this._logService.error(`${LOG_PREFIX} Mission Control returned no sealed token for ${address}; this session will not be able to make authenticated requests.`);
		}

		try {
			await this._remoteAgentHostService.addManagedConnection({
				name: options.name,
				connection: {
					type: RemoteAgentHostEntryType.CloudSandbox,
					address,
					environmentId: options.environmentId,
					sessionId: options.sessionId,
				},
			}, protocolClient, undefined, status);
		} catch (err) {
			protocolClient.dispose();
			this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
			throw err;
		}

		// Keep credentials fresh for the life of the connection so reconnects have a valid token.
		const store = new DisposableStore();
		store.add(this._instantiationService.createInstance(
			CloudSandboxCredentialRefresher,
			address,
			{ environmentId: options.environmentId, sessionId: options.sessionId },
			clientToken.client_id,
			creds,
		));
		this._managed.set(address, store);
		// Expose the sealed GitHub token so the AHP `authenticate` pass can present it to the host.
		this._creds.set(address, creds);

		if (connectError) {
			throw connectError;
		}
		return address;
	}

	/** Mint client creds, retrying (bounded) while the environment is waking. */
	private async _mintWithWaking(options: ICloudSandboxConnectOptions, token: CancellationToken): Promise<ICloudSandboxClientToken> {
		for (let attempt = 0; attempt < MAX_WAKING_RETRIES; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const result = await this._apiService.connect({ environmentId: options.environmentId, sessionId: options.sessionId }, token);
			if (result.kind === 'token') {
				return await this._awaitSealedToken(options, result.token, token);
			}
			const delayMs = Math.min(result.waking.retryAfterSeconds * 1000, MAX_WAKING_DELAY_MS);
			this._logService.info(`${LOG_PREFIX} Environment ${options.environmentId} waking; retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_WAKING_RETRIES})`);
			await timeout(delayMs, token);
		}
		throw new Error(`Timed out waiting for sandbox environment ${options.environmentId} to wake.`);
	}

	/**
	 * Re-mint credentials until they carry a sealed token, which a freshly provisioned environment
	 * can omit for a short window after it comes up. Returns the last credentials either way, since
	 * an environment may legitimately never seal one.
	 */
	private async _awaitSealedToken(options: ICloudSandboxConnectOptions, minted: ICloudSandboxClientToken, token: CancellationToken): Promise<ICloudSandboxClientToken> {
		let clientToken = minted;
		// Match what `_establish` accepts: an unsealed value would wrongly end the loop.
		for (let attempt = 0; attempt < MAX_SEALED_TOKEN_RETRIES && !isCloudSandboxSealedToken(clientToken.encrypted_github_token); attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.info(`${LOG_PREFIX} Environment ${options.environmentId} has no sealed GitHub token yet; re-minting in ${this.sealedTokenRetryDelayMs}ms (attempt ${attempt + 1}/${MAX_SEALED_TOKEN_RETRIES})`);
			await timeout(this.sealedTokenRetryDelayMs, token);

			let result: CloudSandboxConnectResult;
			try {
				result = await this._apiService.connect({ environmentId: options.environmentId, sessionId: options.sessionId }, token);
			} catch (err) {
				if (isCancellationError(err) || token.isCancellationRequested) {
					throw err;
				}
				// The initial mint still works, so degrade rather than discard it.
				this._logService.warn(`${LOG_PREFIX} Re-mint for ${options.environmentId} failed; continuing without a sealed token`, err);
				break;
			}
			if (result.kind !== 'token') {
				// Went back to waking mid-wait; the handshake watchdog covers a host that is gone.
				break;
			}
			clientToken = result.token;
		}
		return clientToken;
	}
}
