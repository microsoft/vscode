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
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
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

function makePromptContext(availableTools?: readonly vscode.LanguageModelToolInformation[]): IBuildPromptContext {
	return {
		query: 'test query',
		history: [],
		chatVariables: new ChatVariablesCollection([]),
		tools: availableTools ? {
			toolReferences: [],
			toolInvocationToken: undefined as never,
			availableTools,
		} : undefined,
	};
}

suite('ToolSearchTool', () => {
	test('searches only deferred tools enabled for the active request', async () => {
		const searchedToolNames: string[][] = [];
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		const resolvedInput = await (tool as any).resolveInput?.(
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
				{ input: resolvedInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['enabled_deferred_tool']]);
	});

	test('keeps deferred tool snapshots isolated per resolved request input', async () => {
		const searchedToolNames: string[][] = [];
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		const requestAInput = await (tool as any).resolveInput?.(
			{ query: 'request a' },
			{
				tools: {
					toolReferences: [],
					toolInvocationToken: undefined as never,
					availableTools: [
						makeToolInfo('read_file'),
						makeToolInfo('request_a_tool'),
					],
				},
			},
			0,
		);

		await (tool as any).resolveInput?.(
			{ query: 'request b' },
			{
				tools: {
					toolReferences: [],
					toolInvocationToken: undefined as never,
					availableTools: [
						makeToolInfo('read_file'),
						makeToolInfo('request_b_tool'),
					],
				},
			},
			0,
		);

		await tool.invoke(
			{ input: requestAInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['request_a_tool']]);
	});

	test('retains request-scoped virtual activate groups during tool search candidate selection', async () => {
		const searchedToolNames: string[][] = [];
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		const resolvedInput = await (tool as any).resolveInput?.(
			{ query: 'vscode interaction tools' },
			{
				tools: {
					toolReferences: [],
					toolInvocationToken: undefined as never,
					availableTools: [
						makeToolInfo('read_file'),
						makeToolInfo('activate_vs_code_interaction'),
					],
				},
			},
			0,
		);

		await tool.invoke(
			{ input: resolvedInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['activate_vs_code_interaction']]);
	});

	test('preserves request-scoped deferred tools after resolved input is shallow-cloned', async () => {
		const searchedToolNames: string[][] = [];
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		const resolvedInput = await tool.resolveInput(
			{ query: 'vscode interaction tools' },
			makePromptContext([
				makeToolInfo('read_file'),
				makeToolInfo('activate_vs_code_interaction'),
			]),
			0,
		);

		const clonedResolvedInput = { ...resolvedInput };

		await tool.invoke(
			{ input: clonedResolvedInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['activate_vs_code_interaction']]);
		expect((tool as any)._requestScopedDeferredToolsContexts.size).toBe(0);
	});

	test('preserves request-scoped deferred tools after resolved input is JSON-round-tripped', async () => {
		const searchedToolNames: string[][] = [];
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		const resolvedInput = await tool.resolveInput(
			{ query: 'vscode interaction tools' },
			makePromptContext([
				makeToolInfo('read_file'),
				makeToolInfo('activate_vs_code_interaction'),
			]),
			0,
		);

		const jsonRoundTrippedInput = JSON.parse(JSON.stringify(resolvedInput));

		await tool.invoke(
			{ input: jsonRoundTrippedInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([['activate_vs_code_interaction']]);
	});

	test('fails explicitly when invoke runs without request-scoped resolveInput context', async () => {
		const nonDeferred = new Set(['read_file']);
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async () => {
					throw new Error('search should not run without resolveInput context');
				},
			} as any,
			{
				isNonDeferredTool: (name: string) => nonDeferred.has(name),
			} as any,
			{ trace() { } } as any,
		);

		await expect(tool.invoke(
			{ input: { query: 'deferred tool' } } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		)).rejects.toThrow('ToolSearchTool: request-scoped deferred tools are unavailable. Ensure resolveInput is called before invoke.');
	});

	test('uses an empty deferred tool snapshot when promptContext.tools is missing', async () => {
		const searchedToolNames: string[][] = [];
		const tool = new ToolSearchTool(
			{
				searchToolsByQuery: async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => {
					searchedToolNames.push(tools.map(candidate => candidate.name));
					return tools.map(candidate => candidate.name);
				},
			} as any,
			{
				isNonDeferredTool: () => false,
			} as any,
			{ trace() { } } as any,
		);

		const resolvedInput = await tool.resolveInput(
			{ query: 'anything' },
			{} as any,
			0,
		);

		const result = await tool.invoke(
			{ input: resolvedInput } as vscode.LanguageModelToolInvocationOptions<{ query: string }>,
			{ isCancellationRequested: false } as vscode.CancellationToken,
		);

		expect(searchedToolNames).toEqual([[]]);
		expect(result.content).toEqual([expect.objectContaining({ value: '[]' })]);
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