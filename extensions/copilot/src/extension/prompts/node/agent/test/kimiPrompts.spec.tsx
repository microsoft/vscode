/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { LanguageModelToolInformation } from 'vscode';
import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IResponseDelta } from '../../../../../platform/networking/common/fetch';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { PromptRenderer } from '../../base/promptRenderer';
import '../allAgentPrompts';
import { PromptRegistry } from '../promptRegistry';

suite('KimiPrompts', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		const chatResponse: (string | IResponseDelta[])[] = [];
		services.define(IChatMLFetcher, new StaticChatMLFetcher(chatResponse));
		accessor = services.createTestingAccessor();
	});

	afterAll(() => {
		accessor.dispose();
	});

	async function renderSystemPrompt(family: string, availableTools?: readonly LanguageModelToolInformation[]): Promise<string> {
		const instantiationService = accessor.get(IInstantiationService);
		const endpoint = instantiationService.createInstance(MockEndpoint, family);
		const customizations = await PromptRegistry.resolveAllCustomizations(instantiationService, endpoint);
		const renderer = PromptRenderer.create(instantiationService, endpoint, customizations.SystemPrompt, {
			availableTools: availableTools ?? accessor.get(IToolsService).tools,
			modelFamily: family,
			codesearchMode: false,
		});
		const result = await renderer.render();
		return result.messages
			.filter(message => message.role === Raw.ChatRole.System)
			.map(message => messageToMarkdown(message))
			.join('\n\n');
	}

	test('uses Kimi-specific prompt for Kimi model families', async () => {
		const renderedPrompts = await Promise.all([
			renderSystemPrompt('kimi-k2.6'),
			renderSystemPrompt('kimi-k2.7-code'),
		]);

		for (const renderedPrompt of renderedPrompts) {
			expect(renderedPrompt).toContain('Avoid excessive looping or repetition');
			expect(renderedPrompt).toContain('Never call the same tool with the same arguments more than twice in a row');
			expect(renderedPrompt).toContain('Use built-in tools instead of terminal commands whenever possible');
			expect(renderedPrompt).toContain('Use the available file editing tools instead of terminal heredocs');
		}
	});

	test('instructs Kimi to use replace-string tools when routed to them', async () => {
		const toolsService = accessor.get(IToolsService);
		const availableTools = toolsService.tools.filter(tool => tool.name !== ToolName.EditFile && tool.name !== ToolName.ApplyPatch);
		const renderedPrompt = await renderSystemPrompt('kimi-k2.7-code', availableTools);

		expect(renderedPrompt).toContain(`Use ${ToolName.ReplaceString} for single string replacements`);
		expect(renderedPrompt).toContain(`Prefer ${ToolName.MultiReplaceString} for multiple independent replacements`);
		expect(renderedPrompt).not.toContain(`Use ${ToolName.EditFile}`);
		expect(renderedPrompt).not.toContain(`Use ${ToolName.ApplyPatch}`);
	});
});
