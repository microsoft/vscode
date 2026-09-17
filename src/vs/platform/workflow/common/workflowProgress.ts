/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { WorkflowProgress, WorkflowRun, WorkflowRunStatus } from './workflow.js';

export function getWorkflowProgress(run: WorkflowRun): WorkflowProgress {
	const index = run.status === 'completed' || run.status === 'stopped'
		? Math.max(0, run.checkpointIndex - 1)
		: run.checkpointIndex;
	const checkpoint = run.snapshot.checkpoints[Math.min(index, run.snapshot.checkpoints.length - 1)];
	const lastDispatchedCheckpoint = run.snapshot.checkpoints.findLast(checkpoint => run.firstTurns[checkpoint.id] !== undefined);
	const completedCheckpoint = run.snapshot.checkpoints.slice(0, run.checkpointIndex).findLast(checkpoint => checkpoint.afterCompletion?.group !== undefined);
	return {
		runId: run.id,
		label: run.snapshot.label,
		checkpointId: checkpoint.id,
		checkpointLabel: checkpoint.label,
		...(lastDispatchedCheckpoint ? { lastDispatchedCheckpointLabel: lastDispatchedCheckpoint.label } : {}),
		position: Math.min(index + 1, run.snapshot.checkpoints.length),
		total: run.snapshot.checkpoints.length,
		completed: run.receipts.length,
		status: run.status,
		reason: run.reason ?? run.wait?.reason,
		needsAttention: run.status === 'blocked' || run.status === 'stopped' || run.status === 'completed',
		activityAt: run.activityAt,
		firstTurnId: run.firstTurns[checkpoint.id],
		group: completedCheckpoint?.afterCompletion?.group,
		revision: run.revision,
	};
}

/** Uses a known dispatched turn as the fallback for older progress metadata. */
export function getWorkflowCheckpointCaption(progress: WorkflowProgress): string | undefined {
	return progress.lastDispatchedCheckpointLabel ?? (progress.firstTurnId ? progress.checkpointLabel : undefined);
}

export function getWorkflowProgressLabel(progress: WorkflowProgress): string {
	return localize('workflow.progress.label', "{0}: {1}", progress.checkpointLabel, getWorkflowStatusLabel(progress.status));
}

export function getWorkflowStatusLabel(status: WorkflowRunStatus): string {
	switch (status) {
		case 'running':
			return localize('workflow.status.running', "In progress");
		case 'waiting':
			return localize('workflow.status.waiting', "Waiting");
		case 'stopped':
			return localize('workflow.status.stopped', "Stopping point reached");
		case 'paused':
			return localize('workflow.status.paused', "Paused");
		case 'blocked':
			return localize('workflow.status.blocked', "Blocked");
		case 'completed':
			return localize('workflow.status.completed', "Completed");
		case 'cancelled':
			return localize('workflow.status.cancelled', "Cancelled");
		default:
			return localize('workflow.status.unknown', "Unknown state");
	}
}

export function getWorkflowProgressDescription(progress: WorkflowProgress): string {
	const completed = progress.total === 1
		? localize('workflow.progress.completedCount.singular', "{0} of {1} checkpoint completed", progress.completed, progress.total)
		: localize('workflow.progress.completedCount', "{0} of {1} checkpoints completed", progress.completed, progress.total);
	const reason = progress.reason?.trim();
	return reason
		? localize('workflow.progress.descriptionWithReason', "{0} ({1})", reason, completed)
		: completed;
}
