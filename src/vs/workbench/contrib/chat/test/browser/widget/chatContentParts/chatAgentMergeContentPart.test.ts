/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentMergePromptSummary } from '../../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ChatAgentMergeContentPart, describeAgentMergeFileLabels, getAgentMergeSummaryLabel } from '../../../../browser/widget/chatContentParts/chatAgentMergeContentPart.js';

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
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('keeps the Agent Message toggle name stable while reporting its state', () => {
		const part = store.add(new ChatAgentMergeContentPart(
			summary({ agentMessage: 'Merge agent details.' }),
			URI.parse('test://session'),
			upcastPartial<IMarkdownRenderer>({}),
			upcastPartial<IOpenerService>({}),
			upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) }),
			upcastPartial<ICommandService>({}),
		));
		const button = part.domNode.querySelector<HTMLElement>('.chat-agent-merge-message-toggle');
		assert.ok(button);

		const getAccessibleState = () => ({
			label: button.getAttribute('aria-label'),
			pressed: button.getAttribute('aria-pressed'),
		});
		const initial = getAccessibleState();
		button.click();
		const showingMessage = getAccessibleState();
		button.click();
		const showingDetails = getAccessibleState();

		assert.deepStrictEqual([initial, showingMessage, showingDetails], [
			{ label: 'Agent Message', pressed: 'false' },
			{ label: 'Agent Message', pressed: 'true' },
			{ label: 'Agent Message', pressed: 'false' },
		]);
	});
});
