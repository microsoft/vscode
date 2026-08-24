/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
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
		description: 'Read annotations, failed jobs, and bounded logs for failed required checks on the pull request authorized for the active Agent Merge turn.',
		inputSchema: { type: 'object', properties: {} },
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
		description: 'Rerun a GitHub Actions workflow associated with a failed required check in the active Agent Merge turn.',
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
	readFailedCI(session: string): Promise<string>;
	replyToReviewThread(session: string, threadId: string, body: string, resolve: boolean): Promise<string>;
	rerunFailedWorkflow(session: string, runId: string, failedJobsOnly: boolean): Promise<string>;
}

export function createAgentMergeServerToolGroup(accessor?: IAgentMergeToolAccessor): IServerToolGroup {
	return {
		definitions,
		isEnabled: toolName => accessor?.isEnabled() === true && definitions.some(definition => definition.name === toolName),
		execute: (_stateManager: AgentHostStateManager, context, toolName: string, rawArgs: unknown) => {
			if (!accessor) {
				throw new Error('Agent Merge tools are not available without an Agent Merge controller.');
			}
			switch (toolName) {
				case readAgentMergeCIToolName:
					return accessor.readFailedCI(context.sessionUri);
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
				invocationMessage: localize('agentMerge.tool.rerunWorkflow.running', "Rerunning failed workflow"),
				pastTenseMessage: result?.success === false
					? localize('agentMerge.tool.rerunWorkflow.failed', "Failed to rerun workflow")
					: localize('agentMerge.tool.rerunWorkflow.complete', "Reran failed workflow"),
			};
		default:
			return undefined;
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
