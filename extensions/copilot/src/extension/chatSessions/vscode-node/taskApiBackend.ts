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
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { ILogService } from '../../../platform/log/common/logService';
import {
	ITaskApiClient,
	ListTaskEventsOptions,
	ListTasksOptions,
} from '../common/taskApiTypes';
import {
	CloudAgentBackend,
	CloudDelegationResult,
	CloudSessionContent,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
	PullArtifactRef,
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

function findPullArtifact(task: AgentTask): (AgentTaskArtifact & { data: AgentTaskGitHubResourceData }) | undefined {
	return task.artifacts?.find(
		(a): a is AgentTaskArtifact & { data: AgentTaskGitHubResourceData } =>
			a.provider === 'github'
			&& a.type === 'pull'
			&& typeof (a.data as AgentTaskGitHubResourceData).id === 'number',
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
	return {
		repo: {
			owner: repoIdentity?.owner ?? '',
			name: repoIdentity?.name ?? '',
		},
		globalId: pullArtifact.data.global_id,
		databaseId: pullArtifact.data.id,
		headRef: findBranchArtifact(task)?.data.head_ref,
	};
}

/**
 * Cloud agent backend backed by Mission Control's Task API.
 *
 * The shape of this class is reviewed and integrated against `CopilotCloudSessionsProvider`
 * today; the actual HTTP wire is not yet available — every call to {@link ITaskApiClient}
 * currently routes to {@link StubTaskApiClient} which throws. A follow-up PR will provide
 * a real client implementation backed by `@vscode/copilot-api`.
 *
 * Selected via the `github.copilot.chat.cloudAgentBackend.version` setting set to `v2`.
 */
export class TaskApiBackend implements CloudAgentBackend {

	constructor(
		private readonly _taskApiClient: ITaskApiClient,
		private readonly _logService: ILogService,
	) { }

	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined {
		const taskParsed = SessionIdForTask.parse(resource);
		if (taskParsed) {
			return { type: 'task', taskId: taskParsed.taskId };
		}
		// Fall back to PR parsing for backward compat with sessions created under v1.
		const prParsed = SessionIdForPr.parse(resource);
		if (prParsed) {
			return { type: 'pr', prNumber: prParsed.prNumber, sessionIndex: prParsed.sessionIndex };
		}
		return undefined;
	}

	async createSession(params: CreateCloudSessionParams, _stream: vscode.ChatResponseStream, _token: vscode.CancellationToken): Promise<CloudDelegationResult> {
		const request: AgentTaskCreateRequest = {
			prompt: params.prompt,
			event_content: params.prompt,
			problem_statement: params.problemStatement,
			base_ref: params.baseRef,
			create_pull_request: true,
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
			...(params.headRef && { head_ref: params.headRef }),
			...(params.customAgent && { custom_agent: params.customAgent }),
			...(params.model && { model: params.model }),
			...(params.partnerAgentId !== undefined && { agent_id: params.partnerAgentId }),
		};

		const task = await this._taskApiClient.createTask(params.owner, params.repo, request);

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
			const response = await this._taskApiClient.listTasks(listOpts);
			for (const task of response.tasks) {
				tasksWithRepo.push({ task, repo: undefined });
			}
		} else {
			const responses = await Promise.all(
				repoIds.map(async repo => {
					try {
						const r = await this._taskApiClient.listTasksForRepo(repo.org, repo.repo, listOpts);
						return { repo: { owner: repo.org, name: repo.repo }, response: r };
					} catch (e: unknown) {
						this._logService.warn(`Failed to fetch tasks for ${repo.org}/${repo.repo}: ${e}`);
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
			.filter(({ task }) => !task.archived_at)
			.map(({ task, repo }): CloudSessionData => ({
				latestSession: taskToSessionInfo(task),
				pullArtifact: taskToPullArtifactRef(task, repo),
			}));
	}

	// ── PR-keyed methods are not supported by the Task backend ──────────────

	fetchPullRequestContent(_repoOwner: string, _repoName: string, _sessions: SessionInfo[]): Promise<CloudSessionContent> {
		throw new Error('TaskApiBackend does not support PR-keyed reads');
	}

	fetchSessionsForPullRequest(_pr: PullRequestSearchItem): Promise<SessionInfo[]> {
		throw new Error('TaskApiBackend does not support PR-keyed reads');
	}

	sendFollowUpToPullRequest(_prGlobalId: string, _prompt: string, _targetAgent?: string): Promise<FollowUpResult | undefined> {
		throw new Error('TaskApiBackend does not support PR-keyed reads');
	}

	getSessionInfo(_sessionId: string): Promise<SessionInfo | undefined> {
		throw new Error('TaskApiBackend does not support PR-keyed reads; use fetchTaskContent');
	}

	getSessionLogsSSE(_sessionId: string): Promise<string> {
		throw new Error('TaskApiBackend does not support PR-keyed reads; use fetchTaskEvents');
	}

	waitForSessionReady(_sessionId: string, _token?: vscode.CancellationToken): Promise<SessionInfo | undefined> {
		throw new Error('TaskApiBackend does not support PR-keyed reads; use waitForTaskTurn');
	}

	// ── Task-keyed methods ──────────────────────────────────────────────────

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
			return undefined;
		}
	}

	async fetchTaskEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]> {
		try {
			const response = await this._taskApiClient.getTaskEvents(taskId, { per_page: 100 });
			return response.events;
		} catch (e) {
			this._logService.warn(`Failed to fetch events for task ${taskId}: ${e}`);
			return [];
		}
	}

	async waitForTaskTurn(taskId: string, sinceTurnCount: number, token?: vscode.CancellationToken): Promise<TaskContent | undefined> {
		const startTime = Date.now();
		while (Date.now() - startTime < TASK_SESSION_POLL_TIMEOUT_MS && !(token?.isCancellationRequested)) {
			try {
				const task = await this._taskApiClient.getTask(taskId);
				const turnCount = task.sessions?.length ?? 0;
				if (turnCount > sinceTurnCount) {
					return {
						task,
						turns: [],
						pullArtifact: taskToPullArtifactRef(task, undefined),
					};
				}
			} catch (e) {
				this._logService.warn(`Failed to poll task ${taskId}: ${e}`);
			}
			await new Promise(resolve => setTimeout(resolve, TASK_SESSION_POLL_INTERVAL_MS));
		}
		return undefined;
	}

	async sendFollowUpToTask(taskId: string, prompt: string): Promise<FollowUpResult | undefined> {
		try {
			await this._taskApiClient.steerTask(taskId, { content: prompt, type: 'user_message' });
			return {};
		} catch (e) {
			this._logService.error(`Failed to steer task ${taskId}: ${e}`);
			return undefined;
		}
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
			throw new Error(l10n.t('Task API request failed: {0} {1}', response.status, response.statusText));
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
