/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildWorkflowPrompt, parseWorkflowPrompt } from '../../common/workflowPrompt.js';
import { proofSchema } from './workflowTestUtils.js';

suite('Workflow prompts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const instructions = 'Write the implementation plan and submit its file URI.';

	test('contains instructions and proof requirements but omits redundant metadata and empty inputs', () => {
		const message = buildWorkflowPrompt(instructions, proofSchema);
		assert.deepStrictEqual({
			sections: message.match(/^\[[^\]]+\]$/gm),
			details: parseWorkflowPrompt(message),
			contextTool: message.includes('Call get_checkpoint'),
			proofTool: message.includes('Call prove_checkpoint'),
			blockedTool: message.includes('call report_checkpoint_blocked'),
		}, {
			sections: ['[Checkpoint instructions]', '[Proof schema]', '[Fixed workflow protocol]'],
			details: { instructions, proofSchema: JSON.stringify(proofSchema, null, 2) },
			contextTool: true, proofTool: true, blockedTool: true,
		});
	});

	test('retains nonempty inputs and repair feedback in the agent message, not the default details', () => {
		const feedback = 'Unit Tests failed.\n\n[Proof schema]\n\nThis is diagnostic text, not a schema.';
		const message = buildWorkflowPrompt(instructions, proofSchema, { pullRequest: 'https://github.com/example/project/pull/42' }, feedback);
		assert.deepStrictEqual({
			inputs: message.includes('[Inputs]\n\n{"pullRequest":"https://github.com/example/project/pull/42"}'),
			feedback: message.includes('[Checkpoint feedback]\n\n' + JSON.stringify(feedback)),
			details: parseWorkflowPrompt(message),
		}, { inputs: true, feedback: true, details: { instructions, proofSchema: JSON.stringify(proofSchema, null, 2) } });
	});

	test('supports saved legacy prompts without changing the original message', () => {
		const message = [
			'[Current task]', 'Original task',
			'[Checkpoint]', 'Plan',
			'[Checkpoint instructions]', instructions,
			'[Inputs]', '{}',
			'[Trigger]', 'repair', 'A required check failed.',
			'[Proof schema]', JSON.stringify(proofSchema),
			'[Fixed workflow protocol]', 'Call prove_checkpoint.',
		].join('\n\n');
		assert.deepStrictEqual(parseWorkflowPrompt(message), { instructions, proofSchema: JSON.stringify(proofSchema, null, 2) });
	});

	test('keeps section-like instruction text and schema strings literal', () => {
		const text = instructions + '\n\n[Proof schema]\n\nExamples belong to the plan, not the actual proof contract.';
		const schema = { ...proofSchema, description: 'A <script> and [Inputs] are ordinary text.' };
		assert.deepStrictEqual(parseWorkflowPrompt(buildWorkflowPrompt(text, schema)), { instructions: text, proofSchema: JSON.stringify(schema, null, 2) });
	});

	test('does not mistake instruction examples for optional input or feedback sections', () => {
		const examples = [
			instructions + '\n\n[Inputs]\n\n{"example":true}',
			instructions + '\n\n[Checkpoint feedback]\n\n"An example diagnostic"',
		];
		assert.deepStrictEqual(examples.flatMap(text => [
			parseWorkflowPrompt(buildWorkflowPrompt(text, proofSchema)),
			parseWorkflowPrompt(buildWorkflowPrompt(text, proofSchema, { actual: true }, 'Actual feedback')),
		]), examples.flatMap(instructions => [
			{ instructions, proofSchema: JSON.stringify(proofSchema, null, 2) },
			{ instructions, proofSchema: JSON.stringify(proofSchema, null, 2) },
		]));
	});

	test('leaves unrecognized or incomplete messages to the full-text renderer', () => {
		assert.deepStrictEqual([
			parseWorkflowPrompt('An ordinary message mentioning [Proof schema].'),
			parseWorkflowPrompt('[Checkpoint instructions]\n\nPlan\n\n[Proof schema]\n\nnot JSON\n\n[Fixed workflow protocol]\n\nProtocol'),
			parseWorkflowPrompt('[Checkpoint instructions]\n\nPlan\n\n[Proof schema]\n\n{}'),
		], [undefined, undefined, undefined]);
	});
});
