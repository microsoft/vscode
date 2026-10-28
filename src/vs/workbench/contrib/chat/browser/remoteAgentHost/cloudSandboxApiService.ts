/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { isObject } from '../../../../../base/common/types.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { clearMarks, mark } from '../../../../../base/common/performance.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { getGitHubRequestId } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import {
	CLOUD_SANDBOX_AGENT_SLUG,
	CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
	CLOUD_SANDBOX_SEALED_TOKEN_PREFIX,
	CLOUD_SANDBOX_SESSION_SCHEME,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxConnectResult,
	CloudSandboxNetworkError,
	CloudSandboxRequestError,
	ICloudSandboxClientToken,
	ICloudSandboxConnectionRequest,
	ICloudSandboxApiService,
	ICloudSandboxCreatedSession,
	ICloudSandboxCreateSessionRequest,
	ICloudSandboxReservedSession,
	ICloudSandboxReserveSessionRequest,
	ICloudSandboxDiscoveredSession,
	ICloudSandboxDiscoveryResult,
	ICloudSandboxEnvironment,
	ICloudSandboxAuthenticationTarget,
	ICloudSandboxIdentityToken,
	ICloudSandboxPreparedAuthentication,
	ICloudSandboxSealedToken,
	ICloudSandboxSealTokenRequest,
	IHostEncryptionKey,
	IMissionControlEnvironment,
	ICloudSandboxModelCatalog,
	ICloudSandboxSessionFeedConnection,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IReplayedTaskHistory, parseTaskEventsResponse, replayTaskAhpEvents, TaskEventReplayError } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { SessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionModelInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI, deriveGitHubEndpoints } from '../../../../../platform/github/common/githubEndpoints.js';
import { parseMissionControlError } from '../../../../../platform/github/common/missionControl/missionControlError.js';
import { ApiRequestError } from '../../../../../platform/github/common/missionControl/missionControlClient.js';
import type { TaskClient } from '../../../../../platform/github/common/missionControl/tasks.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { asText, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { getCloudSandboxTaskCreationPath, ICloudSandboxTelemetryService, requestOutcomeForStatus, type CloudSandboxRequestAction } from './cloudSandboxTelemetry.js';
import { type CloudSandboxLifecycleFailurePoint, type CloudSandboxLifecycleOperation } from './cloudSandboxLifecycleTelemetry.js';
import { CloudSandboxHistoryCache } from './cloudSandboxHistoryCache.js';
import { createCloudSandboxContextTierSchema } from './cloudSandboxSessionConfig.js';
import { CloudSandboxIdentityTokenProvider, ICloudSandboxIdentityTokenResponse } from './cloudSandboxIdentityTokenProvider.js';
import { RATE_LIMIT_MAX_RETRIES, RATE_LIMIT_WAIT_BUDGET_MS, rateLimitDelay, retryAfterSeconds } from './cloudSandboxRateLimit.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';

/** The agent-environment endpoints Mission Control exposes. */
type CloudSandboxEnvironmentAction = 'get' | 'connect' | 'reconnect';

interface ISealedTokenResponse {
	readonly encrypted_github_token?: unknown;
	readonly host_encryption_key?: Partial<IHostEncryptionKey>;
}

/** The subset of a Mission Control task the sandbox discovery path reads. */
interface ITaskSummary {
	readonly id: string;
	readonly event_type?: string;
	readonly clients?: readonly TaskClient[];
	readonly name?: string;
	readonly archived_at?: string | null;
	readonly updated_at?: string;
	readonly state?: string;
	readonly agent_collaborators?: readonly { readonly slug?: string }[];
	readonly compute?: { readonly provider?: string } | null;
	readonly current_environment?: { readonly kind?: string };
	/**
	 * The owning repository, identified by numeric id only — the payload carries no name. See
	 * {@link CloudSandboxApiService._resolveRepositoryName}.
	 */
	readonly repository?: { readonly id?: number };
}

/** A full task, which additionally carries the sessions bound to sandbox environments. */
interface ITaskDetail extends ITaskSummary {
	readonly reserved?: boolean;
	readonly claimed?: boolean;
	readonly reservation_expires_at?: string;
	readonly sessions?: readonly {
		readonly id: string;
		readonly environment_id?: string;
		readonly state?: string;
		readonly created_at?: string;
		readonly updated_at?: string;
		readonly ahp_resource_uri?: string | null;
	}[];
}

interface IScannedTask extends ITaskSummary {
	readonly hasRepository: boolean;
}

interface ICachedSandboxTask {
	readonly summary: IScannedTask;
	readonly session?: ICloudSandboxDiscoveredSession;
	readonly repositoryId?: number;
	readonly needsRefresh?: boolean;
	/** An unchanged, default-titled queued session with no AHP resource; recheck its age on every scan. */
	readonly unstartedSince?: number;
	/** An unattributed default-titled task whose recorded conversation may be an abandoned draft. */
	readonly emptySessionSince?: number;
	readonly hasEmptyHistory?: boolean;
}

interface ISandboxDiscoveryOptions {
	readonly incremental?: boolean;
	readonly taskIds?: readonly string[];
}

const LOG_PREFIX = '[CloudSandboxApi]';

interface ICloudModel {
	readonly id: string;
	readonly name: string;
	readonly model_picker_enabled?: boolean;
	readonly policy?: { readonly state?: string };
	readonly billing?: unknown;
	readonly model_picker_category?: string;
	readonly model_picker_price_category?: string;
	readonly capabilities?: {
		readonly limits?: { readonly max_context_window_tokens?: number; readonly max_prompt_tokens?: number; readonly max_output_tokens?: number };
		readonly supports?: { readonly vision?: boolean; readonly reasoning_effort?: readonly string[] };
	};
}

function taskSessionStatus(state: string | undefined, logService: ILogService): SessionStatus | undefined {
	switch (state) {
		case 'queued':
		case 'in_progress':
			return SessionStatus.InProgress;
		case 'waiting_for_user':
			return SessionStatus.InputNeeded;
		case 'idle':
		case 'completed':
			return SessionStatus.Idle;
		case 'failed':
		case 'timed_out':
		case 'cancelled':
			return SessionStatus.Error;
		case undefined:
			return undefined;
		default:
			logService.warn(`${LOG_PREFIX} Unrecognized session activity state; leaving its status unknown.`);
			return undefined;
	}
}

/**
 * The github.com REST API base, used for the repository-name lookup discovery needs. The CORS
 * caveat on {@link CloudSandboxApiService._tasksBaseUrl} is specific to `api.github.com/agents/*`;
 * the general REST API is CORS-enabled and already called from the renderer elsewhere.
 */
const GITHUB_DOT_COM_API_BASE_URI = deriveGitHubEndpoints(undefined).apiBaseUri;

/** Default per-request timeout (ms) for environment reads and task updates. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Connection requests can wait for an environment to wake before returning. */
const CONNECTION_REQUEST_TIMEOUT_MS = 30_000;

/** Per-request timeout (ms) for discovery, whose task list is far larger than a credential mint. */
const DISCOVERY_TIMEOUT_MS = 30_000;

/** Per-request timeout (ms) for allocating sandbox compute, with or without a task. */
const CREATE_TIMEOUT_MS = 60_000;

/** Default Retry-After (seconds) when a 202 "waking" response omits the header. */
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;

/** How many recent tasks to scan for sandbox sessions during discovery, per page. */
const DISCOVERY_TASK_SCAN_LIMIT = 100;

/**
 * Max concurrent task-detail fetches during discovery.
 *
 * Discovery used to resolve every sandbox task at once, which meant a user with a few dozen
 * sandbox tasks issued that many simultaneous requests and tripped GitHub's rate limit. Each
 * rejected fetch drops its session from the pass, and the burst also starves the `listTasks` call
 * of whichever pass runs next — including the one a freshly reloaded window depends on.
 */
const DISCOVERY_TASK_FETCH_CONCURRENCY = 5;

const DISCOVERY_OVERLAP_MS = 60_000;

const STALLED_SESSION_GRACE_MS = 60 * 60_000;

/** HTTP status GitHub answers a rate-limited request with. */
const HTTP_TOO_MANY_REQUESTS = 429;

/** Fallback scopes when the product does not configure `defaultChatAgent.providerScopes`. */
const FALLBACK_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'];

/**
 * Mission Control client for cloud sandbox sessions: mints (`connect`) and refreshes (`reconnect`)
 * Web PubSub credentials, reads environment and task records, discovers sandbox-backed sessions,
 * and replays a task's persisted AHP history.
 *
 * Runs in the renderer so the sandbox path works in VS Code Web, where no Copilot extension host is
 * available.
 */
export class CloudSandboxApiService extends Disposable implements ICloudSandboxApiService {
	declare readonly _serviceBrand: undefined;

	private readonly _identityTokenProvider: CloudSandboxIdentityTokenProvider;
	private readonly _lifetimeToken = cancelOnDispose(this._store);

	/** Resolved (or in-flight) repository names, keyed by numeric repository id. */
	private readonly _repositoryNames = new Map<number, Promise<string | undefined>>();
	private readonly _discoveredTasks = new Map<string, ICachedSandboxTask>();
	private readonly _activeDiscoveryReads = new Set<Map<string, ICachedSandboxTask | undefined>>();
	private _discoverySince: string | undefined;
	private _discoveryGeneration = 0;
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
	) {
		super();
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
				void this._onAuthenticationChanged();
			}
		}));
		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (e.id === this._authenticationProviderId) {
				void this._onAuthenticationChanged();
			}
		}));
	}

	private get _authenticationProviderId(): string {
		return this._productService.defaultChatAgent?.provider?.default?.id ?? 'github';
	}

	async getAccountKey(): Promise<string | undefined> {
		const generation = this._accountGeneration;
		const session = await this._resolveGitHubSession();
		const accountKey = session ? this._accountKeyForSession(session) : undefined;
		if (generation !== this._accountGeneration) {
			const currentGeneration = this._accountGeneration;
			const currentSession = await this._resolveGitHubSession();
			const currentAccountKey = currentSession ? this._accountKeyForSession(currentSession) : undefined;
			if (currentGeneration !== this._accountGeneration || accountKey !== currentAccountKey) {
				throw new CancellationError();
			}
		}
		return accountKey;
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
		store.add(this._lifetimeToken.onCancellationRequested(() => source.cancel()));
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
		const response = await raceCancellationError(this._requestCredential<ISealedTokenResponse>(
			'sealToken', `${encodeURIComponent(request.environmentId)}/seal-token`,
			{ token: request.token, ...(request.resource === undefined ? {} : { resource: request.resource }) }, token, session,
		), token);
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		return parseSealedTokenResponse(response);
	}

	private async _requestIdentityToken(session: AuthenticationSession, token: CancellationToken): Promise<ICloudSandboxIdentityTokenResponse | undefined> {
		const store = new DisposableStore();
		try {
			const signal = AbortSignal.any([CancellationToken.toAbortSignal(token, store), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
			const client = store.add(await this._githubService.acquireAccountApiClient({
				providerId: this._authenticationProviderId, sessionId: session.id, accountId: session.account.id,
				scopes: session.scopes, authorizationServer: session.authorizationServer?.toString(),
			}, signal));
			const result = await client.environments.mintIdentityToken(signal, { caller: 'mc.tokens.create', deadline: Date.now() + REQUEST_TIMEOUT_MS });
			this._telemetry.reportRequest('mintIdentityToken', 'succeeded');
			return result;
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			if (error instanceof ApiRequestError) {
				this._telemetry.reportRequest('mintIdentityToken', requestOutcomeForStatus(error.statusCode));
				throw new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds, {
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
				});
			}
			this._telemetry.reportRequest('mintIdentityToken', 'networkError');
			throw new Error(localize('cloudSandbox.identityClientFailed', "The sandbox identity-token request failed or returned an invalid response."));
		} finally {
			store.dispose();
		}
	}

	private async _requestCredential<T>(action: 'mintIdentityToken' | 'sealToken', path: string, body: Record<string, unknown>, token: CancellationToken, session?: AuthenticationSession): Promise<T | undefined> {
		const context = await this._request(
			`${GITHUB_DOT_COM_API_BASE_URI}/cmc_internal/api/agents/environments/${path}`,
			action === 'mintIdentityToken' ? 'mc.tokens.create' : 'mc.environmentClient.sealToken', action, { Accept: 'application/json' },
			token, REQUEST_TIMEOUT_MS, body, 'POST', undefined, session ? { authentication: session } : undefined,
		);
		if (token.isCancellationRequested) {
			context.stream.destroy();
			throw new CancellationError();
		}
		if (!isSuccess(context)) {
			context.stream.destroy();
			const status = context.res.statusCode;
			const retryAfter = retryAfterSeconds(context.res.headers?.['retry-after']);
			const requestId = getGitHubRequestId(context.res.headers?.['x-github-request-id']);
			throw new CloudSandboxRequestError(status,
				action === 'mintIdentityToken'
					? localize('cloudSandbox.identityRequestFailed', "Sandbox identity-token acquisition failed: HTTP {0} (request {1}).", status ?? 'unknown', requestId ?? 'unknown')
					: localize('cloudSandbox.sealingRequestFailed', "Sandbox token sealing failed: HTTP {0} (request {1}).", status ?? 'unknown', requestId ?? 'unknown'),
				retryAfter);
		}
		try {
			return await raceCancellationError(this._readJson<T>(context), token);
		} catch (error) {
			context.stream.destroy();
			if (isCancellationError(error)) {
				throw error;
			}
			throw new Error(action === 'mintIdentityToken'
				? localize('cloudSandbox.identityResponseFailed', "Could not read the sandbox identity-token response.")
				: localize('cloudSandbox.sealingResponseFailed', "Could not read the sandbox token-sealing response."));
		}
	}

	async connectSessionFeed(token: CancellationToken): Promise<ICloudSandboxSessionFeedConnection | undefined> {
		const store = new DisposableStore();
		let connection: ICloudSandboxSessionFeedConnection;
		try {
			const signal = AbortSignal.any([CancellationToken.toAbortSignal(token, store), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
			const authentication = await raceCancellationError(this._resolveGitHubSession(), token);
			if (!authentication) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			const client = store.add(await this._githubService.acquireAccountApiClient({
				providerId: this._authenticationProviderId, sessionId: authentication.id,
				accountId: authentication.account.id, scopes: authentication.scopes,
				authorizationServer: authentication.authorizationServer?.toString(),
			}, signal));
			connection = await client.tasks.connectFeed(signal, { caller: 'mc.sessionFeed.connect', deadline: Date.now() + REQUEST_TIMEOUT_MS });
			const current = await raceCancellationError(this._resolveGitHubSession(), token);
			if (!current || current.account.id !== authentication.account.id) {
				throw new CancellationError();
			}
			this._telemetry.reportRequest('connectSessionFeed', 'succeeded');
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error)) {
				throw new CancellationError();
			}
			if (error instanceof ApiRequestError) {
				this._telemetry.reportRequest('connectSessionFeed', requestOutcomeForStatus(error.statusCode));
				if (error.statusCode === 403 || error.statusCode === 404) {
					this._logService.debug(`${LOG_PREFIX} Session feed unavailable (HTTP ${error.statusCode}); retaining discovery polling.`);
					return undefined;
				}
				this._logService.debug(`${LOG_PREFIX} Session feed negotiation failed (HTTP ${error.statusCode}); retaining discovery polling.`);
				throw new CloudSandboxRequestError(error.statusCode, error.message, error.retryAfterSeconds, {
					code: error.code, limitedResource: error.limitedResource, requestId: error.requestId,
				});
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
			throw new Error('Mission Control returned an invalid session feed URL');
		}
		const reconnectAt = Date.parse(connection.reconnect_after);
		if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash
			|| reconnectAt <= Date.now() || reconnectAt >= Date.parse(connection.expires_at)) {
			throw new Error('Mission Control returned invalid session feed connection metadata');
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return connection;
	}

	private async _onAuthenticationChanged(): Promise<void> {
		this._identityTokenProvider.clear();
		this.clearSessionHistory();
		const generation = ++this._accountGeneration;
		this._discoveryGeneration++;
		this._discoverySince = undefined;
		this._discoveredTasks.clear();
		this._repositoryNames.clear();
		try {
			const accountKey = await this.getAccountKey();
			if (generation === this._accountGeneration && !this._store.isDisposed) {
				this._onDidChangeAccount.fire(accountKey);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.warn(`${LOG_PREFIX} Resolving discovery account failed: ${toErrorMessage(error)}`);
			}
		}
	}

	async connect(request: ICloudSandboxConnectionRequest, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest('connect', request, token, {
			...(request.sessionId && { session_id: request.sessionId }),
		});
	}

	async reconnect(request: ICloudSandboxConnectionRequest, clientId: string, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest('reconnect', request, token, {
			client_id: clientId,
			...(request.sessionId && { session_id: request.sessionId }),
		});
	}

	async getEnvironment(environmentId: string, token: CancellationToken): Promise<ICloudSandboxEnvironment> {
		const context = await this._sendEnvironment('get', environmentId, token);
		if (!isSuccess(context)) {
			await this._throwForStatus('get', context);
		}
		const environment = await this._readJson<ICloudSandboxEnvironment>(context);
		if (!environment?.status) {
			throw new Error('Mission Control get returned an incomplete environment response');
		}
		// `status` comes from heartbeat age: a stale one means `/connect` will attempt a resume and
		// can block for its whole budget.
		this._logService.trace(`${LOG_PREFIX} Environment ${environmentId}: status=${environment.status}, ahp=${environment.capabilities?.ahp_version ?? 'unknown'}`);
		return environment;
	}

	getCachedEnvironments(): readonly IMissionControlEnvironment[] | undefined {
		return this._environments?.generation === this._discoveryGeneration && Date.now() - this._environments.fetchedAt < 60_000
			? this._environments.values : undefined;
	}

	async listEnvironments(token: CancellationToken, options?: { readonly refresh?: boolean }): Promise<readonly IMissionControlEnvironment[]> {
		const generation = this._discoveryGeneration;
		const cached = this.getCachedEnvironments();
		if (!options?.refresh && cached) {
			return cached;
		}
		const context = await this._request(`${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments`, 'mc.environmentClient.list', 'listEnvironments', {
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token);
		if (!isSuccess(context)) {
			await this._throwForStatus('list environments', context);
		}
		const response = await this._readJson<unknown>(context);
		if (!Array.isArray(response)) {
			throw new Error('Mission Control returned invalid environment discovery metadata');
		}
		const values: IMissionControlEnvironment[] = [];
		for (const value of response as readonly unknown[]) {
			if (!isObject(value)) {
				this._logService.warn('Ignoring malformed Mission Control environment metadata');
				continue;
			}
			const environment = value as Partial<IMissionControlEnvironment>;
			if (typeof environment.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(environment.id)
				|| typeof environment.name !== 'string' || !environment.name.trim() || typeof environment.kind !== 'string'
				|| typeof environment.status !== 'string' || !environment.status) {
				this._logService.warn('Ignoring incomplete Mission Control environment metadata');
				continue;
			}
			values.push({ id: environment.id, name: environment.name, kind: environment.kind, status: environment.status });
		}
		if (generation !== this._discoveryGeneration) {
			throw new CancellationError();
		}
		this._environments = { generation, fetchedAt: Date.now(), values };
		return values;
	}

	async deleteEnvironment(environmentId: string, token: CancellationToken, expectedAccountKey: string): Promise<void> {
		const context = await this._request(`${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments/${encodeURIComponent(environmentId)}`, 'mc.environmentClient.delete', 'deleteEnvironment', {
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, REQUEST_TIMEOUT_MS, undefined, 'DELETE', undefined, { expectedAccountKey });
		if (!isSuccess(context) && context.res.statusCode !== 404) {
			await this._throwForStatus('environment delete', context);
		}
		this._environments = undefined;
		this._discoveryGeneration++;
	}

	/** Incremental scans preserve absent tasks; full scans also find tasks without environment-kind metadata. */
	async listSessions(token: CancellationToken, options?: ISandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult> {
		const updates = new Map<string, ICachedSandboxTask | undefined>();
		this._activeDiscoveryReads.add(updates);
		try {
			return await this._listSessions(token, options, updates);
		} finally {
			this._activeDiscoveryReads.delete(updates);
		}
	}

	private async _listSessions(token: CancellationToken, options: ISandboxDiscoveryOptions | undefined, updates: ReadonlyMap<string, ICachedSandboxTask | undefined>): Promise<ICloudSandboxDiscoveryResult> {
		const generation = this._discoveryGeneration;
		const targeted = options?.taskIds !== undefined;
		const since = !targeted && options?.incremental ? this._discoverySince : undefined;
		const tasks = new Map<string, IScannedTask>();
		const details = new Map<string, ITaskDetail>();
		const cache = new Map(this._discoveredTasks);
		const removedTaskIds: string[] = [];
		const failedTaskIds = new Set<string>();
		let truncated = false;
		let checkpoint: number | undefined;
		let latestUpdate: number | undefined;
		if (targeted) {
			const limiter = new Limiter<void>(DISCOVERY_TASK_FETCH_CONCURRENCY);
			try {
				await Promise.all([...new Set(options.taskIds)].map(id => limiter.queue(async () => {
					try {
						const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(id)}`, 'get', token);
						const task = await this._readJson<ITaskDetail>(context);
						if (!task || task.id !== id) {
							throw new Error('getTask returned an invalid task');
						}
						tasks.set(id, { ...task, hasRepository: (task.repository?.id ?? 0) > 0 });
						details.set(id, task);
					} catch (error) {
						if (isCancellationError(error) || token.isCancellationRequested) {
							throw new CancellationError();
						}
						if (error instanceof CloudSandboxRequestError && (error.statusCode === 403 || error.statusCode === 404)) {
							cache.delete(id);
							removedTaskIds.push(id);
						} else {
							truncated = true;
							failedTaskIds.add(id);
							this._logService.warn(`${LOG_PREFIX} Feed task refresh failed: ${toErrorMessage(error)}`);
						}
					}
				})));
			} finally {
				limiter.dispose();
			}
		}
		// Separate repository scopes include workspace-less sandboxes as well as repository sessions.
		for (const { withRepository, archived } of targeted ? [] : [
			{ withRepository: true, archived: false }, { withRepository: false, archived: false },
			{ withRepository: true, archived: true }, { withRepository: false, archived: true },
		]) {
			for (let page = 1; ; page++) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				const query: Record<string, string> = {
					per_page: String(DISCOVERY_TASK_SCAN_LIMIT),
					page: String(page),
					sort: 'updated_at',
					direction: 'desc',
					with_repo: String(withRepository),
					is_archived: String(archived),
					...(since ? { since, include_environment_kinds: 'managed-sandbox' } : {}),
				};
				try {
					const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks${toQuery(query)}`, 'list', token);
					const response = await this._readJson<{ tasks?: readonly ITaskSummary[] }>(context);
					if (!Array.isArray(response?.tasks)) {
						throw new Error('listTasks returned no tasks array');
					}
					const date = context.res.headers?.date;
					const serverTime = typeof date === 'string' ? Date.parse(date) : Number.NaN;
					if (!Number.isNaN(serverTime)) {
						checkpoint = Math.min(checkpoint ?? serverTime, serverTime);
					}
					for (const task of response.tasks) {
						tasks.set(task.id, { ...task, hasRepository: withRepository });
						const updatedAt = task.updated_at ? Date.parse(task.updated_at) : Number.NaN;
						if (!Number.isNaN(updatedAt)) {
							latestUpdate = Math.max(latestUpdate ?? updatedAt, updatedAt);
						}
					}
					if (!hasNextLink(context.res.headers?.link)) {
						break;
					}
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (tasks.size === 0) {
						return { kind: 'failed', reason: `listTasks failed: ${toErrorMessage(error)}` };
					}
					this._logService.warn(`${LOG_PREFIX} Discovery page ${page} (with_repo=${withRepository}) failed: ${toErrorMessage(error)}`);
					truncated = true;
					break;
				}
			}
		}

		const scannedTaskIds = new Set(tasks.keys());
		if (since) {
			for (const [id, cached] of cache) {
				if (!tasks.has(id) && (cached.needsRefresh || !cached.session || cached.unstartedSince !== undefined || cached.emptySessionSince !== undefined || (cached.repositoryId !== undefined && !cached.session.repoName))) {
					tasks.set(id, cached.summary);
				}
			}
		}
		const discoveryTime = checkpoint ?? Date.now();
		const sandboxTasks: IScannedTask[] = [];
		const exclusions = { notSandboxCompute: 0, missingSessionBinding: 0, stalledQueuedSession: 0, emptySession: 0, detailFetchFailed: 0 };
		const logExcludedTask = (taskId: string, reason: keyof typeof exclusions) => {
			exclusions[reason]++;
			this._logService.debug(`${LOG_PREFIX} Excluded task ${JSON.stringify({ taskId, reason })}`);
		};
		let acceptedWithOtherAgent = 0;
		for (const task of tasks.values()) {
			if (isCloudSandboxTask(task)) {
				sandboxTasks.push(task);
				if (!task.agent_collaborators?.some(c => c.slug === CLOUD_SANDBOX_AGENT_SLUG)) {
					acceptedWithOtherAgent++;
					this._logService.debug(`${LOG_PREFIX} Accepted task previously excluded by agent slug ${JSON.stringify({ taskId: task.id })}`);
				}
			} else {
				logExcludedTask(task.id, 'notSandboxCompute');
				if (cache.has(task.id)) {
					removedTaskIds.push(task.id);
				}
				cache.delete(task.id);
			}
		}
		let unresolved = 0;
		const limiter = new Limiter<ICloudSandboxDiscoveredSession | undefined>(DISCOVERY_TASK_FETCH_CONCURRENCY);
		let discovered: (ICloudSandboxDiscoveredSession | undefined)[];
		try {
			discovered = await Promise.all(sandboxTasks.map(task => limiter.queue(async (): Promise<ICloudSandboxDiscoveredSession | undefined> => {
				try {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					let cached = cache.get(task.id);
					const previousBinding = cached?.session;
					const application = task.clients?.find(client => client.creator === true)?.slug;
					// Missing creator evidence does not revoke previously learned creation provenance.
					const applicationChanged = application !== undefined && application !== cached?.session?.application;
					if (targeted || cached?.needsRefresh || !cached?.session || !task.updated_at
						|| task.updated_at !== cached.summary.updated_at
						|| task.archived_at !== cached.summary.archived_at
						|| task.hasRepository !== cached.summary.hasRepository
						|| applicationChanged) {
						const full = details.get(task.id) ?? await this._readJson<ITaskDetail>(await this._sendTask(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(task.id)}`, 'get', token));
						if (!full) {
							throw new Error('getTask returned no task');
						}
						const binding = getTaskEnvironmentBinding(full);
						if (!binding && cached?.session) {
							removedTaskIds.push(task.id);
						}
						const status = binding ? taskSessionStatus(full.sessions?.find(session => session.id === binding.sessionId)?.state ?? full.state ?? task.state, this._logService) : undefined;
						const eventType = full.event_type || task.event_type;
						const creatingApplication = full.clients?.find(client => client.creator === true)?.slug ?? application ?? cached?.session?.application;
						const repositoryId = [full.repository?.id, task.repository?.id].find(id => id !== undefined && id > 0);
						const session: ICloudSandboxDiscoveredSession | undefined = binding ? {
							...binding,
							taskId: task.id,
							...(eventType ? { eventType } : {}),
							...(creatingApplication ? { application: creatingApplication } : {}),
							name: full.name ?? task.name ?? `Sandbox ${task.id}`,
							hasRepository: task.hasRepository || repositoryId !== undefined,
							updatedAt: full.updated_at ?? task.updated_at,
							...(status !== undefined ? { status } : {}),
							...(full.archived_at ? { isArchived: true } : {}),
						} : undefined;
						cached = {
							summary: task,
							repositoryId,
							unstartedSince: getUnstartedSessionCreatedAt(full),
							emptySessionSince: session && full.sessions?.length === 1 ? getEmptySessionUpdatedAt(session) : undefined,
							session,
						};
					}
					if (cached.unstartedSince !== undefined && discoveryTime - cached.unstartedSince >= STALLED_SESSION_GRACE_MS) {
						cache.set(task.id, cached);
						logExcludedTask(task.id, 'stalledQueuedSession');
						// An unread page may contain this candidate's recovery update.
						if (!truncated || scannedTaskIds.has(task.id)) {
							removedTaskIds.push(task.id);
							this._logService.trace(`${LOG_PREFIX} Hiding stalled queued sandbox task ${task.id} with no AHP resource.`);
						}
						return undefined;
					}
					if (cached.session && cached.emptySessionSince !== undefined && discoveryTime - cached.emptySessionSince >= STALLED_SESSION_GRACE_MS) {
						if (cached.hasEmptyHistory === undefined) {
							try {
								const history = await this.getSessionHistory(task.id, token);
								cached = { ...cached, hasEmptyHistory: isEmptySessionHistory(history, cached.session.sessionId) };
							} catch (error) {
								if (isCancellationError(error) || token.isCancellationRequested) {
									throw new CancellationError();
								}
								this._logService.warn(`${LOG_PREFIX} Could not verify empty sandbox task ${task.id}; keeping it visible: ${toErrorMessage(error)}`);
								unresolved++;
							}
						}
						if (cached.hasEmptyHistory) {
							cache.set(task.id, cached);
							logExcludedTask(task.id, 'emptySession');
							if (!truncated || scannedTaskIds.has(task.id)) {
								removedTaskIds.push(task.id);
								this._logService.trace(`${LOG_PREFIX} Hiding abandoned sandbox task ${task.id} with empty recorded history.`);
							}
							return undefined;
						}
					}
					if (cached.session && cached.repositoryId !== undefined && !cached.session.repoName) {
						const repoName = await this._resolveRepositoryName(cached.repositoryId, token);
						cached = { ...cached, session: { ...cached.session, repoName } };
					}
					cache.set(task.id, cached);
					if (!cached.session) {
						logExcludedTask(task.id, 'missingSessionBinding');
					} else if (cached.session.environmentId !== previousBinding?.environmentId || cached.session.sessionId !== previousBinding?.sessionId) {
						this._telemetry.lifecycle.record({
							phase: 'binding', outcome: 'observed', operationId: generateUuid(),
							environmentId: cached.session.environmentId, agentSessionId: cached.session.sessionId, taskId: task.id,
						});
					}
					return cached.session;
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
					logExcludedTask(task.id, 'detailFetchFailed');
					cache.set(task.id, { ...cache.get(task.id), summary: task, needsRefresh: true });
					unresolved++;
					failedTaskIds.add(task.id);
					return undefined;
				}
			})));
		} finally {
			limiter.dispose();
		}

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (generation !== this._discoveryGeneration) {
			return { kind: 'failed', reason: 'Sandbox discovery was invalidated while listing sessions' };
		}
		const partial = unresolved > 0 || truncated;
		if (!partial && !targeted) {
			// Browsers may not expose Date through CORS; task timestamps also use the server's clock.
			const nextCheckpoint = checkpoint ?? latestUpdate;
			if (nextCheckpoint !== undefined) {
				this._discoverySince = new Date(nextCheckpoint - DISCOVERY_OVERLAP_MS).toISOString();
			}
			if (!since) {
				for (const id of cache.keys()) {
					if (!scannedTaskIds.has(id)) {
						cache.delete(id);
					}
				}
			}
		}
		const published = new Map<string, ICloudSandboxDiscoveredSession>();
		for (const session of discovered) {
			if (session) {
				published.set(session.taskId, session);
			}
		}
		const removed = new Set(removedTaskIds);
		// Reads in either lane must preserve newer task commits and intervening removals.
		for (const [id, updated] of updates) {
			if (targeted && !options.taskIds.includes(id)) {
				continue;
			}
			const scanned = cache.get(id);
			if (updated && scanned
				&& Date.parse(scanned.session?.updatedAt ?? scanned.summary.updated_at ?? '') > Date.parse(updated.session?.updatedAt ?? updated.summary.updated_at ?? '')) {
				continue;
			}
			published.delete(id);
			removed.delete(id);
			if (updated) {
				cache.set(id, updated);
				if (updated.session && updated.hasEmptyHistory !== true
					&& (updated.unstartedSince === undefined || discoveryTime - updated.unstartedSince < STALLED_SESSION_GRACE_MS)) {
					published.set(id, updated.session);
				} else {
					removed.add(id);
				}
			} else {
				cache.delete(id);
				removed.add(id);
			}
		}
		const committedIds = targeted
			? new Set([...tasks.keys(), ...removed])
			: new Set([...this._discoveredTasks.keys(), ...cache.keys()]);
		for (const id of committedIds) {
			const cached = cache.get(id);
			if (cached) {
				this._discoveredTasks.set(id, cached);
			} else {
				if (this._discoveredTasks.delete(id)) {
					removed.add(id);
				}
			}
			for (const read of this._activeDiscoveryReads) {
				if (read !== updates) {
					read.set(id, cached);
				}
			}
		}
		const sessions = [...published.values()];
		const unnamed = sessions.filter(session => !session.repoName).length;
		this._logService.info(`${LOG_PREFIX} ${targeted ? 'Feed discovery' : since ? 'Incremental discovery' : 'Discovery'} found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${scannedTaskIds.size} scanned${truncated ? ' (scan truncated)' : ''}${unresolved > 0 ? `; ${unresolved} unresolved` : ''}${unnamed > 0 ? `; ${unnamed} without a repository name (they group under "Unknown")` : ''}.`);
		this._logService.info(`${LOG_PREFIX} Discovery filtering ${JSON.stringify({ ...exclusions, acceptedWithOtherAgent })}`);
		for (const session of sessions) {
			this._logService.debug(`${LOG_PREFIX} Discovered sandbox session ${JSON.stringify({
				taskId: session.taskId, sessionId: session.sessionId, environmentId: session.environmentId,
				name: session.name, repoName: session.repoName, updatedAt: session.updatedAt, status: session.status,
			})}`);
		}
		if (partial) {
			return { kind: 'partial', sessions, removedTaskIds: [...removed], ...(targeted ? { failedTaskIds: [...failedTaskIds] } : {}) };
		}
		return targeted || since ? { kind: 'incremental', sessions, removedTaskIds: [...removed] } : { kind: 'complete', sessions };
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
		const context = await this._requestTaskCreation({
			repoNwo: request.repoNwo,
			expectedAccountKey: request.expectedAccountKey,
			prompt: '',
		}, token, undefined, { taskId: request.reservedTaskId });
		operation.bind({ serverRequestId: getGitHubRequestId(context.res.headers?.['x-github-request-id']) });
		const task = await this._readJson<ITaskDetail>(context);
		const taskId = typeof task?.id === 'string' && task.id.trim().length > 0 ? task.id : undefined;
		const binding = task && getTaskEnvironmentBinding(task);
		const reservationExpiresAt = typeof task?.reservation_expires_at === 'string' ? Date.parse(task.reservation_expires_at) : NaN;
		if (!taskId || !binding || task?.reserved !== true || !Number.isFinite(reservationExpiresAt)) {
			if (taskId && taskId !== request.reservedTaskId?.trim()) {
				await this._deleteTaskBestEffort(taskId, request.expectedAccountKey);
			} else if (taskId) {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${taskId} after an unusable renewal response; it may already have been claimed.`);
			}
			throw new CloudSandboxRequestError(context.res.statusCode, localize('cloudSandbox.invalidTaskReservation', "The cloud service did not return a usable task reservation."));
		}
		this._logService.info(`${LOG_PREFIX} Reserved sandbox task ${taskId} (session ${binding.sessionId}) on environment ${binding.environmentId}.`);
		return { taskId, sessionId: binding.sessionId, environmentId: binding.environmentId, reservationExpiresAt };
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
		const context = await this._requestTaskCreation(request, token, onRequest);
		operation.bind({ serverRequestId: getGitHubRequestId(context.res.headers?.['x-github-request-id']) });
		const task = await this._readJson<ITaskDetail>(context);
		const taskId = typeof task?.id === 'string' && task.id.trim().length > 0 ? task.id : undefined;
		if (!taskId) {
			throw new CloudSandboxRequestError(context.res.statusCode, 'Mission Control task create returned no task id');
		}
		let claimed: boolean | undefined;
		if (request.reservedTaskId !== undefined) {
			const serverClaimed = task?.claimed;
			const reserved = task?.reserved;
			if (typeof serverClaimed !== 'boolean' || (reserved !== undefined && reserved !== false) || (serverClaimed && taskId !== request.reservedTaskId.trim())) {
				throw new CloudSandboxRequestError(context.res.statusCode, localize('cloudSandbox.invalidReservationSubmission', "The cloud service did not confirm the task reservation outcome."));
			}
			claimed = serverClaimed;
		}
		const binding = task && getTaskEnvironmentBinding(task);
		if (!binding) {
			if (request.reservedTaskId === undefined) {
				// An unusable task must not remain in the session list.
				await this._deleteTaskBestEffort(taskId, request.expectedAccountKey);
			} else {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${taskId} after an incomplete reservation submission response; its outcome must be reconciled.`);
			}
			throw new CloudSandboxRequestError(context.res.statusCode, `Mission Control bound no sandbox session to task ${taskId}`);
		}
		if (request.environmentId !== undefined && binding.environmentId !== request.environmentId) {
			throw new CloudSandboxRequestError(context.res.statusCode, `Mission Control bound sandbox task ${taskId} to a different environment`);
		}
		this._logService.info(`${LOG_PREFIX} Provisioned sandbox task ${taskId} (session ${binding.sessionId}) on environment ${binding.environmentId}.`);
		return { taskId, sessionId: binding.sessionId, environmentId: binding.environmentId, ...(claimed !== undefined ? { claimed } : {}) };
	}

	private async _requestTaskCreation(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, onRequest?: () => void, reservation?: { readonly taskId?: string }): Promise<IRequestContext> {
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
		const context = await this._request(`${this._tasksBaseUrl()}/tasks`, 'mc.taskClient.create', reservation ? 'reserveTask' : 'createTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, CREATE_TIMEOUT_MS, session => ({
			environment_id: request.environmentId ?? CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
			// Persisted for display, so replayed history shows the prompt no run was started for.
			prompt: request.prompt,
			...(repository ? { repositories: [repository] } : {}),
			// New repo-less compute uses the account authorizing this request.
			...(!repository && request.environmentId === undefined ? { compute: { scope: session.account.label } } : {}),
			...(reservation ? { reserve: true } : {}),
			...(reservedTaskId ? { reserved_task_id: reservedTaskId } : {}),
		}), undefined, onRequest, { expectedAccountKey: request.expectedAccountKey });
		if (!isSuccess(context)) {
			// Read once: the body carries both the id to clean up and the failure message.
			const failureBody = await asText(context).catch(() => '') ?? '';

			const orphanedTaskId = this._taskIdFromFailure(failureBody);
			if (!reservation && reservedTaskId) {
				this._logService.warn(`${LOG_PREFIX} Retaining reservation ${reservedTaskId} and any created task after a failed submission; its outcome must be reconciled.`);
			} else if (orphanedTaskId && reservation && orphanedTaskId === reservedTaskId) {
				this._logService.warn(`${LOG_PREFIX} Retaining task ${orphanedTaskId} after a failed renewal request; it may already have been claimed.`);
			} else if (orphanedTaskId) {
				await this._deleteTaskBestEffort(orphanedTaskId, request.expectedAccountKey);
			} else {
				this._logService.warn(`${LOG_PREFIX} Task create failed (HTTP ${context.res.statusCode ?? 'unknown'}) without reporting a task id. Mission Control may have recorded a task before failing; such a task is orphaned and can only be removed server-side.`);
			}
			await this._throwForStatus(reservation ? 'task reservation' : 'task create', context, failureBody);
		}
		return context;
	}

	async deleteTask(taskId: string, token: CancellationToken, expectedAccountKey?: string): Promise<void> {
		const session = this._discoveredTasks.get(taskId)?.session;
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
		const context = await this._request(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}`, 'mc.taskClient.delete', 'deleteTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, REQUEST_TIMEOUT_MS, undefined, 'DELETE', undefined, { expectedAccountKey });
		if (!isSuccess(context) && context.res.statusCode !== 404) {
			await this._throwForStatus('task delete', context);
		}
		this._discoveredTasks.delete(taskId);
		this.clearSessionHistory(taskId);
		// Discard discovery responses that started before the deletion.
		this._discoveryGeneration++;
	}

	async renameTask(taskId: string, title: string, token: CancellationToken): Promise<void> {
		const context = await this._request(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}`, 'mc.taskClient.update', 'renameTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, REQUEST_TIMEOUT_MS, { name: title }, 'PATCH');
		if (!isSuccess(context)) {
			await this._throwForStatus('task rename', context);
		}
		this.invalidateSessionHistory(taskId);
		const cached = this._discoveredTasks.get(taskId);
		if (cached) {
			this._discoveredTasks.set(taskId, {
				...cached,
				summary: { ...cached.summary, name: title },
				session: cached.session ? { ...cached.session, name: title } : undefined,
				needsRefresh: true,
			});
		}
		this._discoveryGeneration++;
	}

	async setTaskArchived(taskId: string, archived: boolean, token: CancellationToken): Promise<void> {
		const action = archived ? 'archive' : 'unarchive';
		const context = await this._request(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}/${action}`, `mc.taskClient.${action}`, archived ? 'archiveTask' : 'unarchiveTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, REQUEST_TIMEOUT_MS, undefined, 'POST');
		if (!isSuccess(context)) {
			await this._throwForStatus(`task ${action}`, context);
		}
		this._discoveredTasks.delete(taskId);
		this.invalidateSessionHistory(taskId);
		this._discoveryGeneration++;
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
		this._discoveryGeneration++;
		const cached = this._discoveredTasks.get(taskId);
		if (cached?.emptySessionSince !== undefined) {
			this._discoveredTasks.set(taskId, { ...cached, hasEmptyHistory: undefined, needsRefresh: true });
		}
	}

	clearSessionHistory(taskId?: string): void {
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
			}, token, DISCOVERY_TIMEOUT_MS, undefined, undefined, () => {
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

	/**
	 * Resolve a numeric repository id to its `owner/name`, memoized for the life of the service.
	 * A task names its repository nowhere — `repository` carries an id, and the session's
	 * `event_url` / `base_ref` are empty for tasks created through the tasks API.
	 *
	 * The cached promise must never reject: every task in a pass shares it, and a rejection would
	 * count each one as unresolved (forcing the scan `partial`) and drop those sessions from the
	 * listing entirely. A miss is evicted so the next pass retries.
	 */
	private _resolveRepositoryName(repositoryId: number, token: CancellationToken): Promise<string | undefined> {
		const cached = this._repositoryNames.get(repositoryId);
		if (cached) {
			return cached;
		}
		const pending = (async () => {
			try {
				const url = `${GITHUB_DOT_COM_API_BASE_URI}/repositories/${repositoryId}`;
				const context = await this._retryWhileRateLimited('repository get', token, () => this._request(url, 'mc.repositoryClient.get', 'getRepository', {
					'Accept': 'application/vnd.github.v3+json',
				}, token, DISCOVERY_TIMEOUT_MS));
				if (!isSuccess(context)) {
					throw new CloudSandboxRequestError(context.res.statusCode, `HTTP ${context.res.statusCode ?? 'none'}`);
				}
				const body = await this._readJson<{ full_name?: string }>(context);
				return body?.full_name;
			} catch (error) {
				this._logService.warn(`${LOG_PREFIX} Repository ${repositoryId} lookup failed: ${toErrorMessage(error)}`);
				return undefined;
			}
		})();
		this._repositoryNames.set(repositoryId, pending);
		pending.then(name => {
			if (!name && this._repositoryNames.get(repositoryId) === pending) {
				this._repositoryNames.delete(repositoryId);
			}
		});
		return pending;
	}

	/** Shared handler for the `connect`/`reconnect` endpoints (200 token or 202 waking). */
	private async _connectRequest(
		action: CloudSandboxEnvironmentAction,
		request: ICloudSandboxConnectionRequest,
		token: CancellationToken,
		searchParams: Record<string, string>,
	): Promise<CloudSandboxConnectResult> {
		const { environmentId, environmentKind, onRequest } = request;
		const operation = this._telemetry.lifecycle.start(action === 'connect' ? 'credentials.connect' : 'credentials.refresh', {
			environmentKind, environmentId, agentSessionId: searchParams.session_id, connectionId: searchParams.client_id,
		});
		let failurePoint: CloudSandboxLifecycleFailurePoint = 'credentials.request';
		try {
			const context = await this._sendEnvironment(action, environmentId, token, searchParams, onRequest);
			operation.bind({ serverRequestId: getGitHubRequestId(context.res.headers?.['x-github-request-id']) });
			if (context.res.statusCode === 202) {
				onRequest?.('waking');
				const retryAfterSeconds = parseRetryAfter(context.res.headers?.['retry-after']);
				this._logService.debug(`${LOG_PREFIX} ${action}: environment waking, retry after ${retryAfterSeconds}s`);
				operation.complete('waking', {}, undefined, 202);
				return { kind: 'waking', waking: { retryAfterSeconds } };
			}
			if (!isSuccess(context)) {
				await this._throwForStatus(action, context);
			}
			failurePoint = 'credentials.invalidResponse';
			const clientToken = await this._readJson<ICloudSandboxClientToken>(context);
			if (!clientToken?.access_token || !clientToken?.wps_endpoint || !clientToken?.client_id || !clientToken?.groups) {
				failurePoint = 'credentials.incompleteResponse';
				throw new Error(`Mission Control ${action} returned an incomplete token response`);
			}
			if (action === 'reconnect' && clientToken.client_id !== searchParams.client_id) {
				failurePoint = 'credentials.clientMismatch';
				throw new Error('Cloud sandbox reconnect returned credentials for a different client');
			}
			operation.complete('succeeded', { connectionId: clientToken.client_id }, undefined, context.res.statusCode);
			return { kind: 'token', token: clientToken };
		} catch (error) {
			operation.complete(isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failed', { failurePoint }, error);
			throw error;
		}
	}

	/**
	 * Issue an agent-environment request and return the raw response. The caller owns status
	 * handling, since the meaning of a status is endpoint-specific (notably HTTP 202 = "waking",
	 * which is neither an error nor a result).
	 */
	private async _sendEnvironment(
		action: CloudSandboxEnvironmentAction,
		environmentId: string,
		token: CancellationToken,
		searchParams?: Record<string, string>,
		onRequest?: ICloudSandboxConnectionRequest['onRequest'],
	): Promise<IRequestContext> {
		const path = action === 'get' ? '' : `/${action}`;
		const url = `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments/${encodeURIComponent(environmentId)}${path}${toQuery(searchParams)}`;
		return this._request(url, `mc.environmentClient.${action}`, action === 'get' ? 'getEnvironment' : action, {
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, action === 'get' ? REQUEST_TIMEOUT_MS : CONNECTION_REQUEST_TIMEOUT_MS, undefined, undefined, onRequest);
	}

	/** Issue a task API request, throwing on a non-success status. */
	private async _sendTask(url: string, action: 'list' | 'get', token: CancellationToken): Promise<IRequestContext> {
		const context = await this._retryWhileRateLimited(`task ${action}`, token, () => this._request(url, `mc.taskClient.${action}`, action === 'list' ? 'listTasks' : 'getTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, DISCOVERY_TIMEOUT_MS));
		if (!isSuccess(context)) {
			await this._throwForStatus(`task ${action}`, context);
		}
		return context;
	}

	/**
	 * Re-issue a discovery read that came back rate-limited, waiting for `Retry-After` when the
	 * response names one and backing off exponentially when it does not.
	 *
	 * Discovery reads the API far harder than any other sandbox call, so it is the one path that
	 * routinely trips the limit. Reporting a 429 rather than retrying it loses the session being
	 * resolved for the rest of the window, because nothing re-runs a pass that otherwise succeeded.
	 */
	private async _retryWhileRateLimited(action: string, token: CancellationToken, send: () => Promise<IRequestContext>): Promise<IRequestContext> {
		let waited = 0;
		for (let attempt = 0; ; attempt++) {
			const context = await send();
			if (context.res.statusCode !== HTTP_TOO_MANY_REQUESTS || attempt >= RATE_LIMIT_MAX_RETRIES || token.isCancellationRequested) {
				return context;
			}
			const delay = rateLimitDelay(retryAfterSeconds(context.res.headers?.['retry-after']), attempt);
			// Waiting less than asked would re-issue inside the server's window, so a delay that
			// does not fit ends the retries rather than being trimmed to fit.
			if (waited + delay > RATE_LIMIT_WAIT_BUDGET_MS) {
				this._logService.warn(`${LOG_PREFIX} ${action} was rate limited and asks for another ${delay}ms, beyond what is left of its ${RATE_LIMIT_WAIT_BUDGET_MS}ms budget; giving up so the pass stays bounded. A later pass retries it.`);
				return context;
			}
			// Nothing reads the body on this path, and an unconsumed stream holds its connection.
			await asText(context).catch(() => undefined);
			this._logService.warn(`${LOG_PREFIX} ${action} was rate limited; retrying in ${delay}ms (attempt ${attempt + 1} of ${RATE_LIMIT_MAX_RETRIES}).`);
			await timeout(delay, token);
			waited += delay;
		}
	}

	private async _request(url: string, callSite: string, action: CloudSandboxRequestAction, headers: Record<string, string>, token: CancellationToken, timeoutMs: number = REQUEST_TIMEOUT_MS, body?: Record<string, unknown> | ((session: AuthenticationSession) => Record<string, unknown>), method?: 'GET' | 'POST' | 'DELETE' | 'PATCH', onRequest?: ICloudSandboxConnectionRequest['onRequest'], requestContext?: { readonly diagnosticId?: string; readonly authentication?: AuthenticationSession; readonly expectedAccountKey?: string }): Promise<IRequestContext> {
		let session = requestContext?.authentication ?? await this._resolveGitHubSession();
		if (!session?.accessToken) {
			// No request is issued, so there is no request outcome to count.
			throw new CloudSandboxAuthenticationRequiredError();
		}
		if (requestContext?.expectedAccountKey !== undefined && requestContext.expectedAccountKey !== this._accountKeyForSession(session)) {
			throw new CancellationError();
		}
		let accessToken = session.accessToken;
		const started = Date.now();
		const requestMethod = method ?? (body === undefined ? 'GET' : 'POST');
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			for (let attempt = 0; ; attempt++) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				onRequest?.('issued');
				const context = await this._requestService.request({
					type: requestMethod,
					url,
					headers: {
						...headers,
						// `fetch` labels a string body `text/plain` unless told otherwise.
						...(body === undefined ? undefined : { ['Content-Type']: 'application/json' }),
						['Authorization']: `Bearer ${accessToken}`
					},
					...(body === undefined ? undefined : { data: JSON.stringify(typeof body === 'function' ? body(session) : body) }),
					timeout: timeoutMs,
					callSite,
					...(requestContext?.diagnosticId !== undefined ? { diagnosticId: requestContext.diagnosticId } : {}),
				}, token).catch((error: unknown) => {
					if ((action === 'connect' || action === 'reconnect') && !isCancellationError(error) && !token.isCancellationRequested) {
						throw new CloudSandboxNetworkError('Mission Control connection request failed');
					}
					throw error;
				});
				this._telemetry.reportRequest(action, requestOutcomeForStatus(context.res.statusCode));
				// Latency against its budget: `/connect` blocks on a compute resume, so how close a reply
				// came to being cut off separates "Mission Control is silent" from "we stopped listening".
				this._logService.trace(`${LOG_PREFIX} ${action} -> HTTP ${context.res.statusCode ?? 'none'} in ${Date.now() - started}ms (budget ${timeoutMs}ms)${context.res.headers?.['retry-after'] ? `, Retry-After: ${context.res.headers['retry-after']}` : ''}`);
				if (requestMethod === 'GET' && context.res.statusCode === 401 && attempt === 0) {
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
			const requestError = action === 'mintIdentityToken'
				? new CloudSandboxNetworkError(localize('cloudSandbox.identityNetworkError', "The sandbox identity-token request failed before a response was received."))
				: action === 'sealToken'
					? new CloudSandboxNetworkError(localize('cloudSandbox.sealingNetworkError', "The sandbox token-sealing request failed before a response was received."))
					: error;
			if (cancellationError) {
				this._logService.trace(`${LOG_PREFIX} ${action} -> cancelled after ${Date.now() - started}ms (budget ${timeoutMs}ms)`);
			} else {
				this._telemetry.reportRequest(action, 'networkError');
				// Elapsed at the budget means our own timeout fired; shorter means something else did.
				this._logService.trace(`${LOG_PREFIX} ${action} -> failed after ${Date.now() - started}ms (budget ${timeoutMs}ms)`);
				this._logService.error(`${LOG_PREFIX} ${requestMethod} ${action} failed before a response was available.`);
			}
			throw cancellationError ?? requestError;
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
		const context = await this._request(`${this._tasksBaseUrl()}/swe/models`, 'mc.models.list', 'listModels', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
			'X-GitHub-Api-Version': '2026-06-01',
		}, token, DISCOVERY_TIMEOUT_MS);
		if (!isSuccess(context)) {
			await this._throwForStatus('model catalog', context);
		}
		const catalog = await this._readJson<{ data?: ICloudModel[]; default_model?: string }>(context);
		if (!catalog || !Array.isArray(catalog.data) || (catalog.default_model !== undefined && typeof catalog.default_model !== 'string')) {
			throw new Error('Mission Control returned an invalid model catalog.');
		}
		const models: SessionModelInfo[] = [];
		for (const model of catalog.data) {
			const efforts = model?.capabilities?.supports?.reasoning_effort;
			if (!model || typeof model.id !== 'string' || !model.id || typeof model.name !== 'string'
				|| (efforts !== undefined && (!Array.isArray(efforts) || !efforts.every(value => typeof value === 'string')))) {
				throw new Error('Mission Control returned invalid model metadata.');
			}
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

	/**
	 * Throw a diagnosable error for a non-success response. Pass `prereadBody` when the caller has
	 * already consumed the stream, since reading it twice yields nothing.
	 */
	private async _throwForStatus(action: string, context: IRequestContext, prereadBody?: string): Promise<never> {
		const body = prereadBody ?? await asText(context).catch(() => '');
		const status = context.res.statusCode;
		const metadata = parseMissionControlError(body, context.res.headers?.['x-github-request-id']);
		const error = new CloudSandboxRequestError(
			status,
			`Mission Control ${action} failed: HTTP ${status ?? 'unknown'}${metadata.code ? ` code=${metadata.code}` : ''}${metadata.requestId ? ` (requestId=${metadata.requestId})` : ''}`,
			retryAfterSeconds(context.res.headers?.['retry-after']),
			metadata,
		);
		this._logService.error(`${LOG_PREFIX} ${error.message}${metadata.limitedResource ? ` limitedResource=${metadata.limitedResource}` : ''}`);
		throw error;
	}

	/** The task id from a failed create, when the response names the task it already recorded. */
	private _taskIdFromFailure(body: string): string | undefined {
		if (!body) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(body) as { id?: unknown; task_id?: unknown };
			for (const candidate of [parsed?.id, parsed?.task_id]) {
				if (typeof candidate === 'string' && candidate.length > 0) {
					return candidate;
				}
			}
		} catch {
			// A non-JSON error body names no task.
		}
		return undefined;
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

function parseSealedTokenResponse(response: ISealedTokenResponse | undefined): ICloudSandboxSealedToken {
	const key = response?.host_encryption_key;
	const sealed = response?.encrypted_github_token;
	const invalidResponse = () => new Error(localize('cloudSandbox.invalidSealedToken', "The sandbox token-sealing response is invalid."));
	if (typeof sealed !== 'string' || sealed.length > 64 * 1024 || !isObject(key)
		|| typeof key.key_id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(key.key_id)
		|| key.use !== 'auth-token' || typeof key.public_key !== 'string'
		|| (key.algorithm !== 'x25519-sealedbox' && key.algorithm !== 'hpke-x25519-hkdf-sha256-aes256gcm')) {
		throw invalidResponse();
	}
	const prefix = `${CLOUD_SANDBOX_SEALED_TOKEN_PREFIX}${key.key_id}.`;
	const payload = sealed.slice(prefix.length);
	if (!sealed.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(payload)) {
		throw invalidResponse();
	}
	let publicKey: VSBuffer;
	let ciphertext: VSBuffer;
	try {
		publicKey = decodeBase64(key.public_key);
		ciphertext = decodeBase64(payload);
	} catch {
		throw invalidResponse();
	}
	if (publicKey.byteLength !== 32 || encodeBase64(publicKey) !== key.public_key
		|| ciphertext.byteLength < 48 || encodeBase64(ciphertext, false, true) !== payload) {
		throw invalidResponse();
	}
	return {
		encrypted_github_token: sealed,
		host_encryption_key: { key_id: key.key_id, use: key.use, algorithm: key.algorithm, public_key: key.public_key },
	};
}

function isSuccess(context: IRequestContext): boolean {
	const status = context.res.statusCode ?? 0;
	return status >= 200 && status < 300;
}

function toQuery(searchParams: Record<string, string> | undefined): string {
	if (!searchParams) {
		return '';
	}
	const search = new URLSearchParams(searchParams).toString();
	return search ? `?${search}` : '';
}

/** Parse a `Retry-After` header; fall back to a small default. */
function parseRetryAfter(value: string | string[] | undefined): number {
	return retryAfterSeconds(value) ?? DEFAULT_WAKING_RETRY_AFTER_SECONDS;
}

/** Provisioning tasks can advertise an empty provider before their runtime is ready. */
function isCloudSandboxTask(task: ITaskSummary): boolean {
	const provider = task.compute?.provider;
	return provider === 'sandboxes' || ((provider === undefined || provider === '') && task.current_environment?.kind === 'managed-sandbox');
}

/** Whether a `Link` header advertises another page (`rel="next"`). */
function hasNextLink(value: string | string[] | undefined): boolean {
	const raw = Array.isArray(value) ? value.join(',') : value;
	return raw ? /rel="?next"?/.test(raw) : false;
}

function isConcreteEnvironmentId(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value !== CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID;
}

/** Split an `owner/name` into the pair Mission Control expects, or `undefined` when unusable. */
function parseNwo(nwo: string | undefined): { owner: string; name: string } | undefined {
	const separator = nwo?.indexOf('/') ?? -1;
	if (!nwo || separator <= 0 || separator === nwo.length - 1) {
		return undefined;
	}
	return { owner: nwo.slice(0, separator), name: nwo.slice(separator + 1) };
}

/**
 * The Mission Control environment a sandbox task runs in, read from the full task's nested
 * `sessions[]`. Undefined when no session is bound to an environment yet.
 */
function getTaskEnvironmentBinding(task: ITaskDetail): { environmentId: string; sessionId: string } | undefined {
	if (!Array.isArray(task.sessions)) {
		return undefined;
	}
	for (const session of task.sessions) {
		if (isConcreteEnvironmentId(session?.environment_id) && typeof session.id === 'string' && session.id.trim().length > 0) {
			return { environmentId: session.environment_id, sessionId: session.id };
		}
	}
	return undefined;
}

function getUnstartedSessionCreatedAt(task: ITaskDetail): number | undefined {
	if (task.name !== 'New remote session' || task.state !== 'queued' || task.sessions?.length !== 1) {
		return undefined;
	}
	const session = task.sessions[0];
	if (session.state !== 'queued' || session.ahp_resource_uri || !session.created_at || session.updated_at !== session.created_at) {
		return undefined;
	}
	const createdAt = Date.parse(session.created_at);
	return Number.isFinite(createdAt) ? createdAt : undefined;
}

function getEmptySessionUpdatedAt(session: ICloudSandboxDiscoveredSession): number | undefined {
	if ((session.name !== 'New task' && session.name !== 'New Task') || session.eventType !== 'unknown'
		|| session.isArchived || (session.status !== undefined && session.status !== SessionStatus.Idle)) {
		return undefined;
	}
	const updatedAt = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
	return Number.isFinite(updatedAt) ? updatedAt : undefined;
}

function isEmptySessionHistory(history: IReplayedTaskHistory | undefined, sessionId: string): boolean | undefined {
	if (!history || history.truncated) {
		return undefined;
	}
	if (history.sessions.length !== 1) {
		return false;
	}
	const session = history.sessions[0];
	if (session.session !== AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, sessionId).toString()) {
		return undefined;
	}
	if (!session.hasRecordedDefaultChat || session.chats.size !== 1 || session.state.chats.length > 1
		|| (session.state.status & (SessionStatus.InProgress | SessionStatus.Error))
		|| session.state.chats.some(chat => chat.changes?.files
			|| (chat.status & (SessionStatus.InProgress | SessionStatus.Error))
			|| (chat.title && chat.title !== 'New task' && chat.title !== 'New Task'))
		|| (session.state.title && session.state.title !== 'New task' && session.state.title !== 'New Task')) {
		return false;
	}
	const chat = session.chats.get(session.defaultChat);
	return !!chat && chat.turns.length === 0 && !chat.activeTurn && !chat.turnsNextCursor
		&& !(chat.status & (SessionStatus.InProgress | SessionStatus.Error))
		&& !chat.changes?.files && !chat.backgroundWork?.length && !chat.queuedMessages?.length && !chat.steeringMessage && !chat.draft;
}
