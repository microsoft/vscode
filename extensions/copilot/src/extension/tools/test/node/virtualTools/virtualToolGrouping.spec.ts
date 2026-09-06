/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelTextPart, LanguageModelToolInformation } from 'vscode';
import { HARD_TOOL_LIMIT } from '../../../../../platform/configuration/common/configurationService';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { shuffle } from '../../../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { groupBy } from '../../../../../util/vs/base/common/collections';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolGrouping } from '../../../common/virtualTools/toolGrouping';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { TRIM_THRESHOLD } from '../../../common/virtualTools/virtualToolsConstants';
import { IToolCategorization } from '../../../common/virtualTools/virtualToolTypes';

describe('Virtual Tools - Grouping', () => {
	let accessor: ITestingServicesAccessor;
	let grouping: TestToolGrouping;
	let mockGrouper: IToolCategorization;

	class TestToolGrouping extends ToolGrouping {
		constructor(
			_tools: readonly LanguageModelToolInformation[],
			@IInstantiationService _instantiationService: IInstantiationService,
			@ITelemetryService _telemetryService: ITelemetryService
		) {
			super(_tools, _instantiationService, _telemetryService);
			this._grouper = mockGrouper;
		}

		// Expose protected member for testing
		public get grouper() {
			return this._grouper;
		}
	}

	function makeTool(name: string, tags: string[] = []): LanguageModelToolInformation {
		return {
			name,
			description: `Tool for ${name}`,
			inputSchema: undefined,
			source: undefined,
			tags,
		};
	}

	function createGroupingGrouper(): IToolCategorization {
		return {
			recomputeEmbeddingRankings() {
				return Promise.resolve();
			},
			addGroups(query, root, tools, token) {
				const groups = groupBy(tools, t => t.name.split('_')[0]);
				root.contents = [];
				for (const [groupName, groupTools] of Object.entries(groups)) {
					if (!groupTools) {
						continue;
					}
					if (groupTools.length < 3) {
						root.contents.push(...groupTools);
						continue;
					}
					const groupTool = new VirtualTool(
						`${VIRTUAL_TOOL_NAME_PREFIX}${groupName}`,
						`Group of tools: ${groupName}`,
						0,
						{ wasExpandedByDefault: true }
					);
					groupTool.contents = groupTools;
					root.contents.push(groupTool);
				}
				return Promise.resolve();
			},
		};
	}

	function createSimpleGrouper(): IToolCategorization {
		return {
			recomputeEmbeddingRankings: (query, root, token) => Promise.resolve(),
			addGroups(query, root, tools, token) {
				root.contents = [...tools];
				return Promise.resolve();
			},
		};
	}



	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		mockGrouper = createSimpleGrouper();
		grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);
	});

	afterEach(() => {
		accessor.dispose();
	});

	describe('constructor and initialization', () => {
		it('should initialize with empty tools array', () => {
			expect(grouping.tools).toEqual([]);
		});

		it('should initialize with provided tools', () => {
			const tools = [makeTool('test1'), makeTool('test2')];
			const newGrouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, tools);
			expect(newGrouping.tools).toEqual(tools);
		});
	});

	describe('tools property', () => {
		it('should get current tools', () => {
			const tools = [makeTool('test1'), makeTool('test2')];
			grouping.tools = tools;
			expect(grouping.tools).toEqual(tools);
		});

		it('should set new tools and mark as outdated when tools differ', () => {
			const initialTools = [makeTool('test1')];
			const newTools = [makeTool('test2')];

			grouping.tools = initialTools;
			grouping.tools = newTools;

			expect(grouping.tools).toEqual(newTools);
		});

		it('should not mark as outdated when setting identical tools', () => {
			const tools = [makeTool('test1'), makeTool('test2')];
			grouping.tools = tools;

			// Setting same tools should not trigger recompute
			grouping.tools = tools;
			expect(grouping.tools).toEqual(tools);
		});

		it('should detect tool differences by name', () => {
			const tools1 = [makeTool('test1')];
			const tools2 = [makeTool('test1')]; // Same name, different object

			grouping.tools = tools1;
			grouping.tools = tools2;

			// Should not be marked as outdated since names are the same
			expect(grouping.tools).toEqual(tools2);
		});
	});

	describe('compute()', () => {
		it('should return empty array for no tools', async () => {
			const result = await grouping.compute('', CancellationToken.None);
			expect(result).toEqual([]);
		});

		it('should return ungrouped tools when grouper adds them directly', async () => {
			const tools = [makeTool('test1'), makeTool('test2')];
			grouping.tools = tools;

			const result = await grouping.compute('', CancellationToken.None);
			expect(result).toEqual(tools);
		});

		it('should return virtual tool when tools are grouped', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools = [
				makeTool('file_read'),
				makeTool('file_write'),
				makeTool('file_delete')
			];
			grouping.tools = tools;

			const result = await grouping.compute('', CancellationToken.None);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe(`${VIRTUAL_TOOL_NAME_PREFIX}file`);
			expect(result[0].description).toBe('Group of tools: file');
		});

		it('should handle mixed grouped and ungrouped tools', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools = [
				makeTool('file_read'),
				makeTool('file_write'),
				makeTool('file_delete'),
				makeTool('single1'),
				makeTool('single2')
			];
			grouping.tools = tools;

			const result = await grouping.compute('', CancellationToken.None);
			expect(result).toHaveLength(3); // 1 group + 2 singles

			const groupTool = result.find(t => t.name.startsWith(VIRTUAL_TOOL_NAME_PREFIX));
			expect(groupTool).toBeDefined();
			expect(groupTool!.name).toBe(`${VIRTUAL_TOOL_NAME_PREFIX}file`);

			const singleTools = result.filter(t => !t.name.startsWith(VIRTUAL_TOOL_NAME_PREFIX));
			expect(singleTools).toHaveLength(2);
			expect(singleTools.map(t => t.name)).toEqual(['single1', 'single2']);
		});
	});

	describe('computeAll()', () => {
		it('should return complete tree including virtual tools', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools = [
				makeTool('file_read'),
				makeTool('file_write'),
				makeTool('file_delete')
			];
			grouping.tools = tools;

			const result = await grouping.computeAll('', CancellationToken.None);
			expect(result).toHaveLength(1);
			expect(result[0]).toBeInstanceOf(VirtualTool);

			const virtualTool = result[0] as VirtualTool;
			expect(virtualTool.contents).toEqual(tools);
		});
	});

	describe('didCall()', () => {
		it('should return undefined for non-virtual tool calls', () => {
			const result = grouping.didCall(0, 'regular_tool');
			expect(result).toBeUndefined();
		});

		it('should expand virtual tool and return result when called', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools = [
				makeTool('file_read'),
				makeTool('file_write'),
				makeTool('file_delete')
			];
			grouping.tools = tools;

			// First compute to create the virtual tool
			await grouping.compute('', CancellationToken.None);

			const result = grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}file`);
			expect(result).toBeDefined();

			// The constructor takes an array of parts, check that text is present
			const resultString = result?.content[0] as LanguageModelTextPart;
			expect(resultString.value).toMatchInlineSnapshot(`"Tools activated: file_read, file_write, file_delete"`);
		});

		it('should expand virtual tool and make its contents available in subsequent compute', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools = [
				makeTool('file_read'),
				makeTool('file_write'),
				makeTool('file_delete')
			];
			grouping.tools = tools;

			// First compute - should return virtual tool
			let result = await grouping.compute('', CancellationToken.None);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe(`${VIRTUAL_TOOL_NAME_PREFIX}file`);

			// Call the virtual tool to expand it
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}file`);

			// Second compute - should now return the expanded tools
			result = await grouping.compute('', CancellationToken.None);
			expect(result).toEqual(tools);
		});
	});

	describe('re-collapsing behavior', () => {
		it('should re-collapse least recently used tools when exceeding TRIM_THRESHOLD after cache invalidation', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create enough tools to exceed TRIM_THRESHOLD
			const toolGroups: LanguageModelToolInformation[] = [];
			const groupNumbers: number[] = [];
			for (let i = 0; i < HARD_TOOL_LIMIT / 2; i++) {
				groupNumbers.push(i);
				toolGroups.push(makeTool(`group${i}_tool1`));
				toolGroups.push(makeTool(`group${i}_tool2`));
				toolGroups.push(makeTool(`group${i}_tool3`));
			}
			grouping.tools = toolGroups;

			shuffle(groupNumbers);

			// Initial compute - should create virtual tools for groups
			let result = await grouping.compute('', CancellationToken.None);
			expect(result.length).toBeLessThan(toolGroups.length); // Should be grouped

			// Expand some virtual tools by calling them at different turns
			// call and expand until we hit the first trim
			let i = 0;
			for (; i < groupNumbers.length && result.length < TRIM_THRESHOLD; i++) {
				grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group${groupNumbers[i]}`);
				grouping.didTakeTurn();
				result = await grouping.compute('', CancellationToken.None);
			}

			grouping.didInvalidateCache();
			result = await grouping.compute('', CancellationToken.None);
			expect(result.length).toBeLessThanOrEqual(TRIM_THRESHOLD);
			for (let k = i - 1; k > i - 3; k--) {
				expect(result.map(r => r.name)).toContain(`group${groupNumbers[k]}_tool1`);
			}
		});

		it('should prioritize keeping recently used tools when re-collapsing', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create tools that will form groups
			const tools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < 40; i++) {
				tools.push(makeTool(`group${i}_tool1`));
				tools.push(makeTool(`group${i}_tool2`));
				tools.push(makeTool(`group${i}_tool3`));
			}
			grouping.tools = tools;

			await grouping.compute('', CancellationToken.None);

			// Expand tools in different order - later calls are more recent
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group0`); // Oldest usage
			grouping.didTakeTurn();

			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group1`);
			grouping.didTakeTurn();

			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group2`); // Most recent usage
			grouping.didTakeTurn();

			// Force trimming
			grouping.didInvalidateCache();
			const result = await grouping.compute('', CancellationToken.None);

			// group2 tools should still be expanded (most recent)
			// group0 tools should be collapsed first (least recent)
			const expandedTools = result.filter(tool =>
				tool.name.includes('group2_tool') && !tool.name.startsWith(VIRTUAL_TOOL_NAME_PREFIX)
			);
			expect(expandedTools.length).toBeGreaterThan(0);
		});

		it('should handle multiple cache invalidations correctly', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const tools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < 40; i++) {
				tools.push(makeTool(`group${i}_tool1`));
				tools.push(makeTool(`group${i}_tool2`));
				tools.push(makeTool(`group${i}_tool3`));
			}
			grouping.tools = tools;

			await grouping.compute('', CancellationToken.None);

			// Expand some tools
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group0`);
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group1`);
			grouping.didTakeTurn();

			// First cache invalidation
			grouping.didInvalidateCache();
			let result = await grouping.compute('', CancellationToken.None);
			const firstTrimCount = result.length;
			expect(firstTrimCount).toBeLessThanOrEqual(TRIM_THRESHOLD);

			// Expand more tools
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group2`);
			grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}group3`);
			grouping.didTakeTurn();

			// Second cache invalidation
			grouping.didInvalidateCache();
			result = await grouping.compute('', CancellationToken.None);

			// Should still respect TRIM_THRESHOLD
			expect(result.length).toBeLessThanOrEqual(TRIM_THRESHOLD);
		});

		it('should stop trimming when no more virtual tools can be collapsed', async () => {
			mockGrouper = createSimpleGrouper(); // No grouping - all tools individual
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create many individual tools (no groups)
			const tools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < 150; i++) {
				tools.push(makeTool(`individual_tool_${i}`));
			}
			grouping.tools = tools;

			// Invalidate cache to trigger trimming
			grouping.didInvalidateCache();
			const result = await grouping.compute('', CancellationToken.None);

			// Since there are no virtual tools to collapse, should keep all tools
			// even if exceeding TRIM_THRESHOLD
			expect(result.length).toBe(150);
		});
	});

	describe('cache invalidation integration', () => {
		it('should trigger recomputeEmbeddingRankings during cache invalidation', async () => {
			mockGrouper = createSimpleGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			const spy = vi.spyOn(mockGrouper, 'recomputeEmbeddingRankings');
			const tools = [makeTool('test1'), makeTool('test2')];
			grouping.tools = tools;

			// Initial compute should not call recomputeEmbeddingRankings
			await grouping.compute('query', CancellationToken.None);
			expect(spy).not.toHaveBeenCalled();

			// Cache invalidation should trigger recomputeEmbeddingRankings
			grouping.didInvalidateCache();
			await grouping.compute('query', CancellationToken.None);
			expect(spy).toHaveBeenCalledWith('query', grouping['_root'], CancellationToken.None);
		});
	});

	describe('canBeCollapsed metadata', () => {
		it('should respect canBeCollapsed=false during trimming', async () => {
			mockGrouper = {
				recomputeEmbeddingRankings() {
					return Promise.resolve();
				},
				addGroups(query, root, tools, token) {
					// Create some virtual tools with different canBeCollapsed settings
					const collapsibleGroup = new VirtualTool(
						`${VIRTUAL_TOOL_NAME_PREFIX}collapsible`,
						'Collapsible group',
						0,
						{ canBeCollapsed: true, wasExpandedByDefault: true }
					);
					collapsibleGroup.contents = tools.slice(0, 2);
					collapsibleGroup.isExpanded = true;

					const nonCollapsibleGroup = new VirtualTool(
						`${VIRTUAL_TOOL_NAME_PREFIX}noncollapsible`,
						'Non-collapsible group',
						0,
						{ canBeCollapsed: false, wasExpandedByDefault: true }
					);
					nonCollapsibleGroup.contents = tools.slice(2, 4);
					nonCollapsibleGroup.isExpanded = true;

					root.contents = [collapsibleGroup, nonCollapsibleGroup, ...tools.slice(4)];
					return Promise.resolve();
				},
			};
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create many tools to trigger trimming
			const manyTools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < TRIM_THRESHOLD + 10; i++) {
				manyTools.push(makeTool(`tool_${i}`));
			}
			grouping.tools = manyTools;

			// Initial compute
			await grouping.compute('', CancellationToken.None);

			// Force trimming
			grouping.didInvalidateCache();
			await grouping.compute('', CancellationToken.None);

			// Non-collapsible group should still be expanded
			const allResult = await grouping.computeAll('', CancellationToken.None);
			const nonCollapsibleGroup = allResult.find(tool =>
				tool instanceof VirtualTool && tool.name === `${VIRTUAL_TOOL_NAME_PREFIX}noncollapsible`
			) as VirtualTool;
			expect(nonCollapsibleGroup?.isExpanded).toBe(true);

			// Collapsible group may have been collapsed - just verify it exists
			const collapsibleGroup = allResult.find(tool =>
				tool instanceof VirtualTool && tool.name === `${VIRTUAL_TOOL_NAME_PREFIX}collapsible`
			) as VirtualTool;
			expect(collapsibleGroup).toBeDefined();
		});

		it('should set lastUsedOnTurn to Infinity for non-collapsible tools during trimming attempts', async () => {
			mockGrouper = {
				recomputeEmbeddingRankings() {
					return Promise.resolve();
				},
				addGroups(query, root, tools, token) {
					const nonCollapsibleGroup = new VirtualTool(
						`${VIRTUAL_TOOL_NAME_PREFIX}noncollapsible`,
						'Non-collapsible group',
						5, // Initial lastUsedOnTurn
						{ canBeCollapsed: false, wasExpandedByDefault: true }
					);
					nonCollapsibleGroup.contents = tools.slice(0, 3);
					nonCollapsibleGroup.isExpanded = true;

					root.contents = [nonCollapsibleGroup, ...tools.slice(3)];
					return Promise.resolve();
				},
			};
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create many tools to trigger trimming
			const manyTools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < TRIM_THRESHOLD + 10; i++) {
				manyTools.push(makeTool(`tool_${i}`));
			}
			grouping.tools = manyTools;

			// Initial compute
			await grouping.compute('', CancellationToken.None);

			// Force trimming
			grouping.didInvalidateCache();
			await grouping.compute('', CancellationToken.None);

			// Check that non-collapsible tool's lastUsedOnTurn was set to Infinity
			const allResult = await grouping.computeAll('', CancellationToken.None);
			const nonCollapsibleGroup = allResult.find(tool =>
				tool instanceof VirtualTool && tool.name === `${VIRTUAL_TOOL_NAME_PREFIX}noncollapsible`
			) as VirtualTool;
			expect(nonCollapsibleGroup?.lastUsedOnTurn).toBe(Infinity);
			expect(nonCollapsibleGroup?.isExpanded).toBe(true);
		});
	});

	describe('tool limit handling', () => {
		it('should handle tool trimming when exceeding limits', async () => {
			mockGrouper = createGroupingGrouper();
			grouping = accessor.get(IInstantiationService).createInstance(TestToolGrouping, []);

			// Create a large number of tools to test trimming behavior
			const manyTools: LanguageModelToolInformation[] = [];
			for (let i = 0; i < 10; i++) {
				for (let k = 0; k < 20; k++) {
					manyTools.push(makeTool(`cat${i}_tool_${k}`));
				}
			}

			grouping.tools = manyTools;
			const result = await grouping.compute('', CancellationToken.None);
			expect(result.length).toBeLessThanOrEqual(HARD_TOOL_LIMIT);

			for (let i = 0; i < 10; i++) {
				grouping.didCall(0, `${VIRTUAL_TOOL_NAME_PREFIX}cat${i}`);
			}

			expect(result.length).toBeLessThanOrEqual(HARD_TOOL_LIMIT);
		});
	});
});
