/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkflowCheckpointType, WorkflowDefinition } from '../../../../../platform/workflow/common/workflow.js';
import { makeWorkflowLocalContract, moveWorkflowCheckpoint, removeWorkflowCheckpoint } from '../../common/workflowEditing.js';
import { testCheckpointType, testWorkflowDefinition } from './workflowTestData.js';

suite('Workflow editing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const summary = testCheckpointType();
	const consumer: WorkflowCheckpointType = { ...testCheckpointType('test/consume'), inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } };
	const dependency: WorkflowDefinition = {
		...testWorkflowDefinition(),
		checkpoints: [{ id: 'first', type: 'test/summary@1' }, { id: 'second', type: 'test/consume@1', inputs: { summary: { checkpoint: 'first', outputPointer: '/summary' } } }],
	};

	test('reordering preserves each independent checkpoint and leaves the original unchanged', () => {
		const original = testWorkflowDefinition();
		const moved = moveWorkflowCheckpoint(original, 'plan', 1, [summary]);
		assert.deepStrictEqual([original.checkpoints.map(checkpoint => checkpoint.id), moved.checkpoints.map(checkpoint => checkpoint.id)], [['plan', 'implement'], ['implement', 'plan']]);
	});

	test('reordering and removal cannot strand input dependencies', () => {
		assert.throws(() => moveWorkflowCheckpoint(dependency, 'first', 1, [summary, consumer]), /earlier checkpoint/);
		assert.throws(() => removeWorkflowCheckpoint(dependency, 'first', [summary, consumer]), /earlier checkpoint/);
	});

	test('copying a contract makes an independent per-workflow definition', () => {
		const definition = testWorkflowDefinition();
		const checkpoint = makeWorkflowLocalContract(definition, definition.checkpoints[0], summary);
		assert.deepStrictEqual({
			id: checkpoint.localType?.id,
			type: checkpoint.type,
			original: summary.id,
			cloned: checkpoint.localType?.proofSchema !== summary.proofSchema,
		}, { id: 'test/feature/plan', type: 'test/feature/plan@1', original: 'test/summary', cloned: true });
	});
});
