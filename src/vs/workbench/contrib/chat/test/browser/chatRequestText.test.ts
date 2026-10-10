/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { getChatRequestText } from '../../browser/chatRequestText.js';
import { getAgentMergeRequestSummary } from '../../browser/widget/chatContentParts/chatAgentMergeContentPart.js';
import { IChatRequestViewModel } from '../../common/model/chatViewModel.js';

function request(messageText: string, options: Pick<IChatRequestViewModel, 'isSystemInitiated' | 'requestSource' | 'systemInitiatedLabel'> = {}): IChatRequestViewModel {
	return upcastPartial<IChatRequestViewModel>({ id: 'r', messageText, ...options });
}

suite('getChatRequestText', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('names a request by its own text, an Agent Merge request by its summary', () => {
		const agentMergePrompt = buildAgentMergePrompt(['addressReviews'], {
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
			title: 'chat: keep the timeline readable',
			headRef: 'user/branch',
			headSha: '1dd23747a306c10416d6f8a4a6ef032d541b310e',
			baseRef: 'main',
			reviewThreads: [{ id: 'thread-1', path: 'src/file.ts', line: 12, comments: [{ author: 'octocat', body: 'Please fix this.' }] }],
			reviewSummaries: [],
			newComments: [],
			failedChecks: [],
			behind: false,
			conflicting: false,
			commentWatermark: '2026-08-24T10:00:00.000Z',
		});

		const requests = [
			request('Rename the widget'),
			request(agentMergePrompt, { isSystemInitiated: true, requestSource: 'agentMerge' }),
			request(agentMergePrompt),
			request(agentMergePrompt, { isSystemInitiated: true }),
			request(agentMergePrompt, { requestSource: 'agentMerge' }),
			request(agentMergePrompt, { isSystemInitiated: true, requestSource: 'agentMerge', systemInitiatedLabel: 'Terminal needs input' }),
			request('Malformed merge prompt', { isSystemInitiated: true, requestSource: 'agentMerge' }),
		];

		assert.deepStrictEqual(requests.map(item => ({
			text: getChatRequestText(item),
			hasMergeSummary: getAgentMergeRequestSummary(item) !== undefined,
		})), [
			{ text: 'Rename the widget', hasMergeSummary: false },
			{ text: '1 Review Comment, Agent Merge', hasMergeSummary: true },
			{ text: agentMergePrompt, hasMergeSummary: false },
			{ text: agentMergePrompt, hasMergeSummary: false },
			{ text: agentMergePrompt, hasMergeSummary: false },
			{ text: agentMergePrompt, hasMergeSummary: false },
			{ text: 'Malformed merge prompt', hasMergeSummary: false },
		]);
	});
});
