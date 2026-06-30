/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import {
	AgentTask,
	AgentTaskArtifact,
	AgentTaskBranchResourceData,
	AgentTaskCreatePullRequestResponse,
	AgentTaskCreateRequest,
	AgentTaskGetResponse,
	AgentTaskGitHubResourceData,
	AgentTaskListEventsResponse,
	AgentTaskListResponse,
	AgentTaskSessionEvent,
	AgentTaskState,
	AgentTaskSteerRequest,
	RequestType,
} from '@vscode/copilot-api';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { SessionInfo } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { ICloudBackendInstrumentation } from './cloudBackendTelemetry';
import {
	ITaskApiClient,
	ListTaskEventsOptions,
	ListTasksOptions,
} from '../common/taskApiTypes';
import {
	CloudDelegationResult,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
	PullArtifactRef,
	TaskCloudAgentBackend,
	TaskContent,
} from '../vscode/cloudAgentBackend';
import { extractTitle, SessionIdForPr, SessionIdForTask } from '../vscode/copilotCodingAgentUtils';

const TASK_SESSION_POLL_INTERVAL_MS = 2_000;
const TASK_SESSION_POLL_TIMEOUT_MS = 60_000;

function mapTaskStateToSessionState(state: AgentTaskState): SessionInfo['state'] {
	switch (state) {
		case 'queued':
			return 'queued';
		case 'in_progress':
		case 'idle':
		case 'waiting_for_user':
			return 'in_progress';
		case 'completed':
			return 'completed';
		case 'failed':
		case 'timed_out':
		case 'cancelled':
			return 'failed';
	}
}

/**
 * Agent integration slugs that identify the Copilot cloud coding agent. CMC/CAPI returns
 * `copilot-developer`; the monolith uses `copilot-swe-agent` for the same agent. Tasks owned by
 * any other surface — `copilot-developer-cli` (Copilot CLI), `vscode-chat` (VS Code) or
 * `jetbrains-chat` (JetBrains) — are local clients mirrored into Mission Control and must not
 * appear in the cloud sessions list. See github-ui `agent-helpers.ts` (`isCopilotCodingAgent`) and
 * `agent-profile.ts`.
 */
const CLOUD_CODING_AGENT_SLUGS: ReadonlySet<string> = new Set(['copilot-developer', 'copilot-swe-agent']);

/**
 * The owning agent integration of a task. Mirrors CMC's internal `TaskCollaborator`
 * (`agent_collaborators`), which first-party CAPI tokens receive but `@vscode/copilot-api`'s
 * `AgentTask` does not yet model. Only `slug` is needed to identify the client surface.
 */
interface TaskAgentCollaborator {
	readonly slug?: string;
}

/**
 * Whether a task is owned by the Copilot cloud coding agent rather than a local client surface
 * (Copilot CLI / VS Code / JetBrains). The owning surface is identified by the agent integration
 * slug on the task's `agent_collaborators`; tasks without a recognized cloud slug are treated as
 * non-cloud and excluded from the cloud sessions list.
 */
export function isCloudCodingAgentTask(task: AgentTask): boolean {
	const collaborators = (task as AgentTask & { readonly agent_collaborators?: readonly TaskAgentCollaborator[] }).agent_collaborators;
	return collaborators?.some(c => typeof c.slug === 'string' && CLOUD_CODING_AGENT_SLUGS.has(c.slug)) ?? false;
}

function findPullArtifact(task: AgentTask): (AgentTaskArtifact & { data: AgentTaskGitHubResourceData }) | undefined {
	return task.artifacts?.find(
		(a): a is AgentTaskArtifact & { data: AgentTaskGitHubResourceData } =>
			a.provider === 'github'
			&& a.type === 'github_resource'
			&& (a.data as AgentTaskGitHubResourceData).type === 'pull',
	);
}

function findBranchArtifact(task: AgentTask): (AgentTaskArtifact & { data: AgentTaskBranchResourceData }) | undefined {
	return task.artifacts?.find(
		(a): a is AgentTaskArtifact & { data: AgentTaskBranchResourceData } =>
			a.provider === 'github'
			&& a.type === 'branch'
			&& typeof (a.data as AgentTaskBranchResourceData).head_ref === 'string',
	);
}

/** Convert a Task into the SessionInfo shape the existing UI layer expects. */
function taskToSessionInfo(task: AgentTask): SessionInfo {
	return {
		id: task.id,
		name: task.name ?? '',
		user_id: task.creator?.id ?? 0,
		agent_id: 0,
		logs: '',
		logs_blob_id: '',
		state: mapTaskStateToSessionState(task.state),
		owner_id: task.owner?.id ?? 0,
		repo_id: task.repository?.id ?? 0,
		resource_type: 'task',
		resource_id: 0,
		last_updated_at: task.updated_at ?? task.created_at,
		created_at: task.created_at,
		completed_at: task.state === 'completed' ? (task.updated_at ?? task.created_at) : '',
		event_type: 'task',
		workflow_run_id: 0,
		premium_requests: 0,
		error: task.state === 'failed' ? 'Task failed' : null,
		resource_global_id: '',
	};
}

/**
 * Parse `task.html_url` (e.g. `https://github.com/<owner>/<repo>/agents/tasks/<id>`) to
 * recover the repo identity. The Task API wire shape only carries `task.repository.id`, so
 * when the caller doesn't already know the repo (e.g. the global `listTasks` path) this is
 * how we keep `PullArtifactRef.repo.owner/name` populated for resolver fallbacks. Also
 * exported so the provider can derive `{owner, repo}` for the "Create pull request"
 * toolbar action on PR-less tasks.
 */
export function parseRepoFromTaskUrl(htmlUrl: string | undefined): { owner: string; name: string } | undefined {
	if (!htmlUrl) {
		return undefined;
	}
	try {
		const { pathname } = new URL(htmlUrl);
		const match = pathname.match(/^\/([^/]+)\/([^/]+)\//);
		if (match) {
			return { owner: match[1], name: match[2] };
		}
	} catch {
		// not a parseable URL
	}
	return undefined;
}

/**
 * Build a raw {@link PullArtifactRef} for a task that has a `pull` artifact. The provider
 * resolves this to a full `PullRequestSearchItem` lazily (`resolvePullArtifact`); the
 * backend itself stays agnostic of GraphQL / PR identity lookups.
 *
 * Returns undefined for PR-less tasks (which are first-class in the Task API).
 */
function taskToPullArtifactRef(
	task: AgentTask,
	repoIdentity: { owner: string; name: string } | undefined,
): PullArtifactRef | undefined {
	const pullArtifact = findPullArtifact(task);
	if (!pullArtifact) {
		return undefined;
	}
	const repo = repoIdentity ?? parseRepoFromTaskUrl(task.html_url);
	return {
		repo: {
			owner: repo?.owner ?? '',
			name: repo?.name ?? '',
		},
		globalId: pullArtifact.data.global_id,
		databaseId: pullArtifact.data.id,
		headRef: findBranchArtifact(task)?.data.head_ref,
	};
}

/**
 * Branch-comparison refs for a settled, PR-less task that pushed a branch. Returns undefined
 * for in-progress/queued tasks, tasks that already have a pull artifact (changes come from the
 * PR), tasks without a branch artifact, or when the repo identity can't be resolved. The
 * provider uses these to fetch the changed files for the session's changed-files toolbar.
 */
function taskToDiffRefs(
	task: AgentTask,
	repoIdentity: { owner: string; name: string } | undefined,
): { owner: string; repo: string; baseRef: string; headRef: string } | undefined {
	if (task.state === 'queued' || task.state === 'in_progress') {
		return undefined;
	}
	if (findPullArtifact(task)) {
		return undefined;
	}
	const branch = findBranchArtifact(task);
	if (!branch) {
		return undefined;
	}
	const repo = repoIdentity ?? parseRepoFromTaskUrl(task.html_url);
	if (!repo) {
		return undefined;
	}
	return { owner: repo.owner, repo: repo.name, baseRef: branch.data.base_ref, headRef: branch.data.head_ref };
}

/**
 * Cloud agent backend backed by Mission Control's Task API (v2). Selected via the
 * `github.copilot.chat.cloudAgentBackend.version` setting set to `v2`. HTTP requests
 * route through {@link TaskApiHttpClient} below, which uses `ICAPIClientService` for
 * GHE-aware URL construction and auth.
 */
export class TaskApiBackend implements TaskCloudAgentBackend {

	readonly kind = 'task' as const;

	constructor(
		private readonly _taskApiClient: ITaskApiClient,
		private readonly _logService: ILogService,
		private readonly _octoKitService: IOctoKitService,
		private readonly _instrumentation: ICloudBackendInstrumentation,
	) { }

	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined {
		const taskParsed = SessionIdForTask.parse(resource);
		if (taskParsed) {
			return { type: 'task', taskId: taskParsed.taskId };
		}
		// Fall back to PR parsing for backward compat with sessions created under v1.
		const prParsed = SessionIdForPr.parse(resource);
		const prNumber = prParsed?.prNumber ?? SessionIdForPr.parsePullRequestNumber(resource);
		if (prParsed || prNumber) {
			return { type: 'pr', prNumber, sessionIndex: prParsed?.sessionIndex };
		}
		return undefined;
	}

	async createSession(params: CreateCloudSessionParams, _stream: vscode.ChatResponseStream, _token: vscode.CancellationToken): Promise<CloudDelegationResult> {
		const request: AgentTaskCreateRequest = {
			prompt: params.prompt,
			event_content: params.prompt,
			problem_statement: params.problemStatement,
			base_ref: params.baseRef,
			// v2 default: don't auto-create a PR. The provider surfaces a "Create pull
			// request" toolbar action in the chat input when the task completes without an
			// attached pull artifact, so the user can opt in. See
			// `CopilotCloudSessionsProvider.handleCreatePullRequestForTaskCommand`.
			create_pull_request: false,
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
			...(params.headRef && { head_ref: params.headRef }),
			...(params.customAgent && { custom_agent: params.customAgent }),
			...(params.model && { model: params.model }),
			...(params.partnerAgentId !== undefined && { agent_id: params.partnerAgentId }),
		};

		const createStart = Date.now();
		let task: AgentTask;
		try {
			task = await this._taskApiClient.createTask(params.owner, params.repo, request);
		} catch (e) {
			this._instrumentation.sessionCreated('failure', Date.now() - createStart, e);
			throw e;
		}
		this._instrumentation.sessionCreated('success', Date.now() - createStart);

		// Return immediately. The pull artifact (if any) may not exist yet; the provider
		// resolves it asynchronously via `resolvePullArtifactWithRetry` so creation isn't
		// gated on PR materialization. PR-less tasks are first-class in the Task API.
		return {
			kind: 'task',
			taskId: task.id,
			taskUrl: task.html_url ?? '',
			title: task.name ?? extractTitle(params.prompt, params.problemStatement) ?? params.title ?? 'Copilot task',
			sessionId: task.id,
			pullArtifact: taskToPullArtifactRef(task, { owner: params.owner, name: params.repo }),
		};
	}

	async fetchSessionList(repoIds: GithubRepoId[] | undefined, _isAgentWorkspace: boolean, _refresh: boolean): Promise<CloudSessionData[]> {
		const listOpts: ListTasksOptions = { per_page: 100 };
		const tasksWithRepo: { task: AgentTask; repo: { owner: string; name: string } | undefined }[] = [];

		if (!repoIds || repoIds.length === 0) {
			// The global `agents/tasks` endpoint is already scoped to the authenticated user, so
			// no creator filter is needed here.
			const response = await this._taskApiClient.listTasks(listOpts);
			for (const task of response.tasks) {
				tasksWithRepo.push({ task, repo: undefined });
			}
		} else {
			// The repo-scoped endpoint returns every collaborator's tasks by default. Scope it to
			// the current user's own tasks via `creator_id`, matching the github.com/copilot/agents
			// repo page. Fail closed: if the user id can't be resolved we skip the repo fetch and
			// return no tasks rather than reverting to the unscoped list, which would expose other
			// collaborators' tasks during transient auth/API failures.
			const creatorId = await this._resolveCurrentUserId();
			if (creatorId === undefined) {
				this._logService.warn('Skipping repo-scoped cloud task list because the current user id could not be resolved; returning no sessions to avoid exposing other users\' tasks.');
				return [];
			}
			const repoListOpts: ListTasksOptions = { ...listOpts, creator_id: creatorId };
			const responses = await Promise.all(
				repoIds.map(async repo => {
					try {
						const r = await this._taskApiClient.listTasksForRepo(repo.org, repo.repo, repoListOpts);
						return { repo: { owner: repo.org, name: repo.repo }, response: r };
					} catch (e: unknown) {
						this._logService.warn(`Failed to fetch tasks for ${repo.org}/${repo.repo}: ${e}`);
						this._instrumentation.operationFailed('fetchSessionList', e);
						return { repo: { owner: repo.org, name: repo.repo }, response: { tasks: [] as readonly AgentTask[] } satisfies AgentTaskListResponse };
					}
				}),
			);
			for (const { repo, response } of responses) {
				for (const task of response.tasks) {
					tasksWithRepo.push({ task, repo });
				}
			}
		}

		return tasksWithRepo
			.filter(({ task }) => !task.archived_at && isCloudCodingAgentTask(task))
			.map(({ task, repo }): CloudSessionData => ({
				latestSession: taskToSessionInfo(task),
				pullArtifact: taskToPullArtifactRef(task, repo),
				diffRefs: taskToDiffRefs(task, repo),
				taskState: task.state,
			}));
	}

	/**
	 * Resolve the authenticated user's numeric GitHub id for the repo task `creator_id` filter.
	 * Returns undefined (and logs) on failure; callers fail closed rather than listing unscoped.
	 */
	private async _resolveCurrentUserId(): Promise<number | undefined> {
		try {
			const user = await this._octoKitService.getCurrentAuthedUser();
			return user?.id;
		} catch (e: unknown) {
			this._logService.warn(`Failed to resolve current user id for task creator filter: ${e}`);
			return undefined;
		}
	}

	async fetchTaskContent(taskId: string): Promise<TaskContent | undefined> {
		try {
			const task = await this._taskApiClient.getTask(taskId);
			return {
				task,
				turns: [],
				pullArtifact: taskToPullArtifactRef(task, undefined),
			};
		} catch (e) {
			this._logService.warn(`Failed to fetch task ${taskId}: ${e}`);
			this._instrumentation.operationFailed('fetchContent', e);
			return undefined;
		}
	}

	async fetchTaskEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]> {
		const perPage = 100;
		const events: AgentTaskSessionEvent[] = [];
		try {
			for (let page = 1; ; page++) {
				const response = await this._taskApiClient.getTaskEvents(taskId, { per_page: perPage, page });
				const batch = response.events;
				events.push(...batch);
				if (batch.length === 0 || batch.length < perPage || (typeof response.total === 'number' && events.length >= response.total)) {
					break;
				}
			}
			return events;
		} catch (e) {
			this._logService.warn(`Failed to fetch events for task ${taskId}: ${e}`);
			this._instrumentation.operationFailed('fetchEvents', e);
			return events;
		}
	}

	async waitForTaskUpdate(taskId: string, since: { turnCount: number; updatedAt?: string }, token?: vscode.CancellationToken): Promise<TaskContent | undefined> {
		const startTime = Date.now();
		while (Date.now() - startTime < TASK_SESSION_POLL_TIMEOUT_MS && !(token?.isCancellationRequested)) {
			try {
				const task = await this._taskApiClient.getTask(taskId);
				const turnCount = task.sessions?.length ?? 0;
				// Fire when any observable changed: a new turn was added, the task's
				// `updated_at` advanced (covers in-place state transitions), or the latest
				// turn left the in-progress/queued region.
				const updatedAtChanged = since.updatedAt && task.updated_at && task.updated_at !== since.updatedAt;
				const latestTurnState = task.sessions?.[turnCount - 1]?.state;
				const latestTurnSettled = latestTurnState && latestTurnState !== 'in_progress' && latestTurnState !== 'queued' && latestTurnState !== 'idle' && latestTurnState !== 'waiting_for_user';
				if (turnCount > since.turnCount || updatedAtChanged || latestTurnSettled) {
					// First turn appearing (baseline had none) is the v2 "session activated" signal —
					// the task has started producing output. Mirrors v1's PR-ready activation.
					if (since.turnCount === 0 && turnCount >= 1) {
						const createdAtMs = task.created_at ? Date.parse(task.created_at) : NaN;
						this._instrumentation.sessionActivated(Number.isNaN(createdAtMs) ? 0 : Math.max(0, Date.now() - createdAtMs));
					}
					return {
						task,
						turns: [],
						pullArtifact: taskToPullArtifactRef(task, undefined),
					};
				}
			} catch (e) {
				this._logService.warn(`Failed to poll task ${taskId}: ${e}`);
				this._instrumentation.operationFailed('pollUpdate', e);
			}
			await new Promise(resolve => setTimeout(resolve, TASK_SESSION_POLL_INTERVAL_MS));
		}
		return undefined;
	}

	async sendFollowUpToTask(taskId: string, prompt: string): Promise<FollowUpResult | undefined> {
		try {
			await this._taskApiClient.steerTask(taskId, { content: prompt, type: 'user_message' });
			this._instrumentation.followUp('success');
			return {};
		} catch (e) {
			this._logService.error(`Failed to steer task ${taskId}: ${e}`);
			this._instrumentation.followUp('failure', e);
			return undefined;
		}
	}

	async findTaskIdForPullRequest(owner: string, repo: string, prNumber: number): Promise<string | undefined> {
		try {
			const response = await this._taskApiClient.listTasksForRepo(owner, repo, {
				artifact_type: 'pull',
				artifact_id: prNumber,
				sort: 'created_at',
				direction: 'desc',
				per_page: 1,
			});
			return response.tasks[0]?.id;
		} catch (e) {
			this._logService.warn(`Failed to find task for ${owner}/${repo}#${prNumber}: ${e}`);
			this._instrumentation.operationFailed('findTaskForPullRequest', e);
			return undefined;
		}
	}

	async createPullRequestForTask(task: AgentTaskGetResponse): Promise<AgentTaskCreatePullRequestResponse> {
		const repo = await this._resolveRepoForTask(task);
		if (!repo) {
			throw new Error(l10n.t('Unable to determine the repository for this task.'));
		}
		try {
			return await this._taskApiClient.createPRForTask(repo.owner, repo.name, task.id);
		} catch (e) {
			this._instrumentation.operationFailed('createPullRequest', e);
			throw e;
		}
	}

	/**
	 * Resolve `{owner, name}` for a task. Primary source is the task's `html_url`; when that is
	 * absent the Task API only exposes the numeric `repository.id`, which we resolve to a
	 * name-with-owner via the GitHub REST repositories-by-id endpoint.
	 */
	private async _resolveRepoForTask(task: AgentTaskGetResponse): Promise<{ owner: string; name: string } | undefined> {
		const fromUrl = parseRepoFromTaskUrl(task.html_url);
		if (fromUrl) {
			return fromUrl;
		}
		const repoId = (task.repository as { id?: number } | undefined)?.id;
		if (typeof repoId === 'number') {
			const resolved = await this._octoKitService.getRepositoryById(repoId, { createIfNone: { detail: l10n.t('Sign in to GitHub to create a pull request.') } });
			if (resolved) {
				return resolved;
			}
			this._logService.warn(`Could not resolve repository ${repoId} for task ${task.id}.`);
		}
		return undefined;
	}
}

/**
 * Error thrown by {@link TaskApiHttpClient} for non-2xx Task API responses. Carries the HTTP
 * `status` so backend catch sites can surface it to telemetry (the per-backend-version guardrail dimension).
 */
export class TaskApiError extends Error {
	constructor(message: string, readonly status: number, readonly action: string) {
		super(message);
		this.name = 'TaskApiError';
	}
}

/**
 * Real HTTP client for the Mission Control Task API, routing every call through
 * `ICAPIClientService.makeRequest({...}, { type: RequestType.AgentTask, ... })`.
 * The CAPI client maps the `action` discriminator to a URL under `api.github.com/agents/...`
 * (GHE-aware via the shared `dotcomAPIURL`). Auth is the same permissive GitHub
 * session used by `IOctoKitService` for Jobs API calls.
 */
export class TaskApiHttpClient implements ITaskApiClient {

	private static readonly SIGN_IN_DETAIL = l10n.t('Sign in to GitHub to use the Cloud Agent (Task API).');

	constructor(
		private readonly _capiClientService: ICAPIClientService,
		private readonly _authService: IAuthenticationService,
		private readonly _logService: ILogService,
	) { }

	private async _authHeaders(): Promise<Record<string, string>> {
		const session = await this._authService.getGitHubSession('permissive', { silent: true })
			?? await this._authService.getGitHubSession('permissive', { createIfNone: { detail: TaskApiHttpClient.SIGN_IN_DETAIL } });
		const token = session?.accessToken;
		if (!token) {
			throw new Error(l10n.t('Sign in to GitHub to use the Cloud Agent.'));
		}
		return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
	}

	private async _request<T>(
		method: 'GET' | 'POST',
		action: AgentTaskRequestAction,
		opts: { owner?: string; repo?: string; taskId?: string; body?: unknown; searchParams?: Record<string, string | number | boolean> },
	): Promise<T | undefined> {
		const headers = await this._authHeaders();
		const init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string } = { method, headers };
		if (opts.body !== undefined) {
			init.headers['Content-Type'] = 'application/json';
			init.body = JSON.stringify(opts.body);
		}
		const response = await this._capiClientService.makeRequest<Response>(init, {
			type: RequestType.AgentTask,
			action,
			...(opts.owner !== undefined && { owner: opts.owner }),
			...(opts.repo !== undefined && { repo: opts.repo }),
			...(opts.taskId !== undefined && { taskId: opts.taskId }),
			...(opts.searchParams && { searchParams: opts.searchParams }),
		});
		if (!response.ok) {
			let body = '';
			try { body = await response.text(); } catch { /* ignore */ }
			this._logService.warn(`Task API ${action} failed: ${response.status} ${response.statusText} (owner=${opts.owner ?? 'n/a'}, repo=${opts.repo ?? 'n/a'}, taskId=${opts.taskId ?? 'n/a'}); body=${body.slice(0, 200)}`);
			throw new TaskApiError(l10n.t('Task API request failed: {0} {1}', response.status, response.statusText), response.status, action);
		}
		if (response.status === 204 || response.status === 202) {
			return undefined;
		}
		return await response.json() as T;
	}

	async createTask(owner: string, repo: string, request: AgentTaskCreateRequest): Promise<AgentTask> {
		const task = await this._request<AgentTask>('POST', 'create', { owner, repo, body: request });
		if (!task) {
			throw new Error(l10n.t('Task API createTask returned an empty response.'));
		}
		return task;
	}

	async listTasksForRepo(owner: string, repo: string, options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		const response = await this._request<AgentTaskListResponse>('GET', 'list-for-repo', {
			owner, repo, searchParams: toSearchParams(options),
		});
		return response ?? { tasks: [] };
	}

	async listTasks(options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		const response = await this._request<AgentTaskListResponse>('GET', 'list', { searchParams: toSearchParams(options) });
		return response ?? { tasks: [] };
	}

	async getTask(taskId: string): Promise<AgentTaskGetResponse> {
		const task = await this._request<AgentTaskGetResponse>('GET', 'get', { taskId });
		if (!task) {
			throw new Error(l10n.t('Task API getTask returned an empty response.'));
		}
		return task;
	}

	async getTaskEvents(taskId: string, options?: ListTaskEventsOptions): Promise<AgentTaskListEventsResponse> {
		const response = await this._request<AgentTaskListEventsResponse>('GET', 'events', {
			taskId, searchParams: toSearchParams(options),
		});
		return response ?? { events: [], total: 0 };
	}

	async steerTask(taskId: string, request: AgentTaskSteerRequest): Promise<void> {
		await this._request<void>('POST', 'steer', { taskId, body: request });
	}

	async createPRForTask(owner: string, repo: string, taskId: string): Promise<AgentTaskCreatePullRequestResponse> {
		const result = await this._request<AgentTaskCreatePullRequestResponse>('POST', 'create-pr', { owner, repo, taskId });
		if (!result) {
			throw new Error(l10n.t('Task API createPRForTask returned an empty response.'));
		}
		return result;
	}

	async archiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		const task = await this._request<AgentTask>('POST', 'archive', { taskId });
		if (!task) {
			throw new Error(l10n.t('Task API archiveTask returned an empty response.'));
		}
		return task;
	}

	async unarchiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		const task = await this._request<AgentTask>('POST', 'unarchive', { taskId });
		if (!task) {
			throw new Error(l10n.t('Task API unarchiveTask returned an empty response.'));
		}
		return task;
	}
}

type AgentTaskRequestAction = 'create' | 'list' | 'list-for-repo' | 'get' | 'events' | 'steer' | 'create-pr' | 'archive' | 'unarchive';

function toSearchParams(opts: ListTasksOptions | ListTaskEventsOptions | undefined): Record<string, string | number | boolean> | undefined {
	if (!opts) {
		return undefined;
	}
	const result: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(opts)) {
		if (value !== undefined && value !== null) {
			result[key] = value as string | number | boolean;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
