/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { parse } from '../../../../base/common/json.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

export const readAgentMergeCIToolName = 'readAgentMergeCI';
export const replyToAgentMergeReviewThreadToolName = 'replyToAgentMergeReviewThread';
export const rerunAgentMergeWorkflowToolName = 'rerunAgentMergeWorkflow';

const definitions: readonly IAgentServerToolDefinition[] = [
	{
		name: readAgentMergeCIToolName,
		title: 'Read Agent Merge CI',
		description: 'Read CI diagnostics for failed required checks authorized for the active Agent Merge turn. Defaults to a bounded summary of checks, annotations, jobs, failed steps, and failure excerpts. Use a returned evidenceId for a line-numbered tail, range, or literal search with context; pass a returned cursor alone to continue. Responses are capped at 48 KB and job downloads at 16 MiB/30 seconds. Summary pages also respect cache capacity; inspect a page before continuing. Cached evidence expires five minutes after its last summary or on eviction; use summary with jobId to reacquire just that job. Evidence is scoped to this turn, pull request head, workflow attempt, and job. A tail is the real end only when complete is true; a download limit is terminal, not evidence that the unseen log succeeded. Concurrent reads are queued, with waiting included in the three-minute call limit. Follow the returned operations rather than repeating the summary or using other GitHub tools.',
		inputSchema: {
			type: 'object',
			properties: {
				mode: { type: 'string', enum: ['summary', 'tail', 'range', 'search'], description: 'Diagnostic operation. Defaults to summary.' },
				evidenceId: { type: 'string', description: 'Host-owned job evidence ID returned by a summary.' },
				jobId: { type: 'string', description: 'Select one authorized failed job in summary mode, including to reacquire expired or evicted evidence.' },
				cursor: { type: 'string', description: 'Continuation returned by this tool. Pass alone; expired or stale cursors fail explicitly.' },
				startLine: { type: 'integer', minimum: 1, description: 'First line for range or search, inclusive. Defaults to 1.' },
				startColumn: { type: 'integer', minimum: 1, description: 'First column of a range, for continuing a long line. Defaults to 1.' },
				endLine: { type: 'integer', minimum: 1, description: 'Last range line, inclusive. At most 200 lines per requested range.' },
				lineCount: { type: 'integer', minimum: 1, maximum: 200, description: 'Number of tail lines. Defaults to 100; response budget may return fewer.' },
				query: { type: 'string', minLength: 1, maxLength: 200, description: 'Case-insensitive literal search text, not a regular expression.' },
				contextLines: { type: 'integer', minimum: 0, maximum: 5, description: 'Lines surrounding each search match. Defaults to 2.' },
			},
		},
		annotations: { readOnlyHint: true },
	},
	{
		name: replyToAgentMergeReviewThreadToolName,
		title: 'Reply to Agent Merge Review Thread',
		description: 'Reply to an unresolved review thread authorized for the active Agent Merge turn and optionally resolve it.',
		inputSchema: {
			type: 'object',
			properties: {
				threadId: { type: 'string', description: 'GraphQL node ID of an authorized unresolved review thread.' },
				body: { type: 'string', description: 'Concise reply describing how the feedback was addressed.' },
				resolve: { type: 'boolean', description: 'Whether to resolve the thread after posting the reply. Defaults to true.' },
			},
			required: ['threadId', 'body'],
		},
		annotations: { readOnlyHint: false },
	},
	{
		name: rerunAgentMergeWorkflowToolName,
		title: 'Rerun Agent Merge Workflow',
		description: 'Rerun a GitHub Actions workflow associated with a failed required check in the active Agent Merge turn. If its current attempt is still running, Agent Merge defers the rerun until it finishes, provided CI repair remains enabled and the pull request head is unchanged. Continue other actionable work; do not poll or repeat a deferred request.',
		inputSchema: {
			type: 'object',
			properties: {
				runId: { type: 'string', description: 'GitHub Actions workflow run ID.' },
				failedJobsOnly: { type: 'boolean', description: 'Whether to rerun only failed jobs. Defaults to true.' },
			},
			required: ['runId'],
		},
		annotations: { readOnlyHint: false },
	},
];

export interface IAgentMergeToolAccessor {
	isEnabled(): boolean;
	readFailedCI(session: string, request?: AgentMergeCIRequest): Promise<string>;
	replyToReviewThread(session: string, threadId: string, body: string, resolve: boolean): Promise<string>;
	rerunFailedWorkflow(session: string, runId: string, failedJobsOnly: boolean): Promise<string>;
}

export interface AgentMergeCIRequest {
	readonly mode?: 'summary' | 'tail' | 'range' | 'search';
	readonly evidenceId?: string;
	readonly jobId?: string;
	readonly cursor?: string;
	readonly startLine?: number;
	readonly startColumn?: number;
	readonly endLine?: number;
	readonly lineCount?: number;
	readonly query?: string;
	readonly contextLines?: number;
}

export function parseAgentMergeCIRequest(value: unknown): AgentMergeCIRequest {
	const args = asRecord(value, readAgentMergeCIToolName);
	const mode = args.mode ?? 'summary';
	const fields = args.cursor !== undefined ? ['cursor']
		: mode === 'summary' ? ['mode', 'jobId']
			: mode === 'tail' ? ['mode', 'evidenceId', 'lineCount']
				: mode === 'range' ? ['mode', 'evidenceId', 'startLine', 'startColumn', 'endLine']
					: mode === 'search' ? ['mode', 'evidenceId', 'query', 'startLine', 'contextLines'] : undefined;
	if (!fields || Object.keys(args).some(key => !fields.includes(key))) {
		throw new Error('Invalid readAgentMergeCI input: unsupported fields or mode. Pass a cursor alone.');
	}
	if (args.cursor !== undefined) {
		return { cursor: requiredString(args.cursor, 'cursor', readAgentMergeCIToolName) };
	}
	if (mode === 'summary') {
		return { mode, ...(args.jobId !== undefined ? { jobId: requiredString(args.jobId, 'jobId', readAgentMergeCIToolName) } : {}) };
	}
	const evidenceId = requiredString(args.evidenceId, 'evidenceId', readAgentMergeCIToolName);
	if (mode === 'tail') {
		return { mode, evidenceId, lineCount: boundedInteger(args.lineCount, 'lineCount', 1, 200) };
	}
	const startLine = boundedInteger(args.startLine, 'startLine', 1, Number.MAX_SAFE_INTEGER) ?? 1;
	if (mode === 'range') {
		const endLine = boundedInteger(args.endLine, 'endLine', startLine, startLine + 199) ?? startLine + 199;
		return { mode, evidenceId, startLine, endLine, startColumn: boundedInteger(args.startColumn, 'startColumn', 1, Number.MAX_SAFE_INTEGER) };
	}
	const query = requiredString(args.query, 'query', readAgentMergeCIToolName);
	if (query.length > 200 || /[\r\n]/.test(query)) {
		throw new Error('Invalid readAgentMergeCI input: query must be a single line of at most 200 characters.');
	}
	return { mode: 'search', evidenceId, startLine, query, contextLines: boundedInteger(args.contextLines, 'contextLines', 0, 5) };
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`Invalid readAgentMergeCI input: ${field} must be an integer between ${minimum} and ${maximum}.`);
	}
	return value;
}

export function createAgentMergeServerToolGroup(accessor?: IAgentMergeToolAccessor): IServerToolGroup {
	return {
		definitions,
		isEnabled: toolName => accessor?.isEnabled() === true && definitions.some(definition => definition.name === toolName),
		isEnabledForSession: () => true,
		execute: (_stateManager: AgentHostStateManager, context, toolName: string, rawArgs: unknown) => {
			if (!accessor) {
				throw new Error('Agent Merge tools are not available without an Agent Merge controller.');
			}
			switch (toolName) {
				case readAgentMergeCIToolName:
					return accessor.readFailedCI(context.sessionUri, parseAgentMergeCIRequest(rawArgs));
				case replyToAgentMergeReviewThreadToolName: {
					const args = asRecord(rawArgs, toolName);
					return accessor.replyToReviewThread(
						context.sessionUri,
						requiredString(args.threadId, 'threadId', toolName),
						requiredString(args.body, 'body', toolName),
						optionalBoolean(args.resolve, 'resolve', toolName) ?? true,
					);
				}
				case rerunAgentMergeWorkflowToolName: {
					const args = asRecord(rawArgs, toolName);
					return accessor.rerunFailedWorkflow(
						context.sessionUri,
						requiredString(args.runId, 'runId', toolName),
						optionalBoolean(args.failedJobsOnly, 'failedJobsOnly', toolName) ?? true,
					);
				}
				default:
					throw new Error(`Unknown Agent Merge server tool: ${toolName}`);
			}
		},
		getDisplay: (toolName, _args, result) => getDisplay(toolName, result),
	};
}

function getDisplay(toolName: string, result: IServerToolDisplayResult | undefined): IServerToolDisplay | undefined {
	switch (toolName) {
		case readAgentMergeCIToolName:
			return {
				displayName: localize('agentMerge.tool.readCI', "Read Agent Merge CI"),
				invocationMessage: localize('agentMerge.tool.readCI.running', "Reading failed required checks"),
				pastTenseMessage: result?.success === false
					? localize('agentMerge.tool.readCI.failed', "Failed to read required checks")
					: localize('agentMerge.tool.readCI.complete', "Read failed required checks"),
			};
		case replyToAgentMergeReviewThreadToolName:
			return {
				displayName: localize('agentMerge.tool.replyReview', "Reply to Review Thread"),
				invocationMessage: localize('agentMerge.tool.replyReview.running', "Replying to review feedback"),
				pastTenseMessage: result?.success === false
					? localize('agentMerge.tool.replyReview.failed', "Failed to reply to review feedback")
					: localize('agentMerge.tool.replyReview.complete', "Replied to review feedback"),
			};
		case rerunAgentMergeWorkflowToolName:
			return {
				displayName: localize('agentMerge.tool.rerunWorkflow', "Rerun Workflow"),
				invocationMessage: localize('agentMerge.tool.rerunWorkflow.running', "Requesting workflow rerun"),
				pastTenseMessage: getWorkflowRerunMessage(result),
			};
		default:
			return undefined;
	}
}

function getWorkflowRerunMessage(result: IServerToolDisplayResult | undefined): string {
	if (result?.success === false) {
		return localize('agentMerge.tool.rerunWorkflow.failed', "Failed to rerun workflow");
	}
	const value: { readonly outcome?: string } | undefined = result?.text ? parse(result.text) : undefined;
	switch (value?.outcome) {
		case 'deferred':
			return localize('agentMerge.tool.rerunWorkflow.deferred', "Deferred workflow rerun until the current attempt finishes");
		case 'indeterminate':
			return localize('agentMerge.tool.rerunWorkflow.indeterminate', "Could not confirm workflow rerun");
		default:
			return localize('agentMerge.tool.rerunWorkflow.complete', "Requested workflow rerun");
	}
}

function asRecord(value: unknown, toolName: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`Invalid ${toolName} input: expected an object.`);
	}
	return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, toolName: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function optionalBoolean(value: unknown, field: string, toolName: string): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'boolean') {
		throw new Error(`Invalid ${toolName} input: ${field} must be a boolean.`);
	}
	return value;
}
