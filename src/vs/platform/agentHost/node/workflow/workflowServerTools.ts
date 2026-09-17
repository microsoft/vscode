/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { validateWorkflowObject } from '../../../workflow/common/workflowValidation.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import type { IServerToolGroup } from '../shared/agentServerToolHost.js';
import type { IAgentHostWorkflowService } from './agentHostWorkflowService.js';

export const WorkflowToolName = {
	GetCheckpoint: 'get_checkpoint',
	ProveCheckpoint: 'prove_checkpoint',
	ReportCheckpointBlocked: 'report_checkpoint_blocked',
} as const;

const closedObjectSchema = { type: 'object' as const, additionalProperties: false };
const definitions: readonly IAgentServerToolDefinition[] = [
	{
		name: WorkflowToolName.GetCheckpoint,
		description: 'Read the original user request and current workflow assignment, including bound inputs, instructions and proof schema. Use when this turn was assigned a workflow checkpoint and you need its task or context. An ordinary chat or delegated subagent cannot claim a workflow assignment. Do not poll; saved waits are rechecked by the host.',
		inputSchema: { ...closedObjectSchema, properties: {} },
	},
	{
		name: WorkflowToolName.ProveCheckpoint,
		description: 'Submit proof for this turn’s workflow checkpoint. Finish delegated work first and follow the proof schema returned by get_checkpoint. An ended turn is not proof. Acceptance durably records evidence and progress, but does not authorize another checkpoint in this turn. After accepted or waiting, give a brief status and end the turn; after rejected, repair and resubmit if possible. After blocked or stale_assignment, end the turn. Do not poll a saved wait.',
		inputSchema: { ...closedObjectSchema, properties: { proof: { type: 'object', additionalProperties: true } }, required: ['proof'] },
	},
	{
		name: WorkflowToolName.ReportCheckpointBlocked,
		description: 'Report why the current workflow assignment cannot proceed. Use for an unresolved blocker, not for a saved wait or ordinary tool permission request. The host stops automatic continuation and requests attention. After reporting a blocker, end the turn.',
		inputSchema: { ...closedObjectSchema, properties: { reason: { type: 'string', minLength: 1, maxLength: 4096 } }, required: ['reason'] },
	},
];

export function createWorkflowServerToolGroup(workflows?: IAgentHostWorkflowService): IServerToolGroup {
	return {
		definitions,
		isEnabled: () => true,
		isEnabledForSession: () => true,
		execute: async (_state, context, name, rawArgs) => {
			if (!workflows) {
				throw new Error('Workflow tools are not available in this host');
			}
			if (!isObject(rawArgs) || JSON.stringify(rawArgs).length > 256 * 1024) {
				throw new Error('Workflow tool arguments must be a bounded JSON object');
			}
			switch (name) {
				case WorkflowToolName.GetCheckpoint:
					if (Object.keys(rawArgs).length !== 0) {
						throw new Error('get_checkpoint does not accept authority or checkpoint arguments');
					}
					return workflows.getCheckpoint(context);
				case WorkflowToolName.ProveCheckpoint:
					if (Object.keys(rawArgs).length !== 1) {
						throw new Error('prove_checkpoint requires a JSON proof object only');
					}
					validateWorkflowObject(rawArgs.proof);
					return JSON.stringify(await workflows.prove(context, rawArgs.proof));
				case WorkflowToolName.ReportCheckpointBlocked:
					if (Object.keys(rawArgs).length !== 1 || typeof rawArgs.reason !== 'string' || !rawArgs.reason.trim() || rawArgs.reason.length > 4096) {
						throw new Error('report_checkpoint_blocked requires a nonempty reason of at most 4096 characters');
					}
					return JSON.stringify(await workflows.reportBlocked(context, rawArgs.reason));
				default:
					throw new Error(`Unknown workflow tool: ${name}`);
			}
		},
		getDisplay: name => {
			switch (name) {
				case WorkflowToolName.GetCheckpoint:
					return { displayName: localize('workflowTools.get', "Read Checkpoint"), invocationMessage: localize('workflowTools.getting', "Reading the current workflow checkpoint") };
				case WorkflowToolName.ProveCheckpoint:
					return { displayName: localize('workflowTools.prove', "Submit Checkpoint Proof"), invocationMessage: localize('workflowTools.proving', "Checking workflow evidence") };
				case WorkflowToolName.ReportCheckpointBlocked:
					return { displayName: localize('workflowTools.blocked', "Report Checkpoint Blocker"), invocationMessage: localize('workflowTools.blocking', "Reporting a workflow blocker") };
				default:
					return undefined;
			}
		},
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
