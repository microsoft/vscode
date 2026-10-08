/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNumber } from '../../../../base/common/types.js';
import { GitHubRequestError } from '../githubTypes.js';
import { parse, SchemaError } from '../schema.js';
import { PaginatedResponse, PaginationOptions } from './missionControl.js';
import { MissionControlClient, paginated, pagination, parseEnvironmentKind, parseUser, pathSegment, queryPath } from './missionControlClient.js';
import { AhpPayload, CreateTaskRequest, GetTaskResponse, ITasksClient, ListTaskEventsResponse, ListTasksOptions, ListTasksResponse, Repository, SteerTaskRequest, Task, TaskAHPEventsResponse, TaskArtifact, UpdateTaskRequest } from './tasks.js';

export class TasksClient implements ITasksClient {
	constructor(private readonly _client: MissionControlClient) { }

	list(signal: AbortSignal, options?: ListTasksOptions): Promise<PaginatedResponse<ListTasksResponse>> {
		return this._client.request({
			method: 'GET',
			path: queryPath('/tasks', { ...options, ...pagination(options) }),
			expectedStatus: [200],
		}, signal, response => paginated(response, parseListTasksResponse(response.data)));
	}

	get(taskId: string, signal: AbortSignal): Promise<GetTaskResponse> {
		return this._client.request({
			method: 'GET',
			path: taskPath(taskId),
			expectedStatus: [200],
		}, signal, response => parseTaskDetail(response.data, taskId));
	}

	create(request: CreateTaskRequest, signal: AbortSignal): Promise<GetTaskResponse> {
		return this._client.request({
			method: 'POST',
			path: '/tasks',
			body: request,
			expectedStatus: [201],
		}, signal, response => parseTaskDetail(response.data));
	}

	update(taskId: string, request: UpdateTaskRequest, signal: AbortSignal): Promise<GetTaskResponse> {
		if (request.name === undefined && request.sharing_status === undefined) {
			throw new GitHubRequestError('A task update requires at least one property', 'validation');
		}
		return this._client.request({
			method: 'PATCH',
			path: taskPath(taskId),
			body: request,
			expectedStatus: [200],
		}, signal, response => parseTaskDetail(response.data, taskId));
	}

	delete(taskId: string, signal: AbortSignal): Promise<void> {
		return this._client.request({
			method: 'DELETE',
			path: taskPath(taskId),
			expectedStatus: [204],
			responseBody: 'none',
		}, signal, () => { });
	}

	archive(taskId: string, signal: AbortSignal): Promise<Task> {
		return this._setArchived(taskId, true, signal);
	}

	unarchive(taskId: string, signal: AbortSignal): Promise<Task> {
		return this._setArchived(taskId, false, signal);
	}

	private _setArchived(taskId: string, archived: boolean, signal: AbortSignal): Promise<Task> {
		return this._client.request({
			method: 'POST',
			path: `${taskPath(taskId)}/${archived ? 'archive' : 'unarchive'}`,
			expectedStatus: [200],
		}, signal, response => parseTask(response.data, taskId));
	}

	steer(taskId: string, request: SteerTaskRequest, signal: AbortSignal): Promise<void> {
		return this._client.request({
			method: 'POST',
			path: `${taskPath(taskId)}/steer`,
			body: request,
			expectedStatus: [202],
			responseBody: 'none',
		}, signal, () => { });
	}

	abort(taskId: string, signal: AbortSignal): Promise<void> {
		return this.steer(taskId, { type: 'abort' }, signal);
	}

	getEvents(taskId: string, signal: AbortSignal, options?: PaginationOptions): Promise<PaginatedResponse<ListTaskEventsResponse>> {
		return this._client.request({
			method: 'GET',
			path: queryPath(`${taskPath(taskId)}/events`, { ...pagination(options) }),
			expectedStatus: [200],
			retry: false,
		}, signal, response => paginated(response, parseTaskEventsResponse(response.data)));
	}

	getAhpEvents(taskId: string, signal: AbortSignal): Promise<TaskAHPEventsResponse> {
		return this._client.request({
			method: 'GET',
			path: `${taskPath(taskId)}/events`,
			expectedStatus: [200],
			retry: false,
			accept: 'application/vnd.github.ahp+json',
		}, signal, response => parseTaskAhpEventsResponse(response.data));
	}
}

function taskPath(taskId: string): string {
	return `/tasks/${pathSegment(taskId)}`;
}

const parseRepository = parse.object<Repository>({
	id: parse.optional(parse.integer),
	name: parse.optional(parse.string),
	full_name: parse.optional(parse.string),
	owner: parse.optional(parseUser),
});

const parseTaskState = parse.oneOf('queued', 'in_progress', 'completed', 'failed', 'idle', 'waiting_for_user', 'timed_out', 'cancelled');

const parseTaskFields = parse.object<Task>({
	id: parse.nonEmptyString,
	url: parse.optional(parse.string),
	html_url: parse.optional(parse.string),
	name: parse.optional(parse.string),
	creator: parse.optional(parseUser),
	creator_type: parse.optional(parse.oneOf('user', 'organization')),
	user_collaborators: parse.optional(parse.arrayOf(value => isNumber(value) ? parse.integer(value) : parseUser(value))),
	agent_collaborators: parse.optional(parse.arrayOf(parse.object({
		agent_type: parse.optional(parse.string),
		agent_id: parse.optional(parse.integer),
		agent_task_id: parse.optional(parse.string),
		slug: parse.optional(parse.string),
	}))),
	owner: parse.optional(parseUser),
	repository: parse.optional(parseRepository),
	repositories: parse.optional(parse.arrayOf(parseRepository)),
	status: parse.optional(parseTaskState),
	state: parseTaskState,
	session_count: parse.optional(parse.nonNegativeInteger),
	event_type: parse.optional(parse.string),
	artifacts: parse.optional(parse.arrayOf(parseArtifact)),
	archived_at: parse.optional(parse.nullable(parse.dateTime)),
	updated_at: parse.optional(parse.dateTime),
	last_updated_at: parse.optional(parse.dateTime),
	created_at: parse.dateTime,
	remote_steerable: parse.boolean,
	current_environment: parse.optional(parse.nullable(parse.object({
		id: parse.nonEmptyString,
		kind: parseEnvironmentKind,
	}))),
	custom_agent: parse.optional(parse.object({
		id: parse.optional(parse.string),
		name: parse.optional(parse.string),
		is_automation: parse.optional(parse.boolean),
	})),
	experiment_assignment: parse.optional(parse.object({
		experiment_name: parse.string,
		variant: parse.integer,
		variant_name: parse.string,
		assignment_context: parse.string,
	})),
	automation_id: parse.optional(parse.string),
	automation_revision_id: parse.optional(parse.string),
	stale_at: parse.optional(parse.dateTime),
	compute: parse.optional(parse.object({
		provider: parse.optional(parse.oneOf('codespaces', 'sandboxes')),
		resource_id: parse.optional(parse.string),
		scope: parse.optional(parse.string),
	})),
	sharing_status: parse.optional(parse.oneOf('unshared', 'shared', 'unlisted')),
	azure_devops_repository_context: parse.optional(parse.object({
		url: parse.string,
		name: parse.optional(parse.string),
		default_branch: parse.optional(parse.string),
	})),
});

const artifactSchema = {
	provider: parse.oneOf('github', 'azure_devops'),
	type: parse.oneOf('pull', 'branch', 'github_resource', 'azure_devops_resource'),
};

const parseArtifactHeader = parse.object(artifactSchema);

const parseBranchArtifact = parse.object<TaskArtifact>({
	...artifactSchema,
	data: parse.object({
		head_ref: parse.string,
		base_ref: parse.string,
	}),
});

const parseAzureDevOpsArtifact = parse.object<TaskArtifact>({
	...artifactSchema,
	data: parse.object({ url: parse.string }),
});

const parseRepositoryArtifact = parse.object<TaskArtifact>({
	...artifactSchema,
	data: parse.object({
		id: parse.integer,
		type: parse.string,
		global_id: parse.optional(parse.string),
		state: parse.optional(parse.oneOf('open', 'draft', 'closed', 'merged')),
	}),
});

function parseArtifact(value: unknown): TaskArtifact {
	switch (parseArtifactHeader(value).type) {
		case 'branch':
			return parseBranchArtifact(value);
		case 'azure_devops_resource':
			return parseAzureDevOpsArtifact(value);
		default:
			return parseRepositoryArtifact(value);
	}
}

function parseTask(value: unknown, expectedId?: string): Task {
	const task = parseTaskFields(value);
	if (expectedId !== undefined && task.id !== expectedId) {
		throw new SchemaError('Task response did not match the requested task');
	}
	return task;
}

function parseTaskDetail(value: unknown, expectedId?: string): GetTaskResponse {
	return {
		...parseTask(value, expectedId),
		...parseTaskSessions(value),
	};
}

/** Parses the task listing shared by task collections and automation runs. */
export const parseListTasksResponse = parse.object<ListTasksResponse>({
	tasks: parse.arrayOf(parseTask),
	total_active_count: parse.optional(parse.nonNegativeInteger),
	total_waiting_for_user_count: parse.optional(parse.nonNegativeInteger),
	total_archived_count: parse.optional(parse.nonNegativeInteger),
});

const parseTaskSessions = parse.object<Pick<GetTaskResponse, 'sessions'>>({
	sessions: parse.optional(parse.arrayOf(parse.object({
		id: parse.nonEmptyString,
		name: parse.optional(parse.string),
		user: parse.optional(parseUser),
		owner: parse.optional(parseUser),
		repository: parse.optional(parseRepository),
		repositories: parse.optional(parse.arrayOf(parseRepository)),
		agent_id: parse.optional(parse.integer),
		agent_slug: parse.optional(parse.string),
		agent_task_id: parse.optional(parse.string),
		task_id: parse.optional(parse.string),
		state: parseTaskState,
		created_at: parse.dateTime,
		updated_at: parse.optional(parse.dateTime),
		last_updated_at: parse.optional(parse.dateTime),
		completed_at: parse.optional(parse.dateTime),
		event_type: parse.optional(parse.string),
		event_url: parse.optional(parse.string),
		prompt: parse.optional(parse.string),
		event_content: parse.optional(parse.string),
		event_identifiers: parse.optional(parse.strings),
		resource_type: parse.optional(parse.string),
		resource_id: parse.optional(parse.integer),
		resource_number: parse.optional(parse.integer),
		resource_global_id: parse.optional(parse.string),
		resource_state: parse.optional(parse.string),
		head_ref: parse.optional(parse.string),
		base_ref: parse.optional(parse.string),
		workflow_run_id: parse.optional(parse.integer),
		model: parse.optional(parse.string),
		reasoning_effort: parse.optional(parse.string),
		premium_requests: parse.optional(parse.finiteNumber),
		usage: parse.optional(parse.object({
			type: parse.oneOf('ai_credits', 'premium_requests'),
			amount: parse.finiteNumber,
			credits: parse.optional(parse.finiteNumber),
		})),
		remote_steerable: parse.optional(parse.boolean),
		error: parse.optional(parse.object({ message: parse.optional(parse.string) })),
		stale_at: parse.optional(parse.dateTime),
		environment_id: parse.optional(parse.string),
		ahp_resource_uri: parse.optional(parse.string),
	}))),
});

const parseTaskEventsResponse = parse.object<ListTaskEventsResponse>({
	events: parse.arrayOf(parse.object({
		id: parse.nonEmptyString,
		timestamp: parse.dateTime,
		parentId: parse.nullable(parse.string),
		type: parse.nonEmptyString,
		data: parse.jsonValue,
		ephemeral: parse.optional(parse.boolean),
		pending: parse.optional(parse.boolean),
		dismissed: parse.optional(parse.boolean),
		agentId: parse.optional(parse.string),
	})),
	total: parse.nonNegativeInteger,
});

const parseAhpMessage = parse.object<Extract<AhpPayload, { kind: 'message' }>>({
	kind: parse.oneOf('message'),
	data: parse.amend(parse.jsonObject, parse.object({
		channel: parse.string,
		action: parse.amend(parse.jsonObject, parse.object({ type: parse.nonEmptyString })),
		serverSeq: parse.integer,
		rejectionReason: parse.optional(parse.nullable(parse.string)),
	})),
});

const parseAhpChunk = parse.refine(
	parse.object<Extract<AhpPayload, { kind: 'chunk' }>>({
		kind: parse.oneOf('chunk'),
		group_id: parse.nonEmptyString,
		seq: parse.nonNegativeInteger,
		total: parse.range(1, Number.MAX_SAFE_INTEGER),
		bytes: parse.string,
	}),
	chunk => chunk.seq < chunk.total && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(chunk.bytes),
	'Invalid AHP chunk',
);

const parseTaskAhpEventsResponse = parse.refine(
	parse.object<TaskAHPEventsResponse>({
		events: parse.arrayOf(parse.amend(parse.jsonObject, parse.object({
			environment_id: parse.optional(parse.string),
			session_id: parse.nonEmptyString,
			ns: parse.oneOf('ahp', 'sdk'),
			seq: parse.nonNegativeInteger,
			at: parse.dateTime,
			project: parse.optional(parse.amend(parse.jsonObject, parse.object({
				uri: parse.optional(parse.string),
				display_name: parse.optional(parse.string),
			}))),
			payload: parse.amend(
				parse.jsonObject,
				payload => payload.kind === 'message' ? parseAhpMessage(payload) : parseAhpChunk(payload),
			),
		}))),
		total: parse.nonNegativeInteger,
	}),
	response => response.total === response.events.length,
	'AHP history total does not match the returned frame count',
);
