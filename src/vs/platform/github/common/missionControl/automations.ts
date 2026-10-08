/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ListTasksResponse, TaskListOptions } from './tasks.js';
import type { JsonValue } from '../schema.js';
import type { PaginatedResponse, PaginationOptions, RepositoryRef, User } from './missionControl.js';

/** Whether an automation belongs to its creator or to the repository. */
export type AutomationOwnership = 'user' | 'repository';

/** Whether runs may modify only triggering resources or any repository resource. */
export type AutomationWriteScope = 'trigger' | 'repository';

/** Trigger configuration for one event, including event-specific extension fields. */
export interface AutomationTrigger {
	/** Additional event-specific configuration preserved by the API. */
	readonly [key: string]: JsonValue | undefined;
	/** Event activity types that trigger the automation. */
	readonly types?: readonly string[];
	/** Schedule cadences for a public interval trigger. */
	readonly cadence?: readonly string[];
	/** A GitHub search expression filtering issue or pull request events. */
	readonly query?: string;
	/** A case-insensitive substring to match in the discussion or comment body. */
	readonly body_substring?: string;
	/** Affected assignee logins to match, case-insensitively. */
	readonly assignees?: readonly string[];
	/** Added label names to match, case-insensitively. */
	readonly labels?: readonly string[];
	/** Review states to match for pull_request_review_submitted triggers. */
	readonly states?: readonly string[];
	/** One to three upstream automation IDs in the same repository. */
	readonly automation_ids?: readonly string[];
	/** Discussion category names to match, case-insensitively. */
	readonly categories?: readonly string[];
	/** Discussion comment kinds to match, using comment, reply, or both. */
	readonly comment_types?: readonly string[];
	/** The per-trigger write scope, inheriting the automation's scope when omitted. */
	readonly write_scope?: AutomationWriteScope;
	/** Workflow names required by workflow_run triggers. */
	readonly workflows?: readonly string[];
	/** Workflow conclusions required by workflow_run triggers. */
	readonly conclusions?: readonly string[];
	/** Gitignore-style changed-file globs for pull request triggers. */
	readonly paths?: readonly string[];
	/** The UTC hour anchor, from 0 to 23, for daily or weekly interval triggers. */
	readonly hour_utc?: number;
	/** The UTC weekday anchor, from 0 for Sunday to 6 for Saturday, for weekly triggers. */
	readonly day_of_week?: number;
	/** The UTC minute anchor for daily or weekly interval triggers, defaulting to 0. */
	readonly minute_utc?: 0 | 15 | 30 | 45;
}

/** A tool available to the authenticated caller for automation configuration. */
export interface AutomationToolDefinition {
	/** The stable tool identifier used in an automation's tools configuration. */
	readonly id: string;
	/** The human-readable tool name returned by the internal API. */
	readonly name?: string;
	/** The human-readable tool title returned by the public API. */
	readonly title?: string;
	/** A short description of what the tool does. */
	readonly description: string;
	/** The GitHub access level required by the tool, omitted when none is required. */
	readonly scope?: 'read' | 'write';
}

/** A server-defined presentation group of available automation tools. */
export interface AutomationToolGroup {
	/** The group identifier; group membership and ordering are server-controlled. */
	readonly id: string;
	/** The human-readable group name returned by the internal API. */
	readonly name?: string;
	/** The human-readable group title returned by the public API. */
	readonly title?: string;
	/** The tools available in this group, in the server's order. */
	readonly tools: readonly AutomationToolDefinition[];
}

/** A configurable field advertised by an automation trigger. */
export interface AutomationTriggerFieldDefinition {
	/** The field identifier returned by the internal API. */
	readonly name?: string;
	/** The field identifier returned by the public API. */
	readonly id?: string;
	/** The human-readable field label returned by the public API. */
	readonly label?: string;
	/** The field value type returned by the public API. */
	readonly type?: 'string' | 'string_array' | 'integer';
	/** Whether the trigger requires this field to be configured. */
	readonly required: boolean;
	/** The allowed selection values, when the server restricts the field. */
	readonly options?: readonly string[];
	/** Optional Markdown guidance for configuring the field. */
	readonly description?: string;
}

/** A trigger available to the authenticated caller and its configuration metadata. */
export interface AutomationTriggerDefinition {
	/** The trigger identifier returned by the internal API, such as issues or interval. */
	readonly name?: string;
	/** The trigger identifier returned by the public API. */
	readonly id?: string;
	/** The human-readable trigger title. */
	readonly title: string;
	/** A short description of when the trigger fires. */
	readonly description: string;
	/** Internal display labels keyed by field name. */
	readonly field_labels?: Readonly<Record<string, string>>;
	/** The configurable fields in the server's order. */
	readonly fields: readonly AutomationTriggerFieldDefinition[];
	/** Whether event-specific run-now simulation is supported; omission indicates support. */
	readonly supports_run_now?: boolean;
}

/** Metadata explaining why and when an automation was disabled. */
export interface AutomationDisabledState {
	/** The stable machine-readable reason for the disabled state. */
	readonly reason: string;
	/** The timestamp when the automation was disabled. */
	readonly disabled_at: string;
}

/** An MCP server configuration made available to an automation. */
export interface AutomationMCPServer {
	/** The name of the MCP server. */
	readonly name: string;
	/** The server transport type, such as http. */
	readonly type: string;
	/** The server URL, which may contain credentials and must not be logged. */
	readonly url: string;
	/** The tools available on this server. */
	readonly tools?: readonly string[];
}

/** Estimated automation consumption in nano AI credits over rolling windows. */
export interface AutomationUsage {
	/** Nano AI credits consumed in the last 24 hours, accurate to the hour. */
	readonly last_24_hours: number;
	/** Nano AI credits consumed in the last 168 hours, accurate to the hour. */
	readonly last_7_days: number;
	/** Nano AI credits consumed in the last 30 days, accurate to the hour. */
	readonly last_30_days: number;
}

/** A soft cap that prevents new runs once reached within a UTC calendar period. */
export interface AutomationUsageLimit {
	/** The UTC calendar period over which the limit applies. */
	readonly period: 'day' | 'week' | 'month';
	/** The positive limit in nano AI credits. */
	readonly limit: number;
}

/** Estimated consumption against a usage limit in the current UTC calendar period. */
export interface AutomationUsageLimitStatus extends AutomationUsageLimit {
	/** Nano AI credits consumed in the current period. */
	readonly used: number;
	/** The timestamp when the current period ends. */
	readonly resets_at: string;
	/** Whether consumption has reached the limit. */
	readonly reached: boolean;
}

/** An automation summary returned by repository listing endpoints. */
export interface AutomationSummary {
	/** The unique identifier of the automation. */
	readonly id: string;
	/** The name of the automation. */
	readonly name: string;
	/** A short description of what the automation does. */
	readonly description: string;
	/** Whether the automation is disabled, as reported by the internal API. */
	readonly disabled?: boolean;
	/** Whether the automation is enabled, as reported by the public API. */
	readonly enabled?: boolean;
	/** The immutable ownership mode reported by the internal API. */
	readonly ownership?: AutomationOwnership;
	/** The immutable ownership mode reported by the public API. */
	readonly owner_type?: AutomationOwnership;
	/** Which repository resources a triggered run may modify. */
	readonly write_scope?: AutomationWriteScope;
	/** Whether event actors need repository write access for non-interval runs. */
	readonly require_actor_write_permission?: boolean;
	/** Disabled-state metadata, present only while the automation is disabled. */
	readonly disabled_state?: AutomationDisabledState | null;
	/** Trigger configuration keyed by event type. */
	readonly triggers?: Readonly<Record<string, AutomationTrigger>>;
	/** The model override, omitted when using the platform default. */
	readonly model?: string;
	/** The reasoning-effort override, omitted or empty when no override applies. */
	readonly reasoning_effort?: string;
	/** The timestamp when the automation was created. */
	readonly created_at: string;
	/** The timestamp when the automation was last updated. */
	readonly updated_at: string;
	/** The creator, which is distinct from the automation's ownership mode. */
	readonly created_by: User;
	/** Consumption against the automation's current usage limits. */
	readonly usage_limit_status?: readonly AutomationUsageLimitStatus[];
	/** Active tag IDs, present only when tag membership was requested. */
	readonly tag_ids?: readonly string[];
	/** Stored tag IDs without an active same-scope catalog entry. */
	readonly unavailable_tag_ids?: readonly string[];
	/** The opaque membership version accompanying the tag IDs. */
	readonly tag_membership_version?: string;
}

/** A full automation definition returned by repository get, create, and edit operations. */
export interface AutomationDetail extends AutomationSummary {
	/** The prompt template used for automation runs. */
	readonly prompt: string;
	/** The current configuration revision, or unknown for pre-history records. */
	readonly current_revision_id?: string;
	/** The tools available to the automation. */
	readonly tools?: readonly string[];
	/** Repository permissions required by the automation. */
	readonly permissions?: Readonly<Record<string, string>>;
	/** GitHub MCP toolsets enabled for the automation. */
	readonly github_mcp_toolsets?: readonly string[];
	/** Custom agents the automation is allowed to invoke. */
	readonly allowed_custom_agents?: readonly string[];
	/** Internal-only MCP server configurations whose URLs may contain credentials. */
	readonly mcp_servers?: readonly AutomationMCPServer[];
	/** Whether creation auto-disabled the automation because its active limit was reached. */
	readonly active_limit_reached?: boolean;
	/** Estimated AI credit consumption, omitted when unavailable. */
	readonly usage?: AutomationUsage;
	/** The configured AI credit limits, at most one per calendar period. */
	readonly usage_limits?: readonly AutomationUsageLimit[];
}

/** Editable configuration fields shared by automation creation and updates. */
interface AutomationConfiguration {
	/** The name of the automation. */
	readonly name?: string;
	/** A short description of what the automation does. */
	readonly description?: string;
	/** The prompt template for the automation. */
	readonly prompt?: string;
	/** Whether the automation is disabled, using the internal API representation. */
	readonly disabled?: boolean;
	/** Whether the automation is enabled, using the public API representation. */
	readonly enabled?: boolean;
	/** Which resources runs may modify, defaulting to trigger scope on creation. */
	readonly write_scope?: AutomationWriteScope;
	/** Whether event actors must have repository write access for non-interval runs. */
	readonly require_actor_write_permission?: boolean;
	/** The model override; an empty string selects the platform default. */
	readonly model?: string;
	/** The reasoning-effort override; an empty string clears it. */
	readonly reasoning_effort?: string;
	/** Trigger configuration keyed by event type; an empty object clears all triggers. */
	readonly triggers?: Readonly<Record<string, AutomationTrigger>>;
	/** Available tools; an empty array grants no tools. */
	readonly tools?: readonly string[];
	/** Enabled GitHub MCP toolsets; an empty array clears all toolsets. */
	readonly github_mcp_toolsets?: readonly string[];
	/** Allowed custom agents; an empty array clears all custom agents. */
	readonly allowed_custom_agents?: readonly string[];
	/** Internal-only MCP server configurations; an empty array clears all servers. */
	readonly mcp_servers?: readonly AutomationMCPServer[];
	/** Replacement AI credit limits, at most one per period; an empty array removes them. */
	readonly usage_limits?: readonly AutomationUsageLimit[];
}

/** The request body for creating an automation in a repository. */
export interface CreateAutomationRequest extends AutomationConfiguration {
	/** The name of the new automation. */
	readonly name: string;
	/** A short description of what the new automation does. */
	readonly description: string;
	/** The prompt template for the new automation. */
	readonly prompt: string;
	/** The immutable ownership mode for internal callers, defaulting to user. */
	readonly ownership?: AutomationOwnership;
	/** The immutable ownership mode for public callers, defaulting to user. */
	readonly owner_type?: AutomationOwnership;
}

/** The request body for editing an automation; omitted fields are unchanged and explicit nulls are rejected. */
export interface EditAutomationRequest extends AutomationConfiguration {
	/** The detail snapshot's current revision ID for optional atomic stale-edit protection. */
	readonly expected_revision_id?: string;
}

/** Query parameters for one page of repository automation summaries. */
export interface ListAutomationsOptions extends PaginationOptions {
	/** Filter by disabled state, or omit to include both states. */
	readonly disabled?: boolean;
	/** Filter by trigger event type. */
	readonly event?: string;
	/** The user filter, defaulting to the authenticated user when omitted or me. */
	readonly user?: string;
	/** Filter by user or repository ownership, or omit to include both. */
	readonly ownership?: AutomationOwnership;
	/** Request aggregate counts in the response. */
	readonly include_counts?: boolean;
	/** Filter by a stable active tag ID and implicitly request membership metadata. */
	readonly tag_id?: string;
	/** Request tag membership metadata in each returned summary. */
	readonly include_tags?: boolean;
}

/** Query parameters for a repository-scoped automation detail read. */
export interface GetAutomationOptions {
	/** Request tag membership metadata in the detail response. */
	readonly include_tags?: boolean;
}

/** A page of repository automation summaries with the complete filtered result count. */
export interface ListRepoAutomationsResponse {
	/** Summaries on this page, including readable repository-owned automations. */
	readonly automations: readonly AutomationSummary[];
	/** The total number of matching automations across all pages. */
	readonly total_count: number;
}

/** The request body for running an automation against a configured event or manually. */
export interface CreateAutomationTaskRequest {
	/** The configured event name, or manual for a trigger-independent run. */
	readonly event: string;
	/** The activity type, required for resource-based triggers. */
	readonly type?: string;
	/** The workflow conclusion, required for workflow_run triggers. */
	readonly conclusion?: string;
	/** The same-repository resource URL, required for resource-based triggers. */
	readonly resource_url?: string;
}

/** Acknowledgement that an automation run request was accepted, not a created task record. */
export interface CreateAutomationTaskResponse {
	/** The identifier of the automation that was triggered. */
	readonly automation_id?: string;
	/** The trigger event name. */
	readonly event?: string;
	/** The trigger activity type. */
	readonly type?: string;
	/** The workflow conclusion, empty for non-workflow triggers. */
	readonly conclusion?: string;
}

/** Automation REST operations and caller-scoped configuration catalogs without hidden hydration. */
export interface IAutomationsClient {

	/** GET /agents/repos/{owner}/{repo}/automations/v2: list one page of readable automation summaries. */
	list(repository: RepositoryRef, signal: AbortSignal, options?: ListAutomationsOptions): Promise<PaginatedResponse<ListRepoAutomationsResponse>>;

	/** GET /agents/repos/{owner}/{repo}/automations/{automation_id}: get a user- or repository-owned automation. */
	get(repository: RepositoryRef, automationId: string, signal: AbortSignal, options?: GetAutomationOptions): Promise<AutomationDetail>;

	/** POST /agents/repos/{owner}/{repo}/automations: create an automation. */
	create(repository: RepositoryRef, request: CreateAutomationRequest, signal: AbortSignal): Promise<AutomationDetail>;

	/** PATCH /agents/repos/{owner}/{repo}/automations/{automation_id}: update only the supplied fields. */
	update(repository: RepositoryRef, automationId: string, request: EditAutomationRequest, signal: AbortSignal): Promise<AutomationDetail>;

	/** DELETE /agents/repos/{owner}/{repo}/automations/{automation_id}: delete an automation. */
	delete(repository: RepositoryRef, automationId: string, signal: AbortSignal): Promise<void>;

	/** POST /agents/repos/{owner}/{repo}/automations/{automation_id}/tasks: request a run and return its HTTP 202 acknowledgement. */
	dispatch(repository: RepositoryRef, automationId: string, request: CreateAutomationTaskRequest, signal: AbortSignal): Promise<CreateAutomationTaskResponse>;

	/** GET /agents/automations/{automation_id}/tasks: list one page of tasks triggered by an automation. */
	listRuns(automationId: string, signal: AbortSignal, options?: TaskListOptions): Promise<PaginatedResponse<ListTasksResponse>>;

	/** GET /agents/automations/tools: list the authenticated caller's tool groups without pagination. */
	listTools(signal: AbortSignal): Promise<readonly AutomationToolGroup[]>;

	/** GET /agents/automations/triggers: list the authenticated caller's trigger definitions without pagination. */
	listTriggers(signal: AbortSignal): Promise<readonly AutomationTriggerDefinition[]>;
}
