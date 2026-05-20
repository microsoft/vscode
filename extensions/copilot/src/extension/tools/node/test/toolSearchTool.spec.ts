/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { IToolDeferralService } from '../../../../platform/networking/common/toolDeferralService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { IToolsService } from '../../common/toolsService';
import { ToolSearchTool } from '../toolSearchTool';
import { TestToolsService } from './testToolsService';

function makeToolInfo(name: string): vscode.LanguageModelToolInformation {
	return {
		name,
		description: `${name} description`,
		inputSchema: { type: 'object', properties: {} },
		tags: [],
		source: undefined,
	} as vscode.LanguageModelToolInformation;
}

suite('ToolSearchTool', () => {
	test('searches only deferred tools enabled for the active request', async () => {
		const searchedToolNames: string[][] = [];
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				tools: [
					makeToolInfo('read_file'),
					makeToolInfo('enabled_deferred_tool'),
					makeToolInfo('disabled_deferred_tool'),
				],
			} as any,
			{ trace() { } } as any,
		);

		await (tool as any).resolveInput?.(
			{ query: 'deferred tool' },
			{
				tools: {
					toolReferences: [],
					toolInvocationToken: undefined as never,
					availableTools: [
						makeToolInfo('read_file'),
						makeToolInfo('enabled_deferred_tool'),
					],
				},
			},
			0,
		);

		await tool.invoke(
			{ input: { query: 'deferred tool' } } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['enabled_deferred_tool']]);
	});
});

suite('TestToolsService getEnabledTools', () => {
	test('prunes tool_search when the request has zero deferred tools without removing unrelated tools', () => {
		const services = createExtensionUnitTestingServices();
		const nonDeferred = new Set(['tool_search', 'read_file']);
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: (name: string) => nonDeferred.has(name),
		});
		const accessor = services.createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, undefined);
			const toolsService = accessor.get(IToolsService) as TestToolsService;

			toolsService.addTestToolOverride(makeToolInfo('tool_search'), {} as vscode.LanguageModelTool<unknown>);
			toolsService.addTestToolOverride(makeToolInfo('read_file'), {} as vscode.LanguageModelTool<unknown>);

			const request = new TestChatRequest('find tools');
			request.tools = new Map([
				[{ name: 'tool_search' } as vscode.LanguageModelToolInformation, true],
				[{ name: 'read_file' } as vscode.LanguageModelToolInformation, true],
			]);

			const relevantNames = toolsService.getEnabledTools(request, endpoint)
				.map(tool => tool.name)
				.filter(name => name === 'tool_search' || name === 'read_file')
				.sort();

			expect(relevantNames).toEqual(['read_file']);
		} finally {
			accessor.dispose();
		}
	});

	test('retains tool_search when the request includes deferred tools', () => {
		const services = createExtensionUnitTestingServices();
		const nonDeferred = new Set(['tool_search', 'read_file']);
		services.define(IToolDeferralService, {
			_serviceBrand: undefined,
			isNonDeferredTool: (name: string) => nonDeferred.has(name),
		});
		const accessor = services.createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, undefined);
			const toolsService = accessor.get(IToolsService) as TestToolsService;

			toolsService.addTestToolOverride(makeToolInfo('tool_search'), {} as vscode.LanguageModelTool<unknown>);
			toolsService.addTestToolOverride(makeToolInfo('read_file'), {} as vscode.LanguageModelTool<unknown>);
			toolsService.addTestToolOverride(makeToolInfo('enabled_deferred_tool'), {} as vscode.LanguageModelTool<unknown>);

			const request = new TestChatRequest('find tools');
			request.tools = new Map([
				[{ name: 'tool_search' } as vscode.LanguageModelToolInformation, true],
				[{ name: 'read_file' } as vscode.LanguageModelToolInformation, true],
				[{ name: 'enabled_deferred_tool' } as vscode.LanguageModelToolInformation, true],
			]);

			const relevantNames = toolsService.getEnabledTools(request, endpoint)
				.map(tool => tool.name)
				.filter(name => name === 'tool_search' || name === 'read_file' || name === 'enabled_deferred_tool')
				.sort();

			expect(relevantNames).toEqual(['enabled_deferred_tool', 'read_file', 'tool_search']);
		} finally {
			accessor.dispose();
		}
	});
});