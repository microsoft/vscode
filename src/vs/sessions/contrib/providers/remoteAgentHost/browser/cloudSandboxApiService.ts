/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	CLOUD_SANDBOX_AGENT_SLUG,
	CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxConnectResult,
	CloudSandboxRequestError,
	ICloudSandboxClientToken,
	ICloudSandboxConnectionRequest,
	ICloudSandboxApiService,
	ICloudSandboxCreatedSession,
	ICloudSandboxCreateSessionRequest,
	ICloudSandboxDiscoveredSession,
	ICloudSandboxDiscoveryResult,
	ICloudSandboxEnvironment,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI, deriveGitHubEndpoints } from '../../../../../platform/agentHost/common/githubEndpoints.js';
import { IReplayedTaskHistory, parseTaskEventsResponse, replayTaskAhpEvents, TaskEventReplayError } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { asText, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ICloudSandboxTelemetryService, requestOutcomeForStatus, type CloudSandboxRequestAction } from './cloudSandboxTelemetry.js';

/** The agent-environment endpoints Mission Control exposes. */
type CloudSandboxEnvironmentAction = 'get' | 'connect' | 'reconnect';

/** The subset of a Mission Control task the sandbox discovery path reads. */
interface ITaskSummary {
	readonly id: string;
	readonly name?: string;
	readonly archived_at?: string | null;
	readonly updated_at?: string;
	readonly agent_collaborators?: readonly { readonly slug?: string }[];
	readonly compute?: { readonly provider?: string };
	/**
	 * The owning repository, identified by numeric id only — the payload carries no name. See
	 * {@link CloudSandboxApiService._resolveRepositoryName}.
	 */
	readonly repository?: { readonly id?: number };
}

/** A full task, which additionally carries the sessions bound to sandbox environments. */
interface ITaskDetail extends ITaskSummary {
	readonly sessions?: readonly { readonly id: string; readonly environment_id?: string }[];
}

const LOG_PREFIX = '[CloudSandboxApi]';

/**
 * The github.com REST API base, used for the repository-name lookup discovery needs. The CORS
 * caveat on {@link CloudSandboxApiService._tasksBaseUrl} is specific to `api.github.com/agents/*`;
 * the general REST API is CORS-enabled and already called from the renderer elsewhere.
 */
const GITHUB_DOT_COM_API_BASE_URI = deriveGitHubEndpoints(undefined).apiBaseUri;

/** Per-request timeout (ms) for credential and environment calls. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Per-request timeout (ms) for discovery, whose task list is far larger than a credential mint. */
const DISCOVERY_TIMEOUT_MS = 30_000;

/**
 * Per-request timeout (ms) for task creation, which waits on a sandbox VM being allocated rather
 * than on a record being written.
 */
const CREATE_TIMEOUT_MS = 60_000;

/** Default Retry-After (seconds) when a 202 "waking" response omits the header. */
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;

/**
 * Response headers worth logging when a request fails, lowercased to match the response map.
 * `x-github-request-id` is what a support escalation is keyed on.
 */
const DIAGNOSTIC_RESPONSE_HEADERS = ['x-github-request-id', 'x-request-id', 'x-sweagentd-retry', 'retry-after'] as const;

/** How many recent tasks to scan for sandbox sessions during discovery, per page. */
const DISCOVERY_TASK_SCAN_LIMIT = 100;

/** Bounds sequential page fetches. Hitting it leaves tasks unscanned, so the result is `partial`. */
const DISCOVERY_TASK_PAGE_LIMIT = 10;

/**
 * Max concurrent task-detail fetches during discovery.
 *
 * Discovery used to resolve every sandbox task at once, which meant a user with a few dozen
 * sandbox tasks issued that many simultaneous requests and tripped GitHub's rate limit. Each
 * rejected fetch drops its session from the pass, and the burst also starves the `listTasks` call
 * of whichever pass runs next — including the one a freshly reloaded window depends on.
 */
const DISCOVERY_TASK_FETCH_CONCURRENCY = 5;

/** HTTP status GitHub answers a rate-limited request with. */
const HTTP_TOO_MANY_REQUESTS = 429;

/** How many times a rate-limited discovery read is re-issued before it is given up on. */
const RATE_LIMIT_MAX_RETRIES = 3;

/** First backoff step (ms) for a rate-limited read whose response names no `Retry-After`. */
const RATE_LIMIT_BASE_DELAY_MS = 1_000;

/**
 * Cap (ms) on a backoff this client computes for itself. It deliberately does not apply to a
 * server-supplied `Retry-After`: shortening that would re-issue the request inside the window the
 * server just asked us to stay out of, earning another 429 and adding to the very traffic that
 * caused it.
 */
const RATE_LIMIT_MAX_BACKOFF_MS = 8_000;

/**
 * Total time (ms) a single read may spend waiting out rate limits before it gives up.
 *
 * Bounds the pass without ever shortening a wait: a `Retry-After` longer than what is left is not
 * trimmed to fit, it ends the retries. The read then reports its 429 and leaves the scan `partial`,
 * so the caller keeps the sessions it could not resolve and a later pass picks them up.
 */
const RATE_LIMIT_WAIT_BUDGET_MS = 15_000;

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

	/** Resolved (or in-flight) repository names, keyed by numeric repository id. */
	private readonly _repositoryNames = new Map<number, Promise<string | undefined>>();

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
		@ICloudSandboxTelemetryService private readonly _telemetry: ICloudSandboxTelemetryService,
	) {
		super();
	}

	async connect(request: ICloudSandboxConnectionRequest, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest('connect', request.environmentId, token, {
			...(request.sessionId && { session_id: request.sessionId }),
		});
	}

	async reconnect(request: ICloudSandboxConnectionRequest, clientId: string, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		return this._connectRequest('reconnect', request.environmentId, token, {
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

	/**
	 * Enumerate sandbox-backed cloud sessions by scanning recent tasks and resolving each one's
	 * Mission Control environment binding.
	 *
	 * Only a `complete` result may be reconciled against: a partial or truncated scan is missing
	 * entries that still exist.
	 */
	async listSessions(token: CancellationToken): Promise<ICloudSandboxDiscoveryResult> {
		const tasks: ITaskSummary[] = [];
		let truncated = false;
		for (let page = 1; page <= DISCOVERY_TASK_PAGE_LIMIT; page++) {
			let batch: readonly ITaskSummary[];
			let hasNextPage: boolean;
			try {
				const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks?per_page=${DISCOVERY_TASK_SCAN_LIMIT}&page=${page}`, 'list', token);
				const response = await this._readJson<{ tasks?: readonly ITaskSummary[] }>(context);
				if (!response?.tasks) {
					// Earlier pages are still worth seeding, so only fail outright on the first.
					if (page === 1) {
						return { kind: 'failed', reason: `listTasks returned no 'tasks' array` };
					}
					truncated = true;
					break;
				}
				batch = response.tasks;
				hasNextPage = hasNextLink(context.res.headers?.['link']);
			} catch (error) {
				if (page === 1) {
					return { kind: 'failed', reason: `listTasks failed: ${toErrorMessage(error)}` };
				}
				this._logService.warn(`${LOG_PREFIX} Discovery page ${page} failed: ${toErrorMessage(error)}`);
				truncated = true;
				break;
			}
			tasks.push(...batch);
			if (!hasNextPage) {
				break;
			}
			if (page === DISCOVERY_TASK_PAGE_LIMIT) {
				truncated = true;
			}
			if (token.isCancellationRequested) {
				truncated = true;
				break;
			}
		}

		const sandboxTasks = tasks.filter(task => !task.archived_at && isCloudSandboxTask(task));
		let unresolved = 0;
		// Bounded fan-out: resolving every task at once trips the rate limit, and each rejected
		// fetch silently drops its session from this pass.
		const limiter = new Limiter<ICloudSandboxDiscoveredSession | undefined>(DISCOVERY_TASK_FETCH_CONCURRENCY);
		let discovered: (ICloudSandboxDiscoveredSession | undefined)[];
		try {
			discovered = await Promise.all(sandboxTasks.map(task => limiter.queue(async (): Promise<ICloudSandboxDiscoveredSession | undefined> => {
				try {
					const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(task.id)}`, 'get', token);
					const full = await this._readJson<ITaskDetail>(context);
					if (!full) {
						unresolved++;
						return undefined;
					}
					const binding = getTaskEnvironmentBinding(full);
					if (!binding) {
						// No environment bound yet — a real state, not a failure to resolve.
						return undefined;
					}
					const repositoryId = full.repository?.id ?? task.repository?.id;
					const repoName = repositoryId !== undefined ? await this._resolveRepositoryName(repositoryId, token) : undefined;
					return {
						environmentId: binding.environmentId,
						sessionId: binding.sessionId,
						taskId: task.id,
						name: full.name ?? task.name ?? `Sandbox ${task.id}`,
						repoName,
						updatedAt: full.updated_at ?? task.updated_at,
					};
				} catch (error) {
					this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
					unresolved++;
					return undefined;
				}
			})));
		} finally {
			limiter.dispose();
		}

		const sessions = discovered.filter((session): session is ICloudSandboxDiscoveredSession => session !== undefined);
		const unnamed = sessions.filter(session => !session.repoName).length;
		this._logService.info(`${LOG_PREFIX} Discovery found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${tasks.length} scanned${truncated ? ' (scan truncated)' : ''}${unresolved > 0 ? `; ${unresolved} unresolved` : ''}${unnamed > 0 ? `; ${unnamed} without a repository name (they group under "Unknown")` : ''}.`);
		return { kind: unresolved > 0 || truncated ? 'partial' : 'complete', sessions };
	}

	/**
	 * Provision a sandbox task bound to an on-demand environment. Mission Control provisions a VM
	 * and binds a session but starts no run, so the caller sends the first turn over the relay.
	 * The environment on the returned session is the real VM, not the sentinel.
	 */
	async createSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken): Promise<ICloudSandboxCreatedSession> {
		const repository = parseNwo(request.repoNwo);
		const context = await this._request(`${this._tasksBaseUrl()}/tasks`, 'mc.taskClient.create', 'createTask', {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, CREATE_TIMEOUT_MS, {
			environment_id: CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID,
			// Persisted for display, so replayed history shows the prompt no run was started for.
			prompt: request.prompt,
			...(repository && { repositories: [repository] }),
		});
		if (!isSuccess(context)) {
			// Read once: the body carries both the id to clean up and the failure message.
			const failureBody = await asText(context).catch(() => '') ?? '';

			// The generic failure message masks its cause; the request id is the only handle.
			this._logService.error(`${LOG_PREFIX} Task create failed. ${this._describeResponse(context, failureBody)}`);

			const orphanedTaskId = this._taskIdFromFailure(failureBody);
			if (orphanedTaskId) {
				await this._deleteTaskBestEffort(orphanedTaskId);
			} else {
				this._logService.warn(`${LOG_PREFIX} Task create failed (HTTP ${context.res.statusCode ?? 'unknown'}) without reporting a task id. Mission Control may have recorded a task before failing; such a task is orphaned and can only be removed server-side.`);
			}
			await this._throwForStatus('task create', context, failureBody);
		}
		const task = await this._readJson<ITaskDetail>(context);
		const taskId = task?.id;
		if (!taskId) {
			throw new CloudSandboxRequestError(context.res.statusCode, 'Mission Control task create returned no task id');
		}
		const binding = task && getTaskEnvironmentBinding(task);
		if (!binding) {
			// A task with no bound session is unusable — the relay has nothing to address — but it
			// still shows up in the user's task list, so drop it rather than leaving litter behind.
			await this._deleteTaskBestEffort(taskId);
			throw new CloudSandboxRequestError(context.res.statusCode, `Mission Control bound no sandbox session to task ${taskId}`);
		}
		this._logService.info(`${LOG_PREFIX} Provisioned sandbox task ${taskId} (session ${binding.sessionId}) on environment ${binding.environmentId}.`);
		return { taskId, sessionId: binding.sessionId, environmentId: binding.environmentId };
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
	private async _deleteTaskBestEffort(taskId: string): Promise<void> {
		try {
			const context = await this._request(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}`, 'mc.taskClient.delete', 'deleteTask', {
				'Accept': 'application/json',
				'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
			}, CancellationToken.None, REQUEST_TIMEOUT_MS, undefined, 'DELETE');
			// A rejected delete resolves rather than throwing, so the status decides.
			if (!isSuccess(context)) {
				this._logService.warn(`${LOG_PREFIX} Could not clean up sandbox task ${taskId}: HTTP ${context.res.statusCode ?? 'none'}. It remains and can only be removed server-side.`);
				return;
			}
			this._logService.info(`${LOG_PREFIX} Cleaned up unusable sandbox task ${taskId}: HTTP ${context.res.statusCode ?? 'none'}`);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Could not clean up sandbox task ${taskId}: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * Read a task's persisted AHP history and fold it into session/chat state.
	 *
	 * The only history path that survives the sandbox: `/events` is served by Mission Control's
	 * mirror, not the environment. The `vnd.github.ahp+json` media type selects the raw relayed
	 * frames rather than the cloud-task event summaries the endpoint serves by default.
	 */
	async getSessionHistory(taskId: string, token: CancellationToken): Promise<IReplayedTaskHistory | undefined> {
		const url = `${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}/events`;
		const context = await this._request(url, 'mc.taskClient.events', 'getTaskEvents', {
			'Accept': 'application/vnd.github.ahp+json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, DISCOVERY_TIMEOUT_MS);
		if (!isSuccess(context)) {
			await this._throwForStatus('task events', context);
		}
		const body = await this._readJson<unknown>(context);
		if (body === undefined) {
			throw new TaskEventReplayError('Task AHP history response was empty or not JSON.');
		}
		return replayTaskAhpEvents(parseTaskEventsResponse(body));
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
		environmentId: string,
		token: CancellationToken,
		searchParams: Record<string, string>,
	): Promise<CloudSandboxConnectResult> {
		const context = await this._sendEnvironment(action, environmentId, token, searchParams);

		if (context.res.statusCode === 202) {
			const retryAfterSeconds = parseRetryAfter(context.res.headers?.['retry-after']);
			this._logService.debug(`${LOG_PREFIX} ${action}: environment waking, retry after ${retryAfterSeconds}s`);
			return { kind: 'waking', waking: { retryAfterSeconds } };
		}
		if (!isSuccess(context)) {
			await this._throwForStatus(action, context);
		}
		const clientToken = await this._readJson<ICloudSandboxClientToken>(context);
		if (!clientToken?.access_token || !clientToken?.wps_endpoint || !clientToken?.client_id || !clientToken?.groups) {
			throw new Error(`Mission Control ${action} returned an incomplete token response`);
		}
		return { kind: 'token', token: clientToken };
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
	): Promise<IRequestContext> {
		const path = action === 'get' ? '' : `/${action}`;
		const url = `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments/${encodeURIComponent(environmentId)}${path}${toQuery(searchParams)}`;
		return this._request(url, `mc.environmentClient.${action}`, action === 'get' ? 'getEnvironment' : action, {
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token);
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
			const delay = rateLimitDelay(context.res.headers?.['retry-after'], attempt);
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

	private async _request(url: string, callSite: string, action: CloudSandboxRequestAction, headers: Record<string, string>, token: CancellationToken, timeoutMs: number = REQUEST_TIMEOUT_MS, body?: unknown, method?: 'GET' | 'POST' | 'DELETE'): Promise<IRequestContext> {
		const accessToken = await this._resolveGitHubToken();
		if (!accessToken) {
			// No request is issued, so there is no request outcome to count.
			throw new CloudSandboxAuthenticationRequiredError();
		}
		const started = Date.now();
		const requestMethod = method ?? (body === undefined ? 'GET' : 'POST');
		try {
			const context = await this._requestService.request({
				type: requestMethod,
				url,
				headers: {
					...headers,
					// `fetch` labels a string body `text/plain` unless told otherwise.
					...(body === undefined ? undefined : { ['Content-Type']: 'application/json' }),
					['Authorization']: `Bearer ${accessToken}`
				},
				...(body === undefined ? undefined : { data: JSON.stringify(body) }),
				timeout: timeoutMs,
				callSite,
			}, token);
			this._telemetry.reportRequest(action, requestOutcomeForStatus(context.res.statusCode));
			// Latency against its budget: `/connect` blocks on a compute resume, so how close a reply
			// came to being cut off separates "Mission Control is silent" from "we stopped listening".
			this._logService.trace(`${LOG_PREFIX} ${action} -> HTTP ${context.res.statusCode ?? 'none'} in ${Date.now() - started}ms (budget ${timeoutMs}ms)${context.res.headers?.['retry-after'] ? `, Retry-After: ${context.res.headers['retry-after']}` : ''}`);
			return context;
		} catch (error) {
			// A cancelled request was never answered, so it is not a failure worth counting.
			if (!isCancellationError(error) && !token.isCancellationRequested) {
				this._telemetry.reportRequest(action, 'networkError');
			}
			// Elapsed at the budget means our own timeout fired; shorter means something else did.
			this._logService.trace(`${LOG_PREFIX} ${action} -> failed after ${Date.now() - started}ms (budget ${timeoutMs}ms)`);
			this._logService.error(`${LOG_PREFIX} ${requestMethod} ${url} failed: ${toErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Mission Control task API base. Uses the Copilot API host: `api.github.com/agents/*` omits
	 * CORS headers on authenticated responses, so a renderer `fetch` receives the reply and discards it.
	 */
	private _tasksBaseUrl(): string {
		return `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`;
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
		throw new CloudSandboxRequestError(
			status,
			`Mission Control ${action} failed: HTTP ${status ?? 'unknown'} - ${(body ?? '').slice(0, 200)}`,
		);
	}

	/**
	 * Describe a response verbatim for a support escalation: status, the server-side request id,
	 * and the body as received.
	 */
	private _describeResponse(context: IRequestContext, body: string): string {
		const headers = context.res.headers ?? {};
		const parts = [`HTTP ${context.res.statusCode ?? 'none'}`];
		for (const name of DIAGNOSTIC_RESPONSE_HEADERS) {
			const value = headers[name];
			if (value !== undefined) {
				parts.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
			}
		}
		parts.push(`body: ${body || '<empty>'}`);
		return parts.join(' | ');
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
	private async _resolveGitHubToken(): Promise<string | undefined> {
		const providerId = this._productService.defaultChatAgent?.provider?.default?.id ?? 'github';
		const scopes = this._productService.defaultChatAgent?.providerScopes?.[0] ?? FALLBACK_SCOPES;

		let exact: readonly AuthenticationSession[];
		try {
			exact = await this._authenticationService.getSessions(providerId, [...scopes], undefined, true);
		} catch (error) {
			// Throws when the auth provider extension has not registered yet.
			this._logService.warn(`${LOG_PREFIX} getSessions('${providerId}') failed: ${toErrorMessage(error)}`);
			return undefined;
		}
		if (exact.length > 0) {
			return exact[0].accessToken;
		}

		// Fall back to the narrowest session whose scopes are a superset of what we need.
		const all = await this._authenticationService.getSessions(providerId, undefined, undefined, true);
		const required = new Set(scopes);
		let best: { token: string; extra: number } | undefined;
		for (const session of all) {
			const granted = new Set(session.scopes);
			if ([...required].every(scope => granted.has(scope))) {
				const extra = granted.size - required.size;
				if (!best || extra < best.extra) {
					best = { token: session.accessToken, extra };
				}
			}
		}
		if (!best) {
			this._logService.warn(`${LOG_PREFIX} No '${providerId}' session with scopes [${scopes.join(', ')}]`);
		}
		return best?.token;
	}
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

/** Parse a `Retry-After` header (delta-seconds), or `undefined` when absent or unusable. */
function retryAfterSeconds(value: string | string[] | undefined): number | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw) {
		const seconds = Number.parseInt(raw, 10);
		if (Number.isFinite(seconds) && seconds > 0) {
			return seconds;
		}
	}
	return undefined;
}

/** Parse a `Retry-After` header (delta-seconds); fall back to a small default. */
function parseRetryAfter(value: string | string[] | undefined): number {
	return retryAfterSeconds(value) ?? DEFAULT_WAKING_RETRY_AFTER_SECONDS;
}

/**
 * How long to wait before re-issuing a rate-limited request: the server's `Retry-After` verbatim
 * when it names one, otherwise an exponential backoff of our own, capped. A server delay is never
 * shortened — the caller decides whether it still fits its budget, since retrying early only earns
 * another 429.
 */
function rateLimitDelay(retryAfter: string | string[] | undefined, attempt: number): number {
	const seconds = retryAfterSeconds(retryAfter);
	return seconds !== undefined
		? seconds * 1000
		: Math.min(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt), RATE_LIMIT_MAX_BACKOFF_MS);
}

/**
 * Whether a task is a cloud sandbox task: owned by {@link CLOUD_SANDBOX_AGENT_SLUG} and running on
 * the `sandboxes` compute provider. Reads list-level fields only.
 *
 * The slug half must be settled before `chat.agentHost.cloudSandbox.enabled` is turned on: sandbox
 * tasks are expected to move to a different slug, which would silently make discovery return
 * nothing. `compute.provider` is the durable test.
 */
function isCloudSandboxTask(task: ITaskSummary): boolean {
	const isCloudCodingAgent = task.agent_collaborators?.some(c => c.slug === CLOUD_SANDBOX_AGENT_SLUG) ?? false;
	return isCloudCodingAgent && task.compute?.provider === 'sandboxes';
}

/** Whether a `Link` header advertises another page (`rel="next"`). */
function hasNextLink(value: string | string[] | undefined): boolean {
	const raw = Array.isArray(value) ? value.join(',') : value;
	return raw ? /rel="?next"?/.test(raw) : false;
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
	for (const session of task.sessions ?? []) {
		if (session.environment_id && session.environment_id.length > 0 && session.id.length > 0) {
			return { environmentId: session.environment_id, sessionId: session.id };
		}
	}
	return undefined;
}
