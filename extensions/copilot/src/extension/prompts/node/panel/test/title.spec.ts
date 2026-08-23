/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { renderPromptElement } from '../../base/promptRenderer';
import { TitlePrompt } from '../title';

function messageText(message: Raw.ChatMessage | undefined): string | undefined {
	return message?.content
		.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text)
		.map(part => (part as Raw.ChatCompletionContentPartText).text)
		.join('\n');
}

function promptText(messages: Raw.ChatMessage[]): { system: string | undefined; user: string | undefined } {
	return {
		system: messageText(messages.find(msg => msg.role === Raw.ChatRole.System)),
		user: messageText(messages.find(msg => msg.role === Raw.ChatRole.User)),
	};
}

describe('TitlePrompt', () => {
	let accessor: ITestingServicesAccessor;

	beforeEach(() => {
		const services = createExtensionUnitTestingServices();
		services.define(IChatMLFetcher, new StaticChatMLFetcher([]));
		accessor = services.createTestingAccessor();
	});

	test('includes locale instructions', async () => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.LocaleOverride, 'zh-CN');

		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, 'gpt-4.1');
		const { messages } = await renderPromptElement(
			accessor.get(IInstantiationService),
			endpoint,
			TitlePrompt,
			{ userRequest: '请你分析该脚本有何优化空间' });

		expect(promptText(messages)).toMatchSnapshot();
	});

	test('does not include locale instruction when language is en', async () => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.LocaleOverride, 'en');

		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, 'gpt-4.1');
		const { messages } = await renderPromptElement(
			accessor.get(IInstantiationService),
			endpoint,
			TitlePrompt,
			{ userRequest: 'How do I sort an array?' });

		expect(promptText(messages)).toMatchSnapshot();
	});
});
