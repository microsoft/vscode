/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire-format types for the Mission Control Task API plus the {@link ITaskApiClient}
 * abstraction. The HTTP client implementation is not yet available — see
 * {@link StubTaskApiClient} in the `vscode-node/taskApiBackend.ts` companion file.
 */

export type TaskState =
	| 'queued'
	| 'in_progress'
	| 'idle'
	| 'waiting_for_user'
	| 'completed'
	| 'failed'
	| 'timed_out'
	| 'cancelled';

export interface TaskCreator {
	readonly id?: number;
	readonly login?: string;
}

export interface TaskRepositoryOwner {
	readonly id?: number;
	readonly login?: string;
}

export interface TaskRepository {
	readonly id?: number;
	readonly name?: string;
	readonly owner?: TaskRepositoryOwner;
}

export interface TaskArtifactPullData {
	readonly id: number;
	readonly global_id?: string;
	readonly html_url?: string;
}

export interface TaskArtifact {
	readonly type: 'pull' | string;
	readonly data: TaskArtifactPullData | Record<string, unknown>;
}

export interface Task {
	readonly id: string;
	readonly name?: string;
	readonly state: TaskState;
	readonly created_at: string;
	readonly updated_at?: string;
	readonly archived_at?: string | null;
	readonly html_url?: string;
	readonly creator?: TaskCreator;
	readonly repository?: TaskRepository;
	readonly artifacts?: readonly TaskArtifact[];
}

export interface CreateTaskRequest {
	readonly prompt: string;
	readonly event_content?: string;
	readonly problem_statement?: string;
	readonly base_ref?: string;
	readonly head_ref?: string;
	readonly create_pull_request?: boolean;
	readonly event_type?: string;
	readonly custom_agent?: string;
	readonly model?: string;
	readonly agent_id?: number;
}

export interface SteerTaskRequest {
	readonly content: string;
	readonly type: 'user_message' | string;
}

export interface ListTasksOptions {
	readonly page?: number;
	readonly per_page?: number;
}

export interface ListTasksResponse {
	readonly tasks: readonly Task[];
	readonly total_count?: number;
}

export interface TaskEvent {
	readonly id: string;
	readonly type: string;
	readonly created_at: string;
	readonly data: Record<string, unknown>;
}

export interface ListTaskEventsResponse {
	readonly events: readonly TaskEvent[];
}

export interface CreatePullRequestForTaskResponse {
	readonly pull_request_id: number;
	readonly pull_request_url?: string;
}

/**
 * HTTP client for the Mission Control Task API. The implementation lands in a
 * follow-up PR once CAPI routing is available — see {@link StubTaskApiClient}.
 */
export interface ITaskApiClient {
	createTask(owner: string, repo: string, request: CreateTaskRequest): Promise<Task>;
	listTasksForRepo(owner: string, repo: string, options?: ListTasksOptions): Promise<ListTasksResponse>;
	listTasks(options?: ListTasksOptions): Promise<ListTasksResponse>;
	getTask(taskId: string): Promise<Task>;
	getTaskEvents(taskId: string, options?: ListTasksOptions): Promise<ListTaskEventsResponse>;
	steerTask(taskId: string, request: SteerTaskRequest): Promise<void>;
	createPRForTask(owner: string, repo: string, taskId: string): Promise<CreatePullRequestForTaskResponse>;
	archiveTask(owner: string, repo: string, taskId: string): Promise<Task>;
	unarchiveTask(owner: string, repo: string, taskId: string): Promise<Task>;
}
