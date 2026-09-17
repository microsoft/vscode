/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkflowProgress, WorkflowRunStatus } from '../../common/workflow.js';
import { getWorkflowCheckpointCaption, getWorkflowProgressDescription, getWorkflowProgressLabel, getWorkflowStatusLabel } from '../../common/workflowProgress.js';

suite('Workflow progress presentation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const progress: WorkflowProgress = {
		runId: 'run',
		label: 'Feature workflow',
		checkpointId: 'implementation',
		checkpointLabel: 'Implementation',
		position: 3,
		total: 10,
		completed: 2,
		status: 'running',
		needsAttention: false,
		activityAt: 1000,
		revision: 1,
	};

	test('uses consistent plain-text checkpoint and state labels', () => {
		const statuses: WorkflowRunStatus[] = ['running', 'waiting', 'stopped', 'paused', 'blocked', 'completed', 'cancelled'];
		assert.deepStrictEqual(statuses.map(status => [getWorkflowStatusLabel(status), getWorkflowProgressLabel({ ...progress, status })]), [
			['In progress', 'Implementation: In progress'],
			['Waiting', 'Implementation: Waiting'],
			['Stopping point reached', 'Implementation: Stopping point reached'],
			['Paused', 'Implementation: Paused'],
			['Blocked', 'Implementation: Blocked'],
			['Completed', 'Implementation: Completed'],
			['Cancelled', 'Implementation: Cancelled'],
		]);
	});

	test('compact captions only name a dispatched checkpoint, including legacy metadata', () => {
		const statuses: WorkflowRunStatus[] = ['running', 'waiting', 'stopped', 'paused', 'blocked', 'completed', 'cancelled'];
		assert.deepStrictEqual({
			beforeDispatch: getWorkflowCheckpointCaption(progress),
			legacyDispatched: getWorkflowCheckpointCaption({ ...progress, firstTurnId: 'turn' }),
			pendingNextCheckpoint: getWorkflowCheckpointCaption({ ...progress, lastDispatchedCheckpointLabel: 'Plan' }),
			statuses: statuses.map(status => getWorkflowCheckpointCaption({ ...progress, status, lastDispatchedCheckpointLabel: 'Plan', reason: 'Needs input' })),
		}, {
			beforeDispatch: undefined, legacyDispatched: 'Implementation', pendingNextCheckpoint: 'Plan',
			statuses: ['Plan', 'Plan', 'Plan', 'Plan', 'Plan', 'Plan', 'Plan'],
		});
	});

	test('describes reasons together with completed and total checkpoints', () => {
		assert.deepStrictEqual([
			getWorkflowProgressDescription(progress),
			getWorkflowProgressDescription({ ...progress, status: 'waiting', reason: 'CI pending' }),
			getWorkflowProgressDescription({ ...progress, reason: '  Access is unavailable  ' }),
			getWorkflowProgressDescription({ ...progress, reason: ' \n ' }),
		], [
			'2 of 10 checkpoints completed',
			'CI pending (2 of 10 checkpoints completed)',
			'Access is unavailable (2 of 10 checkpoints completed)',
			'2 of 10 checkpoints completed',
		]);
	});

	test('uses singular wording for single-checkpoint workflows', () => {
		assert.deepStrictEqual([
			getWorkflowProgressDescription({ ...progress, completed: 0, total: 1 }),
			getWorkflowProgressDescription({ ...progress, completed: 1, total: 1, status: 'completed' }),
		], ['0 of 1 checkpoint completed', '1 of 1 checkpoint completed']);
	});

	test('formatting does not mutate progress, timestamps or quiet attention state', () => {
		const frozen = Object.freeze({ ...progress, reason: 'Waiting for release', status: 'waiting' as const });
		getWorkflowProgressLabel(frozen);
		getWorkflowCheckpointCaption(frozen);
		getWorkflowProgressDescription(frozen);
		assert.deepStrictEqual(frozen, { ...progress, reason: 'Waiting for release', status: 'waiting' });
	});
});
