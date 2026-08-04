/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterAll, afterEach, beforeAll, expect, suite, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IResponseDelta } from '../../../../../platform/networking/common/fetch';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IToolsService } from '../../../../tools/common/toolsService';
import { PromptRenderer } from '../../base/promptRenderer';
import '../allAgentPrompts';
import { PromptRegistry } from '../promptRegistry';

const SCOPE_GUARD_SENTENCE = `Do exactly what was asked - don't extend scope to new adjacent code, tests, examples, or unrelated files unless the task explicitly includes them.`;
const INTERFACE_SENTENCE = 'But always preserve existing public interfaces: never remove or change the signature of module-level functions, exported names, or class methods that other code might depend on, unless explicitly told to.';

suite('AnthropicPrompts', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		const chatResponse: (string | IResponseDelta[])[] = [];
		services.define(IChatMLFetcher, new StaticChatMLFetcher(chatResponse));
		accessor = services.createTestingAccessor();
	});

	afterEach(async () => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.ClaudeSonnet5PromptEnabled, false);
	});

	afterAll(() => {
		accessor.dispose();
	});

	async function renderSystemPrompt(family: string): Promise<string> {
		const instantiationService = accessor.get(IInstantiationService);
		const endpoint = instantiationService.createInstance(MockEndpoint, family);
		const customizations = await PromptRegistry.resolveAllCustomizations(instantiationService, endpoint);
		const renderer = PromptRenderer.create(instantiationService, endpoint, customizations.SystemPrompt, {
			availableTools: accessor.get(IToolsService).tools,
			modelFamily: family,
			codesearchMode: false,
		});
		const result = await renderer.render();
		return result.messages
			.filter(message => message.role === Raw.ChatRole.System)
			.map(message => messageToMarkdown(message))
			.join('\n\n');
	}

	test('appends the scope discipline paragraph for Sonnet 5 when enabled', async () => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.ClaudeSonnet5PromptEnabled, true);
		const renderedPrompt = await renderSystemPrompt('claude-sonnet-5');

		expect(renderedPrompt).toContain('<scopeDiscipline>');
		expect(renderedPrompt).toContain(SCOPE_GUARD_SENTENCE);
		expect(renderedPrompt).toContain(INTERFACE_SENTENCE);
	});

	test('keeps the Sonnet 4.6 prompt for Sonnet 5 when disabled', async () => {
		const renderedPrompt = await renderSystemPrompt('claude-sonnet-5');

		expect(renderedPrompt).not.toContain('<scopeDiscipline>');
		// Sonnet 4.6 exploration guidance still applies.
		expect(renderedPrompt).toContain('Gather enough context to proceed confidently, then move to implementation.');
	});

	test('does not apply the scope discipline paragraph to other Claude models', async () => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.ClaudeSonnet5PromptEnabled, true);
		const renderedPrompts = await Promise.all([
			renderSystemPrompt('claude-sonnet-4.6'),
			renderSystemPrompt('claude-opus-4.8'),
			renderSystemPrompt('claude-haiku-4.5'),
		]);

		for (const renderedPrompt of renderedPrompts) {
			expect(renderedPrompt).not.toContain('<scopeDiscipline>');
		}
	});
});
