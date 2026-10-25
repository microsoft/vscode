/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { getChatRequestText, stripSystemNotificationWrapper, getChatRequestAccessibleText } from '../../browser/chatRequestText.js';
import { createTestArtifactRequestPresentation } from '../../../../../platform/artifactIntegrations/test/common/artifactIntegrationTestUtils.js';
import { getAgentMergeRequestSummary } from '../../browser/widget/chatContentParts/chatAgentMergeContentPart.js';
import { IChatRequestViewModel } from '../../common/model/chatViewModel.js';

function request(messageText: string, options: Pick<IChatRequestViewModel, 'isSystemInitiated' | 'requestSource' | 'systemInitiatedLabel' | 'artifactRequest'> = {}): IChatRequestViewModel {
	return upcastPartial<IChatRequestViewModel>({ id: 'r', messageText, ...options });
}

suite('getChatRequestText', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('artifact action labels stay concise while the accessible view includes the snapshot', () => {
		const presentation = createTestArtifactRequestPresentation();
		const item = request('Model-facing instructions', { isSystemInitiated: true, requestSource: 'artifactIntegration', artifactRequest: presentation });
		assert.deepStrictEqual({
			label: getChatRequestText(item),
			accessible: getChatRequestAccessibleText(item),
			human: getChatRequestText(request('Human request', { artifactRequest: presentation })),
			legacy: getChatRequestText(request('Legacy artifact request', { isSystemInitiated: true })),
		}, {
			label: 'Analyse Scorecard: Experiment 42',
			accessible: 'Analyse Scorecard: Experiment 42\nSearch ranking\nScorecard\nResults are ready to analyse.\nState: Completed\nSuccessful searches: +2.3%',
			human: 'Human request', legacy: 'Legacy artifact request',
		});
	});

	test('artifact action accessible text explains loading and partial snapshots', () => {
		const presentation = createTestArtifactRequestPresentation({
			details: [{ title: 'Scorecard', availability: { kind: 'loading' }, links: [], items: [], completeness: 'partial' }],
		});
		const item = request('Model-facing instructions', { isSystemInitiated: true, requestSource: 'artifactIntegration', artifactRequest: presentation });
		assert.strictEqual(getChatRequestAccessibleText(item),
			'Analyse Scorecard: Experiment 42\nSearch ranking\nScorecard\nDetails were still loading when this action started.\nPartial snapshot. Open the artifact for more details.');
	});

	test('unwraps system notification display text without changing user text or the request', () => {
		const body = 'Shell command "Install dependencies" (shellId: 16) has exited with exit code 1. Use read_bash with shellId "16".';
		const content = `<system_notification>\n${body}\n</system_notification>`;
		const systemRequest = request(content, { isSystemInitiated: true });

		assert.deepStrictEqual({
			systemText: getChatRequestText(systemRequest),
			userText: getChatRequestText(request(content)),
			requestText: systemRequest.messageText,
		}, {
			systemText: body,
			userText: content,
			requestText: content,
		});
	});

	test('removes only an outer notification wrapper and one padding newline per edge', () => {
		const cases = [
			['<system_notification> body </system_notification>', ' body '],
			['<system_notification>\r\nbody\r\n</system_notification>', 'body'],
			['<system_notification>\n\n    body\n\n</system_notification>', '\n    body\n'],
			[' \n<system_notification>body</system_notification>\n ', 'body'],
			['<system_notification></system_notification>', ''],
			['<system_notification><system_notification>body</system_notification></system_notification>', '<system_notification>body</system_notification>'],
			['Already unwrapped\n', 'Already unwrapped\n'],
			['<system_notification>Missing closing tag', '<system_notification>Missing closing tag'],
			['Before <system_notification>body</system_notification> after', 'Before <system_notification>body</system_notification> after'],
			['&lt;system_notification&gt;body&lt;/system_notification&gt;', '&lt;system_notification&gt;body&lt;/system_notification&gt;'],
		];

		assert.deepStrictEqual(cases.map(([content]) => stripSystemNotificationWrapper(content)), cases.map(([, expected]) => expected));
	});

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
