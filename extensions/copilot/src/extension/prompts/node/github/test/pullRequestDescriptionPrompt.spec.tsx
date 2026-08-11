/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { renderPromptElement } from '../../base/promptRenderer';
import { GitHubPullRequestPrompt } from '../pullRequestDescriptionPrompt';

describe('GitHubPullRequestPrompt', () => {
	test('instructs the model to use the template as the description base', async () => {
		const services = createExtensionUnitTestingServices();
		services.define(IChatMLFetcher, new StaticChatMLFetcher([]));
		const accessor = services.createTestingAccessor();
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, 'gpt-4.1');
		const { messages } = await renderPromptElement(
			accessor.get(IInstantiationService),
			endpoint,
			GitHubPullRequestPrompt,
			{
				commitMessages: ['Fix pull request generation'],
				patches: ['diff --git a/file.ts b/file.ts'],
				issues: undefined,
				template: '## Summary\n\nDescribe the change.',
				compareBranch: 'fix/pr-template',
			},
		);
		const userMessage = messages.find(message => message.role === Raw.ChatRole.User);
		const userMessageText = userMessage?.content
			.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text)
			.map(part => part.text)
			.join('');

		expect(userMessageText).toContain('Use the template above as the base for the pull request description.');
	});
});
