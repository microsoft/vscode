/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MAX_TIMEOUT_DELAY, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { clearMarks, mark } from '../../../../../base/common/performance.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { localize } from '../../../../../nls.js';
import {
	CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxConnectResult,
	CloudSandboxNetworkError,
	CloudSandboxRequestError,
	ICloudSandboxApiService,
	ICloudSandboxAuthenticationTarget,
	ICloudSandboxConnectionRequest,
	ICloudSandboxCreateSessionRequest,
	ICloudSandboxCreatedSession,
	ICloudSandboxDiscoveredSession,
	ICloudSandboxDiscoveryOptions,
	ICloudSandboxDiscoveryResult,
	ICloudSandboxEnvironment,
	ICloudSandboxIdentityToken,
	ICloudSandboxModelCatalog,
	ICloudSandboxPreparedAuthentication,
	ICloudSandboxReserveSessionRequest,
	ICloudSandboxReservedSession,
	ICloudSandboxSealTokenRequest,
	ICloudSandboxSealedToken,
	ICloudSandboxSessionFeedConnection,
	IMissionControlEnvironment,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { getGitHubRequestId } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { SessionModelInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IReplayedTaskHistory, TaskEventReplayError, parseTaskEventsResponse, replayTaskAhpEvents } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { ApiRequestOptions, ApiResponse } from '../../../../../platform/github/common/client/request.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../../../../platform/github/common/githubEndpoints.js';
import { GitHubRequestError, GitHubRequestTimeoutError, isEqualAuthorization } from '../../../../../platform/github/common/githubTypes.js';
import { ApiRequestError, MutationUncertainError } from '../../../../../platform/github/common/missionControl/missionControlClient.js';
import { parseMissionControlError, type MissionControlErrorMetadata } from '../../../../../platform/github/common/missionControl/missionControlError.js';
import { type GetTaskResponse } from '../../../../../platform/github/common/missionControl/tasks.js';
import { RequestError } from '../../../../../platform/github/common/types.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService, asText } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService, toGitHubAuthorizationContext } from '../../../../services/github/common/githubService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { CloudSandboxDiscovery, ICloudSandboxDiscoverySource, getTaskEnvironmentBinding, isConcreteEnvironmentId } from '../../../../../platform/agentHost/common/cloudSandboxDiscovery.js';
import { CloudSandboxHistoryCache } from './cloudSandboxHistoryCache.js';
import { CloudSandboxIdentityTokenProvider, ICloudSandboxIdentityTokenResponse } from './cloudSandboxIdentityTokenProvider.js';
import { type CloudSandboxLifecycleFailurePoint, type CloudSandboxLifecycleOperation } from './cloudSandboxLifecycleTelemetry.js';
import { retryAfterSeconds } from './cloudSandboxRateLimit.js';
import { createCloudSandboxContextTierSchema } from './cloudSandboxSessionConfig.js';
import { ICloudSandboxTelemetryService, getCloudSandboxTaskCreationPath, requestOutcomeForStatus, type CloudSandboxRequestAction } from './cloudSandboxTelemetry.js';

interface ISessionResolution {
	readonly promise: Promise<ICloudSandboxDiscoveredSession>;
	readonly source: CancellationTokenSource;
	waiters: number;
}

const LOG_PREFIX = '[CloudSandboxApi]';

/** Timeout (ms) for history requests still using the legacy request service. */
const LEGACY_READ_TIMEOUT_MS = 30_000;

/** Default Retry-After (seconds) when a 202 "waking" response omits the header. */
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;

/** Fallback scopes when the product does not configure `defaultChatAgent.providerScopes`. */
const FALLBACK_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'];

/** Coordinates sandbox lifecycle, discovery, and recorded history. Supported operations use typed GitHub clients with host-owned execution. */
export class CloudSandboxApiService extends Disposable implements ICloudSandboxApiService {
	declare readonly _serviceBrand: undefined;

	private readonly _discovery: CloudSandboxDiscovery;
	private _discoverySource: { readonly session: AuthenticationSession; readonly source: ICloudSandboxDiscoverySource } | undefined;
	private readonly _identityTokenProvider: CloudSandboxIdentityTokenProvider;
	private readonly _disposeToken = cancelOnDispose(this._store);

	private readonly _apiClient = this._register(new MutableDisposable<IReference<IGitHubAccountClient>>());
	private readonly _sessionResolutions = new Map<string, ISessionResolution>();
	private readonly _sessionResolutionSources = this._register(new DisposableMap<string, CancellationTokenSource>());
	private _discoveryAuthorization: string | undefined;
	private _accountGeneration = 0;
	private _historyRequestId = 0;
	private readonly _historyCache = this._register(new CloudSandboxHistoryCache());
	private _environments: { readonly generation: number; readonly fetchedAt: number; readonly values: readonly IMissionControlEnvironment[] } | undefined;
	private readonly _onDidChangeAccount = this._register(new Emitter<string | undefined>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
		@ICloudSandboxTelemetryService private readonly _telemetry: ICloudSandboxTelemetryService,
		@IWorkbenchGitHubService private readonly _githubService: IWorkbenchGitHubService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();
		this._discovery = this._register(new CloudSandboxDiscovery(
			token => this._getDiscoverySource(token),
			(repositoryId, token) => this._withApiClient(token, { caller: 'mc.repositoryClient.get', priority: 'enrichment' },
				async (client, cancellationToken, options) => (await client.repositories.getById(repositoryId, cancellationToken, options)).full_name),
			data => this._telemetry.reportDiscovery(data),
			this._logService,
		));
		this._identityTokenProvider = this._register(new CloudSandboxIdentityTokenProvider(
			async () => {
				const session = await this._resolveGitHubSession();
				return session ? { accountKey: JSON.stringify([this._authenticationProviderId, session.account.id]), session } : undefined;
			},
			(session, token) => this._requestIdentityToken(session, token),
			(session, request, token) => this._sealToken(request, token, session),
		));
		this._register(this._authenticationService.onDidChangeSessions(e => {
			if (e.providerId === this._authenticationProviderId) {
				void this._onAuthenticationChanged();
			}
		}));
		this._register(this._authenticationService.onDidRegisterAuthenticationProvider(e => {
			if (e.id === this._authenticationProviderId) {
				void this._onAuthenticationChanged(true);
			}
		}));
		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (e.id === this._authenticationProviderId) {
				void this._onAuthenticationChanged(true);
			}
		}));
		this._register(this._userDataProfileService.onDidChangeCurrentProfile(e => {
			if (e.previous.id !== e.profile.id) {
				void this._onAuthenticationChanged(true);
			}
		}));
	}

	private get _authenticationProviderId(): string {
		return this._productService.defaultChatAgent?.provider?.default?.id ?? 'github';
	}

	async getAccountKey(): Promise<string | undefined> {
		const session = await this._resolveStableGitHubSession();
		return session ? this._accountKeyForSession(session) : undefined;
	}

	private async _resolveStableGitHubSession(): Promise<AuthenticationSession | undefined> {
		const generation = this._accountGeneration;
		let session = await this._resolveGitHubSession();
		const accountKey = session ? this._accountKeyForSession(session) : undefined;
		if (generation !== this._accountGeneration) {
			const currentGeneration = this._accountGeneration;
			const currentSession = await this._resolveGitHubSession();
			const currentAccountKey = currentSession ? this._accountKeyForSession(currentSession) : undefined;
			if (currentGeneration !== this._accountGeneration || accountKey !== currentAccountKey) {
				throw new CancellationError();
			}
			session = currentSession;
		}
		return session;
	}

	private async _resolveDiscoveryAuthorization(): Promise<AuthenticationSession | undefined> {
		const session = await this._resolveStableGitHubSession();
		// Token rotation preserves the declared listing scope; unannounced access changes need full reconciliation.
		this._updateDiscoveryAuthorization(session ? JSON.stringify([
			this._authenticationProviderId, session.account.id, session.id, session.authorizationServer?.toString(),
			this._tasksBaseUrl(), this._userDataProfileService.currentProfile.id, [...new Set(session.scopes)].sort(),
		]) : undefined);
		return session;
	}

	private _updateDiscoveryAuthorization(authorization: string | undefined): void {
		if (authorization === this._discoveryAuthorization) {
			return;
		}
		if (this._discoveryAuthorization !== undefined) {
			this._discovery.invalidate();
		}
		this._discoveryAuthorization = authorization;
		this._apiClient.clear();
		this._discoverySource = undefined;
		this._discovery.clear();
		this._clearSessionResolutions();
	}

	private _clearSessionResolutions(): void {
		for (const resolution of this._sessionResolutions.values()) {
			resolution.source.cancel();
		}
		this._sessionResolutions.clear();
	}

	private async _getApiClient(session: AuthenticationSession, cancellationToken: CancellationToken): Promise<IGitHubAccountClient> {
		const authorization = toGitHubAuthorizationContext(this._authenticationProviderId, session);
		const current = this._apiClient.value?.object;
		if (current && isEqualAuthorization(current.authorization, authorization)) {
			return current;
		}
		const generation = this._accountGeneration;
		const lifetime = new DisposableStore();
		try {
			const acquired = lifetime.add(await this._githubService.acquireAccountApiClient(this._authenticationProviderId, session, cancellationToken));
			CancellationToken.throwIfCanceled(cancellationToken);
			if (generation !== this._accountGeneration || this._store.isDisposed) {
				throw new CancellationError();
			}
			const existing = this._apiClient.value?.object;
			if (existing && isEqualAuthorization(existing.authorization, authorization)) {
				lifetime.dispose();
				return existing;
			}
			lifetime.add(Event.once(acquired.onDidInvalidate)(() => {
				if (this._apiClient.value?.object === acquired) {
					this._updateDiscoveryAuthorization(undefined);
				}
			}));
			this._apiClient.value = { object: acquired, dispose: () => lifetime.dispose() };
			return acquired;
		} catch (error) {
			lifetime.dispose();
			throw error;
		}
	}

	private async _withApiClient<T>(
		token: CancellationToken,
		options: ApiRequestOptions,
		execute: (client: IGitHubAccountClient, cancellationToken: CancellationToken, options: ApiRequestOptions, authentication: AuthenticationSession) => Promise<T>,
		context?: {
			readonly authentication?: AuthenticationSession;
			readonly expectedAccountKey?: string;
			readonly action?: string;
		},
	): Promise<T> {
		const lifetime = new DisposableStore();
		try {
			const cancellationToken = CancellationToken.any([
				token,
				this._disposeToken,
			], lifetime);
			CancellationToken.throwIfCanceled(cancellationToken);
			const session = context?.authentication ?? await raceCancellationError(this._resolveDiscoveryAuthorization(), cancellationToken);
			if (!session) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			if (context?.expectedAccountKey !== undefined && context.expectedAccountKey !== this._accountKeyForSession(session)) {
				throw new CancellationError();
			}
			const client = await this._getApiClient(session, cancellationToken);
			CancellationToken.throwIfCanceled(cancellationToken);
			const result = await execute(client, cancellationToken, options, session);
			CancellationToken.throwIfCanceled(cancellationToken);
			return result;
		} catch (error) {
			if (token.isCancellationRequested || this._store.isDisposed || isCancellationError(error)) {
				throw new CancellationError();
			}
			if (error instanceof MutationUncertainError) {
				throw error;
			}
			if (error instanceof ApiRequestError && error.statusCode >= 400) {
				const metadata = {
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
				};
				throw context?.action
					? this._createRequestError(context.action, error.statusCode, error.retryAfterSeconds, metadata, error.outcome)
					: new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds, metadata, error.outcome);
			}
			if (error instanceof GitHubRequestError && error.statusCode !== undefined && error.statusCode >= 400) {
				const metadata = parseMissionControlError(error.responseBody, error.responseMetadata?.requestId);
				throw context?.action
					? this._createRequestError(context.action, error.statusCode, error.responseMetadata?.retryAfterSeconds, metadata)
					: new CloudSandboxRequestError(error.statusCode, error.message, error.responseMetadata?.retryAfterSeconds, metadata);
			}
			throw error;
		} finally {
			lifetime.dispose();
		}
	}

	private _accountKeyForSession(session: AuthenticationSession): string {
		return JSON.stringify([this._authenticationProviderId, session.account.id]);
	}

	getIdentityToken(accountKey: string, token: CancellationToken, forceRefresh = false): Promise<ICloudSandboxIdentityToken> {
		return this._identityTokenProvider.getIdentityToken(accountKey, token, forceRefresh);
	}

	prepareSandboxAuthentication(accountKey: string, target: Promise<ICloudSandboxAuthenticationTarget>, token: CancellationToken, forceRefresh = false): Promise<ICloudSandboxPreparedAuthentication> {
		const preparation = this._identityTokenProvider.prepareSandboxAuthentication(accountKey, target, token, forceRefresh);
		// Observe failures immediately while preserving rejection for the eventual authentication caller.
		void preparation.catch(error => {
			if (!isCancellationError(error)) {
				this._logService.warn(`${LOG_PREFIX} Sandbox authentication preparation failed.`);
			}
		});
		return preparation;
	}

	async sealToken(request: ICloudSandboxSealTokenRequest, token: CancellationToken): Promise<ICloudSandboxSealedToken> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(token));
		store.add(this._disposeToken.onCancellationRequested(() => source.cancel()));
		try {
			const sealed = await this._sealToken(request, source.token);
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
			return sealed;
		} finally {
			source.cancel();
			store.dispose();
		}
	}

	private async _sealToken(request: ICloudSandboxSealTokenRequest, token: CancellationToken, session?: AuthenticationSession): Promise<ICloudSandboxSealedToken> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!request.environmentId.trim() || request.environmentId === '.' || request.environmentId === '..'
			|| !request.token.trim() || request.token.length > 32 * 1024 || (request.resource?.length ?? 0) > 8192) {
			throw new Error(localize('cloudSandbox.invalidSealingRequest', "The sandbox token-sealing request is invalid."));
		}
		if (request.resource) {
			try {
				new URL(request.resource);
			} catch {
				throw new Error(localize('cloudSandbox.invalidSealingResource', "The sandbox token-sealing resource must be a valid URL."));
			}
		}
		const response = await this._withApiClient(token, { caller: 'mc.environmentClient.sealToken', priority: 'mutation' },
			(client, cancellationToken, options) => client.environments.sealToken(request.environmentId, {
				token: request.token, ...(request.resource === undefined ? {} : { resource: request.resource }),
			}, cancellationToken, options),
			{ authentication: session, action: 'token sealing' });
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		return response;
	}

	private async _requestIdentityToken(session: AuthenticationSession, token: CancellationToken): Promise<ICloudSandboxIdentityTokenResponse | undefined> {
		const store = new DisposableStore();
		try {
			const cancellationToken = CancellationToken.any([
				token,
				this._disposeToken,
			], store);
			const client = store.add(await this._githubService.acquireAccountApiClient(this._authenticationProviderId, session, cancellationToken));
			const result = await client.environments.mintIdentityToken(cancellationToken, { caller: 'mc.tokens.create' });
			this._telemetry.reportRequest('mintIdentityToken', 'succeeded');
			return result;
		} catch (error) {
			if (this._store.isDisposed || token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			if (error instanceof ApiRequestError) {
				this._telemetry.reportRequest('mintIdentityToken', requestOutcomeForStatus(error.statusCode));
				throw new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds, {
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
				});
			}
			this._telemetry.reportRequest('mintIdentityToken', 'networkError');
			if (error instanceof GitHubRequestError && error.kind === 'network') {
				throw new CloudSandboxNetworkError(localize('cloudSandbox.identityNetworkFailed', "The sandbox identity-token request failed because of a network error."));
			}
			throw new Error(localize('cloudSandbox.identityClientFailed', "The sandbox identity-token request failed or returned an invalid response."));
		} finally {
			store.dispose();
		}
	}

	async connectSessionFeed(token: CancellationToken): Promise<ICloudSandboxSessionFeedConnection | undefined> {
		const store = new DisposableStore();
		let connection: ICloudSandboxSessionFeedConnection;
		let requested = false;
		try {
			const cancellationToken = CancellationToken.any([
				token,
				this._disposeToken,
			], store);
			const requestToken = cancellationToken;
			const authentication = await raceCancellationError(this._resolveGitHubSession(), requestToken);
			if (!authentication) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			const client = store.add(await this._githubService.acquireAccountApiClient(this._authenticationProviderId, authentication, cancellationToken));
			requested = true;
			connection = await client.tasks.connectFeed(cancellationToken, { caller: 'mc.sessionFeed.connect' });
			const current = await raceCancellationError(this._resolveGitHubSession(), requestToken);
			if (!current || current.account.id !== authentication.account.id) {
				throw new CancellationError();
			}
			this._telemetry.reportRequest('connectSessionFeed', 'succeeded');
		} catch (error) {
			if (this._store.isDisposed || token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			if (error instanceof ApiRequestError) {
				this._telemetry.reportRequest('connectSessionFeed', requestOutcomeForStatus(error.statusCode));
				if (RequestError.isNotFound(error) || RequestError.isForbidden(error)) {
					this._logService.debug(`${LOG_PREFIX} Session feed unavailable (HTTP ${error.statusCode}); retaining discovery polling.`);
					return undefined;
				}
				this._logService.debug(`${LOG_PREFIX} Session feed negotiation failed (HTTP ${error.statusCode}); retaining discovery polling.`);
				throw new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds, {
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
				});
			}
			if (requested && error instanceof RequestError && (error.kind === 'network'
				|| error.kind === 'timeout' && (error instanceof MutationUncertainError || error instanceof GitHubRequestTimeoutError && error.requestDispatched))) {
				this._telemetry.reportRequest('connectSessionFeed', 'networkError');
			}
			this._logService.debug(`${LOG_PREFIX} Session feed negotiation failed; retaining discovery polling.`);
			throw error;
		} finally {
			store.dispose();
		}
		let url: URL;
		try {
			url = new URL(connection.url);
		} catch {
			throw new SchemaError('Mission Control returned an invalid session feed URL');
		}
		const now = Date.now();
		const reconnectIn = connection.reconnect_in ?? Date.parse(connection.reconnect_after) - now;
		const expiresIn = connection.expires_in ?? Date.parse(connection.expires_at) - now;
		if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash
			|| (connection.reconnect_in === undefined) !== (connection.expires_in === undefined)
			|| reconnectIn <= 0 || reconnectIn >= expiresIn || reconnectIn > MAX_TIMEOUT_DELAY) {
			throw new SchemaError('Mission Control returned invalid session feed connection metadata');
		}
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		return connection;
	}

	private async _onAuthenticationChanged(invalidateDiscovery = false): Promise<void> {
		this._discovery.clearAuthorizationFailure();
		this._identityTokenProvider.clear();
		this.clearSessionHistory();
		const generation = ++this._accountGeneration;
		this._discovery.invalidate();
		this._clearSessionResolutions();
		if (invalidateDiscovery) {
			this._updateDiscoveryAuthorization(undefined);
		}
		try {
			const session = await this._resolveDiscoveryAuthorization();
			if (generation === this._accountGeneration && !this._store.isDisposed) {
				this._onDidChangeAccount.fire(session ? this._accountKeyForSession(session) : undefined);
			}
		} catch (error) {
			if (generation === this._accountGeneration) {
				this._updateDiscoveryAuthorization(undefined);
			}
			if (!isCancellationError(error)) {
				this._logService.warn(`${LOG_PREFIX} Resolving discovery account failed: ${toErrorMessage(error)}`);
			}
		}
	}

	async connect(request: ICloudSandboxConnectionRequest, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest(request, token);
	}

	async reconnect(request: ICloudSandboxConnectionRequest, clientId: string, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest(request, token, clientId);
	}

	async getEnvironment(environmentId: string, token: CancellationToken): Promise<ICloudSandboxEnvironment> {
		const environment = await this._withApiClient(token, { caller: 'mc.environmentClient.get' },
			(client, cancellationToken, options) => client.environments.get(environmentId, cancellationToken, options),
			{ action: 'get' });
		// `status` comes from heartbeat age: a stale one means `/connect` will attempt a resume and
		// can block for its whole budget.
		this._logService.trace(`${LOG_PREFIX} Environment ${environmentId}: status=${environment.status}, ahp=${environment.capabilities?.ahp_version ?? 'unknown'}`);
		return environment;
	}

	getCachedEnvironments(): readonly IMissionControlEnvironment[] | undefined {
		return this._environments?.generation === this._discovery.generation && Date.now() - this._environments.fetchedAt < 60_000
			? this._environments.values : undefined;
	}

	async listEnvironments(token: CancellationToken, options?: { readonly refresh?: boolean }): Promise<readonly IMissionControlEnvironment[]> {
		const generation = this._discovery.generation;
		const cached = this.getCachedEnvironments();
		if (!options?.refresh && cached) {
			return cached;
		}
		const environments = await this._withApiClient(token, { caller: 'mc.environmentClient.list' },
			(client, cancellationToken, options) => client.environments.list(cancellationToken, options),
			{ action: 'list environments' });
		const values = environments.map(({ id, name, kind, status, last_heartbeat_at, capabilities }) => ({
			id, name, kind, status,
			...(last_heartbeat_at ? { lastHeartbeatAt: Date.parse(last_heartbeat_at) } : {}),
			...(capabilities?.current_sessions !== undefined && capabilities.current_sessions !== null ? { reportedSessionCount: capabilities.current_sessions } : {}),
		}));
		if (generation !== this._discovery.generation) {
			throw new CancellationError();
		}
		this._environments = { generation, fetchedAt: Date.now(), values };
		return values;
	}

	async deleteEnvironment(environmentId: string, token: CancellationToken, expectedAccountKey: string): Promise<void> {
		try {
			await this._withApiClient(token, { caller: 'mc.environmentClient.delete', priority: 'mutation' },
				(client, cancellationToken, options) => client.environments.delete(environmentId, cancellationToken, options),
				{ expectedAccountKey, action: 'environment delete' });
		} catch (error) {
			if (!(error instanceof CloudSandboxRequestError) || error.statusCode !== 404) {
				throw error;
			}
		}
		this._environments = undefined;
		this._discovery.invalidate();
	}

	listSessions(token: CancellationToken, options?: ICloudSandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult> {
		return this._discovery.listSessions(token, options);
	}

	private async _getDiscoverySource(token: CancellationToken): Promise<ICloudSandboxDiscoverySource> {
		const session = await this._resolveDiscoveryAuthorization();
		CancellationToken.throwIfCanceled(token);
		if (!session) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		if (this._discoverySource?.session.id === session.id && this._discoverySource.session.accessToken === session.accessToken) {
			return this._discoverySource.source;
		}
		const source: ICloudSandboxDiscoverySource = {
			withClient: (token, options, execute) => this._withApiClient(token, options, execute, { authentication: session }),
		};
		this._discoverySource = { session, source };
		return source;
	}

	async resolveSession(taskId: string, token: CancellationToken): Promise<ICloudSandboxDiscoveredSession> {
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		let authentication: AuthenticationSession | undefined;
		const authorizationLifetime = new DisposableStore();
		try {
			const source = authorizationLifetime.add(new CancellationTokenSource(this._disposeToken));
			authorizationLifetime.add(token.onCancellationRequested(() => source.cancel()));
			authentication = await raceCancellationError(this._resolveDiscoveryAuthorization(), source.token);
		} finally {
			authorizationLifetime.dispose();
		}
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!authentication) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		const cached = this._discovery.getTask(taskId);
		if (cached?.environmentId && cached.sessionId) {
			return { ...cached, environmentId: cached.environmentId, sessionId: cached.sessionId };
		}
		let resolution = this._sessionResolutions.get(taskId);
		if (!resolution) {
			const generation = this._accountGeneration;
			const source = new CancellationTokenSource(this._disposeToken);
			this._sessionResolutionSources.set(taskId, source);
			const pending = raceCancellationError((async () => {
				const full = await this._withApiClient(source.token, { caller: 'mc.taskClient.get' },
					(client, cancellationToken, options) => client.tasks.get(taskId, cancellationToken, options), { authentication });
				if (source.token.isCancellationRequested || generation !== this._accountGeneration || this._store.isDisposed) {
					throw new CancellationError();
				}
				const session = await this._discovery.recordResolvedTask(taskId, full, source.token);
				this._telemetry.lifecycle.record({
					phase: 'binding', outcome: 'observed', operationId: generateUuid(),
					environmentId: session.environmentId, agentSessionId: session.sessionId, taskId,
				});
				return session;
			})(), source.token).finally(() => {
				if (this._sessionResolutionSources.get(taskId) === source) {
					this._sessionResolutionSources.deleteAndDispose(taskId);
				} else {
					source.dispose();
				}
				if (this._sessionResolutions.get(taskId)?.promise === pending) {
					this._sessionResolutions.delete(taskId);
				}
			});
			resolution = { promise: pending, source, waiters: 0 };
			this._sessionResolutions.set(taskId, resolution);
		}
		resolution.waiters++;
		try {
			return await raceCancellationError(resolution.promise, token);
		} finally {
			if (--resolution.waiters === 0 && this._sessionResolutions.get(taskId) === resolution) {
				resolution.source.cancel();
				this._sessionResolutions.delete(taskId);
			}
		}
	}

	async reserveSession(request: ICloudSandboxReserveSessionRequest, token: CancellationToken): Promise<ICloudSandboxReservedSession> {
		const operation = this._telemetry.lifecycle.start('task.reserve', { relatedTaskId: request.reservedTaskId });
		try {
			const reserved = await this._reserveSession(request, token, operation);
			operation.complete('succeeded', { taskId: reserved.taskId, environmentId: reserved.environmentId, agentSessionId: reserved.sessionId });
			return reserved;
		} catch (error) {
			operation.failed(error, isCancellationError(error) || token.isCancellationRequested);
			throw error;
		}
	}

	private async _reserveSession(request: ICloudSandboxReserveSessionRequest, token: CancellationToken, operation: CloudSandboxLifecycleOperation): Promise<ICloudSandboxReservedSession> {
		const response = await this._requestTaskCreation({
			repoNwo: request.repoNwo,
			expectedAccountKey: request.expectedAccountKey,
			prompt: '',
		}, token, undefined, { taskId: request.reservedTaskId });
		operation.bind({ serverRequestId: response.metadata?.requestId });
		const task = response.data;
		const taskId = task.id;
		const binding = getTaskEnvironmentBinding(task);
		if (!binding || task.reserved !== true || task.reservation_expires_at === undefined) {
			if (taskId !== request.reservedTaskId?.trim()) {
				await this._deleteTaskBestEffort(taskId, response.accountKey);
			} else {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${taskId} after an unusable renewal response; it may already have been claimed.`);
			}
			throw new CloudSandboxRequestError(response.status, localize('cloudSandbox.invalidTaskReservation', "The cloud service did not return a usable task reservation."));
		}
		this._logService.info(`${LOG_PREFIX} Reserved sandbox task ${taskId} (session ${binding.sessionId}) on environment ${binding.environmentId}.`);
		return { taskId, sessionId: binding.sessionId, environmentId: binding.environmentId, reservationExpiresAt: Date.parse(task.reservation_expires_at) };
	}

	/**
	 * Provision a sandbox task and environment without starting an agent turn.
	 * The caller sends the first turn over the relay.
	 */
	async createSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, onRequest?: () => void): Promise<ICloudSandboxCreatedSession> {
		const startedAt = Date.now();
		const operation = this._telemetry.lifecycle.start('task.create', {
			environmentId: request.environmentId, relatedTaskId: request.reservedTaskId, taskCreationPath: getCloudSandboxTaskCreationPath(request),
		});
		try {
			const created = await this._createSession(request, token, onRequest, operation);
			operation.complete(token.isCancellationRequested ? 'cancelled' : 'succeeded', {
				taskId: created.taskId, environmentId: created.environmentId, agentSessionId: created.sessionId,
				taskCreationPath: getCloudSandboxTaskCreationPath(request, created),
			});
			this._telemetry.reportProvisioningOutcome(token.isCancellationRequested ? 'cancelled' : 'success', Math.max(0, Date.now() - startedAt), getCloudSandboxTaskCreationPath(request, created));
			return created;
		} catch (error) {
			operation.failed(error, isCancellationError(error) || token.isCancellationRequested);
			this._telemetry.reportProvisioningOutcome(isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failure', Math.max(0, Date.now() - startedAt), getCloudSandboxTaskCreationPath(request));
			throw error;
		}
	}

	private async _createSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, onRequest: (() => void) | undefined, operation: CloudSandboxLifecycleOperation): Promise<ICloudSandboxCreatedSession> {
		const response = await this._requestTaskCreation(request, token, onRequest);
		operation.bind({ serverRequestId: response.metadata?.requestId });
		const task = response.data;
		const taskId = task.id;
		let claimed: boolean | undefined;
		if (request.reservedTaskId !== undefined) {
			const serverClaimed = task.claimed;
			if (serverClaimed === undefined || task.reserved === true || (serverClaimed && taskId !== request.reservedTaskId.trim())) {
				throw new CloudSandboxRequestError(response.status, localize('cloudSandbox.invalidReservationSubmission', "The cloud service did not confirm the task reservation outcome."));
			}
			claimed = serverClaimed;
		}
		const binding = getTaskEnvironmentBinding(task);
		if (!binding) {
			if (request.reservedTaskId === undefined) {
				// An unusable task must not remain in the session list.
				await this._deleteTaskBestEffort(taskId, response.accountKey);
			} else {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${taskId} after an incomplete reservation submission response; its outcome must be reconciled.`);
			}
			throw new CloudSandboxRequestError(response.status, `Mission Control bound no sandbox session to task ${taskId}`);
		}
		if (request.environmentId !== undefined && binding.environmentId !== request.environmentId) {
			throw new CloudSandboxRequestError(response.status, `Mission Control bound sandbox task ${taskId} to a different environment`);
		}
		this._logService.info(`${LOG_PREFIX} Provisioned sandbox task ${taskId} (session ${binding.sessionId}) on environment ${binding.environmentId}.`);
		return { taskId, sessionId: binding.sessionId, environmentId: binding.environmentId, ...(claimed !== undefined ? { claimed } : {}) };
	}

	private async _requestTaskCreation(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, onRequest?: () => void, reservation?: { readonly taskId?: string }): Promise<ApiResponse<GetTaskResponse> & { readonly accountKey: string }> {
		await raceCancellationError(this._defaultAccountService.getDefaultAccount(), token);
		this._assertCloudSessionsEnabled();
		const repository = parseNwo(request.repoNwo);
		if (request.repoNwo !== undefined && !repository) {
			throw new CloudSandboxRequestError(undefined, localize('cloudSandbox.invalidRepository', "The sandbox repository must be specified as owner/name."), undefined, { code: 'invalid_request' });
		}
		if (request.environmentId !== undefined && !isConcreteEnvironmentId(request.environmentId)) {
			throw new Error(localize('cloudSandbox.invalidEnvironment', "The prepared sandbox environment identifier is invalid."));
		}
		const requestedReservationId = reservation ? reservation.taskId : request.reservedTaskId;
		const reservedTaskId = requestedReservationId?.trim();
		if (requestedReservationId !== undefined && !reservedTaskId) {
			throw new Error(localize('cloudSandbox.invalidReservation', "The task reservation identifier must not be empty."));
		}
		if (!reservation && reservedTaskId) {
			if (request.environmentId !== undefined) {
				throw new Error(localize('cloudSandbox.reservationEnvironmentConflict', "A task reservation cannot be combined with an existing environment."));
			}
			if (request.expectedAccountKey === undefined) {
				throw new Error(localize('cloudSandbox.reservationAccountRequired', "The account that reserved the task is required to submit it."));
			}
		}
		let submitted = false;
		let createdTaskId: string | undefined;
		let accountKey = request.expectedAccountKey;
		try {
			return await this._withApiClient(token, { caller: 'mc.taskClient.create', priority: 'mutation' },
				async (client, cancellationToken, options, authentication) => {
					const currentAccountKey = this._accountKeyForSession(authentication);
					accountKey = currentAccountKey;
					this._assertCloudSessionsEnabled();
					onRequest?.();
					CancellationToken.throwIfCanceled(cancellationToken);
					submitted = true;
					try {
						const response = await client.tasks.create({
							environment_id: request.environmentId ?? CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
							// Persisted for display before the caller sends the first turn over the relay.
							prompt: request.prompt,
							...(repository ? { repositories: [{ owner: repository.owner, repo: repository.name }] } : {}),
							...(!repository && request.environmentId === undefined ? { compute: { scope: authentication.account.label } } : {}),
							...(reservation ? { reserve: true } : {}),
							...(reservedTaskId ? { reserved_task_id: reservedTaskId } : {}),
						}, cancellationToken, options);
						createdTaskId = response.data.id;
						return { ...response, accountKey: currentAccountKey };
					} catch (error) {
						if (error instanceof ApiRequestError) {
							createdTaskId = error.createdTaskId;
						}
						throw error;
					}
				}, { expectedAccountKey: request.expectedAccountKey, action: reservation ? 'task reservation' : 'task create' });
		} catch (error) {
			if (!submitted) {
				throw error;
			}
			if (!reservation && reservedTaskId) {
				this._logService.warn(`${LOG_PREFIX} Retaining reservation ${reservedTaskId} and any created task after a failed submission; its outcome must be reconciled.`);
			} else if (createdTaskId && reservation && createdTaskId === reservedTaskId) {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${createdTaskId} after a failed renewal request; it may already have been claimed.`);
			} else if (createdTaskId) {
				await this._deleteTaskBestEffort(createdTaskId, accountKey);
			} else {
				this._logService.warn(`${LOG_PREFIX} Task creation failed without reporting a task id; the service may have accepted the operation and its outcome must be reconciled.`);
			}
			throw error;
		}
	}

	private _assertCloudSessionsEnabled(): void {
		if (this._defaultAccountService.currentDefaultAccount?.entitlementsData?.cloud_sessions_enabled === false) {
			throw new CloudSandboxRequestError(undefined, localize('cloudSessions.unavailable', "Cloud session creation is not available for your account."), undefined, { code: 'feature_disabled' });
		}
	}

	async deleteTask(taskId: string, token: CancellationToken, expectedAccountKey?: string): Promise<void> {
		const session = this._discovery.getTask(taskId);
		const operation = this._telemetry.lifecycle.start('task.delete', {
			taskId, environmentId: session?.environmentId, agentSessionId: session?.sessionId,
		});
		try {
			await this._deleteTask(taskId, token, expectedAccountKey);
			operation.complete('succeeded');
		} catch (error) {
			operation.failed(error, isCancellationError(error) || token.isCancellationRequested);
			throw error;
		}
	}

	private async _deleteTask(taskId: string, token: CancellationToken, expectedAccountKey?: string): Promise<void> {
		try {
			await this._withApiClient(token, { caller: 'mc.taskClient.delete', priority: 'mutation' },
				(client, cancellationToken, options) => client.tasks.delete(taskId, cancellationToken, options),
				{ expectedAccountKey, action: 'task delete' });
		} catch (error) {
			if (!(error instanceof CloudSandboxRequestError) || error.statusCode !== 404) {
				throw error;
			}
		}
		this._discovery.removeTask(taskId);
		this.clearSessionHistory(taskId);
	}

	async renameTask(taskId: string, title: string, token: CancellationToken): Promise<void> {
		await this._withApiClient(token, { caller: 'mc.taskClient.update', priority: 'mutation' },
			(client, cancellationToken, options) => client.tasks.update(taskId, { name: title }, cancellationToken, options),
			{ action: 'task rename' });
		this.invalidateSessionHistory(taskId);
		this._discovery.renameTask(taskId, title);
	}

	async setTaskArchived(taskId: string, archived: boolean, token: CancellationToken): Promise<void> {
		const action = archived ? 'archive' : 'unarchive';
		await this._withApiClient(token, { caller: `mc.taskClient.${action}`, priority: 'mutation' },
			(client, cancellationToken, options) => client.tasks.setArchived(taskId, archived, cancellationToken, options),
			{ action: `task ${action}` });
		this._discovery.removeTask(taskId);
		this.invalidateSessionHistory(taskId);
	}

	/**
	 * Delete a task we created but cannot use. Best-effort: the caller is already failing, and a
	 * failed cleanup must not replace the error that explains why.
	 *
	 * Only covers tasks whose id we learned. Mission Control writes the task record before it
	 * provisions compute, so any failure after that point (an authorization rejection, or a
	 * provisioning error such as HTTP 500 `failed to create agent compute`) leaves a task behind.
	 * When the failure response omits the id, that orphan can only be cleaned up server-side.
	 */
	private async _deleteTaskBestEffort(taskId: string, expectedAccountKey?: string): Promise<void> {
		try {
			await this.deleteTask(taskId, CancellationToken.None, expectedAccountKey);
			this._logService.info(`${LOG_PREFIX} Cleaned up unusable sandbox task ${taskId}.`);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Could not clean up sandbox task ${taskId}: ${toErrorMessage(error)}. It remains and can only be removed server-side.`);
		}
	}

	/**
	 * Read a task's persisted AHP history and fold it into session/chat state.
	 *
	 * The only history path that survives the sandbox: `/events` is served by Mission Control's
	 * mirror, not the environment. The `vnd.github.ahp+json` media type selects the raw relayed
	 * frames rather than the cloud-task event summaries the endpoint serves by default.
	 */
	async getSessionHistory(taskId: string, token: CancellationToken, diagnosticId?: string, onCachedHistory?: (history: IReplayedTaskHistory) => void, canCacheHistory?: (history: IReplayedTaskHistory | undefined) => boolean): Promise<IReplayedTaskHistory | undefined> {
		const watch = StopWatch.create(false);
		return this._historyCache.load(taskId, token,
			async sharedToken => {
				try {
					const authentication = await raceCancellationError(this._resolveGitHubSession(), sharedToken);
					if (!authentication?.accessToken) {
						throw new CloudSandboxAuthenticationRequiredError();
					}
					return {
						account: JSON.stringify([this._tasksBaseUrl(), this._authenticationProviderId, authentication.account.id]),
						fetch: (requestToken: CancellationToken) => this._fetchSessionHistory(taskId, requestToken, authentication, watch, diagnosticId),
					};
				} catch (error) {
					this._logService.info(`${LOG_PREFIX} historyAuthentication traceId=${diagnosticId ?? 'standalone'} ${isCancellationError(error) ? 'cancelled' : 'failed'} durationMs=${watch.elapsed()}`);
					throw error;
				}
			},
			onCachedHistory && (history => {
				this._logService.info(`${LOG_PREFIX} historyCacheHit traceId=${diagnosticId ?? 'standalone'} elapsedMs=${watch.elapsed()}`);
				onCachedHistory(history);
			}), canCacheHistory);
	}

	invalidateSessionHistory(taskId: string, preserveCached = false): void {
		this._historyCache.invalidate(taskId, false, preserveCached);
	}

	clearSessionHistory(taskId?: string): void {
		if (taskId !== undefined) {
			this._sessionResolutions.get(taskId)?.source.cancel();
			this._sessionResolutions.delete(taskId);
		} else {
			for (const resolution of this._sessionResolutions.values()) {
				resolution.source.cancel();
			}
			this._sessionResolutions.clear();
		}
		if (taskId !== undefined) {
			this._historyCache.invalidate(taskId, true);
		} else {
			this._historyCache.clear();
		}
	}

	private async _fetchSessionHistory(taskId: string, token: CancellationToken, authentication: AuthenticationSession, watch: StopWatch, diagnosticId?: string): Promise<IReplayedTaskHistory | undefined> {
		// Temporary first-open diagnostics: correlate phases without logging task IDs, content, or credentials.
		const loadId = ++this._historyRequestId;
		const traceId = diagnosticId ?? `history-${loadId}`;
		const marks: string[] = [];
		const logTiming = (event: string, details = '') => {
			const name = `code/cloudSandbox/${traceId}/history-${loadId}/${event}`;
			marks.push(name);
			mark(name);
			this._logService.info(`${LOG_PREFIX} historyTiming loadId=${loadId} traceId=${traceId} ${event}${details ? ` ${details}` : ''} totalMs=${watch.elapsed()}`);
		};
		let phase = 'authentication';
		let phaseStarted = 0;
		logTiming('authenticated', `authenticationMs=${watch.elapsed()}`);
		try {
			const url = `${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}/events`;
			const context = await this._request(url, 'mc.taskClient.events', 'getTaskEvents', {
				'Accept': 'application/vnd.github.ahp+json',
				'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
			}, token, () => {
				phaseStarted = watch.elapsed();
				logTiming('requestIssued', `authenticationMs=${phaseStarted}`);
				phase = 'request';
			}, { diagnosticId: `${traceId}/history-${loadId}`, authentication });
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const responseReceived = watch.elapsed();
			const requestMs = responseReceived - phaseStarted;
			const requestId = getGitHubRequestId(context.res.headers['x-github-request-id']);
			logTiming('responseReceived', `requestMs=${requestMs} status=${context.res.statusCode ?? 'unknown'} responseHeadersMs=${context.timings?.responseHeadersMs ?? 'unavailable'} downloadMs=${context.timings?.responseBodyMs ?? 'unavailable'} decodedBodyBytes=${context.timings?.decodedBodyBytes ?? 'unavailable'} requestId=${requestId ?? 'unavailable'}`);
			phase = 'responseBody';
			phaseStarted = responseReceived;
			if (!isSuccess(context)) {
				if ([401, 403, 404].includes(context.res.statusCode ?? 0)) {
					this.invalidateSessionHistory(taskId);
				}
				await this._throwForStatus('task events', context);
			}
			const body = await this._readJson<unknown>(context);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const bodyRead = watch.elapsed();
			const bodyReadAndParseMs = bodyRead - phaseStarted;
			logTiming('bodyRead', `bodyReadAndParseMs=${bodyReadAndParseMs}`);
			if (body === undefined) {
				throw new TaskEventReplayError('Task AHP history response was empty or not JSON.');
			}
			phase = 'replay';
			phaseStarted = bodyRead;
			const events = parseTaskEventsResponse(body);
			const history = replayTaskAhpEvents(events);
			logTiming('completed', `apiMs=${requestMs + bodyReadAndParseMs} replayMs=${watch.elapsed() - phaseStarted} events=${events.length} sessions=${history?.sessions.length ?? 0} truncated=${history?.truncated ?? false}`);
			return history;
		} catch (error) {
			logTiming(isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failed', `phase=${phase} phaseMs=${watch.elapsed() - phaseStarted}`);
			throw error;
		} finally {
			for (const name of marks) {
				clearMarks(name);
			}
		}
	}

	/** Shared handler for the `connect`/`reconnect` endpoints (200 token or 202 waking). */
	private async _connectRequest(
		request: ICloudSandboxConnectionRequest,
		token: CancellationToken,
		clientId?: string,
	): Promise<CloudSandboxConnectResult> {
		const { environmentId, environmentKind, onRequest } = request;
		const action = clientId === undefined ? 'connect' : 'reconnect';
		const operation = this._telemetry.lifecycle.start(action === 'connect' ? 'credentials.connect' : 'credentials.refresh', {
			environmentKind, environmentId, agentSessionId: request.sessionId, connectionId: clientId,
		});
		let failurePoint: CloudSandboxLifecycleFailurePoint = 'credentials.request';
		let requestingCredentials = false;
		try {
			const result = await this._withApiClient(token, { caller: `mc.environmentClient.${action}`, priority: 'mutation' },
				(client, cancellationToken, options) => {
					onRequest?.('issued');
					requestingCredentials = true;
					const connectionOptions = { ...options, query: request.sessionId ? { session_id: request.sessionId } : undefined };
					return clientId === undefined
						? client.environments.connect(environmentId, cancellationToken, connectionOptions)
						: client.environments.reconnect(environmentId, clientId, cancellationToken, connectionOptions);
				}, { action });
			requestingCredentials = false;
			operation.bind({ serverRequestId: result.requestId });
			this._logService.trace(`${LOG_PREFIX} ${action} -> HTTP ${result.status}`);
			if (result.status === 202) {
				onRequest?.('waking');
				const retryAfterSeconds = result.retryAfterSeconds ?? DEFAULT_WAKING_RETRY_AFTER_SECONDS;
				this._logService.debug(`${LOG_PREFIX} ${action}: environment waking, retry after ${retryAfterSeconds}s`);
				operation.complete('waking', {}, undefined, 202);
				return { kind: 'waking', waking: { retryAfterSeconds } };
			}
			operation.complete('succeeded', { connectionId: result.data.client_id }, undefined, result.status);
			return { kind: 'token', token: result.data };
		} catch (error) {
			if (error instanceof MutationUncertainError && (error.kind === 'schema' || error.kind === 'malformedResponse')) {
				failurePoint = 'credentials.invalidResponse';
			}
			if (error instanceof CloudSandboxRequestError) {
				operation.bind({ serverRequestId: error.requestId });
				this._logService.error(`${LOG_PREFIX} ${error.message}${error.limitedResource ? ` limitedResource=${error.limitedResource}` : ''}`);
			}
			const cancelled = isCancellationError(error) || token.isCancellationRequested;
			const unanswered = requestingCredentials && error instanceof RequestError && (error.kind === 'network'
				|| error.kind === 'timeout' && (error instanceof MutationUncertainError || error instanceof GitHubRequestTimeoutError && error.requestDispatched));
			const failure = !cancelled && unanswered ? new CloudSandboxNetworkError('Mission Control connection request failed', { cause: error }) : error;
			operation.complete(cancelled ? 'cancelled' : 'failed', { failurePoint }, failure);
			throw failure;
		}
	}

	private async _request(url: string, callSite: string, action: CloudSandboxRequestAction, headers: Record<string, string>, token: CancellationToken, onRequest?: () => void, requestContext?: { readonly diagnosticId?: string; readonly authentication?: AuthenticationSession }): Promise<IRequestContext> {
		let session = requestContext?.authentication ?? await this._resolveGitHubSession();
		if (!session?.accessToken) {
			// No request is issued, so there is no request outcome to count.
			throw new CloudSandboxAuthenticationRequiredError();
		}
		let accessToken = session.accessToken;
		const started = Date.now();
		const timeoutMs = LEGACY_READ_TIMEOUT_MS;
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			for (let attempt = 0; ; attempt++) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				onRequest?.();
				const context = await this._requestService.request({
					type: 'GET',
					url,
					headers: {
						...headers,
						['Authorization']: `Bearer ${accessToken}`
					},
					timeout: timeoutMs,
					callSite,
					...(requestContext?.diagnosticId !== undefined ? { diagnosticId: requestContext.diagnosticId } : {}),
				}, token);
				this._telemetry.reportRequest(action, requestOutcomeForStatus(context.res.statusCode));
				this._logService.trace(`${LOG_PREFIX} ${action} -> HTTP ${context.res.statusCode ?? 'none'} in ${Date.now() - started}ms (budget ${timeoutMs}ms)${context.res.headers?.['retry-after'] ? `, Retry-After: ${context.res.headers['retry-after']}` : ''}`);
				if (context.res.statusCode === 401 && attempt === 0) {
					const replacement = await raceCancellationError(this._resolveGitHubSession(), token).catch(error => {
						if (!(error instanceof CloudSandboxAuthenticationRequiredError)) {
							throw error;
						}
						this._logService.debug(`${LOG_PREFIX} No replacement credential is available; reporting the original authentication refusal.`);
						return undefined;
					});
					if (replacement?.accessToken && replacement.accessToken !== session.accessToken && replacement.account.id === session.account.id) {
						await asText(context);
						session = replacement;
						accessToken = replacement.accessToken;
						continue;
					}
				}
				return context;
			}
		} catch (error) {
			// A cancelled request was never answered, so it is not a failure worth counting.
			const cancellationError = isCancellationError(error)
				? error
				: token.isCancellationRequested ? new CancellationError() : undefined;
			if (cancellationError) {
				this._logService.trace(`${LOG_PREFIX} ${action} -> cancelled after ${Date.now() - started}ms (budget ${timeoutMs}ms)`);
			} else {
				this._telemetry.reportRequest(action, 'networkError');
				// Elapsed at the budget means our own timeout fired; shorter means something else did.
				this._logService.trace(`${LOG_PREFIX} ${action} -> failed after ${Date.now() - started}ms (budget ${timeoutMs}ms)`);
				this._logService.error(`${LOG_PREFIX} GET ${action} failed before a response was available.`);
			}
			throw cancellationError ?? error;
		}
	}

	/**
	 * Mission Control task API base. Uses the Copilot API host: `api.github.com/agents/*` omits
	 * CORS headers on authenticated responses, so a renderer `fetch` receives the reply and discards it.
	 */
	private _tasksBaseUrl(): string {
		return `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`;
	}

	async listModels(token: CancellationToken): Promise<ICloudSandboxModelCatalog> {
		const catalog = await this._withApiClient(token, { caller: 'mc.models.list' },
			(client, cancellationToken, options) => client.missionControlModels.list(cancellationToken, options),
			{ action: 'model catalog' });
		const models: SessionModelInfo[] = [];
		for (const model of catalog.data) {
			const efforts = model.capabilities?.supports?.reasoning_effort;
			if (model.model_picker_enabled === false || model.policy?.state === 'disabled') {
				continue;
			}
			const billing = normalizeCAPIBilling(model.billing);
			const contextTier = createCloudSandboxContextTierSchema(billing);
			models.push({
				id: model.id,
				name: model.name,
				provider: 'copilot',
				maxContextWindow: model.capabilities?.limits?.max_context_window_tokens,
				maxPromptTokens: model.capabilities?.limits?.max_prompt_tokens,
				maxOutputTokens: model.capabilities?.limits?.max_output_tokens,
				supportsVision: model.capabilities?.supports?.vision,
				_meta: createPricingMetaFromBilling(billing, model.model_picker_price_category, model.model_picker_category),
				...(efforts?.length || contextTier ? {
					configSchema: {
						type: 'object',
						properties: {
							...(efforts?.length ? {
								reasoningEffort: {
									type: 'string',
									title: localize('cloudSandbox.reasoningEffort', "Effort Level"),
									enum: [...efforts],
								}
							} : {}),
							...(contextTier ? { contextTier } : {}),
						},
					},
				} : {}),
			});
		}
		return { models, defaultModel: catalog.default_model };
	}

	private async _readJson<T>(context: IRequestContext): Promise<T | undefined> {
		const body = await asText(context);
		if (!body) {
			return undefined;
		}
		try {
			return JSON.parse(body) as T;
		} catch {
			return undefined;
		}
	}

	/** Surface credential-free diagnostics from a failed raw read. */
	private async _throwForStatus(action: string, context: IRequestContext): Promise<never> {
		const body = await asText(context).catch(() => '');
		const status = context.res.statusCode;
		const metadata = parseMissionControlError(body, context.res.headers?.['x-github-request-id']);
		const error = this._createRequestError(action, status, retryAfterSeconds(context.res.headers?.['retry-after']), metadata);
		this._logService.error(`${LOG_PREFIX} ${error.message}${metadata.limitedResource ? ` limitedResource=${metadata.limitedResource}` : ''}`);
		throw error;
	}

	private _createRequestError(action: string, status: number | undefined, retryAfter: number | undefined, metadata: MissionControlErrorMetadata, outcome?: 'indeterminate'): CloudSandboxRequestError {
		return new CloudSandboxRequestError(
			status,
			`Mission Control ${action} failed: HTTP ${status ?? 'unknown'}${metadata.code ? ` code=${metadata.code}` : ''}${metadata.requestId ? ` (requestId=${metadata.requestId})` : ''}`,
			retryAfter,
			metadata,
			outcome,
		);
	}

	/** A GitHub session carrying at least the configured chat provider scopes. */
	private async _resolveGitHubSession(): Promise<AuthenticationSession | undefined> {
		const providerId = this._authenticationProviderId;
		const scopes = this._productService.defaultChatAgent?.providerScopes?.[0] ?? FALLBACK_SCOPES;

		let exact: readonly AuthenticationSession[];
		try {
			exact = await this._authenticationService.getSessions(providerId, [...scopes], undefined, true);
		} catch (error) {
			// Throws when the auth provider extension has not registered yet.
			this._logService.warn(`${LOG_PREFIX} getSessions('${providerId}') failed: ${toErrorMessage(error)}`);
			throw new CloudSandboxAuthenticationRequiredError();
		}
		if (exact.length > 0) {
			return exact[0];
		}

		// Fall back to the narrowest session whose scopes are a superset of what we need.
		const all = await this._authenticationService.getSessions(providerId, undefined, undefined, true);
		const required = new Set(scopes);
		let best: { session: AuthenticationSession; extra: number } | undefined;
		for (const session of all) {
			const granted = new Set(session.scopes);
			if ([...required].every(scope => granted.has(scope))) {
				const extra = granted.size - required.size;
				if (!best || extra < best.extra) {
					best = { session, extra };
				}
			}
		}
		if (!best) {
			this._logService.warn(`${LOG_PREFIX} No '${providerId}' session with scopes [${scopes.join(', ')}]`);
		}
		return best?.session;
	}
}

function isSuccess(context: IRequestContext): boolean {
	const status = context.res.statusCode ?? 0;
	return status >= 200 && status < 300;
}

/** Split an `owner/name` into the pair Mission Control expects, or `undefined` when unusable. */
function parseNwo(nwo: string | undefined): { owner: string; name: string } | undefined {
	const separator = nwo?.indexOf('/') ?? -1;
	if (!nwo || separator <= 0 || separator === nwo.length - 1) {
		return undefined;
	}
	return { owner: nwo.slice(0, separator), name: nwo.slice(separator + 1) };
}
