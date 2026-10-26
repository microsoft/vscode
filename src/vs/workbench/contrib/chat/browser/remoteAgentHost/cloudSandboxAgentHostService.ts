/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { disposableTimeout, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { localize } from '../../../../../nls.js';
import { AgentHostTransportFailureReason, NonReconnectableTransportError, IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { sealAgentHostCredential } from '../../../../../platform/agentHost/browser/agentHostCredentialSealing.js';
import type { AuthenticateParams } from '../../../../../platform/agentHost/common/agent.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { formatConnectionDiagnosticError, getConnectionDiagnosticError, traceConnectionOperation, type IConnectionDiagnosticEvent } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { WebPubSubRelayTransport } from '../../../../../platform/agentHost/browser/webPubSubRelayTransport.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, AgentHostAhpJsonlLoggingSettingId, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import {
	buildWpsUrl,
	cloudSandboxAddress,
	cloudSandboxEnvironmentId,
	CloudSandboxEnabledSettingId,
	CloudSandboxNetworkError,
	ICloudSandboxAgentHostService,
	ICloudSandboxConnectOptions,
	ICloudSandboxApiService,
	isCloudSandboxSealedToken,
	isRetryableCloudSandboxError,
	CloudSandboxRequestError,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type IHostEncryptionKey,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection, type IRemoteAgentHostEntry, type RemoteAgentHostConnectionObserver } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { DEFAULT_RECONNECT_POLICY } from '../../../../../platform/agentHost/common/reconnectPolicy.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IPowerService } from '../../../../services/power/common/powerService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { MISSION_CONTROL_RETRY_BUDGET_MS, missionControlMaxRetries, missionControlRetryDelay } from '../../../../../platform/github/common/missionControl/missionControlError.js';
import { CloudSandboxCredentialRefresher, CloudSandboxCredentialRefreshState, MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, MIN_CREDENTIAL_REFRESH_DELAY_MS, type ICloudSandboxCreds } from './cloudSandboxCredentialRefresh.js';
import { getCloudSandboxConnectionSurface, ICloudSandboxTelemetryService, type CloudSandboxConnectionSurface, type ICloudSandboxConnectionTelemetry } from './cloudSandboxTelemetry.js';
import { isMissionControlRecipientTrusted, verifyMissionControlRecipient } from './missionControlCredentialSealing.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

const CONNECTION_RETRY_DELAY_MS = 30_000;
const MIN_WAKING_RETRY_DELAY_MS = 1_000;

/** Maximum number of credential refreshes while waiting for a sealed token. */
export const MAX_SEALED_TOKEN_RETRIES = 12;

/** Delay between credential refreshes while waiting for complete credentials. */
const SEALED_TOKEN_RETRY_DELAY_MS = 5_000;

/** Total budget for acquiring credentials and establishing the connection. */
const CONNECTION_TIMEOUT_MS = 10 * 60_000;
const SANDBOX_RECONNECT_POLICY = {
	...DEFAULT_RECONNECT_POLICY,
	maxElapsedTimeMs: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES * MIN_CREDENTIAL_REFRESH_DELAY_MS,
	jitter: true,
};
const USER_LOCAL_RECONNECT_POLICY = { ...SANDBOX_RECONNECT_POLICY, maxElapsedTimeMs: 120_000 };

interface IStagedCloudSandboxConnection {
	readonly entry: IRemoteAgentHostEntry;
	readonly options: ICloudSandboxConnectOptions;
	readonly creds: ICloudSandboxCreds;
	readonly clientId: string;
	readonly refreshState: CloudSandboxCredentialRefreshState;
	refresher: CloudSandboxCredentialRefresher | undefined;
	authenticationLifetime: CancellationTokenSource | undefined;
	reconnectRequiresRefresh: boolean;
	lastAuthenticationToken: string | undefined;
	trustedEncryptionKeys: readonly IHostEncryptionKey[] | undefined;
}

/** Builds cloud sandbox protocol clients from credentials staged by the caller. */
class CloudSandboxConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.CloudSandbox;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;

	private readonly _stagedConnections = new Map<string, IStagedCloudSandboxConnection>();
	private readonly _pendingConnections = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _connectionTelemetry = this._register(new DisposableMap<string, ICloudSandboxConnectionTelemetry>());
	private readonly _entries = observableValue<readonly IRemoteAgentHostEntry[]>(this, []);
	private readonly _surface: CloudSandboxConnectionSurface;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ICloudSandboxTelemetryService private readonly _telemetryService: ICloudSandboxTelemetryService,
		@IPowerService private readonly _powerService: IPowerService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
	) {
		super();
		this.entries = this._entries;
		this._surface = getCloudSandboxConnectionSurface(this._environmentService.isSessionsWindow, isWeb);
		this._register(toDisposable(() => {
			for (const staged of this._stagedConnections.values()) {
				staged.authenticationLifetime?.dispose(true);
			}
		}));
		// Staging is cleared only by an explicit `unstageConfiguration`, never by
		// observing the connection disappear. The service withdraws an entry
		// before arming a retry, so treating that as removal would delete the
		// staged credentials the retry needs and leave `_scheduleReconnect` with
		// nothing configured — silently turning every scheduled retry into one
		// single attempt. `_establish` already unstages on the paths that really
		// are terminal.
	}

	beginConnect(address: string, options: ICloudSandboxConnectOptions): ICloudSandboxConnectionTelemetry | undefined {
		if (this._store.isDisposed || this._connectionTelemetry.has(address)) {
			return undefined;
		}
		const telemetry = this._telemetryService.trackConnection('credentials', this._surface, options.connectionSource, options);
		this._connectionTelemetry.set(address, telemetry);
		return telemetry;
	}

	getTelemetry(address: string): ICloudSandboxConnectionTelemetry | undefined {
		return this._connectionTelemetry.get(address);
	}

	releaseTelemetry(address: string, telemetry: ICloudSandboxConnectionTelemetry | undefined): void {
		if (telemetry && this._connectionTelemetry.get(address) === telemetry) {
			this._connectionTelemetry.deleteAndDispose(address);
		}
	}

	endConnectionTelemetry(address: string, cancelled: boolean): void {
		const telemetry = this._connectionTelemetry.get(address);
		telemetry?.onConnectionStateChange(cancelled ? 'disposed' : 'failed');
		this.releaseTelemetry(address, telemetry);
	}

	getConnectionObserver(entry: IRemoteAgentHostEntry): RemoteAgentHostConnectionObserver {
		const address = getEntryAddress(entry);
		const staged = this._stagedConnections.get(address);
		let telemetry = this._connectionTelemetry.get(address);
		if (!telemetry) {
			// A new tracker for retained credentials is a new attachment, not the original provisioning flow.
			telemetry = this._telemetryService.trackConnection('connection', this._surface, 'existing', {
				environmentKind: staged?.options.environmentKind,
				environmentId: staged?.options.environmentId,
				sessionId: staged?.options.sessionId,
			});
			this._connectionTelemetry.set(address, telemetry);
		}
		const connectionTelemetry = telemetry;
		return state => {
			if (state === 'connected' && staged) {
				staged.reconnectRequiresRefresh = false;
			}
			connectionTelemetry.onConnectionStateChange(state);
			if (state === 'failed' || state === 'disposed') {
				this.releaseTelemetry(address, connectionTelemetry);
			}
		};
	}

	stageConfiguration(options: ICloudSandboxConnectOptions, clientToken: ICloudSandboxClientToken): IRemoteAgentHostEntry {
		const address = cloudSandboxAddress(options.environmentId);
		this._pendingConnections.deleteAndDispose(address);
		this._stagedConnections.get(address)?.authenticationLifetime?.dispose(true);
		const entry: IRemoteAgentHostEntry = {
			name: options.name,
			connection: {
				type: RemoteAgentHostEntryType.CloudSandbox,
				address,
				environmentId: options.environmentId,
				sessionId: options.sessionId,
				...(options.environmentKind ? { environmentKind: options.environmentKind } : {}),
			},
		};
		this._stagedConnections.set(address, {
			entry,
			options,
			creds: { token: clientToken },
			clientId: clientToken.client_id,
			refreshState: new CloudSandboxCredentialRefreshState(),
			refresher: undefined,
			authenticationLifetime: undefined,
			reconnectRequiresRefresh: true,
			lastAuthenticationToken: undefined,
			trustedEncryptionKeys: options.trustedEncryptionKeys,
		});
		this._updateEntries();
		return entry;
	}

	unstageConfiguration(address: string): void {
		this._pendingConnections.deleteAndDispose(address);
		this._stagedConnections.get(address)?.authenticationLifetime?.dispose(true);
		this._stagedConnections.delete(address);
		this._updateEntries();
	}

	isCurrentConfiguration(entry: IRemoteAgentHostEntry): boolean {
		return this._stagedConnections.get(getEntryAddress(entry))?.entry === entry;
	}

	getSealedGitHubToken(environmentId: string): string | undefined {
		return this._stagedConnections.get(cloudSandboxAddress(environmentId))?.creds.token.encrypted_github_token;
	}

	async resolveUserLocalAuthentication(environmentId: string, resource: string, forceRefresh = false): Promise<AuthenticateParams> {
		const staged = this._stagedConnections.get(cloudSandboxAddress(environmentId));
		if (!staged || staged.options.environmentKind !== 'user-local' || !staged.options.accountKey) {
			throw new Error('Mission Control identity authentication requires a staged user-local connection.');
		}
		const lifetime = staged.authenticationLifetime;
		if (!lifetime || lifetime.token.isCancellationRequested) {
			throw new CancellationError();
		}
		const token = lifetime.token;
		const identity = await this._apiService.getIdentityToken(staged.options.accountKey, token, forceRefresh);
		if (token.isCancellationRequested || staged.authenticationLifetime !== lifetime || !this.isCurrentConfiguration(staged.entry)) {
			throw new CancellationError();
		}
		const expiresIn = identity.expiresAt === undefined ? undefined : Math.floor((identity.expiresAt - Date.now()) / 1000);
		if (expiresIn !== undefined && expiresIn <= 0) {
			throw new Error('Mission Control identity credential expired before authentication.');
		}
		return { resource, token: identity.token, ...(expiresIn === undefined ? {} : { expiresIn }) };
	}

	async refreshSealedGitHubToken(environmentId: string): Promise<string | undefined> {
		const address = cloudSandboxAddress(environmentId);
		const staged = this._stagedConnections.get(address);
		const refresher = staged?.refresher;
		if (!staged || !refresher) {
			throw new Error(`No active cloud sandbox credential refresher for ${address}.`);
		}
		const sealedToken = await refresher.refreshAuthenticationCredentials();
		if (this._stagedConnections.get(address) !== staged || staged.refresher !== refresher) {
			throw new CancellationError();
		}
		return sealedToken;
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

		const store = new DisposableStore();
		this._pendingConnections.set(address, store);
		try {
			staged.authenticationLifetime?.dispose(true);
			const lifetime = new CancellationTokenSource();
			store.add(toDisposable(() => lifetime.dispose(true)));
			staged.authenticationLifetime = lifetime;
			const telemetry = this._connectionTelemetry.get(address);
			telemetry?.setConnectionId(staged.clientId);
			let protocolClient: AgentHostProtocolClient | undefined = undefined;
			const diagnosticObserver = (event: IConnectionDiagnosticEvent) => telemetry?.recordConnectionDiagnostic({ ...event, ...protocolClient?.getConnectionDiagnosticState() });
			const refresher = store.add(this._instantiationService.createInstance(
				CloudSandboxCredentialRefresher,
				address,
				{ environmentId: staged.options.environmentId, sessionId: staged.options.sessionId, ...(staged.options.environmentKind ? { environmentKind: staged.options.environmentKind } : {}), onRequest: telemetry?.createRequestObserver() },
				staged.clientId,
				staged.creds,
				staged.refreshState,
			));
			staged.refresher = refresher;
			store.add(toDisposable(() => {
				if (staged.refresher === refresher) {
					staged.refresher = undefined;
				}
			}));
			const prepareCredentials = (refreshConnection: boolean) => traceConnectionOperation(diagnosticObserver, 'credentials', async () => {
				try {
					if (refreshConnection) {
						await refresher.refreshConnectionCredentials();
					} else {
						await refresher.ensureUnexpiredCredentials();
					}
				} catch (error) {
					if (this._stagedConnections.get(address) !== staged || store.isDisposed) {
						throw new CancellationError();
					}
					if (staged.refreshState.permanentFailure) {
						this.unstageConfiguration(address);
						throw new NonReconnectableTransportError('Mission Control refused connection recovery; reconnect after resolving environment availability or account authorization.',
							staged.refreshState.permanentFailureStatus === 404 ? AgentHostTransportFailureReason.HostNotRunning : AgentHostTransportFailureReason.Unknown);
					}
					throw error;
				}
				if (this._stagedConnections.get(address) !== staged || store.isDisposed) {
					throw new CancellationError();
				}
			});
			await prepareCredentials(false);
			const ahpLoggingEnabled = staged.options.environmentKind !== 'user-local'
				&& !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
			const transportFactory = (): IProtocolTransport => this._instantiationService.createInstance(WebPubSubRelayTransport, {
				clientConnectionKind: staged.options.environmentKind === 'user-local' ? AgentHostClientConnectionKind.MissionControl : AgentHostClientConnectionKind.WebPubSub,
				clientId: staged.clientId,
				url: buildWpsUrl(staged.creds.token),
				toHostGroup: staged.creds.token.groups.to_host,
				joinGroups: [staged.creds.token.groups.broadcast, staged.creds.token.groups.to_client],
				groupValidation: { expected: { cid: staged.creds.token.client_id } },
				onDidReceiveFrame: () => telemetry?.recordReceivedFrame(),
				ahpLogger: ahpLoggingEnabled
					? this._instantiationService.createInstance(AhpJsonlLogger, {
						logsHome: this._environmentService.logsHome,
						logId: address,
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
					clientInfo: this._environmentService.isSessionsWindow ? agentsWindowAgentHostClientInfo : editorWindowAgentHostClientInfo,
					reconnectPolicy: staged.options.environmentKind === 'user-local' ? USER_LOCAL_RECONNECT_POLICY : SANDBOX_RECONNECT_POLICY,
					onDidSuspend: this._powerService.onDidSuspend,
					onDidResume: this._powerService.onDidResume,
					prepareReconnect: async () => {
						await prepareCredentials(staged.reconnectRequiresRefresh || staged.options.environmentKind === 'user-local');
						staged.reconnectRequiresRefresh = true;
					},
					prepareAuthentication: async () => {
						if (staged.options.environmentKind !== 'user-local' && staged.lastAuthenticationToken && staged.lastAuthenticationToken === staged.creds.token.encrypted_github_token) {
							await traceConnectionOperation(diagnosticObserver, 'credentials', () => refresher.refreshAuthenticationCredentials());
						}
					},
					resolveInitialAuthentication: () => this._resolveInitialAuthentication(staged, lifetime.token),
					sealAuthenticationToken: staged.options.environmentKind === 'user-local' ? async request => {
						if (await this._apiService.getAccountKey() !== staged.options.accountKey) {
							throw new CancellationError();
						}
						if (!isMissionControlRecipientTrusted(request, staged.trustedEncryptionKeys)) {
							const environment = await this._apiService.getEnvironment(staged.options.environmentId, lifetime.token);
							if (environment.id !== staged.options.environmentId) {
								throw new Error('Mission Control returned a different environment for credential encryption.');
							}
							staged.trustedEncryptionKeys = environment.encryption_keys;
						}
						verifyMissionControlRecipient(request, staged.trustedEncryptionKeys);
						if (lifetime.token.isCancellationRequested || !this.isCurrentConfiguration(staged.entry)) {
							throw new CancellationError();
						}
						return sealAgentHostCredential(request);
					} : undefined,
				},
			);
			protocolClient = client;
			store.add(client.onDidConnectionDiagnostic(diagnosticObserver));
			store.add(client.onDidAction(envelope => telemetry?.recordSessionAction(envelope, client.getConnectionDiagnosticState())));
			return { connection: client, transportDisposable: store, reconnectManagedByClient: true };
		} catch (error) {
			store.dispose();
			throw error;
		} finally {
			if (this._pendingConnections.get(address) === store) {
				this._pendingConnections.deleteAndLeak(address);
			}
		}
	}

	private async _resolveInitialAuthentication(staged: IStagedCloudSandboxConnection, token: CancellationToken): Promise<AuthenticateParams | undefined> {
		if (token.isCancellationRequested || !this.isCurrentConfiguration(staged.entry)) {
			throw new CancellationError();
		}
		if (staged.options.environmentKind === 'user-local') {
			return this.resolveUserLocalAuthentication(staged.options.environmentId, GITHUB_COPILOT_PROTECTED_RESOURCE.resource);
		}
		// Throw rather than returning `undefined`: an unusable token must fail
		// the connection, not produce one that reports connected and then fails
		// every authenticated request. The protocol client classifies this as an
		// initial-authentication failure and surfaces it as incompatible.
		const address = getEntryAddress(staged.entry);
		const sealedToken = staged.creds.token.encrypted_github_token;
		if (!sealedToken) {
			throw new Error(`Mission Control returned no sealed token for ${address}; the session cannot make authenticated requests.`);
		}
		if (!isCloudSandboxSealedToken(sealedToken)) {
			throw new Error(`Refusing to forward a non-sealed token to ${address}; Mission Control did not return a copilot-sealed envelope.`);
		}
		staged.lastAuthenticationToken = sealedToken;
		return { resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: sealedToken };
	}

	private _updateEntries(): void {
		this._entries.set([...this._stagedConnections.values()].map(connection => connection.entry), undefined);
	}

	getUserLocalEnvironmentIds(account: string | undefined): readonly string[] {
		return [...this._stagedConnections.values()].filter(connection => connection.options.environmentKind === 'user-local' && connection.options.accountKey !== account).map(connection => connection.options.environmentId);
	}
}

/** Renderer-side coordinator for Copilot cloud sandbox connections. */
export class CloudSandboxAgentHostService extends Disposable implements ICloudSandboxAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _connectionFactory: CloudSandboxConnectionFactory;
	private _accountGeneration = 0;

	/** Overridable so tests can exercise the re-mint loop without waiting on real delays. */
	protected readonly sealedTokenRetryDelayMs: number = SEALED_TOKEN_RETRY_DELAY_MS;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostService private readonly _localAgentHostService: IAgentHostService,
	) {
		super();
		this._connectionFactory = this._register(this._instantiationService.createInstance(CloudSandboxConnectionFactory));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));
		this._register(this._apiService.onDidChangeAccount(account => {
			this._accountGeneration++;
			for (const id of this._connectionFactory.getUserLocalEnvironmentIds(account)) {
				void this.disconnect(id).catch(error => this._logService.error('Failed to withdraw user-local MC connection', error));
			}
		}));
	}

	getSealedGitHubToken(environmentId: string): string | undefined {
		return this._connectionFactory.getSealedGitHubToken(environmentId);
	}

	refreshSealedGitHubToken(environmentId: string): Promise<string | undefined> {
		return this._connectionFactory.refreshSealedGitHubToken(environmentId);
	}

	resolveUserLocalAuthentication(environmentId: string, resource: string, forceRefresh = false): Promise<AuthenticateParams> {
		return this._connectionFactory.resolveUserLocalAuthentication(environmentId, resource, forceRefresh);
	}

	async disconnect(addressOrEnvironmentId: string): Promise<void> {
		const address = cloudSandboxEnvironmentId(addressOrEnvironmentId) === undefined ? cloudSandboxAddress(addressOrEnvironmentId) : addressOrEnvironmentId;
		this._connectionFactory.endConnectionTelemetry(address, true);
		this._connectionFactory.unstageConfiguration(address);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
	}

	async connect(options: ICloudSandboxConnectOptions, token: CancellationToken): Promise<string> {
		if (options.environmentKind !== 'user-local' && !this._configurationService.getValue<boolean>(CloudSandboxEnabledSettingId)) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}
		let userLocalAccount: string | undefined;
		const accountGeneration = this._accountGeneration;
		if (options.environmentKind === 'user-local') {
			if (await this._localAgentHostService.getMissionControlEnvironmentId?.() === options.environmentId) {
				throw new Error('Use local IPC for this window\'s own Agent Host, not its Mission Control relay.');
			}
			const account = await this._apiService.getAccountKey();
			if (!account) {
				throw new Error('User-local Mission Control connections require a signed-in account.');
			}
			userLocalAccount = account;
			for (const id of this._connectionFactory.getUserLocalEnvironmentIds(account)) {
				await this.disconnect(id);
			}
		}

		const address = cloudSandboxAddress(options.environmentId);

		// Reuse an existing live connection for this environment.
		const existing = this._remoteAgentHostService.getConnection(address);
		if (existing) {
			this._logService.trace(`${LOG_PREFIX} Reusing existing connection for ${address}`);
			return address;
		}

		const watch = StopWatch.create(false);
		this._logService.info(`${LOG_PREFIX} Connecting to sandbox environment ${options.environmentId}; sessionId=${options.sessionId ?? 'none'}`);

		const telemetry = this._connectionFactory.beginConnect(address, options);
		const operation = new DisposableStore();
		const source = operation.add(new CancellationTokenSource(token));
		let timedOut = false;
		operation.add(disposableTimeout(() => {
			timedOut = true;
			telemetry?.onConnectionStateChange('failed');
			source.cancel();
		}, CONNECTION_TIMEOUT_MS));
		operation.add(token.onCancellationRequested(() => {
			telemetry?.completeConnect('cancelled');
			this._connectionFactory.releaseTelemetry(address, telemetry);
		}));
		let establishing = false;
		let clientId: string | undefined;
		try {
			// Pending responses and network failures share the overall connection deadline.
			const requestTelemetry = this._connectionFactory.getTelemetry(address);
			const clientToken = await traceConnectionOperation(
				event => requestTelemetry?.recordConnectionDiagnostic(event),
				'credentials',
				() => raceCancellationError(this._mintWithWaking(options, source.token, requestTelemetry), source.token),
			);
			if (userLocalAccount !== undefined) {
				const verifiedAccount = await this._apiService.getAccountKey();
				if (accountGeneration !== this._accountGeneration || verifiedAccount !== userLocalAccount) {
					throw new CancellationError();
				}
			}

			// A token only means Mission Control believes the environment is online — a sandbox deleted
			// minutes ago still has a fresh heartbeat, so one is minted for a host that is already gone.
			// The protocol client's liveness watchdog, armed before the handshake, settles that case.
			establishing = true;
			clientId = clientToken.client_id;
			this._logService.info(`${LOG_PREFIX} Credentials ready: environmentId=${options.environmentId} sessionId=${options.sessionId ?? 'none'} clientId=${clientId} durationMs=${watch.elapsed()}`);
			requestTelemetry?.setConnectStage('connection');
			const result = await this._establish(userLocalAccount === undefined ? options : { ...options, accountKey: userLocalAccount }, address, clientToken, source.token);
			telemetry?.completeConnect(token.isCancellationRequested ? 'cancelled' : 'success');
			return result;
		} catch (error) {
			const outcome = timedOut ? 'timeout' : isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failed';
			const message = `${LOG_PREFIX} Connection ${outcome}: environmentId=${options.environmentId} sessionId=${options.sessionId ?? 'none'} clientId=${clientId ?? 'none'} stage=${establishing ? 'connection' : 'credentials'} durationMs=${watch.elapsed()}`;
			if (outcome === 'cancelled') {
				this._logService.debug(message);
			} else {
				this._logService.warn(timedOut ? message : `${message}: ${formatConnectionDiagnosticError(getConnectionDiagnosticError(error))}`);
			}
			telemetry?.completeConnect(!timedOut && (isCancellationError(error) || token.isCancellationRequested) ? 'cancelled' : 'failure');
			if (!establishing) {
				this._connectionFactory.releaseTelemetry(address, telemetry);
			}
			throw timedOut ? new Error(localize('cloudSandbox.connectionTimedOut', "Connecting to the sandbox timed out after {0} seconds.", CONNECTION_TIMEOUT_MS / 1000)) : error;
		} finally {
			operation.dispose();
		}
	}

	/**
	 * Stage already-minted credentials and wait for the remote connection service to handshake it.
	 */
	protected async _establish(options: ICloudSandboxConnectOptions, address: string, clientToken: ICloudSandboxClientToken, token: CancellationToken): Promise<string> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const entry = this._connectionFactory.stageConfiguration(options, clientToken);
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
			if (this._connectionFactory.isCurrentConfiguration(entry) && (token.isCancellationRequested || !connectionStillLive)) {
				this._connectionFactory.endConnectionTelemetry(address, isCancellationError(error) || token.isCancellationRequested);
				this._connectionFactory.unstageConfiguration(address);
				await this._remoteAgentHostService.removeRemoteAgentHost(address);
			}
			throw error;
		}
	}

	/** Mint credentials, retrying waking responses and network failures within the connection deadline. */
	private async _mintWithWaking(options: ICloudSandboxConnectOptions, token: CancellationToken, telemetry: ICloudSandboxConnectionTelemetry | undefined): Promise<ICloudSandboxClientToken> {
		let rateLimitFailures = 0;
		let rateLimitedAt: number | undefined;
		for (let attempt = 1; ; attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			let result: CloudSandboxConnectResult;
			try {
				result = await this._apiService.connect({ environmentId: options.environmentId, sessionId: options.sessionId, ...(options.environmentKind ? { environmentKind: options.environmentKind } : {}), onRequest: telemetry?.createRequestObserver() }, token);
			} catch (error) {
				if (error instanceof CloudSandboxRequestError && isRetryableCloudSandboxError(error)
					&& (error.code === 'rate_limit_exceeded' || error.statusCode === 429) && !token.isCancellationRequested) {
					rateLimitedAt ??= Date.now();
					const delay = missionControlRetryDelay('rate_limit_exceeded', error.retryAfterSeconds, ++rateLimitFailures);
					if (rateLimitFailures > missionControlMaxRetries(error.code) || Date.now() + delay - rateLimitedAt >= MISSION_CONTROL_RETRY_BUDGET_MS) {
						throw error;
					}
					this._logService.warn(`${LOG_PREFIX} Connection admission was rate limited; retrying after ${delay}ms.`);
					await timeout(delay, token);
					continue;
				}
				if (!(error instanceof CloudSandboxNetworkError) || token.isCancellationRequested) {
					throw error;
				}
				this._logService.warn(`${LOG_PREFIX} Connection request failed for environment ${options.environmentId}; retrying in ${CONNECTION_RETRY_DELAY_MS}ms: ${formatConnectionDiagnosticError(getConnectionDiagnosticError(error))}`);
				await timeout(CONNECTION_RETRY_DELAY_MS, token);
				continue;
			}
			rateLimitFailures = 0;
			rateLimitedAt = undefined;
			if (result.kind === 'token') {
				return options.environmentKind === 'user-local' ? result.token : await this._awaitSealedToken(options, result.token, token, telemetry);
			}
			const delayMs = this._wakingRetryDelay(result.waking.retryAfterSeconds);
			this._logService.info(`${LOG_PREFIX} Environment ${options.environmentId} waking; retrying in ${delayMs}ms (attempt ${attempt})`);
			await timeout(delayMs, token);
		}
	}

	private _wakingRetryDelay(retryAfterSeconds: number, minimumDelayMs = MIN_WAKING_RETRY_DELAY_MS): number {
		const delay = Math.max(retryAfterSeconds * 1000, minimumDelayMs);
		const jitterMs = Math.max(1, Math.floor(Math.random() * Math.min(1000, delay * 0.2)));
		const withJitter = delay + jitterMs;
		if (!Number.isFinite(withJitter)) {
			throw new Error(localize('cloudSandbox.invalidRetryDelay', "The sandbox returned an invalid retry delay."));
		}
		// The connection deadline cancels longer waits before they can trigger an early retry.
		return Math.min(withJitter, CONNECTION_TIMEOUT_MS);
	}

	/** Refresh the initial client's credentials within the attempt limit; initialization validates the final bundle. */
	private async _awaitSealedToken(options: ICloudSandboxConnectOptions, minted: ICloudSandboxClientToken, token: CancellationToken, telemetry: ICloudSandboxConnectionTelemetry | undefined): Promise<ICloudSandboxClientToken> {
		let clientToken = minted;
		let delayMs = this.sealedTokenRetryDelayMs;
		let rateLimitFailures = 0;
		let rateLimitedAt: number | undefined;
		// Match what `_establish` accepts: an unsealed value would wrongly end the loop.
		for (let attempt = 0; attempt < MAX_SEALED_TOKEN_RETRIES && !isCloudSandboxSealedToken(clientToken.encrypted_github_token); attempt++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.info(`${LOG_PREFIX} Environment ${options.environmentId} has no sealed GitHub token yet; refreshing in ${delayMs}ms (attempt ${attempt + 1}/${MAX_SEALED_TOKEN_RETRIES})`);
			await timeout(delayMs, token);

			let result: CloudSandboxConnectResult;
			try {
				result = await this._apiService.reconnect({ environmentId: options.environmentId, sessionId: options.sessionId, ...(options.environmentKind ? { environmentKind: options.environmentKind } : {}), onRequest: telemetry?.createRequestObserver() }, minted.client_id, token);
			} catch (err) {
				if (isCancellationError(err) || token.isCancellationRequested) {
					throw err;
				}
				if (!isRetryableCloudSandboxError(err)) {
					throw err;
				}
				if (err instanceof CloudSandboxRequestError && (err.code === 'rate_limit_exceeded' || err.statusCode === 429)) {
					rateLimitedAt ??= Date.now();
					delayMs = missionControlRetryDelay('rate_limit_exceeded', err.retryAfterSeconds, ++rateLimitFailures);
					if (rateLimitFailures > missionControlMaxRetries(err.code) || Date.now() + delayMs - rateLimitedAt >= MISSION_CONTROL_RETRY_BUDGET_MS) {
						throw err;
					}
					continue;
				}
				// The initial mint still works, so degrade rather than discard it.
				this._logService.warn(`${LOG_PREFIX} Credential refresh for ${options.environmentId} failed; continuing without a sealed token`, err);
				break;
			}
			rateLimitFailures = 0;
			rateLimitedAt = undefined;
			if (result.kind !== 'token') {
				delayMs = this._wakingRetryDelay(result.waking.retryAfterSeconds, SEALED_TOKEN_RETRY_DELAY_MS);
				continue;
			}
			clientToken = result.token;
			delayMs = this.sealedTokenRetryDelayMs;
		}
		return clientToken;
	}
}
