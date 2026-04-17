/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { augmentPromptWithPlanningContext, buildPlanningTransitionContext, isPlanningModeName, mergePlanningTransitionContexts } from '../../../common/planning/chatPlanningTransition.js';

suite('ChatPlanningTransition', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds a normalized planning context from carousel answers', () => {
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			allowSkip: true,
			questions: [
				{ id: 'goal', type: 'text', title: 'Goal' },
				{ id: 'scope', type: 'singleSelect', title: 'Scope', options: [{ id: 'narrow', label: 'Narrow', value: 'Narrow' }] },
				{ id: 'tasks', type: 'multiSelect', title: 'Task Breakdown', options: [{ id: 'a', label: 'Audit', value: 'Audit' }, { id: 'b', label: 'Implement', value: 'Implement' }] }
			],
			data: {
				goal: 'Clarify the transition into implementation',
				scope: { selectedValue: 'Narrow' },
				tasks: { selectedValues: ['Audit', 'Implement'], freeformValue: 'Validate the handoff prompt' }
			},
			isUsed: true
		};

		const context = buildPlanningTransitionContext(carousel);
		assert.deepStrictEqual(context, {
			phase: 'broad-scan',
			answers: [
				{ question: 'Goal', answer: 'Clarify the transition into implementation' },
				{ question: 'Scope', answer: 'Narrow' },
				{ question: 'Task Breakdown', answer: 'Audit, Implement; Validate the handoff prompt' }
			]
		});
	});

	test('augments the base handoff prompt with planning context', () => {
		const prompt = augmentPromptWithPlanningContext('Implement the approved plan.', {
			phase: 'focused-slice',
			answers: [
				{ question: 'Goal', answer: 'Improve goal clarity before coding' },
				{ question: 'Constraints', answer: 'Keep changes localized to chat planning' }
			]
		});

		assert.ok(prompt.startsWith('Implement the approved plan.'));
		assert.ok(prompt.includes('Planning context from the previous planning step:'));
		assert.ok(prompt.includes('- Goal: Improve goal clarity before coding'));
		assert.ok(prompt.includes('- Constraints: Keep changes localized to chat planning'));
	});

	test('merges planning contexts without duplicating the same question', () => {
		const merged = mergePlanningTransitionContexts(
			{
				phase: 'broad-scan',
				answers: [
					{ question: 'Goal', answer: 'Clarify scope before editing files' },
					{ question: 'Constraints', answer: 'Touch chat planning only' }
				]
			},
			{
				phase: 'detailed-inspection',
				answers: [
					{ question: 'Constraints', answer: 'This later duplicate should be ignored' },
					{ question: 'Task Breakdown', answer: 'Audit existing flow, then wire the transition' }
				]
			}
		);

		assert.deepStrictEqual(merged, {
			phase: 'detailed-inspection',
			answers: [
				{ question: 'Goal', answer: 'Clarify scope before editing files' },
				{ question: 'Constraints', answer: 'Touch chat planning only' },
				{ question: 'Task Breakdown', answer: 'Audit existing flow, then wire the transition' }
			]
		});
	});

	test('recognizes planning mode names', () => {
		assert.strictEqual(isPlanningModeName('Plan'), true);
		assert.strictEqual(isPlanningModeName('planner'), true);
		assert.strictEqual(isPlanningModeName('Agent'), false);
	});
});
