/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { SessionInfo } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { extractTitle, truncatePrompt } from '../vscode/copilotCodingAgentUtils';
import { SessionIdForPr } from '../vscode/copilotCodingAgentUtils';
import { SessionIdForTask } from '../vscode/copilotCodingAgentUtils';
import {
	CloudAgentBackend,
	CloudDelegationResult,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
} from './cloudAgentBackend';
import {
	CreateTaskRequest,
	ITaskApiClient,
	Task,
	TaskArtifact,
	TaskArtifactPullData,
	TaskState,
} from './taskApiTypes';

const TASK_SESSION_POLL_INTERVAL_MS = 2_000;
const TASK_SESSION_POLL_TIMEOUT_MS = 60_000;

/**
 * Maps a Task API state to the SessionInfo state used by the existing UI layer.
 */
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

/**
 * Extracts the pull request artifact from a task's artifacts array, if present.
 */
function findPullArtifact(task: Task): (TaskArtifact & { data: TaskArtifactPullData }) | undefined {
	return task.artifacts?.find(
		(a): a is TaskArtifact & { data: TaskArtifactPullData } => a.type === 'pull'
	);
}

/**
 * Converts a Task to a minimal SessionInfo for the UI layer.
 * Fields that don't have a Task API equivalent use sensible defaults.
 */
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

/**
 * Task API backend — implements CloudAgentBackend using Mission Control's Task API.
 *
 * This is the "new" backend. When the feature flag is fully enabled,
 * create_pull_request defaults to false — PRs are created on demand
 * via the createPRForTask endpoint instead of automatically.
 *
 * Design principles:
 *  - Data-oriented: return raw data, not VS Code UI parts
 *  - Clean implementation against the Task API spec
 *  - Offset-based pagination (page/per_page), NOT E-Tag polling
 *
 * Pattern follows Mission Control's StrictTaskHandler: new implementation
 * sits alongside JobsApiBackend, selected by feature flag.
 */
export class TaskApiBackend implements CloudAgentBackend {

	constructor(
		private readonly _taskApiClient: ITaskApiClient,
		private readonly _octoKitService: IOctoKitService,
		private readonly _logService: ILogService,
	) {}

	async createSession(
		params: CreateCloudSessionParams,
		_token: vscode.CancellationToken,
	): Promise<CloudDelegationResult> {
		const { problemStatement } = truncatePrompt(
			this._logService,
			params.prompt,
			params.problemContext || undefined,
		);

		const request: CreateTaskRequest = {
			prompt: params.prompt,
			event_content: params.prompt,
			problem_statement: problemStatement,
			base_ref: params.baseRef,
			create_pull_request: false, // PR-less by default — PRs created on demand
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
		};

		if (params.headRef) {
			request.head_ref = params.headRef;
		}
		if (params.customAgent && params.customAgent !== 'default') {
			request.custom_agent = params.customAgent;
		}
		if (params.model && params.model !== 'default') {
			request.model = params.model;
		}
		if (params.partnerAgent) {
			const agentId = parseInt(params.partnerAgent, 10);
			if (!isNaN(agentId)) {
				request.agent_id = agentId;
			}
		}

		// Determine repo owner/name from selectedRepository or throw
		const repoParts = params.selectedRepository?.split('/');
		if (!repoParts || repoParts.length !== 2) {
			throw new Error('TaskApiBackend.createSession requires selectedRepository in "owner/repo" format');
		}
		const [owner, repo] = repoParts;

		const task = await this._taskApiClient.createTask(owner, repo, request);

		// Check if task already has a PR artifact (unlikely at creation, but possible)
		const pullArtifact = findPullArtifact(task);
		if (pullArtifact) {
			return {
				kind: 'pullRequest',
				prNumber: pullArtifact.data.id,
				sessionId: SessionIdForTask.getId(task.id),
			};
		}

		return {
			kind: 'task',
			taskId: task.id,
			taskUrl: task.html_url ?? '',
			title: task.name ?? extractTitle(params.prompt, params.problemContext) ?? 'Copilot task',
		};
	}

	async fetchSessionList(
		repoIds: GithubRepoId[],
		_isAgentWorkspace: boolean,
	): Promise<CloudSessionData[]> {
		const allTasks: Task[] = [];

		if (!repoIds || repoIds.length === 0) {
			// Fetch all tasks for the authenticated user
			const response = await this._taskApiClient.listTasks({ per_page: 100 });
			allTasks.push(...response.tasks);
		} else {
			const taskResponses = await Promise.all(
				repoIds.map(repo =>
					this._taskApiClient.listTasksForRepo(repo.org, repo.repo, { per_page: 100 })
						.catch(e => {
							this._logService.warn(`Failed to fetch tasks for ${repo.org}/${repo.repo}: ${e}`);
							return { tasks: [] as Task[] };
						})
				)
			);
			for (const response of taskResponses) {
				allTasks.push(...response.tasks);
			}
		}

		// Filter out archived tasks
		const activeTasks = allTasks.filter(t => !t.archived_at);

		return activeTasks.map(task => {
			const pullArtifact = findPullArtifact(task);
			const sessionInfo = taskToSessionInfo(task);

			const data: CloudSessionData = {
				sessions: [sessionInfo],
			};

			// If task has a PR artifact, include PR data in a shape the UI expects
			if (pullArtifact && task.repository) {
				data.pullRequest = {
					id: String(pullArtifact.data.global_id ?? pullArtifact.data.id),
					number: pullArtifact.data.id,
					title: task.name ?? '',
					state: task.state === 'completed' ? 'OPEN' : 'OPEN',
					url: task.html_url ?? '',
					createdAt: task.created_at,
					updatedAt: task.updated_at ?? task.created_at,
					author: task.creator ? { login: task.creator.login ?? '' } : null,
					repository: {
						owner: { login: task.repository.owner?.login ?? '' },
						name: task.repository.name ?? '',
					},
					additions: 0,
					deletions: 0,
					files: { totalCount: 0 },
					fullDatabaseId: pullArtifact.data.id,
					headRefOid: '',
					body: '',
				};
			}

			return data;
		});
	}

	async fetchSessionContent(
		_repoOwner: string,
		_repoName: string,
		sessions: SessionInfo[],
	): Promise<{ initialPrompt?: string; logs: string }> {
		if (sessions.length === 0) {
			return { logs: '' };
		}

		const taskId = sessions[0].id;
		let initialPrompt: string | undefined;
		let logs = '';

		try {
			const response = await this._taskApiClient.getTaskEvents(taskId, { per_page: 100 });
			const events = response.events;

			// Extract initial prompt from first user.message event
			const firstUserMessage = events.find(e => e.type === 'user.message');
			if (firstUserMessage && typeof firstUserMessage.data['content'] === 'string') {
				initialPrompt = firstUserMessage.data['content'];
			}

			// Serialize events as JSON for the content builder
			logs = JSON.stringify(events, undefined, 2);
		} catch (e) {
			this._logService.warn(`Failed to fetch events for task ${taskId}: ${e}`);
		}

		return { initialPrompt, logs };
	}

	async sendFollowUp(
		prNumberOrTaskId: number | string,
		prompt: string,
		_targetAgent?: string,
	): Promise<FollowUpResult> {
		if (typeof prNumberOrTaskId !== 'string') {
			return { success: false, message: 'TaskApiBackend requires a task ID (string) for follow-ups' };
		}

		try {
			await this._taskApiClient.steerTask(prNumberOrTaskId, {
				content: prompt,
				type: 'user_message',
			});
			return { success: true };
		} catch (e) {
			this._logService.error(`Failed to steer task ${prNumberOrTaskId}: ${e}`);
			return { success: false, message: `Failed to send follow-up: ${e}` };
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

	async getSessionInfo(sessionId: string): Promise<SessionInfo | undefined> {
		try {
			const task = await this._taskApiClient.getTask(sessionId);
			return taskToSessionInfo(task);
		} catch (e) {
			this._logService.warn(`Failed to fetch task ${sessionId}: ${e}`);
			return undefined;
		}
	}

	async waitForSessionReady(
		sessionId: string,
		token: vscode.CancellationToken,
	): Promise<SessionInfo | undefined> {
		const startTime = Date.now();
		while (Date.now() - startTime < TASK_SESSION_POLL_TIMEOUT_MS && !token.isCancellationRequested) {
			const task = await this._taskApiClient.getTask(sessionId);
			const state = task.state;
			if (state === 'in_progress' || state === 'completed' || state === 'failed' ||
				state === 'timed_out' || state === 'cancelled') {
				return taskToSessionInfo(task);
			}
			await new Promise(resolve => setTimeout(resolve, TASK_SESSION_POLL_INTERVAL_MS));
		}
		return undefined;
	}

	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined {
		// Check for task URI pattern first
		const taskParsed = SessionIdForTask.parse(resource);
		if (taskParsed) {
			return { type: 'task', taskId: taskParsed.taskId };
		}

		// Fall back to PR parsing for backward compat
		const prParsed = SessionIdForPr.parse(resource);
		if (prParsed) {
			return { type: 'pr', prNumber: prParsed.prNumber, sessionIndex: prParsed.sessionIndex };
		}

		return undefined;
	}

	async checkEnabled(owner: string, repo: string): Promise<{ enabled: boolean; message?: string }> {
		// Task API doesn't have a separate enablement check.
		// Delegate to the same OctoKit CCA check used by JobsApiBackend.
		try {
			const result = await this._octoKitService.isCCAEnabled(owner, repo, {});
			return { enabled: result.enabled === true };
		} catch (e) {
			this._logService.warn(`Failed to check CCA enabled for ${owner}/${repo}: ${e}`);
			return { enabled: false, message: `Failed to check enablement: ${e}` };
		}
	}
}

/**
 * Stub Task API client that logs calls and returns default values.
 * Will be replaced with a proper HTTP client once @vscode/copilot-api
 * adds Task API routing support.
 */
export class StubTaskApiClient implements ITaskApiClient {

	constructor(
		private readonly _logService: ILogService,
	) {}

	private _notImplemented(method: string): never {
		const msg = `StubTaskApiClient.${method} is not yet implemented — awaiting CAPI routing`;
		this._logService.error(msg);
		throw new Error(msg);
	}

	async createTask(_owner: string, _repo: string, _request: CreateTaskRequest): Promise<Task> {
		return this._notImplemented('createTask');
	}

	async listTasksForRepo(_owner: string, _repo: string): Promise<import('./taskApiTypes').ListTasksResponse> {
		return this._notImplemented('listTasksForRepo');
	}

	async listTasks(): Promise<import('./taskApiTypes').ListTasksResponse> {
		return this._notImplemented('listTasks');
	}

	async getTask(_taskId: string): Promise<Task> {
		return this._notImplemented('getTask');
	}

	async getTaskEvents(_taskId: string): Promise<import('./taskApiTypes').ListTaskEventsResponse> {
		return this._notImplemented('getTaskEvents');
	}

	async steerTask(_taskId: string, _request: import('./taskApiTypes').SteerTaskRequest): Promise<void> {
		this._notImplemented('steerTask');
	}

	async createPRForTask(_owner: string, _repo: string, _taskId: string): Promise<import('./taskApiTypes').CreatePullRequestForTaskResponse> {
		return this._notImplemented('createPRForTask');
	}

	async archiveTask(_owner: string, _repo: string, _taskId: string): Promise<Task> {
		return this._notImplemented('archiveTask');
	}

	async unarchiveTask(_owner: string, _repo: string, _taskId: string): Promise<Task> {
		return this._notImplemented('unarchiveTask');
	}
}
