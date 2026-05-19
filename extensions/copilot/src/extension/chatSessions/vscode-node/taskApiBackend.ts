/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { ILogService } from '../../../platform/log/common/logService';
import {
	CreatePullRequestForTaskResponse,
	CreateTaskRequest,
	ITaskApiClient,
	ListTaskEventsResponse,
	ListTasksOptions,
	ListTasksResponse,
	SteerTaskRequest,
	Task,
	TaskArtifact,
	TaskArtifactPullData,
	TaskState,
} from '../common/taskApiTypes';
import {
	CloudAgentBackend,
	CloudDelegationResult,
	CloudSessionContent,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
} from '../vscode/cloudAgentBackend';
import { extractTitle, SessionIdForPr, SessionIdForTask } from '../vscode/copilotCodingAgentUtils';

const TASK_SESSION_POLL_INTERVAL_MS = 2_000;
const TASK_SESSION_POLL_TIMEOUT_MS = 60_000;

function mapTaskStateToSessionState(state: TaskState): SessionInfo['state'] {
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

function findPullArtifact(task: Task): (TaskArtifact & { data: TaskArtifactPullData }) | undefined {
	return task.artifacts?.find(
		(a): a is TaskArtifact & { data: TaskArtifactPullData } =>
			a.type === 'pull' && typeof (a.data as TaskArtifactPullData).id === 'number',
	);
}

/** Convert a Task into the SessionInfo shape the existing UI layer expects. */
function taskToSessionInfo(task: Task): SessionInfo {
	return {
		id: task.id,
		name: task.name ?? '',
		user_id: task.creator?.id ?? 0,
		agent_id: 0,
		logs: '',
		logs_blob_id: '',
		state: mapTaskStateToSessionState(task.state),
		owner_id: task.repository?.owner?.id ?? 0,
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

/** Synthesize a PullRequestSearchItem from a task that has a PR artifact attached. */
function taskToPullRequest(task: Task, pullArtifact: TaskArtifact & { data: TaskArtifactPullData }): PullRequestSearchItem {
	return {
		id: String(pullArtifact.data.global_id ?? pullArtifact.data.id),
		number: pullArtifact.data.id,
		title: task.name ?? '',
		state: 'OPEN',
		url: pullArtifact.data.html_url ?? task.html_url ?? '',
		createdAt: task.created_at,
		updatedAt: task.updated_at ?? task.created_at,
		author: task.creator ? { login: task.creator.login ?? '' } : null,
		repository: {
			owner: { login: task.repository?.owner?.login ?? '' },
			name: task.repository?.name ?? '',
		},
		additions: 0,
		deletions: 0,
		files: { totalCount: 0 },
		fullDatabaseId: pullArtifact.data.id,
		headRefOid: '',
		body: '',
	} as PullRequestSearchItem;
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
		const request: CreateTaskRequest = {
			prompt: params.prompt,
			event_content: params.prompt,
			problem_statement: params.problemStatement,
			base_ref: params.baseRef,
			create_pull_request: true, // MVP — keeps PR-based UI working during transition
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
			...(params.headRef && { head_ref: params.headRef }),
			...(params.customAgent && { custom_agent: params.customAgent }),
			...(params.model && { model: params.model }),
			...(params.partnerAgentId !== undefined && { agent_id: params.partnerAgentId }),
		};

		const task = await this._taskApiClient.createTask(params.owner, params.repo, request);

		// A task may already have a PR artifact attached on creation (unlikely but possible).
		const pullArtifact = findPullArtifact(task);
		if (pullArtifact) {
			return {
				kind: 'pullRequest',
				prNumber: pullArtifact.data.id,
				sessionId: task.id,
			};
		}

		return {
			kind: 'task',
			taskId: task.id,
			taskUrl: task.html_url ?? '',
			title: task.name ?? extractTitle(params.prompt, params.problemStatement) ?? params.title ?? 'Copilot task',
			sessionId: task.id,
		};
	}

	async fetchSessionList(repoIds: GithubRepoId[] | undefined, _isAgentWorkspace: boolean, _refresh: boolean): Promise<CloudSessionData[]> {
		const allTasks: Task[] = [];
		const listOpts: ListTasksOptions = { per_page: 100 };

		if (!repoIds || repoIds.length === 0) {
			const response = await this._taskApiClient.listTasks(listOpts);
			allTasks.push(...response.tasks);
		} else {
			const responses = await Promise.all(
				repoIds.map(repo => this._taskApiClient.listTasksForRepo(repo.org, repo.repo, listOpts)
					.catch((e: unknown) => {
						this._logService.warn(`Failed to fetch tasks for ${repo.org}/${repo.repo}: ${e}`);
						return { tasks: [] as readonly Task[] } satisfies ListTasksResponse;
					}),
				),
			);
			for (const response of responses) {
				allTasks.push(...response.tasks);
			}
		}

		const activeTasks = allTasks.filter(t => !t.archived_at);

		return activeTasks.map(task => {
			const pullArtifact = findPullArtifact(task);
			const data: CloudSessionData = {
				latestSession: taskToSessionInfo(task),
				...(pullArtifact && { pullRequest: taskToPullRequest(task, pullArtifact) }),
			};
			return data;
		});
	}

	async fetchSessionContent(_repoOwner: string, _repoName: string, sessions: SessionInfo[]): Promise<CloudSessionContent> {
		if (sessions.length === 0) {
			return {};
		}
		const taskId = sessions[0].id;
		try {
			const response = await this._taskApiClient.getTaskEvents(taskId, { per_page: 100 });
			const firstUserMessage = response.events.find(e => e.type === 'user.message');
			const content = firstUserMessage?.data['content'];
			return { initialPrompt: typeof content === 'string' ? content : undefined };
		} catch (e) {
			this._logService.warn(`Failed to fetch events for task ${taskId}: ${e}`);
			return {};
		}
	}

	async sendFollowUp(pullRequestOrTaskId: string, prompt: string, _targetAgent?: string): Promise<FollowUpResult | undefined> {
		try {
			await this._taskApiClient.steerTask(pullRequestOrTaskId, { content: prompt, type: 'user_message' });
			return {};
		} catch (e) {
			this._logService.error(`Failed to steer task ${pullRequestOrTaskId}: ${e}`);
			return undefined;
		}
	}

	async getSessionInfo(sessionId: string): Promise<SessionInfo | undefined> {
		try {
			const task = await this._taskApiClient.getTask(sessionId);
			return taskToSessionInfo(task);
		} catch (e) {
			this._logService.warn(`Failed to fetch task ${sessionId}: ${e}`);
			return undefined;
		}
	}

	async getSessionLogs(sessionId: string): Promise<string> {
		try {
			const response = await this._taskApiClient.getTaskEvents(sessionId, { per_page: 100 });
			return JSON.stringify(response.events, undefined, 2);
		} catch (e) {
			this._logService.warn(`Failed to fetch events for task ${sessionId}: ${e}`);
			return '';
		}
	}

	async waitForSessionReady(sessionId: string, token?: vscode.CancellationToken): Promise<SessionInfo | undefined> {
		const startTime = Date.now();
		while (Date.now() - startTime < TASK_SESSION_POLL_TIMEOUT_MS && !(token?.isCancellationRequested)) {
			try {
				const task = await this._taskApiClient.getTask(sessionId);
				const state = task.state;
				if (state === 'in_progress' || state === 'completed' || state === 'failed'
					|| state === 'timed_out' || state === 'cancelled') {
					return taskToSessionInfo(task);
				}
			} catch (e) {
				this._logService.warn(`Failed to poll task ${sessionId}: ${e}`);
			}
			await new Promise(resolve => setTimeout(resolve, TASK_SESSION_POLL_INTERVAL_MS));
		}
		return undefined;
	}
}

/**
 * Placeholder {@link ITaskApiClient} used until CAPI routing for the Task API is
 * available. Every method throws a localized "not yet wired" error so the
 * orchestration in {@link TaskApiBackend} is exercised end-to-end (and reviewed
 * in this PR) without needing a live wire.
 */
export class StubTaskApiClient implements ITaskApiClient {

	constructor(private readonly _logService: ILogService) { }

	private notWired(method: string): never {
		const msg = vscode.l10n.t('Task API client method `{0}` is not yet wired \u2014 awaiting CAPI routing.', method);
		this._logService.error(`StubTaskApiClient.${method}: ${msg}`);
		throw new Error(msg);
	}

	createTask(_owner: string, _repo: string, _request: CreateTaskRequest): Promise<Task> {
		this.notWired('createTask');
	}

	listTasksForRepo(_owner: string, _repo: string, _options?: ListTasksOptions): Promise<ListTasksResponse> {
		this.notWired('listTasksForRepo');
	}

	listTasks(_options?: ListTasksOptions): Promise<ListTasksResponse> {
		this.notWired('listTasks');
	}

	getTask(_taskId: string): Promise<Task> {
		this.notWired('getTask');
	}

	getTaskEvents(_taskId: string, _options?: ListTasksOptions): Promise<ListTaskEventsResponse> {
		this.notWired('getTaskEvents');
	}

	steerTask(_taskId: string, _request: SteerTaskRequest): Promise<void> {
		this.notWired('steerTask');
	}

	createPRForTask(_owner: string, _repo: string, _taskId: string): Promise<CreatePullRequestForTaskResponse> {
		this.notWired('createPRForTask');
	}

	archiveTask(_owner: string, _repo: string, _taskId: string): Promise<Task> {
		this.notWired('archiveTask');
	}

	unarchiveTask(_owner: string, _repo: string, _taskId: string): Promise<Task> {
		this.notWired('unarchiveTask');
	}
}
