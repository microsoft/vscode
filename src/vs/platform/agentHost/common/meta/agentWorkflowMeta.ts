/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkflowInvocation, WorkflowProgress } from '../../../workflow/common/workflow.js';
import { parseWorkflowMessagePresentation, type WorkflowMessagePresentation } from '../../../workflow/common/workflowMessage.js';

export const AgentWorkflowCapabilityMetaKey = 'vscode.workflows';
const progressMetaKey = 'vscode.workflow';
const messageMetaKey = 'vscode.chat.workflow';

interface IHasMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentWorkflowRunChange {
	readonly session: string;
	readonly progress?: WorkflowProgress;
}

export function supportsAgentHostWorkflows(source: IHasMeta | undefined): boolean {
	return source?._meta?.[AgentWorkflowCapabilityMetaKey] === true;
}

export function toAgentWorkflowCapabilityMeta(supported: boolean | undefined): { [AgentWorkflowCapabilityMetaKey]: true } | undefined {
	return supported === true ? { [AgentWorkflowCapabilityMetaKey]: true } : undefined;
}

export function readAgentWorkflowRunChange(value: unknown): IAgentWorkflowRunChange | undefined {
	if (!isRecord(value) || typeof value.session !== 'string' || !value.session) {
		return undefined;
	}
	const candidate = value.progress;
	const progress = readAgentWorkflowProgress({ _meta: { [progressMetaKey]: candidate } });
	return candidate === undefined || progress ? { session: value.session, progress } : undefined;
}

export function readAgentWorkflowProgress(source: IHasMeta | undefined): WorkflowProgress | undefined {
	const value = source?._meta?.[progressMetaKey];
	if (!isRecord(value)
		|| typeof value.runId !== 'string' || typeof value.label !== 'string'
		|| typeof value.checkpointId !== 'string' || typeof value.checkpointLabel !== 'string'
		|| !isCount(value.position) || !isCount(value.total) || !isCount(value.completed) || !isCount(value.revision)
		|| value.total < 1 || value.position > value.total || value.completed > value.total
		|| typeof value.status !== 'string' || !['running', 'waiting', 'stopped', 'paused', 'blocked', 'completed', 'cancelled'].includes(value.status)
		|| typeof value.needsAttention !== 'boolean' || !isCount(value.activityAt)) {
		return undefined;
	}
	const optional = value as Record<string, unknown>;
	if (['reason', 'firstTurnId', 'group', 'lastDispatchedCheckpointLabel'].some(key => optional[key] !== undefined && typeof optional[key] !== 'string')
		|| typeof optional.lastDispatchedCheckpointLabel === 'string' && !optional.lastDispatchedCheckpointLabel.trim()) {
		return undefined;
	}
	return {
		runId: value.runId, label: value.label, checkpointId: value.checkpointId, checkpointLabel: value.checkpointLabel,
		position: value.position, total: value.total, completed: value.completed, revision: value.revision,
		status: value.status as WorkflowProgress['status'], needsAttention: value.needsAttention, activityAt: value.activityAt,
		...(typeof optional.reason === 'string' ? { reason: optional.reason } : {}),
		...(typeof optional.firstTurnId === 'string' ? { firstTurnId: optional.firstTurnId } : {}),
		...(typeof optional.lastDispatchedCheckpointLabel === 'string' ? { lastDispatchedCheckpointLabel: optional.lastDispatchedCheckpointLabel } : {}),
		...(typeof optional.group === 'string' ? { group: optional.group } : {}),
	};
}

export function withAgentWorkflowProgress(meta: Record<string, unknown> | undefined, progress: WorkflowProgress | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (progress) {
		result[progressMetaKey] = progress;
	} else {
		delete result[progressMetaKey];
	}
	return result;
}

/** This marker is presentational; only the host's prepared turn authorizes an assignment. */
export function isWorkflowMessage(source: IHasMeta): boolean {
	return source._meta?.[messageMetaKey] !== undefined;
}

export function readWorkflowMessagePresentation(source: IHasMeta): WorkflowMessagePresentation | undefined {
	const value = source._meta?.[messageMetaKey];
	return isRecord(value) ? parseWorkflowMessagePresentation(value.presentation) : undefined;
}

export function toWorkflowMessageMeta(invocation: WorkflowInvocation | undefined, presentation?: WorkflowMessagePresentation): Record<string, unknown> {
	return { [messageMetaKey]: { ...invocation, ...(presentation ? { presentation } : {}) } };
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
