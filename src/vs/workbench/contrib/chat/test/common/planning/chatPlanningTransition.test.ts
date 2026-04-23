/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { augmentPromptWithPlanningContext, buildPlanningTransitionContext, isPlanningModeName, mergePlanningTransitionContexts, planningTargetConfirmationQuestionId, serializePlanningTarget } from '../../../common/planning/chatPlanningTransition.js';

suite('ChatPlanningTransition', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds a normalized planning context from carousel answers', () => {
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			allowSkip: true,
			questions: [
				{ id: 'goal', type: 'text', title: 'Goal' },
				{ id: 'scope', type: 'singleSelect', title: 'Scope', options: [{ id: 'narrow', label: 'Narrow', value: 'scope:narrow' }] },
				{ id: 'tasks', type: 'multiSelect', title: 'Task Breakdown', options: [{ id: 'a', label: 'Audit', value: 'task:audit' }, { id: 'b', label: 'Implement', value: 'task:implement' }] }
			],
			data: {
				goal: 'Clarify the transition into implementation',
				scope: { selectedValue: 'scope:narrow' },
				tasks: { selectedValues: ['task:audit', 'task:implement'], freeformValue: 'Validate the handoff prompt' }
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
			],
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'file', label: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts', confidence: 'high' },
				workspaceFolders: ['vscode'],
				workspaceTopLevelEntries: ['src', 'extensions', 'build'],
				workingSetFiles: ['src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'],
				focusQueries: ['planning', 'chatWidget'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		});

		assert.ok(prompt.startsWith('Implement the approved plan.'));
		assert.ok(prompt.includes('Planning context from the previous planning step:'));
		assert.ok(prompt.includes('- Goal: Improve goal clarity before coding'));
		assert.ok(prompt.includes('- Constraints: Keep changes localized to chat planning'));
		assert.ok(prompt.includes('Planning target: src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts (file, high confidence)'));
		assert.ok(prompt.includes('Workspace top-level entries: src, extensions, build'));
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

	test('prefers narrowed repository context details from the latest stage', () => {
		const merged = mergePlanningTransitionContexts(
			{
				phase: 'broad-scan',
				answers: [{ question: 'Goal', answer: 'Analyze the CSV workflow' }],
				repositoryContext: {
					scope: 'broad',
					planningTarget: { kind: 'folder', label: 'data', confidence: 'medium' },
					focusSummary: 'Broad workspace scan',
					focusQueries: ['csv', 'data'],
					workspaceFolders: ['vscode'],
					workspaceTopLevelEntries: ['src', 'data'],
					workingSetFiles: ['data/orders.csv'],
					activeDocumentSymbols: [],
					workspaceSymbolMatches: [],
					nearbyFiles: ['data/orders.csv', 'data/customers.csv'],
					relevantSnippets: [{ path: 'data/orders.csv', preview: 'id,total', detailLevel: 'broad' }],
				}
			},
			{
				phase: 'focused-slice',
				answers: [{ question: 'Related Files', answer: 'customers.csv and schema.json' }],
				repositoryContext: {
					scope: 'focused',
					planningTarget: { kind: 'file', label: 'data/orders.csv', confidence: 'high' },
					focusSummary: 'Focused on orders.csv and its related files',
					focusQueries: ['orders.csv', 'customers.csv', 'schema.json'],
					workspaceFolders: ['vscode'],
					workspaceTopLevelEntries: ['src', 'data'],
					workingSetFiles: ['data/orders.csv', 'data/customers.csv'],
					activeDocumentSymbols: [],
					workspaceSymbolMatches: [],
					nearbyFiles: ['data/customers.csv', 'data/schema.json'],
					relevantSnippets: [{ path: 'data/customers.csv', preview: 'customer_id,name', detailLevel: 'focused' }],
				}
			}
		);

		assert.deepStrictEqual(merged?.repositoryContext?.focusQueries, ['orders.csv', 'customers.csv', 'schema.json']);
		assert.deepStrictEqual(merged?.repositoryContext?.workingSetFiles, ['data/orders.csv', 'data/customers.csv']);
		assert.deepStrictEqual(merged?.repositoryContext?.nearbyFiles, ['data/customers.csv', 'data/schema.json']);
		assert.deepStrictEqual(merged?.repositoryContext?.relevantSnippets, [{
			path: 'data/customers.csv',
			preview: 'customer_id,name',
			detailLevel: 'focused'
		}]);
	});

	test('recognizes planning mode names', () => {
		assert.strictEqual(isPlanningModeName('Plan'), true);
		assert.strictEqual(isPlanningModeName('planner'), true);
		assert.strictEqual(isPlanningModeName('Agent'), false);
	});

	test('upgrades the planning target when the confirmation picker is answered', () => {
		const confirmedTarget = {
			kind: 'file' as const,
			label: 'src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts',
			resource: 'file:///workspace/src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts',
			confidence: 'high' as const,
		};
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			allowSkip: true,
			questions: [
				{
					id: planningTargetConfirmationQuestionId,
					type: 'singleSelect',
					title: 'Primary Planning Target',
					options: [
						{
							id: 'confirm-file',
							label: confirmedTarget.label,
							value: serializePlanningTarget(confirmedTarget),
						}
					]
				}
			],
			data: {
				[planningTargetConfirmationQuestionId]: {
					selectedValue: serializePlanningTarget(confirmedTarget)
				}
			},
			isUsed: true
		};

		const context = buildPlanningTransitionContext(carousel, carousel.data, {
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'workspace', label: 'vscode', confidence: 'low' },
				focusQueries: [],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		});

		assert.deepStrictEqual(context?.repositoryContext?.planningTarget, confirmedTarget);
		assert.deepStrictEqual(context?.answers, [{
			question: 'Primary Planning Target',
			answer: confirmedTarget.label
		}]);
	});
});
