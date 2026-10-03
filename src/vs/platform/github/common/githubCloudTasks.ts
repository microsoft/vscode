/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubCloudApi, GitHubCloudList, GitHubCloudListOptions, cloudNullableString, cloudObject, cloudOptionalString, cloudPagination, cloudPathSegment, cloudQuery, cloudStatus, cloudTimestamp, collectCloudPages } from './githubCloudApi.js';
import { arrayProperty, nextLink, optionalObjectProperty, requiredNumber, requiredString } from './githubResponse.js';
import { GitHubRequestError } from './githubTypes.js';

export interface GitHubCloudTaskSession {
	readonly id: string;
	readonly environment_id?: string;
	readonly state?: string;
	readonly created_at?: string;
	readonly updated_at?: string;
	readonly ahp_resource_uri?: string | null;
}

/** Control-plane task data, without a Sessions model or interpretation of activity states. */
export interface GitHubCloudTask {
	readonly id: string;
	readonly state: string;
	readonly created_at: string;
	readonly updated_at?: string;
	readonly name?: string;
	readonly status?: string | null;
	readonly automation_id?: string;
	readonly event_type?: string;
	readonly html_url?: string;
	readonly archived_at?: string | null;
	readonly creator?: { readonly id?: number; readonly login?: string } | null;
	readonly repository?: { readonly id?: number } | null;
	readonly compute?: { readonly provider: string };
	readonly current_environment?: { readonly kind?: string } | null;
	readonly agent_collaborators?: readonly { readonly slug?: string }[];
	readonly sessions?: readonly GitHubCloudTaskSession[];
}

export interface GitHubCloudTaskCreateRequest {
	readonly prompt: string;
	readonly agent_id?: number;
	readonly repositories?: readonly { readonly owner: string; readonly name: string }[];
	readonly problem_statement?: string;
	readonly event_content?: string;
	readonly model?: string;
	readonly custom_agent?: string;
	readonly create_pull_request?: boolean;
	readonly base_ref?: string;
	readonly head_ref?: string;
	readonly event_type?: string;
	/** Environment provisioning does not start the first agent turn. */
	readonly environment_id?: string;
}

export type GitHubCloudTaskSteerRequest = {
	readonly content: string;
	readonly type?: 'user_message' | 'ask_user_response' | 'plan_approval_response' | 'permission_response' | 'elicitation_response' | 'abort' | 'mode_switch';
	readonly problem_statement?: string;
	readonly model?: string;
	readonly event_type?: string;
} | { readonly type: 'abort' };

export interface GitHubCloudTaskListOptions extends GitHubCloudListOptions {
	readonly state?: string;
	readonly isArchived?: boolean;
	readonly since?: string;
	readonly creatorId?: number;
	readonly withRepository?: boolean;
	readonly includeEnvironmentKinds?: readonly string[];
	readonly sort?: 'created_at' | 'updated_at';
	readonly direction?: 'asc' | 'desc';
}

export type GitHubCloudTaskEventsOptions =
	| { readonly format: 'ahp' }
	| { readonly format?: 'task'; readonly page?: number; readonly perPage?: number };

/** Raw event payloads deliberately remain unparsed; AHP replay belongs to the consumer. */
export interface GitHubCloudTaskEvents {
	readonly events: readonly unknown[];
	readonly total: number;
	readonly hasNextPage: boolean;
}

export interface IGitHubCloudTasks {
	list(signal: AbortSignal, options?: GitHubCloudTaskListOptions): Promise<GitHubCloudList<GitHubCloudTask>>;
	listForAutomation(automationId: string, signal: AbortSignal, options?: GitHubCloudListOptions): Promise<GitHubCloudList<GitHubCloudTask>>;
	get(id: string, signal: AbortSignal, automationId?: string): Promise<GitHubCloudTask>;
	create(value: GitHubCloudTaskCreateRequest, signal: AbortSignal): Promise<GitHubCloudTask>;
	delete(id: string, signal: AbortSignal): Promise<void>;
	steer(id: string, value: GitHubCloudTaskSteerRequest, signal: AbortSignal): Promise<void>;
	abort(id: string, signal: AbortSignal): Promise<void>;
	getEvents(id: string, signal: AbortSignal, options?: GitHubCloudTaskEventsOptions): Promise<GitHubCloudTaskEvents>;
}

export class GitHubCloudTasks implements IGitHubCloudTasks {
	constructor(private readonly _api: GitHubCloudApi) { }

	list(signal: AbortSignal, options: GitHubCloudTaskListOptions = {}): Promise<GitHubCloudList<GitHubCloudTask>> {
		const pagination = cloudPagination(options);
		return this._api.run('github.cloudTasks', signal, request => collectCloudPages(request, '/tasks', 'tasks', pagination, {
			state: options.state,
			is_archived: options.isArchived,
			since: options.since,
			creator_id: options.creatorId,
			with_repo: options.withRepository,
			include_environment_kinds: options.includeEnvironmentKinds?.join(','),
			sort: options.sort ?? 'updated_at',
			direction: options.direction ?? 'desc',
		}, value => parseTask(value)));
	}

	listForAutomation(automationId: string, signal: AbortSignal, options: GitHubCloudListOptions = {}): Promise<GitHubCloudList<GitHubCloudTask>> {
		const path = `/automations/${cloudPathSegment(automationId)}/tasks`;
		const pagination = cloudPagination({ perPage: 50, ...options });
		return this._api.run('github.cloudTasks', signal, request => collectCloudPages(request, path, 'tasks', pagination, {
			sort: 'created_at', direction: 'desc', is_archived: false,
		}, value => parseTask(value, undefined, automationId)));
	}

	get(id: string, signal: AbortSignal, automationId?: string): Promise<GitHubCloudTask> {
		const path = `/tasks/${cloudPathSegment(id)}`;
		return this._api.run('github.cloudTasks', signal, request => request({ method: 'GET', path }, response => {
			cloudStatus(response, 200, 304);
			return parseTask(response.data, id, automationId);
		}));
	}

	create(value: GitHubCloudTaskCreateRequest, signal: AbortSignal): Promise<GitHubCloudTask> {
		return this._api.run('github.cloudTasks', signal, request => request({ method: 'POST', path: '/tasks', body: value }, response => {
			cloudStatus(response, 200, 201);
			return parseTask(response.data);
		}));
	}

	delete(id: string, signal: AbortSignal): Promise<void> {
		const path = `/tasks/${cloudPathSegment(id)}`;
		return this._api.run('github.cloudTasks', signal, request => request({ method: 'DELETE', path, responseBody: 'none' }, response => cloudStatus(response, 200, 204)));
	}

	steer(id: string, value: GitHubCloudTaskSteerRequest, signal: AbortSignal): Promise<void> {
		const path = `/tasks/${cloudPathSegment(id)}/steer`;
		return this._api.run('github.cloudTasks', signal, request => request({ method: 'POST', path, body: value, responseBody: 'none' }, response => cloudStatus(response, 200, 202, 204)));
	}

	abort(id: string, signal: AbortSignal): Promise<void> {
		return this.steer(id, { type: 'abort' }, signal);
	}

	getEvents(id: string, signal: AbortSignal, options: GitHubCloudTaskEventsOptions = {}): Promise<GitHubCloudTaskEvents> {
		const path = `/tasks/${cloudPathSegment(id)}/events`;
		const pagination = cloudPagination(options.format === 'ahp' ? {} : options);
		const ahp = options.format === 'ahp';
		return this._api.run('github.cloudTasks', signal, request => request({
			method: 'GET',
			path: ahp ? path : cloudQuery(path, { page: pagination.page, per_page: pagination.perPage }),
			accept: ahp ? 'application/vnd.github.ahp+json' : 'application/json',
		}, response => {
			cloudStatus(response, 200, 304);
			const data = cloudObject(response.data);
			const events = arrayProperty(data, 'events');
			const total = requiredNumber(data, 'total');
			if (!Number.isSafeInteger(total) || total < events.length || ahp && total !== events.length) {
				throw new GitHubRequestError('GitHub cloud event history was incomplete or inconsistent', 'malformedResponse');
			}
			const hasNextPage = nextLink(response.link) !== undefined || !ahp && (pagination.page - 1) * pagination.perPage + events.length < total;
			if (events.length === 0 && hasNextPage || ahp && hasNextPage) {
				throw new GitHubRequestError('GitHub cloud event history was incomplete or inconsistent', 'malformedResponse');
			}
			return { events, total, hasNextPage };
		}));
	}
}

function parseTask(value: unknown, id?: string, automationId?: string): GitHubCloudTask {
	validateTask(value);
	if (id !== undefined && value.id !== id || automationId !== undefined && value.automation_id !== undefined && value.automation_id !== automationId) {
		throw new GitHubRequestError('GitHub cloud task identity did not match the request', 'malformedResponse');
	}
	return value;
}

function validateTask(value: unknown): asserts value is GitHubCloudTask {
	const task = cloudObject(value);
	if (!requiredString(task, 'id') || !requiredString(task, 'state')) {
		throw new GitHubRequestError('GitHub cloud task identity or state was missing', 'malformedResponse');
	}
	cloudTimestamp(requiredString(task, 'created_at'));
	for (const key of ['updated_at', 'name', 'automation_id', 'event_type', 'html_url']) {
		const property = cloudOptionalString(task, key);
		if (property !== undefined && key === 'updated_at') {
			cloudTimestamp(property);
		}
	}
	cloudNullableString(task, 'status');
	const archivedAt = cloudNullableString(task, 'archived_at');
	if (archivedAt !== undefined && archivedAt !== null) {
		cloudTimestamp(archivedAt);
	}
	for (const key of ['creator', 'repository']) {
		const object = optionalObjectProperty(task, key);
		if (object) {
			if (Reflect.get(object, 'id') !== undefined) {
				const id = requiredNumber(object, 'id');
				if (!Number.isSafeInteger(id) || id < 0) {
					throw new GitHubRequestError('GitHub cloud task had an invalid numeric identity', 'malformedResponse');
				}
			}
			if (key === 'creator') {
				cloudOptionalString(object, 'login');
			}
		}
	}
	const compute = Reflect.get(task, 'compute');
	if (compute !== undefined) {
		requiredString(cloudObject(compute), 'provider');
	}
	const environment = optionalObjectProperty(task, 'current_environment');
	if (environment) {
		cloudOptionalString(environment, 'kind');
	}
	if (Reflect.get(task, 'agent_collaborators') !== undefined) {
		for (const collaborator of arrayProperty(task, 'agent_collaborators')) {
			cloudOptionalString(cloudObject(collaborator), 'slug');
		}
	}
	if (Reflect.get(task, 'sessions') !== undefined) {
		for (const value of arrayProperty(task, 'sessions')) {
			const session = cloudObject(value);
			if (!requiredString(session, 'id')) {
				throw new GitHubRequestError('GitHub cloud session identity was missing', 'malformedResponse');
			}
			for (const key of ['environment_id', 'state', 'created_at', 'updated_at']) {
				const property = cloudOptionalString(session, key);
				if (property !== undefined && (key === 'created_at' || key === 'updated_at')) {
					cloudTimestamp(property);
				}
			}
			cloudNullableString(session, 'ahp_resource_uri');
		}
	}
}
