/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { parse } from '../../../../base/common/json.js';
import { AgentMergeSessionOverrides, agentMergeMergeBehaviorSummary, agentMergeMergePullRequestValues, isAgentMergeMergePullRequest } from '../../common/agentMerge.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

export const setAgentMergeEnabledToolName = 'setAgentMergeEnabled';
export const readAgentMergeCIToolName = 'readAgentMergeCI';
export const replyToAgentMergeReviewThreadToolName = 'replyToAgentMergeReviewThread';
export const rerunAgentMergeWorkflowToolName = 'rerunAgentMergeWorkflow';

const definitions: readonly IAgentServerToolDefinition[] = [
	{
		name: setAgentMergeEnabledToolName,
		title: 'Configure Agent Merge',
		description: 'Enable, disable, or configure Agent Merge for the current session when the user asks to start, stop, or configure Agent Merge, keep a pull request green, or merge it when ready. Not for one-off pull request inspection or repair. This does not change the global Agent Merge setting or GitHub auto-merge. Enablement and supplied options persist for this session. Only change options the user requests. Enabling monitoring alone does not enable automatic merging: for an explicit "merge when green" request, set mergePullRequest to "always", or "ifUnchanged" if the user wants to review agent-made changes first. Use the returned effective configuration when explaining what will happen. Initial enablement captures the current Git branch and returns target.branchName; autonomous work starts after the current turn ends. Calling again updates the configuration even when already enabled without changing the target; omitted options stay unchanged. The current tool-approval policy applies.',
		inputSchema: {
			type: 'object',
			properties: {
				enabled: { type: 'boolean', description: 'Whether Agent Merge should monitor and act on the pull request for this session. Pass true to update options while keeping it enabled.' },
				addressReviews: { type: 'boolean', description: 'Whether to address new pull request review comments. Omit to preserve the current option.' },
				fixCI: { type: 'boolean', description: 'Whether to fix failing CI checks. Omit to preserve the current option.' },
				resolveConflicts: { type: 'boolean', description: 'Whether to resolve merge conflicts and update a behind branch. Omit to preserve the current option.' },
				mergePullRequest: { type: 'string', enum: [...agentMergeMergePullRequestValues], description: 'When to merge automatically once ready: always, only while unchanged by Agent Merge, or never. Omit to preserve the current option.' },
			},
			required: ['enabled'],
		},
		annotations: { readOnlyHint: false },
	},
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
	setEnabled(session: string, enabled: boolean, overrides?: AgentMergeSessionOverrides): Promise<string>;
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
		canRequireConfirmation: toolName => toolName === setAgentMergeEnabledToolName,
		execute: (_stateManager: AgentHostStateManager, context, toolName: string, rawArgs: unknown) => {
			if (!accessor) {
				throw new Error('Agent Merge tools are not available without an Agent Merge controller.');
			}
			switch (toolName) {
				case setAgentMergeEnabledToolName: {
					const args = asRecord(rawArgs, toolName);
					if (Object.keys(args).some(key => !['enabled', 'addressReviews', 'fixCI', 'resolveConflicts', 'mergePullRequest'].includes(key))) {
						throw new Error(`Invalid ${toolName} input: unsupported configuration option.`);
					}
					const mergePullRequest = args.mergePullRequest;
					if (mergePullRequest !== undefined && !isAgentMergeMergePullRequest(mergePullRequest)) {
						throw new Error(`Invalid ${toolName} input: mergePullRequest must be always, ifUnchanged, or never.`);
					}
					return accessor.setEnabled(context.sessionUri, requiredBoolean(args.enabled, 'enabled', toolName), {
						...(args.addressReviews !== undefined ? { addressReviews: requiredBoolean(args.addressReviews, 'addressReviews', toolName) } : {}),
						...(args.fixCI !== undefined ? { fixCI: requiredBoolean(args.fixCI, 'fixCI', toolName) } : {}),
						...(args.resolveConflicts !== undefined ? { resolveConflicts: requiredBoolean(args.resolveConflicts, 'resolveConflicts', toolName) } : {}),
						...(mergePullRequest !== undefined ? { mergePullRequest } : {}),
					});
				}
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
		getDisplay,
	};
}

function getDisplay(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	switch (toolName) {
		case setAgentMergeEnabledToolName: {
			if (!isRecord(args)) {
				return undefined;
			}
			const enabled = args.enabled;
			if (typeof enabled !== 'boolean') {
				return undefined;
			}
			const configure = enabled && ['addressReviews', 'fixCI', 'resolveConflicts', 'mergePullRequest'].some(key => args[key] !== undefined);
			return {
				displayName: configure
					? localize('agentMerge.tool.configure', "Configure Agent Merge")
					: enabled
						? localize('agentMerge.tool.enable', "Enable Agent Merge")
						: localize('agentMerge.tool.disable', "Disable Agent Merge"),
				invocationMessage: configure
					? localize('agentMerge.tool.configure.running', "Configuring Agent Merge")
					: enabled
						? localize('agentMerge.tool.enable.running', "Enabling Agent Merge")
						: localize('agentMerge.tool.disable.running', "Disabling Agent Merge"),
				pastTenseMessage: getEnablementMessage(enabled, result),
				confirmationTitle: configure
					? localize('agentMerge.tool.configure.confirmationTitle', "Configure Agent Merge?")
					: enabled
						? localize('agentMerge.tool.enable.confirmationTitle', "Enable Agent Merge?")
						: localize('agentMerge.tool.disable.confirmationTitle', "Disable Agent Merge?"),
				confirmationMessage: getEnablementConfirmation(enabled, args),
			};
		}
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

function getEnablementConfirmation(enabled: boolean, args: Record<string, unknown>): string {
	const changes: string[] = [];
	if (typeof args.addressReviews === 'boolean') {
		changes.push(args.addressReviews
			? localize('agentMerge.tool.configure.addressReviews.on', "Address new pull request review comments.")
			: localize('agentMerge.tool.configure.addressReviews.off', "Do not address pull request review comments."));
	}
	if (typeof args.fixCI === 'boolean') {
		changes.push(args.fixCI
			? localize('agentMerge.tool.configure.fixCI.on', "Fix failing CI checks.")
			: localize('agentMerge.tool.configure.fixCI.off', "Do not fix failing CI checks."));
	}
	if (typeof args.resolveConflicts === 'boolean') {
		changes.push(args.resolveConflicts
			? localize('agentMerge.tool.configure.resolveConflicts.on', "Resolve merge conflicts and update the branch when it falls behind.")
			: localize('agentMerge.tool.configure.resolveConflicts.off', "Do not resolve merge conflicts or update a behind branch."));
	}
	switch (args.mergePullRequest) {
		case 'always':
			changes.push(localize('agentMerge.tool.configure.merge.always', "Merge the pull request automatically when it is ready, including changes made by Agent Merge."));
			break;
		case 'ifUnchanged':
			changes.push(localize('agentMerge.tool.configure.merge.ifUnchanged', "Merge the pull request automatically when it is ready, only if Agent Merge has not made changes."));
			break;
		case 'never':
			changes.push(localize('agentMerge.tool.configure.merge.never', "Do not merge the pull request automatically."));
			break;
	}
	if (changes.length === 0) {
		return enabled
			? localize('agentMerge.tool.enable.confirmationMessage', "Allow Agent Merge to monitor this session's pull request and work autonomously using its existing options, including merging if configured?")
			: localize('agentMerge.tool.disable.confirmationMessage', "Stop Agent Merge monitoring and autonomous work for this session?");
	}
	const heading = enabled
		? localize('agentMerge.tool.configure.confirmationMessage', "Allow Agent Merge to monitor this session's pull request and work autonomously with these option changes? Unspecified options stay unchanged.")
		: localize('agentMerge.tool.configure.disabled.confirmationMessage', "Stop Agent Merge monitoring and autonomous work, and save these option changes for this session? Unspecified options stay unchanged.");
	return [heading, '', ...changes.map(change => `- ${change}`)].join('\n');
}

function getEnablementMessage(enabled: boolean, result: IServerToolDisplayResult | undefined): string {
	if (result?.success === false) {
		return localize('agentMerge.tool.setEnabled.failed', "Failed to update Agent Merge");
	}
	const value: { readonly enabled?: boolean; readonly configuration?: { readonly mergePullRequest?: string }; readonly monitoring?: string } | undefined = result?.text ? parse(result.text) : undefined;
	if (value?.enabled && isAgentMergeMergePullRequest(value.configuration?.mergePullRequest)) {
		const summary = agentMergeMergeBehaviorSummary(value.configuration.mergePullRequest);
		return value.monitoring === 'pending'
			? localize('agentMerge.tool.enable.pending', "Agent Merge enabled; monitoring starts after this turn. {0}", summary)
			: localize('agentMerge.tool.enable.configured', "Agent Merge enabled. {0}", summary);
	}
	return (value?.enabled ?? enabled)
		? localize('agentMerge.tool.enable.complete', "Enabled Agent Merge")
		: localize('agentMerge.tool.disable.complete', "Disabled Agent Merge");
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, toolName: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`Invalid ${toolName} input: expected an object.`);
	}
	return value;
}

function requiredString(value: unknown, field: string, toolName: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function requiredBoolean(value: unknown, field: string, toolName: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`Invalid ${toolName} input: ${field} must be a boolean.`);
	}
	return value;
}

function optionalBoolean(value: unknown, field: string, toolName: string): boolean | undefined {
	return value === undefined ? undefined : requiredBoolean(value, field, toolName);
}
