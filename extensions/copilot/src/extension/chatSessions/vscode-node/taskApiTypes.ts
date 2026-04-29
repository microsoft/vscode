/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TypeScript types matching the Mission Control Task API OpenAPI spec.
 * These are the wire-format types used for HTTP request/response bodies.
 *
 * Source of truth: copilot-mission-control/api/generated-sessions-openapi.yaml
 * Generated Go types: copilot-mission-control/internal/session/sessionapi/models.generated.go
 */

// ============================================================================
// Task State
// ============================================================================

export type TaskState =
	| 'queued'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'idle'
	| 'waiting_for_user'
	| 'timed_out'
	| 'cancelled';

// ============================================================================
// Task Artifacts
// ============================================================================

export type TaskArtifactType = 'pull' | 'branch';

export interface TaskArtifactPullData {
	id: number;
	global_id?: string;
}

export interface TaskArtifactBranchData {
	head_ref: string;
	base_ref: string;
}

export interface TaskArtifact {
	provider: 'github';
	type: TaskArtifactType;
	data: TaskArtifactPullData | TaskArtifactBranchData;
}

// ============================================================================
// Task
// ============================================================================

export interface TaskUser {
	id?: number;
	login?: string;
	avatar_url?: string;
	html_url?: string;
}

export interface TaskRepository {
	id?: number;
	name?: string;
	full_name?: string;
	owner?: TaskUser;
	html_url?: string;
}

export interface TaskCustomAgent {
	name?: string;
	is_automation?: boolean;
}

export interface TaskCompute {
	provider?: 'codespaces' | 'sandboxes';
	resource_id?: string;
}

export interface Task {
	/** Unique task identifier (UUID). */
	id: string;
	/** Current task state. */
	state: TaskState;
	/** When the task was created. */
	created_at: string;
	/** Whether the task supports mid-session steering via API. */
	remote_steerable: boolean;

	url?: string;
	html_url?: string;
	name?: string;
	creator?: TaskUser;
	creator_type?: 'user' | 'organization';
	owner?: TaskUser;
	repository?: TaskRepository;
	session_count?: number;
	artifacts?: TaskArtifact[];
	archived_at?: string | null;
	updated_at?: string;
	custom_agent?: TaskCustomAgent;
	compute?: TaskCompute;
}

// ============================================================================
// Create Task Request
// ============================================================================

export interface CreateTaskRepository {
	owner: string;
	name: string;
}

export interface CreateTaskRequest {
	/** The user's prompt. Only required field. */
	prompt: string;

	agent_id?: number;
	base_ref?: string;
	head_ref?: string;
	create_pull_request?: boolean;
	custom_agent?: string;
	model?: string;
	event_content?: string;
	event_type?: string;
	event_url?: string;
	event_identifiers?: string[];
	problem_statement?: string;
	repositories?: CreateTaskRepository[];
	compute?: TaskCompute;
}

// ============================================================================
// Steer Task Request
// ============================================================================

export type SteerTaskRequestType =
	| 'user_message'
	| 'ask_user_response'
	| 'plan_approval_response'
	| 'permission_response'
	| 'elicitation_response'
	| 'abort'
	| 'mode_switch';

export interface SteerTaskRequest {
	/** Follow-up message content. Required for all types except 'abort'. */
	content?: string;
	/** Steer type. Defaults to 'user_message'. */
	type?: SteerTaskRequestType;

	custom_agent?: string;
	event_identifiers?: string[];
	event_type?: string;
	model?: string;
	problem_statement?: string;
}

// ============================================================================
// Session Events
// ============================================================================

export type SessionEventType =
	// Session lifecycle
	| 'session.start' | 'session.resume' | 'session.error' | 'session.idle'
	| 'session.info' | 'session.model_change' | 'session.remote_steerable_changed'
	| 'session.shutdown' | 'session.title_changed' | 'session.truncation'
	| 'session.handoff' | 'session.import_legacy' | 'session.requested'
	// User messages
	| 'user.message' | 'user_input.requested' | 'user_input.completed'
	// Assistant turns
	| 'assistant.turn_start' | 'assistant.turn_end' | 'assistant.message'
	| 'assistant.intent' | 'assistant.usage'
	| 'assistant.streaming_delta' | 'assistant.reasoning_delta' | 'assistant.message_delta'
	// Tool execution
	| 'tool.user_requested' | 'tool.execution_start'
	| 'tool.execution_partial_result' | 'tool.execution_complete'
	// Custom agents
	| 'custom_agent.started' | 'custom_agent.completed'
	| 'custom_agent.failed' | 'custom_agent.selected'
	// Lifecycle / system
	| 'hook.start' | 'hook.end' | 'abort' | 'system.message'
	// Permissions / elicitation / plan
	| 'permission.requested' | 'permission.completed'
	| 'elicitation.requested' | 'elicitation.completed'
	| 'exit_plan_mode.requested' | 'exit_plan_mode.completed';

export interface SessionEvent {
	/** Unique event identifier (UUID). */
	id: string;
	/** Event type — discriminator for the data payload. */
	type: SessionEventType;
	/** When the event occurred. */
	timestamp: string;

	/** Parent event ID for hierarchical event linking. */
	parentId?: string;
	/** If true, event is not persisted long-term. */
	ephemeral?: boolean;
	/** Server-generated placeholder for pending user action. */
	pending?: boolean;
	/** User action was never processed by agent. */
	dismissed?: boolean;
	/** Event-specific payload. Shape depends on `type`. */
	data: Record<string, unknown>;
}

// ============================================================================
// List Tasks Response
// ============================================================================

export interface ListTasksResponse {
	tasks: Task[];
	total_active_count?: number;
	total_archived_count?: number;
}

// ============================================================================
// List Task Events Response
// ============================================================================

export interface ListTaskEventsResponse {
	events: SessionEvent[];
	total: number;
}

// ============================================================================
// Create Pull Request Response
// ============================================================================

export interface CreatePullRequestForTaskResponse {
	id: number;
	number: number;
	repository_id: number;
}

// ============================================================================
// Pagination
// ============================================================================

export interface TaskApiPaginationParams {
	page?: number;
	per_page?: number;
	sort?: string;
	direction?: 'asc' | 'desc';
}

// ============================================================================
// API Error Response
// ============================================================================

export interface TaskApiErrorDetail {
	code: 'missing_field' | 'invalid' | 'custom';
	message?: string;
}

export interface TaskApiErrorResponse {
	message: string;
	documentation_url?: string;
	errors?: TaskApiErrorDetail[];
}

// ============================================================================
// Task API Client Interface
// ============================================================================

/**
 * Client interface for Mission Control's Task API.
 *
 * Endpoints:
 *   POST   /agents/repos/{owner}/{repo}/tasks          → createTask
 *   GET    /agents/repos/{owner}/{repo}/tasks           → listTasksForRepo
 *   GET    /agents/tasks                                → listTasks
 *   GET    /agents/tasks/{task_id}                      → getTask
 *   GET    /agents/tasks/{task_id}/events               → getTaskEvents
 *   POST   /agents/tasks/{task_id}/steer                → steerTask
 *   POST   /agents/repos/{owner}/{repo}/tasks/{id}/pulls → createPRForTask
 *   POST   /agents/repos/{owner}/{repo}/tasks/{id}/archive → archiveTask
 *   POST   /agents/repos/{owner}/{repo}/tasks/{id}/unarchive → unarchiveTask
 */
export interface ITaskApiClient {
	/** Create a new task in a repository. Returns 201. */
	createTask(owner: string, repo: string, request: CreateTaskRequest): Promise<Task>;

	/** List tasks for a specific repository. Returns 200. */
	listTasksForRepo(owner: string, repo: string, pagination?: TaskApiPaginationParams): Promise<ListTasksResponse>;

	/** List all tasks for the authenticated user. Returns 200. */
	listTasks(pagination?: TaskApiPaginationParams): Promise<ListTasksResponse>;

	/** Get a specific task by ID. Returns 200. */
	getTask(taskId: string): Promise<Task>;

	/** Get events for a task. Offset-based pagination via page/per_page. Returns 200. */
	getTaskEvents(taskId: string, pagination?: TaskApiPaginationParams): Promise<ListTaskEventsResponse>;

	/** Send a follow-up or control message to a task. Returns 202 (accepted, async). */
	steerTask(taskId: string, request: SteerTaskRequest): Promise<void>;

	/** Create a pull request from a completed task. Returns 201. */
	createPRForTask(owner: string, repo: string, taskId: string): Promise<CreatePullRequestForTaskResponse>;

	/** Archive a task. Returns 200. */
	archiveTask(owner: string, repo: string, taskId: string): Promise<Task>;

	/** Unarchive a task. Returns 200. */
	unarchiveTask(owner: string, repo: string, taskId: string): Promise<Task>;
}
