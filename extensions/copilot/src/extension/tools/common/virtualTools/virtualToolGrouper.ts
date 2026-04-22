/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEmbeddingsComputer } from '../../../../platform/embeddings/common/embeddingsComputer';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { groupBy } from '../../../../util/vs/base/common/collections';
import { StopWatch } from '../../../../util/vs/base/common/stopwatch';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolExtensionSource, LanguageModelToolMCPSource } from '../../../../vscodeTypes';
import { BuiltInToolGroupHandler } from './builtInToolGroupHandler';
import { EMBEDDING_TYPE_FOR_TOOL_GROUPING } from './preComputedToolEmbeddingsCache';
import { IToolEmbeddingsComputer } from './toolEmbeddingsComputer';
import { EMBEDDINGS_GROUP_NAME, VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from './virtualTool';
import * as Constant from './virtualToolsConstants';
import { TOOLS_AND_GROUPS_LIMIT } from './virtualToolsConstants';
import { describeBulkToolGroups } from './virtualToolSummarizer';
import { ISummarizedToolCategory, ISummarizedToolCategoryUpdatable, IToolCategorization, IToolGroupingCache } from './virtualToolTypes';

const CATEGORIZATION_ENDPOINT = 'copilot-fast';
const SUMMARY_PREFIX = 'Call this tool when you need access to a new category of tools. The category of tools is described as follows:\n\n';
const SUMMARY_SUFFIX = '\n\nBe sure to call this tool if you need a capability related to the above.';

export class VirtualToolGrouper implements IToolCategorization {
	private builtInToolGroupHandler: BuiltInToolGroupHandler;

	constructor(
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IToolGroupingCache private readonly _cache: IToolGroupingCache,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IEmbeddingsComputer private readonly embeddingsComputer: IEmbeddingsComputer,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IToolEmbeddingsComputer private readonly _toolEmbeddingsComputer: IToolEmbeddingsComputer,
		@IInstantiationService _instantiationService: IInstantiationService,
	) {
		this.builtInToolGroupHandler = new BuiltInToolGroupHandler();
	}

	/**
	 * Determines if built-in tool grouping should be triggered based on configuration and tool count
	 */
	private shouldTriggerBuiltInGrouping(tools: LanguageModelToolInformation[]): boolean {
		const defaultToolGroupingEnabled = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.DefaultToolsGrouped, this._expService);

		return tools.length > Constant.START_BUILTIN_GROUPING_AFTER_TOOL_COUNT && defaultToolGroupingEnabled;
	}

	async addGroups(query: string, root: VirtualTool, tools: LanguageModelToolInformation[], token: CancellationToken): Promise<void> {
		// If there's no need to group tools, just add them all directly;

		// if there are more than START_BUILTIN_GROUPING_AFTER_TOOL_COUNT tools, we should group built-in tools
		// otherwise, follow the existing logic of grouping all tools together
		const shouldGroup = this.shouldTriggerBuiltInGrouping(tools);

		if (!shouldGroup && tools.length < Constant.START_GROUPING_AFTER_TOOL_COUNT) {
			root.contents = tools;
			return;
		}

		const byToolset = groupBy(tools, t => {
			if (t.source instanceof LanguageModelToolExtensionSource) {
				return 'ext_' + t.source.id;
			} else if (t.source instanceof LanguageModelToolMCPSource) {
				return 'mcp_' + t.source.label;
			} else {
				return BuiltInToolGroupHandler.BUILT_IN_GROUP_KEY;
			}
		});

		const previousGroups = new Map</* name */ string, VirtualTool>();
		for (const tool of root.all()) {
			if (tool instanceof VirtualTool) {
				previousGroups.set(tool.name, tool);
			}
		}

		const predictedToolsSw = new StopWatch();
		const predictedToolsPromise = this._getPredictedTools(query, tools, token).then(tools => ({ tools, durationMs: predictedToolsSw.elapsed() }));

		// Separate builtin tools from extension/MCP tools
		const builtinTools = byToolset[BuiltInToolGroupHandler.BUILT_IN_GROUP_KEY] || [];
		const toolsetEntries = Object.entries(byToolset)
			.filter(([key]) => key !== BuiltInToolGroupHandler.BUILT_IN_GROUP_KEY)
			.filter((entry): entry is [string, LanguageModelToolInformation[]] => entry[1] !== undefined);

		const groupedResults: (VirtualTool | LanguageModelToolInformation)[] = [];

		// Handle built-in tools - apply grouping logic if needed
		const shouldGroupBuiltin = this.shouldTriggerBuiltInGrouping(builtinTools);
		if (shouldGroupBuiltin) {
			const builtinGroups = this.builtInToolGroupHandler.createBuiltInToolGroups(builtinTools);
			groupedResults.push(...builtinGroups);
		} else {
			// Add builtin tools directly without grouping
			groupedResults.push(...builtinTools);
		}

		// Process extension/MCP tools per-toolset with proportional slot allocation
		if (toolsetEntries.length > 0) {
			// Calculate available slots after accounting for builtin tools/groups
			const builtinSlotCount = groupedResults.length;
			const availableSlots = TOOLS_AND_GROUPS_LIMIT - builtinSlotCount;
			const slotAllocation = this._allocateSlots(toolsetEntries, availableSlots);

			// Process each toolset individually
			const toolsetGrouped = await Promise.all([...toolsetEntries].map(async ([toolsetKey, tools]) => {
				const allocatedSlots = slotAllocation.get(toolsetKey) || 0;
				return allocatedSlots > 0 ? await this._processToolset(tools, allocatedSlots, token) : [];
			}));

			groupedResults.push(...toolsetGrouped.flat());
		}

		this._cache.flush();
		root.contents = VirtualToolGrouper.deduplicateGroups(groupedResults);

		// Send telemetry for per-toolset processing
		if (toolsetEntries.length > 0) {
			const totalToolsToGroup = toolsetEntries.reduce((sum, [, tools]) => sum + tools.length, 0);
			const totalGroupsCreated = groupedResults.filter(item => item instanceof VirtualTool).length;

			/* __GDPR__
				"virtualTools.perToolsetGenerate" : {
					"owner": "connor4312",
					"comment": "Reports information about the per-toolset generation of virtual tools.",
					"toolsetsProcessed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of toolsets processed", "isMeasurement": true },
					"toolsBefore": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tools before categorization", "isMeasurement": true },
					"groupsAfter": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of groups after categorization", "isMeasurement": true },
					"builtinTools": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of builtin tools added directly", "isMeasurement": true }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('virtualTools.perToolsetGenerate', {}, {
				toolsetsProcessed: toolsetEntries.length,
				toolsBefore: totalToolsToGroup,
				groupsAfter: totalGroupsCreated,
				builtinTools: builtinTools.length,
			});
		}

		for (const tool of root.all()) {
			if (tool instanceof VirtualTool) {
				const prev = previousGroups.get(tool.name);
				if (prev) {
					tool.copyStateFrom(prev);
				}
			}
		}

		await this._addEmbeddingMatchedTools(root, predictedToolsPromise);
	}

	/** Recomputes and updates the embedding-matched tools on the `root` based on the user query. */
	async recomputeEmbeddingRankings(query: string, root: VirtualTool, token: CancellationToken): Promise<void> {
		const predictedToolsSw = new StopWatch();
		const actualTools = [...root.all()].filter((t): t is LanguageModelToolInformation => !(t instanceof VirtualTool));
		const matchedTools = this._getPredictedTools(query, actualTools, token).then(tools => ({
			tools,
			durationMs: predictedToolsSw.elapsed()
		}));

		await this._addEmbeddingMatchedTools(root, matchedTools);
	}

	private _addPredictedToolsGroup(root: VirtualTool, predictedTools: LanguageModelToolInformation[]): void {
		const newGroup = new VirtualTool(EMBEDDINGS_GROUP_NAME, 'Tools with high predicted relevancy for this query', Infinity, {
			wasEmbeddingsMatched: true,
			wasExpandedByDefault: true,
			canBeCollapsed: false,
		});

		newGroup.isExpanded = true;
		for (const tool of predictedTools) {
			newGroup.contents.push(tool);
		}

		const idx = root.contents.findIndex(t => t.name === EMBEDDINGS_GROUP_NAME);
		if (idx >= 0) {
			root.contents[idx] = newGroup;
		} else {
			root.contents.push(newGroup);
		}
	}

	private async _addEmbeddingMatchedTools(root: VirtualTool, predictedToolsPromise: Promise<{ tools: LanguageModelToolInformation[]; durationMs: number }>): Promise<void> {
		// Aggressively expand groups with predicted tools up to hard limit
		const sw = new StopWatch();
		let error: Error | undefined;
		let computeMs: number | undefined;
		try {
			const { tools, durationMs } = await predictedToolsPromise;
			computeMs = durationMs;
			this._addPredictedToolsGroup(root, tools);
		} catch (e) {
			error = e;
		} finally {
			// Telemetry for predicted tool re-expansion
			/* __GDPR__
				"virtualTools.expandEmbedding" : {
					"owner": "connor4312",
					"comment": "Expansion of virtual tool groups using embedding-based ranking.",
					"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Error message if expansion failed" },
					"blockingMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Blocking duration of the expansion operation in milliseconds", "isMeasurement": true },
					"computeMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Duration of the expansion operation in milliseconds", "isMeasurement": true },
					"hadError": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the operation had an error", "isMeasurement": true }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('virtualTools.expandEmbedding', { error: error ? error.message : undefined }, {
				blockingMs: sw.elapsed(),
				computeMs,
				hadError: error ? 1 : 0,
			});
		}
	}

	public static deduplicateGroups(grouped: readonly (VirtualTool | LanguageModelToolInformation)[]) {
		const seen = new Set<string>();
		const result: (VirtualTool | LanguageModelToolInformation)[] = [];

		for (const item of grouped) {
			let name = item.name;
			let counter = 1;

			// Find a unique name by adding numeric suffix if needed
			while (seen.has(name)) {
				counter++;
				name = `${item.name}_${counter}`;
			}

			// Create new virtual tool with unique name if needed
			if (item instanceof VirtualTool && name !== item.name) {
				const renamedTool = item.cloneWithNewName(name);
				seen.add(name);
				result.push(renamedTool);
			} else {
				seen.add(name);
				result.push(item);
			}
		}

		return result;
	}

	/**
	 * Allocate slots proportionally to each toolset based on tool count, ensuring every toolset gets at least one slot
	 */
	private _allocateSlots(toolsetEntries: Array<[string, LanguageModelToolInformation[]]>, availableSlots: number): Map<string, number> {
		const allocation = new Map<string, number>();

		// If we have more toolsets than slots, give each one slot
		if (toolsetEntries.length >= availableSlots) {
			for (let i = 0; i < toolsetEntries.length; i++) {
				allocation.set(toolsetEntries[i][0], i < availableSlots ? 1 : 0);
			}
			return allocation;
		}

		// Calculate total tools to group
		const totalTools = toolsetEntries.reduce((sum, [, tools]) => sum + tools.length, 0);

		// Give each toolset at least one slot
		let remainingSlots = availableSlots - toolsetEntries.length;
		for (const [toolsetKey] of toolsetEntries) {
			allocation.set(toolsetKey, 1);
		}

		// Distribute remaining slots proportionally
		if (remainingSlots > 0) {
			const proportions = toolsetEntries.map(([toolsetKey, tools]) => ({
				toolsetKey,
				proportion: tools.length / totalTools,
				toolCount: tools.length
			}));

			// Sort by proportion descending to handle rounding better
			proportions.sort((a, b) => b.proportion - a.proportion);

			// Allocate additional slots based on proportion
			for (const { toolsetKey, proportion } of proportions) {
				const additionalSlots = Math.round(proportion * remainingSlots);
				const slotsToAdd = Math.min(additionalSlots, remainingSlots);
				allocation.set(toolsetKey, allocation.get(toolsetKey)! + slotsToAdd);
				remainingSlots -= slotsToAdd;
			}

			// Distribute any remaining slots to toolsets with the most tools
			while (remainingSlots > 0) {
				for (const { toolsetKey } of proportions) {
					if (remainingSlots <= 0) {
						break;
					}
					allocation.set(toolsetKey, allocation.get(toolsetKey)! + 1);
					remainingSlots--;
				}
			}
		}

		return allocation;
	}

	/**
	 * Process a single toolset based on allocated slots
	 */
	private async _processToolset(
		tools: LanguageModelToolInformation[],
		allocatedSlots: number,
		token: CancellationToken
	): Promise<(VirtualTool | LanguageModelToolInformation)[]> {
		// If allocated slots >= tool count, return all tools individually
		if (allocatedSlots >= tools.length) {
			return tools;
		}

		// If only one slot allocated, return all tools in a single group with LLM-generated summary
		if (allocatedSlots === 1) {
			const groupDescriptions = await this._generateBulkGroupDescriptions([tools], token);
			const group = groupDescriptions.groups[0];
			return [new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX + group.name, SUMMARY_PREFIX + group.summary + SUMMARY_SUFFIX, 0, {}, group.tools)];
		}

		// Otherwise, use embedding-based grouping with the allocated slot limit
		return await this._generateEmbeddingBasedGroups(tools, allocatedSlots, token);
	}


	private async _getPredictedTools(query: string, tools: LanguageModelToolInformation[], token: CancellationToken): Promise<LanguageModelToolInformation[]> {
		if (!query) {
			return [];
		}

		// compute the embeddings for the query
		const queryEmbedding = await this.embeddingsComputer.computeEmbeddings(EMBEDDING_TYPE_FOR_TOOL_GROUPING, [query], {}, new TelemetryCorrelationId('VirtualToolGrouper::_getPredictedTools'), token);
		if (!queryEmbedding || queryEmbedding.values.length === 0) {
			return [];
		}
		const queryEmbeddingVector = queryEmbedding.values[0];

		// Filter out built-in tools. Only consider extension and MCP tools for similarity computation
		const nonBuiltInTools = tools.filter(tool =>
			tool.source instanceof LanguageModelToolExtensionSource ||
			tool.source instanceof LanguageModelToolMCPSource
		);

		// Get the top 10 tool embeddings for the non-built-in tools
		const toolEmbeddings = await this._toolEmbeddingsComputer.retrieveSimilarEmbeddingsForAvailableTools(queryEmbeddingVector, nonBuiltInTools, 10, token);
		if (!toolEmbeddings) {
			return [];
		}

		// Filter the tools by the top 10 tool embeddings, maintaining order
		const toolNameToTool = new Map(tools.map(tool => [tool.name, tool]));
		const predictedTools = toolEmbeddings
			.map((toolName: string) => toolNameToTool.get(toolName))
			.filter((tool: LanguageModelToolInformation | undefined): tool is LanguageModelToolInformation => tool !== undefined);
		return predictedTools;
	}

	/**
	 * Generate embedding-based groups for tools with a specific limit
	 */
	private async _generateEmbeddingBasedGroups(tools: LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<(VirtualTool | LanguageModelToolInformation)[]> {
		if (tools.length <= Constant.MIN_TOOLSET_SIZE_TO_GROUP) {
			// If too few tools, return them as individual tools instead of creating groups
			return [];
		}

		let embeddingGroups: LanguageModelToolInformation[][] = [];

		try {
			// Use the provided limit for embedding-based clustering
			embeddingGroups = await this._toolEmbeddingsComputer.computeToolGroupings(tools, limit, token);

			this._logService.trace(`[virtual-tools] Embedding-based grouping created ${embeddingGroups.length} groups from ${tools.length} tools`);
		} catch (e) {
			this._logService.error(`Failed to create embedding-based groups: ${e}`);
			// Let the error bubble up as requested - no fallback
			throw e;
		}

		const singles = embeddingGroups.filter(g => g.length === 1).map(g => g[0]);
		const grouped = embeddingGroups.filter(g => g.length > 1);

		// Generate descriptions for the groups using LLM in bulk
		const groupDescriptions = await this._generateBulkGroupDescriptions(grouped, token);

		this._logService.trace(`[virtual-tools] Embedding-based grouping created ${groupDescriptions.groups.length} groups from ${tools.length} tools`);

		return groupDescriptions.groups
			.map((v): VirtualTool | LanguageModelToolInformation => new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX + v.name, SUMMARY_PREFIX + v.summary + SUMMARY_SUFFIX, 0, {}, v.tools))
			.concat(singles);
	}

	/**
	 * Generate descriptions for embedding-based tool groups using LLM in bulk
	 */
	protected async _generateBulkGroupDescriptions(embeddingGroups: LanguageModelToolInformation[][], token: CancellationToken) {
		const cached = await Promise.all(embeddingGroups.map(group => this._cache.getDescription(group)));
		const missing: ISummarizedToolCategoryUpdatable[] = [];
		const output: ISummarizedToolCategory[] = [];
		for (const entry of cached) {
			if (entry.category) {
				output.push(entry.category);
			} else {
				missing.push(entry);
			}
		}

		const endpoint = await this._endpointProvider.getChatEndpoint(CATEGORIZATION_ENDPOINT);
		const described = await describeBulkToolGroups(endpoint, missing.map(m => m.tools), token);
		let missed = 0;
		for (let i = 0; i < described.length; i++) {
			const d = described[i];
			const m = missing[i];
			if (d) {
				m.update(d);
				output.push(d);
			} else {
				missed++;
				output.push({ name: `group_${i}`, summary: `Contains the tools: ${m.tools.map(t => t.name).join(', ')}`, tools: m.tools });
			}
		}

		return { groups: output, missed };
	}
}
