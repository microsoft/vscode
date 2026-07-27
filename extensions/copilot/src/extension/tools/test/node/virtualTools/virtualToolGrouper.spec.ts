/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { ConfigKey, HARD_TOOL_LIMIT, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { EmbeddingType, IEmbeddingsComputer } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolExtensionSource, LanguageModelToolMCPSource } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { EMBEDDINGS_GROUP_NAME, VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { VirtualToolGrouper } from '../../../common/virtualTools/virtualToolGrouper';
import { GROUP_WITHIN_TOOLSET, MIN_TOOLSET_SIZE_TO_GROUP, NUM_EMBED_MATCHED_TOOLS, START_GROUPING_AFTER_TOOL_COUNT, TOOLS_AND_GROUPS_LIMIT } from '../../../common/virtualTools/virtualToolsConstants';
import { ISummarizedToolCategory } from '../../../common/virtualTools/virtualToolTypes';

describe('Virtual Tools - Grouper', () => {
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

	/** Root contents excluding the embeddings group, which `addGroups` always appends. */
	function contentsWithoutEmbeddings(): (VirtualTool | LanguageModelToolInformation)[] {
		return root.contents.filter(c => c.name !== EMBEDDINGS_GROUP_NAME);
	}

	function groupsIn(): VirtualTool[] {
		return contentsWithoutEmbeddings().filter((c): c is VirtualTool => c instanceof VirtualTool);
	}

	/**
	 * Built-in tools consume top-level slots, so enough of them leaves extension and
	 * MCP toolsets short of slots. Grouping is driven entirely by that pressure.
	 */
	function builtinsFillingSlots(free: number): LanguageModelToolInformation[] {
		return Array.from({ length: TOOLS_AND_GROUPS_LIMIT - free }, (_, i) => makeTool(`builtin_${i}`));
	}

	/** Names of the tools reachable from the root, top-level or nested in a group. */
	function reachableToolNames(): Set<string> {
		const names = new Set<string>();
		for (const item of root.all()) {
			if (!(item instanceof VirtualTool)) {
				names.add(item.name);
			}
		}
		return names;
	}

	beforeEach(async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		// Built-in grouping is experiment-gated. These tests rely on built-in tools each
		// taking a slot, which is what puts the other toolsets under slot pressure.
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.DefaultToolsGrouped, false);
		grouper = accessor.get(IInstantiationService).createInstance(TestVirtualToolGrouper);
		root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
		root.isExpanded = true;
	});

	describe('deduplicateGroups', () => {
		function vt(name: string, contents: LanguageModelToolInformation[] = []): VirtualTool {
			return new VirtualTool(name, `VT ${name}`, 0, {}, contents);
		}

		it('renames colliding groups with a numeric suffix', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}foo`;
			const result = VirtualToolGrouper.deduplicateGroups([vt(dupName), vt(dupName), vt(dupName)]);

			expect(result.map(i => i.name)).toEqual([dupName, `${dupName}_2`, `${dupName}_3`]);
		});

		it('carries contents over when renaming a group', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}bar`;
			const tool = makeTool('inner_tool');
			const result = VirtualToolGrouper.deduplicateGroups([vt(dupName), vt(dupName, [tool])]);

			const renamed = result.find(i => i.name === `${dupName}_2`) as VirtualTool;
			expect(renamed.contents).toEqual([tool]);
		});

		it('never drops an item', () => {
			const dupName = `${VIRTUAL_TOOL_NAME_PREFIX}baz`;
			const items = [vt(dupName), makeTool(dupName), makeTool('unique'), vt(dupName)];

			expect(VirtualToolGrouper.deduplicateGroups(items)).toHaveLength(items.length);
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

			expect(contentsWithoutEmbeddings()).toHaveLength(tools.length);
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

			const allTools = [...extensionTools, ...builtinsFillingSlots(4)];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// The extension's tools are grouped, and none of them are lost.
			const grouped = groupsIn().flatMap(g => Array.from(g.all()).map(t => t.name));
			expect({
				groupedExtensionTools: extensionTools.every(t => grouped.includes(t.name)),
				lost: allTools.map(t => t.name).filter(n => !reachableToolNames().has(n)),
			}).toEqual({ groupedExtensionTools: true, lost: [] });
		});

		it('should group MCP tools by MCP source label', async () => {
			const mcpSource = makeMCPSource('test-mcp');
			const mcpTools = Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) =>
				makeTool(`mcp_tool_${i}`, mcpSource)
			);

			const allTools = [...mcpTools, ...builtinsFillingSlots(4)];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// The MCP server's tools are grouped, and none of them are lost.
			const grouped = groupsIn().flatMap(g => Array.from(g.all()).map(t => t.name));
			expect({
				groupedMcpTools: mcpTools.every(t => grouped.includes(t.name)),
				lost: allTools.map(t => t.name).filter(n => !reachableToolNames().has(n)),
			}).toEqual({ groupedMcpTools: true, lost: [] });
		});

		it('should handle mixed toolsets correctly', async () => {
			const extensionSource = makeExtensionSource('test.extension');
			const mcpSource = makeMCPSource('test-mcp');

			const builtins = builtinsFillingSlots(4);
			const allTools = [
				...builtins,
				...Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) => makeTool(`ext_${i}`, extensionSource)),
				...Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) => makeTool(`mcp_${i}`, mcpSource)),
			];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// Built-in tools stay top-level; extension and MCP tools get grouped.
			const topLevelNames = contentsWithoutEmbeddings().filter(t => !(t instanceof VirtualTool)).map(t => t.name);
			expect({
				builtinsTopLevel: builtins.every(t => topLevelNames.includes(t.name)),
				hasGroups: groupsIn().length > 0,
				lost: allTools.map(t => t.name).filter(n => !reachableToolNames().has(n)),
			}).toEqual({ builtinsTopLevel: true, hasGroups: true, lost: [] });
		});

		it('keeps serialized tools within the hard limit when built-in grouping is disabled', async () => {
			const extensionSource = makeExtensionSource('test.extension');
			const extensionTools = Array.from({ length: NUM_EMBED_MATCHED_TOOLS }, (_, i) => makeTool(`extension_${i}`, extensionSource));
			const allTools = [
				...Array.from({ length: HARD_TOOL_LIMIT - NUM_EMBED_MATCHED_TOOLS }, (_, i) => makeTool(`builtin_${i}`)),
				...extensionTools,
			];

			vi.spyOn(accessor.get(IEmbeddingsComputer), 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{ type: EmbeddingType.text3small_512, value: [0.1, 0.2, 0.3, 0.4, 0.5] }]
			});
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue(extensionTools.map(tool => tool.name));

			await grouper.addGroups('find extension tools', root, allTools, CancellationToken.None);

			const serialized = Array.from(root.tools());
			expect({
				serializedCount: serialized.length,
				withinHardLimit: serialized.length <= HARD_TOOL_LIMIT,
				lost: allTools.map(tool => tool.name).filter(name => !reachableToolNames().has(name)),
			}).toEqual({ serializedCount: HARD_TOOL_LIMIT, withinHardLimit: true, lost: [] });
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

			const allTools = [...largeToolset, ...builtinsFillingSlots(4)];

			await grouper.addGroups('', root, allTools, CancellationToken.None);

			// A toolset larger than its slot allocation is split across several groups.
			expect({
				groupCount: groupsIn().length > 1,
				lost: allTools.map(t => t.name).filter(n => !reachableToolNames().has(n)),
			}).toEqual({ groupCount: true, lost: [] });
		});
	});

	describe('addGroups - state preservation', () => {
		it('should preserve expansion state of existing virtual tools', async () => {
			const extensionSource = makeExtensionSource('stateful.extension');
			const tools = [
				...Array.from({ length: GROUP_WITHIN_TOOLSET + 1 }, (_, i) => makeTool(`file_tool_${i}`, extensionSource)),
				...builtinsFillingSlots(4),
			];

			// First grouping
			await grouper.addGroups('', root, tools, CancellationToken.None);

			// Expand a virtual tool
			const virtualTool = groupsIn()[0];
			expect(virtualTool).toBeDefined();
			virtualTool.isExpanded = true;
			virtualTool.lastUsedOnTurn = 5;

			// Second grouping with same tools
			await grouper.addGroups('', root, tools, CancellationToken.None);

			const regrouped = groupsIn().find(t => t.name === virtualTool.name)!;
			expect({ isExpanded: regrouped.isExpanded, lastUsedOnTurn: regrouped.lastUsedOnTurn })
				.toEqual({ isExpanded: true, lastUsedOnTurn: 5 });
		});
	});

	describe('recomputeEmbeddingRankings', () => {
		function stubQueryEmbedding() {
			vi.spyOn(accessor.get(IEmbeddingsComputer), 'computeEmbeddings').mockResolvedValue({
				type: EmbeddingType.text3small_512,
				values: [{ type: EmbeddingType.text3small_512, value: [0.1, 0.2, 0.3, 0.4, 0.5] }]
			});
		}

		function stubPredictions(...names: string[]) {
			vi.spyOn(grouper['_toolEmbeddingsComputer'], 'retrieveSimilarEmbeddingsForAvailableTools')
				.mockResolvedValue(names);
		}

		function embeddingsGroup(): VirtualTool {
			return root.contents.find(c => c.name === EMBEDDINGS_GROUP_NAME) as VirtualTool;
		}

		it('should create embeddings group with predicted tools', async () => {
			const tools = [makeTool('predicted1'), makeTool('regular1'), makeTool('predicted2'), makeTool('regular2')];
			root.contents = [...tools];
			stubQueryEmbedding();
			stubPredictions('predicted1', 'predicted2');

			await grouper.recomputeEmbeddingRankings('test query', root, CancellationToken.None);

			const group = embeddingsGroup();
			expect({
				description: group.description,
				isExpanded: group.isExpanded,
				canBeCollapsed: group.metadata.canBeCollapsed,
				wasExpandedByDefault: group.metadata.wasExpandedByDefault,
				contents: group.contents.map(t => t.name),
				originalToolsIntact: contentsWithoutEmbeddings(),
			}).toEqual({
				description: 'Tools with high predicted relevancy for this query',
				isExpanded: true,
				canBeCollapsed: false,
				wasExpandedByDefault: true,
				contents: ['predicted1', 'predicted2'],
				originalToolsIntact: tools,
			});
		});

		it('should replace existing embeddings group when recomputing', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2'), makeTool('tool3')];
			root.contents = [...tools];
			stubQueryEmbedding();

			stubPredictions('tool1');
			await grouper.recomputeEmbeddingRankings('query1', root, CancellationToken.None);
			const first = embeddingsGroup().contents.map(t => t.name);

			stubPredictions('tool2', 'tool3');
			await grouper.recomputeEmbeddingRankings('query2', root, CancellationToken.None);

			expect({
				first,
				second: embeddingsGroup().contents.map(t => t.name),
				groupCount: root.contents.filter(c => c.name === EMBEDDINGS_GROUP_NAME).length,
			}).toEqual({ first: ['tool1'], second: ['tool2', 'tool3'], groupCount: 1 });
		});

		it('should create an empty embeddings group when nothing is predicted', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];
			stubQueryEmbedding();
			stubPredictions();

			await grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None);

			expect({
				contents: embeddingsGroup().contents,
				originalToolsIntact: contentsWithoutEmbeddings(),
			}).toEqual({ contents: [], originalToolsIntact: tools });
		});

		it('should create an empty embeddings group when predicted tools are not in the root', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];
			stubQueryEmbedding();
			stubPredictions('nonexistent1', 'nonexistent2');

			await grouper.recomputeEmbeddingRankings('query', root, CancellationToken.None);

			expect({
				contents: embeddingsGroup().contents,
				originalToolsIntact: contentsWithoutEmbeddings(),
			}).toEqual({ contents: [], originalToolsIntact: tools });
		});

		it('should handle errors in embeddings computation gracefully', async () => {
			const tools = [makeTool('tool1'), makeTool('tool2')];
			root.contents = [...tools];
			vi.spyOn(accessor.get(IEmbeddingsComputer), 'computeEmbeddings')
				.mockRejectedValue(new Error('Embeddings computation failed'));

			const originalContents = [...root.contents];

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
