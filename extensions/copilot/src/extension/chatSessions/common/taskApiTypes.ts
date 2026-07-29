/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local helpers for the Mission Control Task API: the option bags used at call sites and
 * the {@link ITaskApiClient} abstraction. The wire-format types themselves live in
 * `@vscode/copilot-api` (`AgentTask*`).
 */

import type {
	AgentTask,
	AgentTaskCreatePullRequestResponse,
	AgentTaskCreateRequest,
	AgentTaskGetResponse,
	AgentTaskListEventsResponse,
	AgentTaskListResponse,
	AgentTaskSteerRequest,
} from '@vscode/copilot-api';

export interface ListTasksOptions {
	readonly page?: number;
	readonly per_page?: number;
	readonly sort?: 'updated_at' | 'created_at';
	readonly direction?: 'asc' | 'desc';
	readonly state?: string;
	readonly is_archived?: boolean;
	readonly since?: string;
	readonly artifact_type?: 'pull' | 'chat';
	readonly artifact_id?: number;
	/**
	 * Restrict the repo-scoped task list to tasks created by the given user id. Mirrors the
	 * `creator_id` filter used by the github.com/copilot/agents repo page; without it the
	 * repo-scoped endpoint returns every collaborator's tasks.
	 */
	readonly creator_id?: number;
}

export interface ListTaskEventsOptions {
	readonly page?: number;
	readonly per_page?: number;
}

/**
 * HTTP client for the Mission Control Task API. Implementations route through
 * `ICAPIClientService.makeRequest({...}, { type: RequestType.AgentTask, ... })`.
 */
export interface ITaskApiClient {
	createTask(owner: string, repo: string, request: AgentTaskCreateRequest): Promise<AgentTask>;
	listTasksForRepo(owner: string, repo: string, options?: ListTasksOptions): Promise<AgentTaskListResponse>;
	listTasks(options?: ListTasksOptions): Promise<AgentTaskListResponse>;
	getTask(taskId: string): Promise<AgentTaskGetResponse>;
	getTaskEvents(taskId: string, options?: ListTaskEventsOptions): Promise<AgentTaskListEventsResponse>;
	steerTask(taskId: string, request: AgentTaskSteerRequest): Promise<void>;
	createPRForTask(owner: string, repo: string, taskId: string): Promise<AgentTaskCreatePullRequestResponse>;
	archiveTask(owner: string, repo: string, taskId: string): Promise<AgentTask>;
	unarchiveTask(owner: string, repo: string, taskId: string): Promise<AgentTask>;
}
