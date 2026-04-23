/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { assessPlanningReadiness } from '../../../common/planning/chatPlanningReadiness.js';

suite('ChatPlanningReadiness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('flags repo-target confirmation only when the workspace is still ambiguous', () => {
		const readiness = assessPlanningReadiness({
			userRequest: 'Improve planning mode in chat.',
			planningAnswers: [],
			recentConversation: [],
			repositoryContext: {
				scope: 'broad',
				planningTarget: { kind: 'workspace', label: '2 workspace folders', confidence: 'low' },
				focusQueries: ['planning'],
				workspaceFolders: ['app', 'docs'],
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

	test('asks fewer goal-clarity questions when the request is already specific', () => {
		const broadReadiness = assessPlanningReadiness({
			userRequest: 'Help me plan a change in the repo.',
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

		const specificReadiness = assessPlanningReadiness({
			userRequest: 'Plan how to analyze orders.csv and validate it against schema.json.',
			planningAnswers: [
				{ question: 'Primary artifact', answer: 'Focus on orders.csv first.' },
				{ question: 'Related files', answer: 'Keep schema.json in view for validation.' }
			],
			recentConversation: [],
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'file', label: 'data/orders.csv', confidence: 'high' },
				requestIntent: 'data-analysis',
				primaryArtifactHint: 'data/orders.csv',
				relatedArtifactHints: ['data/schema.json'],
				focusQueries: ['orders.csv', 'schema.json'],
				workingSetFiles: ['data/orders.csv', 'data/schema.json'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: ['data/schema.json'],
				relevantSnippets: [],
			}
		});

		assert.ok(broadReadiness.goalClarity.questionCount > specificReadiness.goalClarity.questionCount);
	});

	test('uses the task lens to recognize decomposition readiness', () => {
		const readiness = assessPlanningReadiness({
			userRequest: 'Plan how to analyze orders.csv with schema.json.',
			planningAnswers: [],
			recentConversation: [],
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'file', label: 'data/orders.csv', confidence: 'high' },
				requestIntent: 'data-analysis',
				taskLens: {
					taskKind: 'data-analysis',
					taskSummary: 'Analyze orders.csv against schema.json.',
					primaryArtifact: 'data/orders.csv',
					secondaryArtifacts: ['data/schema.json'],
					artifactType: 'dataset',
					desiredOutcome: 'Produce a useful analysis for data/orders.csv.',
					deliverableType: 'analysis',
					validationTargets: ['Schema checks', 'Analysis output'],
					riskAreas: ['Keep the analysis scoped to orders.csv and schema.json.'],
					planAreas: ['Analysis target', 'Validation path'],
				},
				primaryArtifactHint: 'data/orders.csv',
				relatedArtifactHints: ['data/schema.json'],
				focusQueries: ['orders.csv', 'schema.json'],
				workingSetFiles: ['data/orders.csv', 'data/schema.json'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: ['data/schema.json'],
				relevantSnippets: [],
			}
		});

		assert.deepStrictEqual(readiness.taskDecomposition.missingDimensions, []);
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('repo-target'));
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('work-breakdown'));
		assert.ok(readiness.taskDecomposition.presentDimensions.includes('validation'));
		assert.strictEqual(readiness.taskDecomposition.questionCount, 1);
	});

	test('treats requested artifact hints as unresolved until a concrete file is pinned down', () => {
		const readiness = assessPlanningReadiness({
			userRequest: 'Plan how to analyze a csv file in this repo.',
			planningAnswers: [],
			recentConversation: [],
			repositoryContext: {
				scope: 'focused',
				planningTarget: { kind: 'workspace', label: 'vscode', confidence: 'low' },
				requestIntent: 'data-analysis',
				taskLens: {
					taskKind: 'data-analysis',
					desiredOutcome: 'Plan how to analyze a csv file in this repo.',
					artifactType: 'dataset',
					unknowns: ['Exact file, folder, or subsystem'],
				},
				primaryArtifactHint: 'Requested CSV file',
				focusQueries: ['csv'],
				workspaceFolders: ['vscode'],
				workspaceTopLevelEntries: ['data', 'src'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		});

		assert.ok(readiness.goalClarity.questionCount >= 2);
		assert.ok(readiness.goalClarity.missingDimensions.includes('repo-target') || readiness.goalClarity.partialDimensions.includes('repo-target'));
		assert.ok(!readiness.goalClarity.presentDimensions.includes('repo-target'));
	});
});
