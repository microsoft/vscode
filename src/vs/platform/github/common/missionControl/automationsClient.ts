/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathSegment, withQuery, repositoryPath } from '../client/routing.js';
import { parse, SchemaError } from '../client/schema.js';
import { RepositoryRef } from '../client/types.js';
import { AutomationDetail, AutomationSummary, AutomationToolDefinition, AutomationToolGroup, AutomationTriggerDefinition, AutomationTriggerFieldDefinition, CreateAutomationRequest, CreateAutomationTaskRequest, CreateAutomationTaskResponse, EditAutomationRequest, GetAutomationOptions, IAutomationsClient, ListAutomationsOptions, ListRepoAutomationsResponse } from './automations.js';
import { PaginatedResponse } from './missionControl.js';
import { MissionControlClient, paginated, parseUser } from './missionControlClient.js';
import { ListTasksResponse, TaskListOptions } from './tasks.js';
import { parseListTasksResponse } from './tasksClient.js';

export class AutomationsClient implements IAutomationsClient {
	constructor(private readonly _client: MissionControlClient) { }

	list(repository: RepositoryRef, signal: AbortSignal, options?: ListAutomationsOptions): Promise<PaginatedResponse<ListRepoAutomationsResponse>> {
		return this._client.request({
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/automations/v2`, { ...options }),
			expectedStatus: [200],
		}, signal, response => paginated(response, parseListAutomationsResponse(response.data)));
	}

	get(repository: RepositoryRef, automationId: string, signal: AbortSignal, options?: GetAutomationOptions): Promise<AutomationDetail> {
		return this._client.request({
			method: 'GET',
			path: withQuery(automationPath(repository, automationId), { ...options }),
			expectedStatus: [200],
		}, signal, response => parseAutomationDetail(response.data, automationId));
	}

	create(repository: RepositoryRef, request: CreateAutomationRequest, signal: AbortSignal): Promise<AutomationDetail> {
		return this._client.request({
			method: 'POST',
			path: `${repositoryPath(repository)}/automations`,
			body: request,
			expectedStatus: [201],
		}, signal, response => parseAutomationDetail(response.data));
	}

	update(repository: RepositoryRef, automationId: string, request: EditAutomationRequest, signal: AbortSignal): Promise<AutomationDetail> {
		return this._client.request({
			method: 'PATCH',
			path: automationPath(repository, automationId),
			body: request,
			expectedStatus: [200],
		}, signal, response => parseAutomationDetail(response.data, automationId));
	}

	delete(repository: RepositoryRef, automationId: string, signal: AbortSignal): Promise<void> {
		return this._client.request({
			method: 'DELETE',
			path: automationPath(repository, automationId),
			expectedStatus: [204],
			responseBody: 'none',
		}, signal, () => { });
	}

	dispatch(repository: RepositoryRef, automationId: string, request: CreateAutomationTaskRequest, signal: AbortSignal): Promise<CreateAutomationTaskResponse> {
		return this._client.request({
			method: 'POST',
			path: `${automationPath(repository, automationId)}/tasks`,
			body: request,
			expectedStatus: [202],
		}, signal, response => parseCreateAutomationTaskResponse(response.data));
	}

	listRuns(automationId: string, signal: AbortSignal, options?: TaskListOptions): Promise<PaginatedResponse<ListTasksResponse>> {
		return this._client.request({
			method: 'GET',
			path: withQuery(`/automations/${pathSegment(automationId)}/tasks`, { ...options }),
			expectedStatus: [200],
		}, signal, response => {
			const data = parseListTasksResponse(response.data);
			if (data.tasks.some(task => task.automation_id !== automationId)) {
				throw new SchemaError('Automation run did not belong to the requested automation');
			}
			return paginated(response, data);
		});
	}

	listTools(signal: AbortSignal): Promise<readonly AutomationToolGroup[]> {
		return this._client.request({
			method: 'GET',
			path: '/automations/tools',
			expectedStatus: [200],
		}, signal, response => parseToolGroups(response.data));
	}

	listTriggers(signal: AbortSignal): Promise<readonly AutomationTriggerDefinition[]> {
		return this._client.request({
			method: 'GET',
			path: '/automations/triggers',
			expectedStatus: [200],
		}, signal, response => parseTriggerDefinitions(response.data));
	}
}

function automationPath(repository: RepositoryRef, automationId: string): string {
	return `${repositoryPath(repository)}/automations/${pathSegment(automationId)}`;
}

const parseOwnership = parse.oneOf('user', 'repository');
const parseWriteScope = parse.oneOf('trigger', 'repository');
const usageLimitSchema = {
	period: parse.oneOf('day', 'week', 'month'),
	limit: parse.range(1, Number.MAX_SAFE_INTEGER),
};

const summarySchema: parse.ObjectSchema<AutomationSummary> = {
	id: parse.nonEmptyString,
	name: parse.string,
	description: parse.string,
	disabled: parse.optional(parse.boolean),
	enabled: parse.optional(parse.boolean),
	ownership: parse.optional(parseOwnership),
	owner_type: parse.optional(parseOwnership),
	write_scope: parse.optional(parseWriteScope),
	require_actor_write_permission: parse.optional(parse.boolean),
	disabled_state: parse.optional(parse.nullable(parse.object({
		reason: parse.string,
		disabled_at: parse.dateTime,
	}))),
	triggers: parse.optional(parse.dictionary(parse.amend(parse.jsonObject, parse.object({
		types: parse.optional(parse.strings),
		cadence: parse.optional(parse.strings),
		query: parse.optional(parse.string),
		body_substring: parse.optional(parse.string),
		assignees: parse.optional(parse.strings),
		labels: parse.optional(parse.strings),
		states: parse.optional(parse.strings),
		automation_ids: parse.optional(parse.strings),
		categories: parse.optional(parse.strings),
		comment_types: parse.optional(parse.strings),
		write_scope: parse.optional(parseWriteScope),
		workflows: parse.optional(parse.strings),
		conclusions: parse.optional(parse.strings),
		paths: parse.optional(parse.strings),
		hour_utc: parse.optional(parse.range(0, 23)),
		day_of_week: parse.optional(parse.range(0, 6)),
		minute_utc: parse.optional(parse.oneOf(0, 15, 30, 45)),
	})))),
	model: parse.optional(parse.string),
	reasoning_effort: parse.optional(parse.string),
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
	created_by: parseUser,
	usage_limit_status: parse.optional(parse.arrayOf(parse.object({
		...usageLimitSchema,
		used: parse.nonNegativeInteger,
		resets_at: parse.dateTime,
		reached: parse.boolean,
	}))),
	tag_ids: parse.optional(parse.strings),
	unavailable_tag_ids: parse.optional(parse.strings),
	tag_membership_version: parse.optional(parse.string),
};

const parseListAutomationsResponse = parse.object<ListRepoAutomationsResponse>({
	automations: parse.arrayOf(parse.object(summarySchema)),
	total_count: parse.nonNegativeInteger,
});

const parseCreateAutomationTaskResponse = parse.object<CreateAutomationTaskResponse>({
	automation_id: parse.optional(parse.string),
	event: parse.optional(parse.string),
	type: parse.optional(parse.string),
	conclusion: parse.optional(parse.string),
});

const parseToolGroups = parse.arrayOf(parse.object<AutomationToolGroup>({
	id: parse.nonEmptyString,
	name: parse.optional(parse.string),
	title: parse.optional(parse.string),
	tools: parse.arrayOf(parse.object<AutomationToolDefinition>({
		id: parse.nonEmptyString,
		name: parse.optional(parse.string),
		title: parse.optional(parse.string),
		description: parse.string,
		scope: parse.optional(parse.oneOf('read', 'write')),
	})),
}));

const parseTriggerDefinitions = parse.arrayOf(parse.object<AutomationTriggerDefinition>({
	name: parse.optional(parse.string),
	id: parse.optional(parse.string),
	title: parse.string,
	description: parse.string,
	field_labels: parse.optional(parse.dictionary(parse.string)),
	fields: parse.arrayOf(parse.object<AutomationTriggerFieldDefinition>({
		name: parse.optional(parse.string),
		id: parse.optional(parse.string),
		label: parse.optional(parse.string),
		type: parse.optional(parse.oneOf('string', 'string_array', 'integer')),
		required: parse.boolean,
		options: parse.optional(parse.strings),
		description: parse.optional(parse.string),
	})),
	supports_run_now: parse.optional(parse.boolean),
}));

const parseAutomationDetailFields = parse.object<AutomationDetail>({
	...summarySchema,
	prompt: parse.string,
	current_revision_id: parse.optional(parse.string),
	tools: parse.optional(parse.strings),
	permissions: parse.optional(parse.dictionary(parse.string)),
	github_mcp_toolsets: parse.optional(parse.strings),
	allowed_custom_agents: parse.optional(parse.strings),
	mcp_servers: parse.optional(parse.arrayOf(parse.object({
		name: parse.string,
		type: parse.string,
		url: parse.string,
		tools: parse.optional(parse.strings),
	}))),
	active_limit_reached: parse.optional(parse.boolean),
	usage: parse.optional(parse.object({
		last_24_hours: parse.nonNegativeInteger,
		last_7_days: parse.nonNegativeInteger,
		last_30_days: parse.nonNegativeInteger,
	})),
	usage_limits: parse.optional(parse.arrayOf(parse.object(usageLimitSchema))),
});

function parseAutomationDetail(value: unknown, expectedId?: string): AutomationDetail {
	const automation = parseAutomationDetailFields(value);
	if (expectedId !== undefined && automation.id !== expectedId) {
		throw new SchemaError('Automation response did not match the requested automation');
	}
	return automation;
}
