/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { getChatRequestText } from '../../browser/chatRequestText.js';
import { IChatRequestViewModel } from '../../common/model/chatViewModel.js';

function request(messageText: string, systemInitiatedLabel?: string): IChatRequestViewModel {
	return { id: 'r', messageText, systemInitiatedLabel } as unknown as IChatRequestViewModel;
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

		assert.deepStrictEqual([
			getChatRequestText(request('Rename the widget')),
			getChatRequestText(request(agentMergePrompt)),
			// A request the transcript renders with its own notification label keeps its text.
			getChatRequestText(request(agentMergePrompt, 'Terminal needs input')),
		], [
			'Rename the widget',
			'Agent Merge, 1 comment',
			agentMergePrompt,
		]);
	});
});
