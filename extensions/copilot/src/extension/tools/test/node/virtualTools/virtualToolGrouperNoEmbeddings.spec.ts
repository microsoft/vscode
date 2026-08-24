/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { HARD_TOOL_LIMIT } from '../../../../../platform/configuration/common/configurationService';
import { Embedding } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolMCPSource } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IToolEmbeddingsComputer } from '../../../common/virtualTools/toolEmbeddingsComputer';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { VirtualToolGrouper } from '../../../common/virtualTools/virtualToolGrouper';
import { ISummarizedToolCategory } from '../../../common/virtualTools/virtualToolTypes';

class TestToolEmbeddingsComputer implements IToolEmbeddingsComputer {
	declare _serviceBrand: undefined;

	available = false;
	computeGroupingCallCount = 0;
	groupTools: (tools: readonly LanguageModelToolInformation[], limit: number) => LanguageModelToolInformation[][] = () => [];

	isEmbeddingModelAvailable(): Promise<boolean> {
		return Promise.resolve(this.available);
	}

	retrieveSimilarEmbeddingsForAvailableTools(_queryEmbedding: Embedding, _availableTools: readonly LanguageModelToolInformation[], _limit: number, _token: CancellationToken): Promise<string[]> {
		return Promise.resolve([]);
	}

	searchToolsByQuery(_query: string, _availableTools: readonly LanguageModelToolInformation[], _limit: number, _token: CancellationToken): Promise<string[]> {
		return Promise.resolve([]);
	}

	computeToolGroupings(tools: readonly LanguageModelToolInformation[], limit: number, _token: CancellationToken): Promise<LanguageModelToolInformation[][]> {
		this.computeGroupingCallCount++;
		return Promise.resolve(this.groupTools(tools, limit));
	}
}

class TestVirtualToolGrouper extends VirtualToolGrouper {
	protected override _generateBulkGroupDescriptions(embeddingGroups: LanguageModelToolInformation[][], _token: CancellationToken): Promise<{ groups: ISummarizedToolCategory[]; missed: number }> {
		return Promise.resolve({
			groups: embeddingGroups.map((tools, index) => ({
				name: `embedding_${index + 1}`,
				summary: `Embedding group ${index + 1}`,
				tools,
			})),
			missed: 0,
		});
	}
}

function makeMcpSource(label: string): LanguageModelToolMCPSource {
	const source: LanguageModelToolMCPSource = Object.create(LanguageModelToolMCPSource.prototype);
	Object.defineProperties(source, {
		label: { value: label, enumerable: true },
		name: { value: label, enumerable: true },
	});
	return source;
}

function makeTool(name: string, source?: LanguageModelToolMCPSource): LanguageModelToolInformation {
	return {
		name,
		description: `Tool for ${name}`,
		inputSchema: undefined,
		source,
		tags: [],
	};
}

describe('Virtual Tools - MCP without embeddings', () => {
	let accessor: ITestingServicesAccessor;
	let embeddingsComputer: TestToolEmbeddingsComputer;

	beforeEach(() => {
		const services = createExtensionUnitTestingServices();
		embeddingsComputer = new TestToolEmbeddingsComputer();
		services.define(IToolEmbeddingsComputer, embeddingsComputer);
		accessor = services.createTestingAccessor();
	});

	afterEach(() => {
		accessor.dispose();
	});

	function createIssueTools() {
		const builtInTools = Array.from({ length: 51 }, (_, index) => makeTool(`builtin_${index}`));
		const mcpToolCounts = [24, 10, 13];
		const mcpTools = mcpToolCounts.flatMap((count, serverIndex) => {
			const source = makeMcpSource(`server-${serverIndex}`);
			return Array.from({ length: count }, (_, toolIndex) => makeTool(`mcp_${serverIndex}_${toolIndex}`, source));
		});
		return { builtInTools, mcpTools };
	}

	async function groupIssueTools(builtInTools: LanguageModelToolInformation[], mcpTools: LanguageModelToolInformation[]) {
		const root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
		root.isExpanded = true;
		const grouper = accessor.get(IInstantiationService).createInstance(TestVirtualToolGrouper);
		await grouper.addGroups('', root, [...builtInTools, ...mcpTools], CancellationToken.None);
		return root;
	}

	it('keeps all #327424 MCP tools reachable when embeddings are unavailable', async () => {
		const { builtInTools, mcpTools } = createIssueTools();
		const root = await groupIssueTools(builtInTools, mcpTools);
		const requestTools = [...root.tools()];

		expect({
			input: { builtIn: builtInTools.length, mcp: mcpTools.length },
			output: {
				builtIn: requestTools.filter(tool => tool.name.startsWith('builtin_')).length,
				mcp: requestTools.filter(tool => tool.name.startsWith('mcp_')).length,
				virtualMcpGroups: requestTools.filter(tool => tool.name.startsWith(VIRTUAL_TOOL_NAME_PREFIX)).length,
				reachableMcp: mcpTools.filter(tool => root.find(tool.name)).length,
				totalRequestTools: requestTools.length,
			},
			computeGroupingCallCount: embeddingsComputer.computeGroupingCallCount,
		}).toEqual({
			input: { builtIn: 51, mcp: 47 },
			output: { builtIn: 51, mcp: 34, virtualMcpGroups: 3, reachableMcp: 47, totalRequestTools: 88 },
			computeGroupingCallCount: 0,
		});
	});

	it('uses embedding groups when embeddings are available for every tool', async () => {
		embeddingsComputer.available = true;
		embeddingsComputer.groupTools = tools => {
			const groups: LanguageModelToolInformation[][] = [];
			for (let index = 0; index < tools.length; index += 4) {
				groups.push(tools.slice(index, index + 4));
			}
			return groups;
		};
		const { builtInTools, mcpTools } = createIssueTools();
		const root = await groupIssueTools(builtInTools, mcpTools);

		expect({
			reachableMcp: mcpTools.filter(tool => root.find(tool.name)).length,
			embeddingGroups: root.contents.filter(tool => tool.name.startsWith(`${VIRTUAL_TOOL_NAME_PREFIX}embedding_`)).length,
			fallbackGroups: root.contents.filter(tool => tool.name.startsWith(`${VIRTUAL_TOOL_NAME_PREFIX}fallback_`)).length,
			individualMcp: [...root.tools()].filter(tool => tool.name.startsWith('mcp_')).length,
			totalRequestTools: [...root.tools()].length,
		}).toEqual({
			reachableMcp: 47,
			embeddingGroups: 12,
			fallbackGroups: 0,
			individualMcp: 1,
			totalRequestTools: 64,
		});
	});

	it('falls back when the embedding result does not cover every tool', async () => {
		embeddingsComputer.available = true;
		embeddingsComputer.groupTools = tools => [tools.slice(0, 4)];
		const { builtInTools, mcpTools } = createIssueTools();
		const root = await groupIssueTools(builtInTools, mcpTools);
		const requestTools = [...root.tools()];

		expect({
			directMcp: requestTools.filter(tool => tool.name.startsWith('mcp_')).length,
			fallbackGroups: requestTools.filter(tool => tool.name.startsWith(`${VIRTUAL_TOOL_NAME_PREFIX}fallback_`)).length,
			reachableMcp: mcpTools.filter(tool => root.find(tool.name)).length,
			totalRequestTools: requestTools.length,
		}).toEqual({
			directMcp: 34,
			fallbackGroups: 3,
			reachableMcp: 47,
			totalRequestTools: 88,
		});
	});

	it('keeps every fallback-tree expansion path within the hard tool limit', async () => {
		const builtInTools = Array.from({ length: 51 }, (_, index) => makeTool(`builtin_${index}`));
		const source = makeMcpSource('large-server');
		const mcpTools = Array.from({ length: 500 }, (_, index) => makeTool(`mcp_large_${index}`, source));
		const root = await groupIssueTools(builtInTools, mcpTools);
		let maximumVisibleTools = 0;

		for (const tool of mcpTools) {
			const found = root.find(tool.name);
			for (const group of found?.path ?? []) {
				group.isExpanded = true;
			}
			maximumVisibleTools = Math.max(maximumVisibleTools, [...root.tools()].length);
			for (const item of root.all()) {
				if (item instanceof VirtualTool && item !== root) {
					item.isExpanded = false;
				}
			}
		}

		expect({
			reachableMcp: mcpTools.filter(tool => root.find(tool.name)).length,
			withinHardLimit: maximumVisibleTools <= HARD_TOOL_LIMIT,
		}).toEqual({
			reachableMcp: 500,
			withinHardLimit: true,
		});
	});
});
