/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentMergePromptSummary } from '../../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { describeAgentMergeFileLabels, getAgentMergeSummaryLabel } from '../../../../browser/widget/chatContentParts/chatAgentMergeContentPart.js';

function summary(overrides: Partial<IAgentMergePromptSummary> = {}): IAgentMergePromptSummary {
	return {
		actions: [],
		pullRequestUrl: '',
		title: '',
		headRef: '',
		headSha: '',
		baseRef: 'main',
		reviewThreads: [],
		reviewSummaries: [],
		newComments: [],
		failedChecks: [],
		behind: false,
		conflicting: false,
		agentMessage: '',
		...overrides,
	};
}

suite('ChatAgentMergeContentPart file labels', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('names a unique file without a disambiguating path', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts', line: 68 },
			{ path: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
			{},
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'chatWidget.ts:68', title: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatEditor.ts', title: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
			undefined,
		]);
	});

	test('adds the shortest distinguishing prefix to same-named files', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts', line: 412 },
			{ path: 'src/vs/sessions/contrib/chat/browser/chatWidget.ts', line: 88 },
			{ path: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts', line: 24 },
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'chatWidget.ts:412', description: '…/workbench/…', title: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatWidget.ts:88', description: '…/sessions/…', title: 'src/vs/sessions/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatEditor.ts:24', title: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
		]);
	});

	test('leaves same-named files in one directory undisambiguated', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/a/index.ts', line: 1 },
			{ path: 'src/a/index.ts', line: 9 },
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'index.ts:1', title: 'src/a/index.ts' },
			{ name: 'index.ts:9', title: 'src/a/index.ts' },
		]);
	});

	test('summarizes encountered events in one status sentence', () => {
		assert.deepStrictEqual([
			getAgentMergeSummaryLabel(summary()),
			getAgentMergeSummaryLabel(summary({ behind: true })),
			getAgentMergeSummaryLabel(summary({ conflicting: true })),
			getAgentMergeSummaryLabel(summary({
				reviewSummaries: [
					{ author: 'octocat', body: 'Please fix this.' },
					{ author: 'hubot', body: 'Please add a test.' },
				],
				failedChecks: ['Compile', 'Unit Tests'],
				behind: true,
				conflicting: true,
			})),
		], [
			'No Pending Feedback, Agent Merge',
			'Behind Base Branch, Agent Merge',
			'Merge Conflicts, Agent Merge',
			'2 Review Comments, 2 Failing Checks, Merge Conflicts, and Behind Base Branch, Agent Merge',
		]);
	});
});
