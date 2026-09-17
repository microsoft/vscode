/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import type { WorkflowAssignmentReason } from './workflow.js';

/** Immutable display metadata, independent of the agent-facing prompt and execution authority. */
export interface WorkflowMessagePresentation {
	readonly kind: 'workflow';
	readonly workflowLabel: string;
	readonly checkpointLabel: string;
	readonly reason?: WorkflowAssignmentReason;
}

export function parseWorkflowMessagePresentation(value: unknown): WorkflowMessagePresentation | undefined {
	if (!isRecord(value) || value.kind !== 'workflow'
		|| typeof value.workflowLabel !== 'string' || !value.workflowLabel.trim()
		|| typeof value.checkpointLabel !== 'string' || !value.checkpointLabel.trim()) {
		return undefined;
	}
	const reason = value.reason;
	if (reason !== undefined && reason !== 'start' && reason !== 'previous_completed'
		&& reason !== 'repair' && reason !== 'resume' && reason !== 'missing_proof' && reason !== 'reconcile') {
		return undefined;
	}
	return {
		kind: 'workflow',
		workflowLabel: value.workflowLabel,
		checkpointLabel: value.checkpointLabel,
		...(reason !== undefined ? { reason } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}
