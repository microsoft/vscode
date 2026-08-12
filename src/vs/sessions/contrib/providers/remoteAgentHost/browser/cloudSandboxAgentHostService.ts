/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { RemoteAgentHostProtocolClient } from '../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { WebPubSubRelayTransport } from '../../../../../platform/agentHost/browser/webPubSubRelayTransport.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../../platform/agentHost/common/agentService.js';
import {
	buildWpsUrl,
	cloudSandboxAddress,
	CloudSandboxEnabledSettingId,
	ICloudSandboxAgentHostService,
	ICloudSandboxConnectOptions,
	ICloudSandboxApiService,
	isCloudSandboxSealedToken,
	type ICloudSandboxClientToken,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CloudSandboxCredentialRefresher, MAX_WAKING_DELAY_MS, type ICloudSandboxCreds } from './cloudSandboxCredentialRefresh.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/** Maximum number of `/connect` "waking" retries before giving up. */
const MAX_WAKING_RETRIES = 20;

/**
 * Renderer-side coordinator for Copilot cloud sandbox connections.
 *
 * Mirrors {@link WebTunnelAgentHostService}: establishes a connection
 * out-of-band (mint creds → open a {@link WebPubSubRelayTransport} → drive the
 * AHP handshake) and hands the pre-connected {@link RemoteAgentHostProtocolClient}
 * to {@link IRemoteAgentHostService.addManagedConnection}, so the existing
 * remote-agent-host contribution surfaces it as a native, interactive session.
 */
export class CloudSandboxAgentHostService extends Disposable implements ICloudSandboxAgentHostService {
	declare readonly _serviceBrand: undefined;

	/** Credential-refresh scheduler per connection address, disposed when the connection is gone. */
	private readonly _managed = this._register(new DisposableMap<string>());

	/** Current Web PubSub credentials per connection address, including the sealed GitHub token. */
	private readonly _creds = new Map<string, ICloudSandboxCreds>();

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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
	private async _establish(options: ICloudSandboxConnectOptions, address: string, clientToken: ICloudSandboxClientToken, token: CancellationToken): Promise<string> {
		// Mutable holder read by the transport factory: the protocol client re-invokes the factory to
		// soft-reconnect, picking up whatever credentials the refresh scheduler last wrote.
		const creds: ICloudSandboxCreds = { token: clientToken };
		// Three per-client relay lanes: publish to `to_host`; receive replies on `to_client` and
		// unsolicited session state on `broadcast`. `groupValidation` drops inbound frames whose
		// group name doesn't carry our own client id.
		const transportFactory = (): IProtocolTransport => new WebPubSubRelayTransport({
			url: buildWpsUrl(creds.token),
			toHostGroup: creds.token.groups.to_host,
			joinGroups: [creds.token.groups.broadcast, creds.token.groups.to_client],
			groupValidation: { expected: { cid: creds.token.client_id } },
		});

		// Mission Control mints the client id and binds the relay lane to it, so the AHP identity
		// must match or the host rejects requests on that lane.
		const protocolClient = this._instantiationService.createInstance(
			RemoteAgentHostProtocolClient, address, transportFactory, undefined, clientToken.client_id, editorWindowAgentHostClientInfo,
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
				return result.token;
			}
			const delayMs = Math.min(result.waking.retryAfterSeconds * 1000, MAX_WAKING_DELAY_MS);
			this._logService.info(`${LOG_PREFIX} Environment ${options.environmentId} waking; retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_WAKING_RETRIES})`);
			await timeout(delayMs, token);
		}
		throw new Error(`Timed out waiting for sandbox environment ${options.environmentId} to wake.`);
	}
}
