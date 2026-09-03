/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import { isOpenAIModel, modelSupportCacheBreakPoints } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import '../allAgentPrompts';
import { DefaultAgentPrompt } from '../defaultAgentInstructions';
import { Gpt56PromptResolver } from '../openai/gpt56Prompt';
import { AgentPromptRegistry, IAgentPrompt, PromptRegistry } from '../promptRegistry';

suite('OpenAI prompt fallback', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeAll(() => {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
	});

	afterAll(() => accessor.dispose());

	function createEndpoint(family: string, modelProvider = 'copilot'): MockEndpoint {
		const endpoint = instantiationService.createInstance(MockEndpoint, family);
		endpoint.modelProvider = modelProvider;
		return endpoint;
	}

	function resolve(endpoint: IChatEndpoint) {
		return PromptRegistry.resolveAllCustomizations(instantiationService, endpoint);
	}

	test.each([
		['gpt-4.2', 'copilot'],
		['gpt-5.7', 'copilot'],
		['gpt-5.7-mini', 'copilot'],
		['gpt-5.7-codex', 'copilot'],
		['gpt-5.10', 'copilot'],
		['gpt-5.10-codex', 'copilot'],
		['gpt-5.40', 'copilot'],
		['gpt-5.50', 'copilot'],
		['gpt-5.60', 'copilot'],
		['gpt-6-preview', 'Azure'],
		['OpenAI', 'copilot'],
		['preview-model', 'OpenAI'],
		['preview-model', 'openai'],
	])('%s from %s inherits the entire latest prompt bundle', async (family, provider) => {
		expect(await resolve(createEndpoint(family, provider))).toEqual(await resolve(createEndpoint('gpt-5.6')));
	});

	test.each([
		['gpt-3.5-turbo', 'DefaultOpenAIAgentPrompt'],
		['gpt-4o', 'DefaultOpenAIAgentPrompt'],
		['gpt-4o-mini', 'DefaultOpenAIAgentPrompt'],
		['gpt-4.1', 'DefaultOpenAIAgentPrompt'],
		['gpt-4.5-preview', 'DefaultOpenAIAgentPrompt'],
		['o3-mini', 'DefaultOpenAIAgentPrompt'],
		['o4-mini', 'DefaultOpenAIAgentPrompt'],
		['gpt-5-nano', 'DefaultOpenAIAgentPrompt'],
		['gpt-5', 'DefaultGpt5AgentPrompt'],
		['gpt-5-mini', 'DefaultGpt5AgentPrompt'],
		['gpt-5-codex', 'CodexStyleGpt5CodexPrompt'],
		['gpt-5.1', 'Gpt51Prompt'],
		['gpt-5.1-codex', 'Gpt51CodexPrompt'],
		['gpt-5.1-codex-mini', 'Gpt51CodexPrompt'],
		['gpt-5.2', 'HiddenModelBPrompt'],
		['gpt-5.2-codex', 'Gpt51CodexPrompt'],
		['gpt-5.3-codex', 'Gpt53CodexPrompt'],
		['gpt-5.4', 'Gpt54Prompt'],
		['gpt-5.5', 'Gpt55Prompt'],
		['gpt-5.6', 'Gpt56Prompt'],
		['vscModelE-preview', 'VSCModelPromptE'],
	])('preserves the explicit prompt for %s', async (family, expected) => {
		expect((await resolve(createEndpoint(family, 'OpenAI'))).SystemPrompt.name).toBe(expected);
	});

	test.each(['claude-sonnet-4.6', 'gemini-2.0-flash', 'grok-code-fast-1', 'kimi-k3'])('keeps %s family routing ahead of provider metadata', async family => {
		expect(await resolve(createEndpoint(family, 'OpenAI'))).toEqual(await resolve(createEndpoint(family)));
	});

	test('preserves an explicitly aliased family without changing the model id or capabilities', async () => {
		const endpoint = createEndpoint('gpt-5.1', 'OpenAI');
		endpoint.model = 'preview-model';
		const customizations = await resolve(endpoint);
		expect({
			customizations,
			model: endpoint.model,
			family: endpoint.family,
			cacheBreakpoints: modelSupportCacheBreakPoints(endpoint),
		}).toEqual({
			customizations: await resolve(createEndpoint('gpt-5.1')),
			model: 'preview-model',
			family: 'gpt-5.1',
			cacheBreakpoints: false,
		});
	});

	test.each(['matcher', 'prefix'] as const)('a later %s specialization takes precedence over a registered fallback', async kind => {
		class SpecializedPromptResolver implements IAgentPrompt {
			static readonly familyPrefixes = kind === 'prefix' ? ['gpt-6'] : [];
			static matchesModel(endpoint: IChatEndpoint): boolean {
				return kind === 'matcher' && endpoint.family === 'gpt-6';
			}
			resolveSystemPrompt() {
				return DefaultAgentPrompt;
			}
			resolveUserQueryTagName() {
				return 'specializedRequest';
			}
		}

		const registry = new AgentPromptRegistry();
		registry.registerFallbackPrompt(Gpt56PromptResolver, isOpenAIModel);
		registry.registerPrompt(SpecializedPromptResolver);
		const result = await registry.resolveAllCustomizations(instantiationService, createEndpoint('gpt-6'));
		expect({ systemPrompt: result.SystemPrompt, userQueryTagName: result.userQueryTagName }).toEqual({
			systemPrompt: DefaultAgentPrompt,
			userQueryTagName: 'specializedRequest',
		});
	});
});
