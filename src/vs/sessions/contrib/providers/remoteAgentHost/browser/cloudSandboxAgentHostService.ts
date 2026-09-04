/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { raceCancellationError, timeout } from '../../../../../base/common/async.js';
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
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection, type IRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
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

interface IStagedCloudSandboxConnection {
	readonly entry: IRemoteAgentHostEntry;
	readonly options: ICloudSandboxConnectOptions;
	readonly creds: ICloudSandboxCreds;
	readonly clientId: string;
}

/** Builds cloud sandbox protocol clients from credentials staged by the caller. */
class CloudSandboxConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.CloudSandbox;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;

	private readonly _stagedConnections = new Map<string, IStagedCloudSandboxConnection>();
	private readonly _entries = observableValue<readonly IRemoteAgentHostEntry[]>(this, []);

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _configurationService: IConfigurationService,
		private readonly _environmentService: IEnvironmentService,
	) {
		super();
		this.entries = this._entries;
		// Staging is cleared only by an explicit `unstageConfiguration`, never by
		// observing the connection disappear. The service withdraws an entry
		// before arming a retry, so treating that as removal would delete the
		// staged credentials the retry needs and leave `_scheduleReconnect` with
		// nothing configured — silently turning every scheduled retry into one
		// single attempt. `_establish` already unstages on the paths that really
		// are terminal.
	}

	stageConfiguration(options: ICloudSandboxConnectOptions, clientToken: ICloudSandboxClientToken): IRemoteAgentHostEntry {
		const address = cloudSandboxAddress(options.environmentId);
		const entry: IRemoteAgentHostEntry = {
			name: options.name,
			connection: {
				type: RemoteAgentHostEntryType.CloudSandbox,
				address,
				environmentId: options.environmentId,
				sessionId: options.sessionId,
			},
		};
		this._stagedConnections.set(address, {
			entry,
			options,
			creds: { token: clientToken },
			clientId: clientToken.client_id,
		});
		this._updateEntries();
		return entry;
	}

	unstageConfiguration(address: string): void {
		this._stagedConnections.delete(address);
		this._updateEntries();
	}

	getSealedGitHubToken(environmentId: string): string | undefined {
		return this._stagedConnections.get(cloudSandboxAddress(environmentId))?.creds.token.encrypted_github_token;
	}

	async createConnection(entry: IRemoteAgentHostEntry, _options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.CloudSandbox) {
			throw new Error(`Cloud sandbox factory cannot create a ${entry.connection.type} connection.`);
		}
		const address = getEntryAddress(entry);
		const staged = this._stagedConnections.get(address);
		if (!staged) {
			throw new Error(`No cloud sandbox connection is staged for ${address}.`);
		}

		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		const transportFactory = (): IProtocolTransport => new WebPubSubRelayTransport({
			url: buildWpsUrl(staged.creds.token),
			toHostGroup: staged.creds.token.groups.to_host,
			joinGroups: [staged.creds.token.groups.broadcast, staged.creds.token.groups.to_client],
			groupValidation: { expected: { cid: staged.creds.token.client_id } },
			ahpLogger: ahpLoggingEnabled
				? this._instantiationService.createInstance(AhpJsonlLogger, {
					logsHome: this._environmentService.logsHome,
					connectionId: staged.clientId,
					transport: 'webpubsub',
				})
				: undefined,
		});
		const client = this._instantiationService.createInstance(
			AgentHostProtocolClient,
			address,
			transportFactory,
			{
				clientId: staged.clientId,
				clientInfo: editorWindowAgentHostClientInfo,
				resolveInitialAuthentication: () => this._resolveInitialAuthentication(address),
			},
		);
		const store = new DisposableStore();
		const refresher = store.add(new MutableDisposable<CloudSandboxCredentialRefresher>());
		store.add(client.onDidChangeConnectionState(state => {
			if (state === 'connected' && !refresher.value) {
				refresher.value = this._instantiationService.createInstance(
					CloudSandboxCredentialRefresher,
					address,
					{ environmentId: staged.options.environmentId, sessionId: staged.options.sessionId },
					staged.clientId,
					staged.creds,
				);
			}
		}));
		return { connection: client, transportDisposable: store };
	}

	private async _resolveInitialAuthentication(address: string): Promise<{ readonly resource: string; readonly token: string } | undefined> {
		// Throw rather than returning `undefined`: an unusable token must fail
		// the connection, not produce one that reports connected and then fails
		// every authenticated request. The protocol client classifies this as an
		// initial-authentication failure and surfaces it as incompatible.
		const sealedToken = this._stagedConnections.get(address)?.creds.token.encrypted_github_token;
		if (!sealedToken) {
			throw new Error(`Mission Control returned no sealed token for ${address}; the session cannot make authenticated requests.`);
		}
		if (!isCloudSandboxSealedToken(sealedToken)) {
			throw new Error(`Refusing to forward a non-sealed token to ${address}; Mission Control did not return a copilot-sealed envelope.`);
		}
		return { resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: sealedToken };
	}

	private _updateEntries(): void {
		this._entries.set([...this._stagedConnections.values()].map(connection => connection.entry), undefined);
	}
}

/** Renderer-side coordinator for Copilot cloud sandbox connections. */
export class CloudSandboxAgentHostService extends Disposable implements ICloudSandboxAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _connectionFactory: CloudSandboxConnectionFactory;

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
		this._connectionFactory = this._register(new CloudSandboxConnectionFactory(
			this._instantiationService,
			this._configurationService,
			this._environmentService,
		));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));
	}

	getSealedGitHubToken(environmentId: string): string | undefined {
		return this._connectionFactory.getSealedGitHubToken(environmentId);
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
	 * Stage already-minted credentials and wait for the remote connection service to handshake it.
	 */
	protected async _establish(options: ICloudSandboxConnectOptions, address: string, clientToken: ICloudSandboxClientToken, token: CancellationToken): Promise<string> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._connectionFactory.stageConfiguration(options, clientToken);
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._remoteAgentHostService.reconnect(address, true);
			await raceCancellationError(this._remoteAgentHostService.waitForConnection(address), token);
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);
			return address;
		} catch (error) {
			// A failed dial now retains a client-less entry, so mere presence no
			// longer means the connection survived — require a live one.
			const connectionStillLive = this._remoteAgentHostService.connections.some(connection =>
				connection.address === address
				&& (RemoteAgentHostConnectionStatus.isConnected(connection.status) || RemoteAgentHostConnectionStatus.isReconnecting(connection.status)));
			if (token.isCancellationRequested || !connectionStillLive) {
				this._connectionFactory.unstageConfiguration(address);
				await this._remoteAgentHostService.removeRemoteAgentHost(address);
			}
			throw error;
		}
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
