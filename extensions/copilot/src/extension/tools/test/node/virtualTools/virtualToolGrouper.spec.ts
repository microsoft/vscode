/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { EmbeddingType, IEmbeddingsComputer } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolExtensionSource, LanguageModelToolMCPSource } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { VirtualToolGrouper } from '../../../common/virtualTools/virtualToolGrouper';
import { GROUP_WITHIN_TOOLSET, MIN_TOOLSET_SIZE_TO_GROUP, START_GROUPING_AFTER_TOOL_COUNT } from '../../../common/virtualTools/virtualToolsConstants';
import { ISummarizedToolCategory } from '../../../common/virtualTools/virtualToolTypes';

describe.skip('Virtual Tools - Grouper', () => {
	let accessor: ITestingServicesAccessor;
	let grouper: TestVirtualToolGrouper;
	let root: VirtualTool;

	class TestVirtualToolGrouper extends VirtualToolGrouper {
		// Override the bulk description method to avoid hitting the endpoint
		protected override async _generateBulkGroupDescriptions(embeddingGroups: LanguageModelToolInformation[][], token: CancellationToken): Promise<{ groups: ISummarizedToolCategory[]; missed: number }> {
			// Simulate describing groups based on their tool names
			const groups = embeddingGroups.map((group, index) => {
				const prefix = group[0]?.name.split('_')[0] || 'unknown';
				return {
					name: `${prefix}_group_${index + 1}`,
					summary: `Group of ${prefix} tools containing ${group.map(t => t.name).join(', ')}`,
					tools: group
				};
			});
			return { groups, missed: 0 };
		}
	}

	function makeTool(name: string, source?: LanguageModelToolExtensionSource | LanguageModelToolMCPSource): LanguageModelToolInformation {
		return {
			name,
			description: `Tool for ${name}`,
			inputSchema: undefined,
			source,
			tags: [],
		};
	}

	function makeExtensionSource(id: string): LanguageModelToolExtensionSource {
		// TODO@connor4312
		return new (LanguageModelToolExtensionSource as any)(id, id);
	}

	function makeMCPSource(label: string): LanguageModelToolMCPSource {
		// TODO@connor4312
		return new (LanguageModelToolMCPSource as any)(label, label);
	}

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		grouper = accessor.get(IInstantiationService).createInstance(TestVirtualToolGrouper);
		root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
		root.isExpanded = true;
	});

	describe('_deduplicateGroups', () => {
		function vt(name: string, possiblePrefix?: string): VirtualTool {
			return new VirtualTool(
				name,
				`VT ${name}`,
				0,
				{},
				[]
			);
		}

		it('deduplicates VirtualTool against LM tool by prefixing existing VT', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}foo`;
			const items = [
				vt(dupName, 'ext_'),
				makeTool(dupName),
			];

			const result = VirtualToolGrouper.deduplicateGroups(items) as Array<VirtualTool | LanguageModelToolInformation>;

			// Expect both the LM tool and the prefixed VT to exist, and no unprefixed VT
			const names = result.map(i => i.name);
			expect(names).toContain(dupName);
			expect(names).toContain(`activate_ext_${dupName.slice(VIRTUAL_TOOL_NAME_PREFIX.length)}`);
			expect(result.find(i => i instanceof VirtualTool && i.name === dupName)).toBeUndefined();
		});

		it('deduplicates LM tool against VirtualTool by prefixing new VT', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}bar`;
			const items = [
				makeTool(dupName),
				vt(dupName, 'mcp_'),
			];

			const result = VirtualToolGrouper.deduplicateGroups(items) as Array<VirtualTool | LanguageModelToolInformation>;
			const names = result.map(i => i.name);
			expect(names).toContain(dupName); // LM tool remains under original name
			expect(names).toContain(`activate_mcp_${dupName.slice(VIRTUAL_TOOL_NAME_PREFIX.length)}`); // VT is cloned with prefix
		});

		it('handles VT vs VT duplicate by prefixing the first and keeping the second', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}baz`;
			const first = vt(dupName, 'ext_');
			const second = vt(dupName, 'mcp_');
			const result = VirtualToolGrouper.deduplicateGroups([first, second]) as Array<VirtualTool | LanguageModelToolInformation>;

			const vtPrefixed = result.find(i => i instanceof VirtualTool && i.name === `activate_ext_${dupName.slice(VIRTUAL_TOOL_NAME_PREFIX.length)}`) as VirtualTool | undefined;
			const vtUnprefixed = result.find(i => i.name === dupName) as VirtualTool | undefined;

			expect(vtPrefixed).toBeDefined();
			// Second VT should remain at the original (unprefixed) name
			expect(vtUnprefixed).toBeInstanceOf(VirtualTool);
		});

		it('drops duplicate when no possiblePrefix is available on VT', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}qux`;
			const items = [
				vt(dupName), // no possiblePrefix
				makeTool(dupName),
			];

			const result = VirtualToolGrouper.deduplicateGroups(items) as Array<VirtualTool | LanguageModelToolInformation>;
			// Only the first VT remains
			expect(result).toHaveLength(1);
			expect(result[0]).toBeInstanceOf(VirtualTool);
			expect(result[0].name).toBe(dupName);
		});

		it('keeps only the first LM tool on LM vs LM duplicate', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}dup`;
			const items = [makeTool(dupName), makeTool(dupName)];
			const result = VirtualToolGrouper.deduplicateGroups(items) as Array<VirtualTool | LanguageModelToolInformation>;
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe(dupName);
		});
	});

	afterEach(() => {
		accessor.dispose();
	});

	describe('addGroups - basic functionality', () => {
		it('should add tools directly when below START_GROUPING_AFTER_TOOL_COUNT', async () => {
			const tools = Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT - 1 }, (_, i) =>
				makeTool(`tool_${i}`)
			);

			await grouper.addGroups('', root, tools, CancellationToken.None);

			expect(root.contents).toEqual(tools);
		});

		it('should group tools when above START_GROUPING_AFTER_TOOL_COUNT', async () => {
			const tools = Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT + 1 }, (_, i) =>
				makeTool(`tool_${i}`)
			);

			await grouper.addGroups('', root, tools, CancellationToken.None);

			expect(root.contents.length).toBeGreaterThan(0);
			expect(root.contents.length).toEqual(tools.length);
		});
	});

	describe('addGroups - toolset grouping', () => {
		it('should handle built-in tools without grouping', async () => {
			const builtInTools = [
				makeTool('builtin_tool1'),
				makeTool('builtin_tool2'),
				makeTool('builtin_tool3'),
			];

			await grouper.addGroups('', root, builtInTools, CancellationToken.None);

			expect(root.contents).toEqual(builtInTools);
		});

		it('should group extension tools by extension id', async () => {
			const extensionSource = makeExtensionSource('test.extension');
			const extensionTools = Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) =>
				makeTool(`ext_tool_${i}`, extensionSource)
			);

			// Need enough tools to trigger grouping
			const allTools = [
				...extensionTools,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Should have created virtual tools for the extension
			const vt = root.contents.filter((tool): tool is VirtualTool => tool instanceof VirtualTool);
			expect(vt).toHaveLength(1);
			expect(vt[0].name).toBe('activate_ext');
		});

		it('should group MCP tools by MCP source label', async () => {
			const mcpSource = makeMCPSource('test-mcp');
			const mcpTools = Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) =>
				makeTool(`mcp_tool_${i}`, mcpSource)
			);

			// Need enough tools to trigger grouping
			const allTools = [
				...mcpTools,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Should have created virtual tools for the extension
			const vt = root.contents.filter((tool): tool is VirtualTool => tool instanceof VirtualTool);
			expect(vt).toHaveLength(1);
			expect(vt[0].name).toBe('activate_mcp');
		});

		it('should handle mixed toolsets correctly', async () => {
			const extensionSource = makeExtensionSource('test.extension');
			const mcpSource = makeMCPSource('test-mcp');

			const tools = [
				...Array.from({ length: 5 }, (_, i) => makeTool(`builtin_${i}`)),
				...Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) => makeTool(`ext_${i}`, extensionSource)),
				...Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) => makeTool(`mcp_${i}`, mcpSource)),
			];

			// Need enough tools to trigger grouping
			const allTools = [
				...tools,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Should have built-in tools and virtual tools for extension and MCP
			const nonExtra = root.contents.filter(tool => !tool.name.includes('extra_'));
			const builtInCount = nonExtra.filter(tool => !(tool instanceof VirtualTool)).length;
			const virtualCount = nonExtra.filter(tool => tool instanceof VirtualTool).length;

			expect(builtInCount).toBe(5); // Built-in tools added directly
			expect(virtualCount).toBeGreaterThan(0); // Virtual tools for extension and MCP
		});
	});

	describe('addGroups - toolset size thresholds', () => {
		it('should not group toolsets below MIN_TOOLSET_SIZE_TO_GROUP', async () => {
			const extensionSource = makeExtensionSource('small.extension');
			const smallToolset = Array.from({ length: MIN_TOOLSET_SIZE_TO_GROUP - 1 }, (_, i) =>
				makeTool(`small_${i}`, extensionSource)
			);

			// Need enough total tools to trigger grouping
			const allTools = [
				...smallToolset,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`builtin_${i}`))
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Small toolset should be added directly without grouping
			const addedDirectly = root.contents.filter(tool =>
				!(tool instanceof VirtualTool) && tool.name.startsWith('small_')
			);
			expect(addedDirectly).toHaveLength(MIN_TOOLSET_SIZE_TO_GROUP - 1);
		});

		it('should divide large toolsets into subgroups', async () => {
			const extensionSource = makeExtensionSource('large.extension');
			const largeToolset = Array.from({ length: GROUP_WITHIN_TOOLSET + 5 }, (_, i) =>
				makeTool(`group${i % 3}_tool_${i}`, extensionSource) // Create 3 groups
			);

			// Need enough tools to trigger grouping
			const allTools = [
				...largeToolset,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];


			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Should have created virtual tools for the extension
			const vt = root.contents.filter((tool): tool is VirtualTool => tool instanceof VirtualTool);
			expect(vt).toHaveLength(3);
			expect(vt.map(vt => vt.name)).toMatchInlineSnapshot(`
				[
				  "activate_group0",
				  "activate_group1",
				  "activate_group2",
				]
			`);
		});
	});

	describe('addGroups - state preservation', () => {
		it('should preserve expansion state of existing virtual tools', async () => {
			const tools = Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT + 1 }, (_, i) =>
				makeTool(`file_tool_${i}`)
			);

			// First grouping
			await grouper.addGroups('', root, tools, CancellationToken.None);

			// Expand a virtual tool
			const virtualTool = root.contents.find(tool => tool instanceof VirtualTool) as VirtualTool;
			if (virtualTool) {
				virtualTool.isExpanded = true;
				virtualTool.lastUsedOnTurn = 5;
			}

			// Second grouping with same tools
			await grouper.addGroups('', root, tools, CancellationToken.None);

			// State should be preserved
			const newVirtualTool = root.contents.find(tool =>
				tool instanceof VirtualTool && tool.name === virtualTool?.name
			) as VirtualTool;

			if (newVirtualTool) {
				expect(newVirtualTool.isExpanded).toBe(true);
				expect(newVirtualTool.lastUsedOnTurn).toBe(5);
			}
		});
	});

	describe('cache integration', () => {
		it('should use cache for tool group generation', async () => {
			const tools1 = Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) =>
				makeTool(`grouped_tool_${i}`, makeExtensionSource('cached.extension1'))
			);
			const tools2 = Array.from({ length: MIN_TOOLSET_SIZE_TO_GROUP + 1 }, (_, i) =>
				makeTool(`summarized_tool_${i}`, makeExtensionSource('cached.extension2'))
			);

			const allTools = [
				...tools1,
				...tools2,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			const context = accessor.get(IVSCodeExtensionContext);
			const cached = context.globalState.get('virtToolGroupCache');
			function sortObj(obj: unknown): any {
				if (Array.isArray(obj)) {
					return obj.map(sortObj).sort();
				}
				if (obj && typeof obj === 'object') {
					return Object.fromEntries(Object.entries(obj)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([k, v]) => [k, sortObj(v)]));
				}
				return obj;
			}

			expect(sortObj(cached)).toMatchInlineSnapshot(`
				{
				  "lru": [
				    [
				      "5sujG9z5TJJRhFVv6jkxLSvKfLlEi6DEUboDpSCLfvQ=",
				      {
				        "groups": [
				          {
				            "name": "grouped",
				            "summary": "Tools for grouped operations",
				            "tools": [
				              "grouped_tool_0",
				              "grouped_tool_1",
				              "grouped_tool_10",
				              "grouped_tool_11",
				              "grouped_tool_12",
				              "grouped_tool_13",
				              "grouped_tool_14",
				              "grouped_tool_15",
				              "grouped_tool_16",
				              "grouped_tool_2",
				              "grouped_tool_3",
				              "grouped_tool_4",
				              "grouped_tool_5",
				              "grouped_tool_6",
				              "grouped_tool_7",
				              "grouped_tool_8",
				              "grouped_tool_9",
				            ],
				          },
				        ],
				      },
				    ],
				    [
				      {
				        "groups": [
				          {
				            "name": "summarized",
				            "summary": "Summarized tools for summarized",
				            "tools": [
				              "summarized_tool_0",
				              "summarized_tool_1",
				              "summarized_tool_2",
				            ],
				          },
				        ],
				      },
				      "ukyzHGWUUwylzlhwETqBtsi69Xhj9XqiFp45nH8yqYE=",
				    ],
				  ],
				}
			`);

			const intoGroups = vi.spyOn(grouper, '_divideToolsIntoGroups' as any);
			const intoSummary = vi.spyOn(grouper, '_summarizeToolGroup' as any);

			await grouper.addGroups('', root, allTools, CancellationToken.None);
			expect(intoGroups).not.toHaveBeenCalled();
			expect(intoSummary).not.toHaveBeenCalled();

			const tools3 = Array.from({ length: MIN_TOOLSET_SIZE_TO_GROUP + 2 }, (_, i) =>
				makeTool(`summarized_tool_${i}`, makeExtensionSource('cached.extension2'))
			);

			const allTools2 = [
				...tools1,
				...tools3,
				...Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) => makeTool(`extra_${i}`))
			];
			await grouper.addGroups('', root, allTools2, CancellationToken.None);

			expect(intoGroups).not.toHaveBeenCalled();
			expect(intoSummary).toHaveBeenCalledOnce();
		});
	});

	describe('embedding-based expansion', () => {
		beforeEach(() => {
			const configurationService = accessor.get(IConfigurationService);
			vi.spyOn(configurationService, 'getExperimentBasedConfig').mockReturnValue(true);
		});

		it('should expand virtual tools containing predicted tools when embedding ranking is enabled', async () => {
			// Create extension tools that will be grouped
			const extensionSource = makeExtensionSource('test.extension');
			const extensionTools = [
				makeTool('predicted_tool1', extensionSource), // Higher priority (index 0)
				makeTool('predicted_tool2', extensionSource), // Lower priority (index 1)
				makeTool('other_tool1', extensionSource),
				makeTool('other_tool2', extensionSource),
			];

			// Add enough builtin tools to trigger grouping
			const builtinTools = Array.from({ length: START_GROUPING_AFTER_TOOL_COUNT }, (_, i) =>
				makeTool(`builtin_${i}`)
			);

			const allTools = [...extensionTools, ...builtinTools];

			// Mock the embedding computation and tool retrieval
			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{
					type: EmbeddingType.text3small_512,
					value: [0.1, 0.2, 0.3, 0.4, 0.5]
				}]
			});

			// Mock the tool embeddings computer to return specific predicted tools
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue(['predicted_tool1', 'predicted_tool2']);

			const query = 'test query for embeddings';

			// Call addGroups which should trigger embedding-based expansion
			await grouper.addGroups(query, root, allTools, CancellationToken.None);

			// Find the virtual tool that was created for the extension
			const virtualTools = root.contents.filter((tool): tool is VirtualTool => tool instanceof VirtualTool);
			expect(virtualTools.length).toBeGreaterThan(0);

			// The virtual tool containing predicted tools should be expanded
			const extVirtualTool = virtualTools.find(vt =>
				vt.contents.some(tool => tool.name === 'predicted_tool1' || tool.name === 'predicted_tool2')
			);
			expect(extVirtualTool).toBeDefined();
			if (extVirtualTool) {
				expect(extVirtualTool.isExpanded).toBe(true);
				expect(extVirtualTool.metadata.wasExpandedByDefault).toBe(true);
			}
		});
	});

	describe('recomputeEmbeddingRankings', () => {
		beforeEach(() => {
			const configurationService = accessor.get(IConfigurationService);
			vi.spyOn(configurationService, 'getExperimentBasedConfig').mockReturnValue(true);
		});

		it('should do nothing when embedding ranking is disabled', async () => {
			const configurationService = accessor.get(IConfigurationService);
			vi.spyOn(configurationService, 'getExperimentBasedConfig').mockReturnValue(false);

			const tools = [makeTool('test1'), makeTool('test2')];
			root.contents = [...tools];

			const originalContents = [...root.contents];
			await grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None);

			// Should not have changed anything
			expect(root.contents).toEqual(originalContents);
		});

		it('should create embeddings group with predicted tools', async () => {
			const tools = [makeTool('predicted1'), makeTool('regular1'), makeTool('predicted2'), makeTool('regular2')];
			root.contents = [...tools];

			// Mock the embeddings computer and tool retrieval
			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{
					type: EmbeddingType.text3small_512,
					value: [0.1, 0.2, 0.3, 0.4, 0.5]
				}]
			});

			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue(['predicted1', 'predicted2']);

			await grouper.recomputeEmbeddingRankings('test query', root, CancellationToken.None);

			// Should have added embeddings group at the beginning
			expect(root.contents[0]).toBeInstanceOf(VirtualTool);
			const embeddingsGroup = root.contents[0] as VirtualTool;
			expect(embeddingsGroup.name).toBe('activate_embeddings');
			expect(embeddingsGroup.description).toBe('Tools with high predicted relevancy for this query');
			expect(embeddingsGroup.isExpanded).toBe(true);
			expect(embeddingsGroup.metadata.canBeCollapsed).toBe(false);
			expect(embeddingsGroup.metadata.wasExpandedByDefault).toBe(true);

			// Should contain the predicted tools
			expect(embeddingsGroup.contents).toHaveLength(2);
			expect(embeddingsGroup.contents.map(t => t.name)).toEqual(['predicted1', 'predicted2']);

			// Original tools should still be in root
			const remainingTools = root.contents.slice(1);
			expect(remainingTools).toEqual(tools);
		});

		it('should replace existing embeddings group when recomputing', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2'), makeTool('tool3')];
			root.contents = [...tools];

			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{
					type: EmbeddingType.text3small_512,
					value: [0.1, 0.2, 0.3, 0.4, 0.5]
				}]
			});

			// First call - predict tool1
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValueOnce(['tool1']);

			await grouper.recomputeEmbeddingRankings('query1', root, CancellationToken.None);

			// Should have embeddings group with tool1
			expect(root.contents[0]).toBeInstanceOf(VirtualTool);
			let embeddingsGroup = root.contents[0] as VirtualTool;
			expect(embeddingsGroup.contents).toHaveLength(1);
			expect(embeddingsGroup.contents[0].name).toBe('tool1');

			// Second call - predict tool2 and tool3
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValueOnce(['tool2', 'tool3']);

			await grouper.recomputeEmbeddingRankings('query2', root, CancellationToken.None);

			// Should have replaced the embeddings group
			expect(root.contents[0]).toBeInstanceOf(VirtualTool);
			embeddingsGroup = root.contents[0] as VirtualTool;
			expect(embeddingsGroup.contents).toHaveLength(2);
			expect(embeddingsGroup.contents.map(t => t.name)).toEqual(['tool2', 'tool3']);
		});

		it('should create empty embeddings group when no predicted tools found', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];

			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{
					type: EmbeddingType.text3small_512,
					value: [0.1, 0.2, 0.3, 0.4, 0.5]
				}]
			});

			// Return no predicted tools
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue([]);

			await grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None);

			// Should have added empty embeddings group at the beginning
			expect(root.contents[0]).toBeInstanceOf(VirtualTool);
			const embeddingsGroup = root.contents[0] as VirtualTool;
			expect(embeddingsGroup.name).toBe('activate_embeddings');
			expect(embeddingsGroup.contents).toHaveLength(0);

			// Original tools should still be in root after the embeddings group
			const remainingTools = root.contents.slice(1);
			expect(remainingTools).toEqual(tools);
		});

		it('should create empty embeddings group when predicted tools are not found in root', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];

			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{
					type: EmbeddingType.text3small_512,
					value: [0.1, 0.2, 0.3, 0.4, 0.5]
				}]
			});

			// Return predicted tools that don't exist in root
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue(['nonexistent1', 'nonexistent2']);

			await grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None);

			// Should have added empty embeddings group since predicted tools don't exist in root
			expect(root.contents[0]).toBeInstanceOf(VirtualTool);
			const embeddingsGroup = root.contents[0] as VirtualTool;
			expect(embeddingsGroup.name).toBe('activate_embeddings');
			expect(embeddingsGroup.contents).toHaveLength(0);

			// Original tools should still be in root after the embeddings group
			const remainingTools = root.contents.slice(1);
			expect(remainingTools).toEqual(tools);
		});

		it('should handle errors in embeddings computation gracefully', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];

			// Mock embeddings computation to throw an error
			const embeddingsComputer = accessor.get(IEmbeddingsComputer);
			vi.spyOn(embeddingsComputer, 'computeEmbeddings').mockRejectedValue(new Error('Embeddings computation failed'));

			const originalContents = [...root.contents];

			// Should not throw and should not modify contents
			await expect(grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None)).resolves.toBeUndefined();
			expect(root.contents).toEqual(originalContents);
		});
	});

	describe('edge cases', () => {
		it('should handle empty tool list', async () => {
			await grouper.addGroups('', root, [], CancellationToken.None);

			expect(root.contents).toHaveLength(0);
		});

		it('should handle single tool', async () => {
			const tools = [makeTool('single_tool')];

			await grouper.addGroups('', root, tools, CancellationToken.None);

			expect(root.contents).toEqual(tools);
		});
	});
});
