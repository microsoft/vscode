/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { assessPlanningReadiness } from '../../../common/planning/chatPlanningReadiness.js';

suite('ChatPlanningReadiness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flags repo-target confirmation when the inferred target is low confidence', () => {
		const readiness = assessPlanningReadiness({
			userRequest: 'Improve planning mode in chat.',
			planningAnswers: [],
			recentConversation: [],
			repositoryContext: {
				scope: 'broad',
				planningTarget: { kind: 'workspace', label: 'vscode', confidence: 'low' },
				focusQueries: ['planning'],
				workspaceFolders: ['vscode'],
				workspaceTopLevelEntries: ['src', 'extensions'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		});

		assert.strictEqual(readiness.goalClarity.shouldConfirmPlanningTarget, true);
		assert.strictEqual(readiness.goalClarity.questionCount, 4);
		assert.ok(readiness.goalClarity.missingDimensions.includes('repo-target'));
	});

	test('treats settled answers and plan structure as decomposition readiness', () => {
		const readiness = assessPlanningReadiness({
			userRequest: 'Refine planning mode behavior.',
			plannerNotes: 'Keep the changes inside chat planning.',
			planningAnswers: [
				{ question: 'Insertion Point', answer: 'Start in chatWidget.ts and then wire the generator.' },
				{ question: 'Validation', answer: 'Run planning tests and verify the pre-planning handoff.' }
			],
			recentConversation: ['Assistant: First inspect chatWidget, then tighten the generator prompt.'],
			currentPlan: [
				'1. Update the planning transition context.',
				'2. Extend question generation inputs.',
				'3. Validate with targeted tests.'
			].join('\n'),
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'file', label: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts', confidence: 'high' },
				focusQueries: ['chatWidget', 'planning'],
				workingSetFiles: ['src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		});

		assert.strictEqual(readiness.taskDecomposition.shouldConfirmPlanningTarget, false);
		assert.deepStrictEqual(readiness.taskDecomposition.missingDimensions, []);
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('repo-target'));
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('insertion-point'));
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('work-breakdown'));
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('validation'));
		assert.strictEqual(readiness.taskDecomposition.questionCount, 1);
	});
});
