/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	CLOUD_SANDBOX_AGENT_SLUG,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxConnectResult,
	ICloudSandboxClientToken,
	ICloudSandboxConnectionRequest,
	ICloudSandboxCredentialsService,
	ICloudSandboxDiscoveredSession,
	ICloudSandboxDiscoveryResult,
	ICloudSandboxEnvironment,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from '../../../../../platform/agentHost/common/githubEndpoints.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { asText, IRequestService } from '../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';

/** The agent-environment endpoints Mission Control exposes. */
type CloudSandboxEnvironmentAction = 'get' | 'connect' | 'reconnect';

/** The subset of a Mission Control task the sandbox discovery path reads. */
interface ITaskSummary {
	readonly id: string;
	readonly name?: string;
	readonly html_url?: string;
	readonly archived_at?: string | null;
	readonly updated_at?: string;
	readonly agent_collaborators?: readonly { readonly slug?: string }[];
	readonly compute?: { readonly provider?: string };
}

/** A full task, which additionally carries the sessions bound to sandbox environments. */
interface ITaskDetail extends ITaskSummary {
	readonly sessions?: readonly { readonly id: string; readonly environment_id?: string }[];
}

const LOG_PREFIX = '[CloudSandboxCredentials]';

/** Per-request timeout (ms) for credential and environment calls. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Per-request timeout (ms) for discovery, whose task list is far larger than a credential mint. */
const DISCOVERY_TIMEOUT_MS = 30_000;

/** Default Retry-After (seconds) when a 202 "waking" response omits the header. */
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;

/** How many recent tasks to scan for sandbox sessions during discovery. */
const DISCOVERY_TASK_SCAN_LIMIT = 100;

/** Fallback scopes when the product does not configure `defaultChatAgent.providerScopes`. */
const FALLBACK_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'];

/**
 * Mission Control client for cloud sandbox sessions: mints (`connect`) and refreshes (`reconnect`)
 * Web PubSub credentials, reads an environment's status, and discovers sandbox-backed sessions.
 *
 * Runs in the renderer so the sandbox path works in VS Code Web, where no Copilot extension host is
 * available.
 */
export class CloudSandboxCredentialsService extends Disposable implements ICloudSandboxCredentialsService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
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
		return environment;
	}

	/**
	 * Enumerate sandbox-backed cloud sessions by scanning recent tasks and resolving each one's
	 * Mission Control environment binding.
	 *
	 * The result distinguishes a full scan from a partial or failed one: a caller that reconciles
	 * against this list would otherwise treat a transient request failure as "these sessions no
	 * longer exist" and tear down live providers.
	 */
	async listSessions(token: CancellationToken): Promise<ICloudSandboxDiscoveryResult> {
		let tasks: readonly ITaskSummary[];
		try {
			const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks?per_page=${DISCOVERY_TASK_SCAN_LIMIT}`, 'list', token);
			const response = await this._readJson<{ tasks?: readonly ITaskSummary[] }>(context);
			if (!response?.tasks) {
				return { kind: 'failed', reason: `listTasks returned no 'tasks' array` };
			}
			tasks = response.tasks;
		} catch (error) {
			return { kind: 'failed', reason: `listTasks failed: ${toErrorMessage(error)}` };
		}

		const sandboxTasks = tasks.filter(task => !task.archived_at && isCloudSandboxTask(task));
		let unresolved = 0;
		const discovered = await Promise.all(sandboxTasks.map(async (task): Promise<ICloudSandboxDiscoveredSession | undefined> => {
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
				const repo = parseRepoFromTaskUrl(full.html_url);
				return {
					environmentId: binding.environmentId,
					sessionId: binding.sessionId,
					name: full.name ?? task.name ?? `Sandbox ${task.id}`,
					repoName: repo ? `${repo.owner}/${repo.name}` : undefined,
					updatedAt: full.updated_at ?? task.updated_at,
				};
			} catch (error) {
				this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
				unresolved++;
				return undefined;
			}
		}));

		const sessions = discovered.filter((session): session is ICloudSandboxDiscoveredSession => session !== undefined);
		this._logService.info(`${LOG_PREFIX} Discovery found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${tasks.length} scanned${unresolved > 0 ? `; ${unresolved} unresolved` : ''}.`);
		return { kind: unresolved > 0 ? 'partial' : 'complete', sessions };
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
		return this._request(url, `mc.environmentClient.${action}`, {
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token);
	}

	/** Issue a task API request, throwing on a non-success status. */
	private async _sendTask(url: string, action: string, token: CancellationToken): Promise<IRequestContext> {
		const context = await this._request(url, `mc.taskClient.${action}`, {
			'Accept': 'application/json',
			'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
		}, token, DISCOVERY_TIMEOUT_MS);
		if (!isSuccess(context)) {
			await this._throwForStatus(`task ${action}`, context);
		}
		return context;
	}

	private async _request(url: string, callSite: string, headers: Record<string, string>, token: CancellationToken, timeout: number = REQUEST_TIMEOUT_MS): Promise<IRequestContext> {
		const accessToken = await this._resolveGitHubToken();
		if (!accessToken) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		try {
			return await this._requestService.request({
				type: 'GET',
				url,
				headers: { ...headers, ['Authorization']: `Bearer ${accessToken}` },
				timeout,
				callSite,
			}, token);
		} catch (error) {
			this._logService.error(`${LOG_PREFIX} GET ${url} failed: ${toErrorMessage(error)}`);
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

	/** Throw a diagnosable error for a non-success response, including the body when readable. */
	private async _throwForStatus(action: string, context: IRequestContext): Promise<never> {
		const body = await asText(context).catch(() => '');
		throw new Error(`Mission Control ${action} failed: HTTP ${context.res.statusCode ?? 'unknown'} - ${(body ?? '').slice(0, 200)}`);
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

/** Parse a `Retry-After` header (delta-seconds); fall back to a small default. */
function parseRetryAfter(value: string | string[] | undefined): number {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw) {
		const seconds = Number.parseInt(raw, 10);
		if (Number.isFinite(seconds) && seconds > 0) {
			return seconds;
		}
	}
	return DEFAULT_WAKING_RETRY_AFTER_SECONDS;
}

/**
 * Whether a task is a cloud sandbox task: owned by {@link CLOUD_SANDBOX_AGENT_SLUG} and running on
 * the `sandboxes` compute provider. Reads list-level fields only.
 */
function isCloudSandboxTask(task: ITaskSummary): boolean {
	const isCloudCodingAgent = task.agent_collaborators?.some(c => c.slug === CLOUD_SANDBOX_AGENT_SLUG) ?? false;
	return isCloudCodingAgent && task.compute?.provider === 'sandboxes';
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

/** The `owner/name` repository encoded in a task's `html_url`, when parseable. */
function parseRepoFromTaskUrl(htmlUrl: string | undefined): { owner: string; name: string } | undefined {
	if (!htmlUrl) {
		return undefined;
	}
	try {
		const match = new URL(htmlUrl).pathname.match(/^\/([^/]+)\/([^/]+)\//);
		if (match) {
			return { owner: match[1], name: match[2] };
		}
	} catch {
		// not a parseable URL
	}
	return undefined;
}
