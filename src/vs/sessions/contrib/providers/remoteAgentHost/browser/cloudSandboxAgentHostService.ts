/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
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
	CloudSandboxEnvironmentOfflineError,
	ICloudSandboxCredentialsService,
	isCloudSandboxSealedToken,
	type ICloudSandboxClientToken,
	type ICloudSandboxEnvironment,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/** Maximum number of `/connect` "waking" retries before giving up. */
const MAX_WAKING_RETRIES = 20;

/** Upper bound on a single waking Retry-After wait (ms), guarding against a hostile header. */
const MAX_WAKING_DELAY_MS = 30_000;

/** Refresh the Web PubSub credentials this long before the access token's `expires_at`. */
const CREDENTIAL_REFRESH_LEAD_MS = 60_000;

/** Floor / ceiling for the scheduled credential-refresh delay. */
const MIN_CREDENTIAL_REFRESH_DELAY_MS = 5_000;
const MAX_CREDENTIAL_REFRESH_DELAY_MS = 55 * 60_000;

/** Backoff delay after a failed credential refresh before retrying. */
const CREDENTIAL_REFRESH_RETRY_MS = 30_000;

/** Maximum time to wait for a sandbox environment to report `online` before giving up. */
const ENVIRONMENT_READY_TIMEOUT_MS = 120_000;

/** Delay between environment status polls while waiting for `online`. */
const ENVIRONMENT_POLL_INTERVAL_MS = 2_000;

/**
 * How many full establish attempts (each minting a fresh client id via `/connect`, which is the
 * only call that publishes a new daemon spawn) before giving up.
 */
const MAX_ESTABLISH_ATTEMPTS = 3;

/** Delay between establish attempts. */
const ESTABLISH_RETRY_DELAY_MS = 2_000;

/** Mutable holder for the current Web PubSub credentials, read by the transport factory. */
interface ICloudSandboxCreds {
	token: ICloudSandboxClientToken;
}

/**
 * Delay (ms) until credentials should be refreshed, computed as `expires_at` minus a lead time and
 * clamped to a sane range. Falls back to the minimum when `expires_at` is missing/unparseable.
 */
function credentialRefreshDelayMs(expiresAt: string | undefined): number {
	const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
	if (Number.isNaN(expiryMs)) {
		return MIN_CREDENTIAL_REFRESH_DELAY_MS;
	}
	const delay = expiryMs - Date.now() - CREDENTIAL_REFRESH_LEAD_MS;
	return Math.min(MAX_CREDENTIAL_REFRESH_DELAY_MS, Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, delay));
}

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
		@ICloudSandboxCredentialsService private readonly _credentialsService: ICloudSandboxCredentialsService,
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

		// Each attempt mints a fresh client id via `/connect`; only that call republishes the daemon
		// spawn, so a failed attempt cannot be recovered by reusing the same id.
		let lastError: unknown;
		for (let attempt = 1; attempt <= MAX_ESTABLISH_ATTEMPTS; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			try {
				return await this._establish(options, address, token);
			} catch (err) {
				if (isCancellationError(err) || err instanceof CancellationError) {
					throw err;
				}
				// Retrying re-mints credentials and wakes the sandbox again, which cannot help here.
				if (err instanceof CloudSandboxEnvironmentOfflineError) {
					throw err;
				}
				lastError = err;
				if (attempt >= MAX_ESTABLISH_ATTEMPTS) {
					break;
				}
				this._logService.warn(`${LOG_PREFIX} Establish attempt ${attempt}/${MAX_ESTABLISH_ATTEMPTS} failed for ${address}; retrying with a fresh connect`, err);
				await timeout(ESTABLISH_RETRY_DELAY_MS, token);
			}
		}
		this._logService.error(`${LOG_PREFIX} Connection setup failed`, lastError);
		throw lastError;
	}

	/**
	 * One establish attempt: mint credentials, wait for the environment to be online, open the relay,
	 * drive the AHP handshake, and register the connection.
	 */
	private async _establish(options: ICloudSandboxConnectOptions, address: string, token: CancellationToken): Promise<string> {
		const clientToken = await this._mintWithWaking(options, token);

		// Credentials can be issued before the daemon is listening, which would leave `initialize`
		// unanswered, so wait for the environment to report `online`.
		await this._waitForEnvironmentOnline(options.environmentId, token);

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
		this._scheduleCredentialRefresh(store, address, options, clientToken.client_id, creds);
		this._managed.set(address, store);
		// Expose the sealed GitHub token so the AHP `authenticate` pass can present it to the host.
		this._creds.set(address, creds);

		if (connectError) {
			throw connectError;
		}
		return address;
	}

	/**
	 * Poll until the environment reports `online`. Proceeds without gating when the environment
	 * cannot be read. Protocol compatibility is settled by the `initialize` handshake.
	 *
	 * Credentials are minted first, and Mission Control answers `202 waking` until the environment
	 * is up — so a token in hand means the wake already completed. A state that cannot recover from
	 * there is reported immediately rather than waited out.
	 *
	 * TODO: when the environment is unreachable, render the session's history read-only and queue
	 * follow-ups until the host reconnects, as github-ui does. That needs a history source that does
	 * not depend on the relay, which we do not have yet.
	 */
	private async _waitForEnvironmentOnline(environmentId: string, token: CancellationToken): Promise<void> {
		const deadline = Date.now() + ENVIRONMENT_READY_TIMEOUT_MS;
		let lastStatus: string | undefined;
		while (true) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			let environment: ICloudSandboxEnvironment;
			try {
				environment = await this._credentialsService.getEnvironment(environmentId, token);
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Could not read environment ${environmentId}; connecting without a readiness gate`, err);
				return;
			}

			if (environment.status === 'online') {
				if (lastStatus) {
					this._logService.info(`${LOG_PREFIX} Environment ${environmentId} is online.`);
				}
				return;
			}
			if (environment.status === 'offline' || environment.status === 'draining') {
				throw new CloudSandboxEnvironmentOfflineError(environment.status);
			}
			if (environment.status !== lastStatus) {
				lastStatus = environment.status;
				this._logService.info(`${LOG_PREFIX} Environment ${environmentId} is '${environment.status}'; waiting for it to come online.`);
			}
			if (Date.now() >= deadline) {
				// Not fatal: an environment may be reachable without reporting `online`, so fall
				// through and let the handshake decide.
				this._logService.warn(`${LOG_PREFIX} Environment ${environmentId} still '${environment.status}' after ${Math.round(ENVIRONMENT_READY_TIMEOUT_MS / 1000)}s; attempting to connect anyway.`);
				return;
			}
			await timeout(ENVIRONMENT_POLL_INTERVAL_MS, token);
		}
	}

	/**
	 * Re-mint Web PubSub credentials shortly before they expire and write them into {@link creds}.
	 * The open socket is untouched; the new token is used the next time the transport is rebuilt.
	 */
	private _scheduleCredentialRefresh(store: DisposableStore, address: string, options: ICloudSandboxConnectOptions, clientId: string, creds: ICloudSandboxCreds): void {
		const timer = store.add(new MutableDisposable());
		const arm = (delayMs: number) => {
			timer.value = disposableTimeout(() => void refresh(), Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, delayMs));
		};
		const refresh = async () => {
			try {
				const result = await this._credentialsService.reconnect(
					{ environmentId: options.environmentId, sessionId: options.sessionId }, clientId, CancellationToken.None,
				);
				if (result.kind === 'waking') {
					arm(Math.min(result.waking.retryAfterSeconds * 1000, MAX_WAKING_DELAY_MS));
					return;
				}
				// Keep the previous sealed token when a refresh omits it.
				creds.token = result.token.encrypted_github_token
					? result.token
					: { ...result.token, encrypted_github_token: creds.token.encrypted_github_token, host_encryption_key: creds.token.host_encryption_key };
				this._logService.trace(`${LOG_PREFIX} Refreshed Web PubSub credentials for ${address}`);
				arm(credentialRefreshDelayMs(result.token.expires_at));
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Credential refresh failed for ${address}; retrying`, err);
				arm(CREDENTIAL_REFRESH_RETRY_MS);
			}
		};
		arm(credentialRefreshDelayMs(creds.token.expires_at));
	}

	/** Mint client creds, retrying (bounded) while the environment is waking. */
	private async _mintWithWaking(options: ICloudSandboxConnectOptions, token: CancellationToken): Promise<ICloudSandboxClientToken> {
		for (let attempt = 0; attempt < MAX_WAKING_RETRIES; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const result = await this._credentialsService.connect({ environmentId: options.environmentId, sessionId: options.sessionId }, token);
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
