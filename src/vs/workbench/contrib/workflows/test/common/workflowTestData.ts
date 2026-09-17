/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkflowCheckpointType, WorkflowDefinition, WorkflowRun, WorkflowSnapshot } from '../../../../../platform/workflow/common/workflow.js';
import { deepFreeze } from '../../../../../base/common/objects.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';

export function testCheckpointType(id = 'test/summary', version = 1): WorkflowCheckpointType {
	return {
		id, version, label: 'Summary',
		instructions: 'Summarize the completed work and submit the summary as proof.',
		proofSchema: { type: 'object', properties: { summary: { type: 'string', minLength: 1 } }, required: ['summary'], additionalProperties: false },
		completion: { kind: 'reported' },
	};
}

export function testWorkflowDefinition(): WorkflowDefinition {
	return {
		id: 'test/feature', version: 1, label: 'Feature delivery',
		checkpoints: [{ id: 'plan', type: 'test/summary@1', label: 'Plan' }, { id: 'implement', type: 'test/summary@1', label: 'Implementation' }],
	};
}

export function testWorkflowSnapshot(): WorkflowSnapshot {
	const definition = testWorkflowDefinition();
	const type = testCheckpointType();
	return deepFreeze({
		...definition,
		checkpoints: definition.checkpoints.map(checkpoint => ({ id: checkpoint.id, label: checkpoint.label!, type, instructions: type.instructions, inputs: {} })),
	});
}

export function testWorkflowRun(): WorkflowRun {
	return {
		id: 'test-run', version: 1, revision: 1,
		session: 'test-session://owner/one', chat: 'test-session://owner/one',
		task: 'Implement keyboard navigation',
		inputs: {},
		snapshot: testWorkflowSnapshot(),
		stopAfter: 'implement', status: 'running', checkpointIndex: 0,
		receipts: [], firstTurns: { plan: 'first-turn' },
		createdAt: 1, updatedAt: 1, activityAt: 1,
	};
}

export function testWorkflowRunWithMissingInputs(): WorkflowRun {
	const run = testWorkflowRun();
	const inputSchema: IJSONSchema = {
		type: 'object',
		properties: {
			repository: { type: 'string', title: 'Repository', format: 'uri', minLength: 1 },
			channel: { type: 'string', title: 'Release channel', enum: ['stable', 'insiders'] },
		},
		required: ['repository', 'channel'], additionalProperties: false,
	};
	return {
		...run, status: 'blocked', checkpointIndex: 1,
		snapshot: {
			...run.snapshot,
			inputSchema: { ...inputSchema, properties: { ...inputSchema.properties, experimentName: { type: 'string' } } },
			checkpoints: run.snapshot.checkpoints.map(checkpoint => checkpoint.id === 'implement' ? {
				...checkpoint,
				type: { ...checkpoint.type, id: 'test/inputs', inputSchema },
				inputs: { repository: { input: 'repository' }, channel: { input: 'channel' } },
			} : checkpoint),
		},
		inputRequest: { checkpointId: 'implement', keys: ['repository', 'channel'] },
		reason: 'Provide the inputs for Implementation to continue.',
		receipts: [{
			id: 'receipt', checkpointId: 'plan', assignmentId: 'plan-assignment', turnId: 'first-turn', acceptedAt: 1,
			proof: { summary: 'Plan saved.' }, output: { summary: 'Plan saved.' }, evidence: [], provenance: 'reported',
		}],
	};
}

export function testWorkflowRunWithStartCondition(): WorkflowRun {
	const type: WorkflowCheckpointType = {
		...testCheckpointType('test/experiment-started'),
		label: 'Experiment started',
		instructions: 'Start the experiment after the change is available in a release.',
		startCondition: {
			check: 'vscode.github/commit-in-release@1',
			inputs: { repository: { value: 'https://github.com/example/project' }, commit: { value: 'a'.repeat(40) } },
		},
	};
	const checkpointId = 'experiment-started';
	const proof = { summary: 'Experiment A started.' };
	return {
		...testWorkflowRun(),
		task: 'Start experiment A',
		snapshot: deepFreeze({
			id: 'test/experiment', version: 1, label: 'Experiment rollout',
			checkpoints: [{ id: checkpointId, label: type.label, instructions: type.instructions, type, inputs: {} }],
		}),
		status: 'completed', checkpointIndex: 1, stopAfter: checkpointId,
		firstTurns: { [checkpointId]: 'first-turn' },
		receipts: [{
			id: 'experiment-receipt', checkpointId, assignmentId: 'experiment-assignment', turnId: 'first-turn',
			proof, output: proof, provenance: 'reported', acceptedAt: 2,
			evidence: [{ kind: 'link', uri: 'https://example.com/experiments/42', label: 'Experiment A' }],
		}],
		startConditionReceipts: [{
			id: 'release-receipt', checkpointId, assignmentId: 'experiment-assignment', checkId: 'vscode.github/commit-in-release@1',
			output: { releaseId: 42, releaseCommit: 'a'.repeat(40), tagSha: 'b'.repeat(40) },
			evidence: [{ kind: 'link', uri: 'https://github.com/example/project/releases/tag/v1.2.3', label: 'Published release v1.2.3' }],
			provenance: 'checked', observedAt: 1,
		}],
		updatedAt: 2,
	};
}
