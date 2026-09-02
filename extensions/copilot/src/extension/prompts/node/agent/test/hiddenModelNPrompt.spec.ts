/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, afterEach, beforeAll, expect, suite, test, vi } from 'vitest';
import { isHiddenModelN } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IToolsService } from '../../../../tools/common/toolsService';
import { PromptRenderer } from '../../base/promptRenderer';
import '../allAgentPrompts';
import { Gpt56PromptResolver } from '../openai/gpt56Prompt';
import { HiddenModelNPromptResolver } from '../openai/hiddenModelNPrompt';
import { PromptRegistry } from '../promptRegistry';

suite('Hidden model N prompt', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let endpoint: MockEndpoint;
	const resolver = new HiddenModelNPromptResolver();
	const gpt56Resolver = new Gpt56PromptResolver();

	beforeAll(() => {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		endpoint = instantiationService.createInstance(MockEndpoint, 'hidden-model-n-test');
	});

	afterEach(() => vi.restoreAllMocks());
	afterAll(() => accessor.dispose());

	test.each(['hiddenModelN', 'hidden-model-n-test', 'gpt-5.6', 'unknown-model'])('does not match %s while the hash list is empty', async family => {
		const model = instantiationService.createInstance(MockEndpoint, family);
		expect({
			family: isHiddenModelN(family),
			endpoint: isHiddenModelN(model),
			resolver: await HiddenModelNPromptResolver.matchesModel(model),
		}).toEqual({ family: false, endpoint: false, resolver: false });
	});

	test('registers the hidden-model prompt bundle', async () => {
		vi.spyOn(HiddenModelNPromptResolver, 'matchesModel').mockResolvedValue(true);
		const customizations = await PromptRegistry.resolveAllCustomizations(instantiationService, endpoint);
		expect({
			system: customizations.SystemPrompt,
			reminder: customizations.ReminderInstructionsClass,
			identity: customizations.CopilotIdentityRulesClass,
			safety: customizations.SafetyRulesClass,
		}).toEqual({
			system: resolver.resolveSystemPrompt(endpoint),
			reminder: resolver.resolveReminderInstructions(endpoint),
			identity: gpt56Resolver.resolveCopilotIdentityRules(endpoint),
			safety: gpt56Resolver.resolveSafetyRules(endpoint),
		});
	});

	test.each([false, true])('copies GPT-5.6 system instructions with tools enabled: %s', async toolsEnabled => {
		const hiddenPrompt = resolver.resolveSystemPrompt(endpoint)!;
		const gpt56Prompt = gpt56Resolver.resolveSystemPrompt(endpoint)!;
		const props = {
			availableTools: toolsEnabled ? accessor.get(IToolsService).tools : [],
			modelFamily: endpoint.family,
			codesearchMode: false,
		};
		const actual = await PromptRenderer.create(instantiationService, endpoint, hiddenPrompt, props).render();
		const expected = await PromptRenderer.create(instantiationService, endpoint, gpt56Prompt, props).render();
		expect(hiddenPrompt).not.toBe(gpt56Prompt);
		expect(actual.messages).toEqual(expected.messages);
	});

	test.each([false, true])('copies GPT-5.6 reminders with tools enabled: %s', async toolsEnabled => {
		const model = instantiationService.createInstance(MockEndpoint, endpoint.family);
		model.supportsToolSearch = toolsEnabled;
		const hiddenReminder = resolver.resolveReminderInstructions(model)!;
		const gpt56Reminder = gpt56Resolver.resolveReminderInstructions(model)!;
		const props = {
			endpoint: model,
			hasTodoTool: toolsEnabled,
			hasEditFileTool: toolsEnabled,
			hasReplaceStringTool: toolsEnabled,
			hasMultiReplaceStringTool: toolsEnabled,
			hasMemoryTool: toolsEnabled,
		};
		const actual = await PromptRenderer.create(instantiationService, model, hiddenReminder, props).renderElementJSON();
		const expected = await PromptRenderer.create(instantiationService, model, gpt56Reminder, props).renderElementJSON();
		expect(hiddenReminder).not.toBe(gpt56Reminder);
		expect(actual).toEqual({ ...expected, node: { ...expected.node, ctorName: hiddenReminder.name } });
	});
});
