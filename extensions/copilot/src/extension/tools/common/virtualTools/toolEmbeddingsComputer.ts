/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { Embedding, EmbeddingType, IEmbeddingsComputer, isValidEmbedding, rankEmbeddings } from '../../../../platform/embeddings/common/embeddingsComputer';
import { EmbeddingsGrouper, Node } from '../../../../platform/embeddings/common/embeddingsGrouper';
import { ILogService } from '../../../../platform/log/common/logService';
import { IGithubAvailableEmbeddingTypesService } from '../../../../platform/workspaceChunkSearch/common/githubAvailableEmbeddingTypes';
import { createServiceIdentifier } from '../../../../util/common/services';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { StopWatch } from '../../../../util/vs/base/common/stopwatch';
import { isDefined } from '../../../../util/vs/base/common/types';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { EMBEDDING_TYPE_FOR_NO_AUTH_TOOL_SEARCH, EMBEDDING_TYPE_FOR_TOOL_GROUPING, PreComputedToolEmbeddingsCache } from './preComputedToolEmbeddingsCache';
import { ToolEmbeddingLocalCache } from './toolEmbeddingsLocalCache';
import { MIN_TOOLSET_SIZE_TO_GROUP } from './virtualToolsConstants';

export interface IToolEmbeddingsCache {
	initialize(): Promise<void>;
	get(tool: LanguageModelToolInformation): Embedding | undefined;
	set(tool: LanguageModelToolInformation, embedding: Embedding): void;
}

interface IInit {
	embeddingType: EmbeddingType;
	caches: readonly IToolEmbeddingsCache[];
}

interface IToolEmbeddingsProfile extends IInit {
	readonly store: Map<string, Promise<Embedding | undefined>>;
	readonly initialized: Lazy<Promise<void>>;
}

export interface IToolEmbeddingsComputer {
	_serviceBrand: undefined;

	retrieveSimilarEmbeddingsForAvailableTools(queryEmbedding: Embedding, availableTools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<string[]>;

	isEmbeddingModelAvailable(): Promise<boolean>;

	computeToolGroupings(tools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<LanguageModelToolInformation[][]>;

	/**
	 * Searches for tools similar to the given natural language query using embeddings.
	 * Returns the names of the top matching tools.
	 */
	searchToolsByQuery(query: string, availableTools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<string[]>;
}

export const IToolEmbeddingsComputer = createServiceIdentifier<IToolEmbeddingsComputer>('IToolEmbeddingsComputer');

/**
 * Manages tool embeddings from both pre-computed cache and runtime computation
 */
export class ToolEmbeddingsComputer implements IToolEmbeddingsComputer {
	declare _serviceBrand: undefined;

	private readonly _profiles = new Map<string, IToolEmbeddingsProfile>();

	constructor(
		@IEmbeddingsComputer private readonly _embeddingsComputer: IEmbeddingsComputer,
		@ILogService private readonly _logService: ILogService,
		@IGithubAvailableEmbeddingTypesService private readonly _availableEmbeddingTypesService: IGithubAvailableEmbeddingTypesService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	protected getCaches(instantiationService: IInstantiationService, embeddingType: EmbeddingType): IInit {
		const caches: IToolEmbeddingsCache[] = [instantiationService.createInstance(PreComputedToolEmbeddingsCache, embeddingType)];
		// The local cache file holds a single embedding type, so only the primary type persists to disk.
		if (embeddingType.equals(EMBEDDING_TYPE_FOR_TOOL_GROUPING)) {
			caches.push(instantiationService.createInstance(ToolEmbeddingLocalCache, embeddingType));
		}
		return { embeddingType, caches };
	}

	private _getProfile(embeddingType: EmbeddingType): IToolEmbeddingsProfile {
		let profile = this._profiles.get(embeddingType.id);
		if (!profile) {
			const init = this.getCaches(this._instantiationService, embeddingType);
			profile = {
				...init,
				store: new Map(),
				initialized: new Lazy(async () => { await Promise.all(init.caches.map(c => c.initialize())); }),
			};
			this._profiles.set(embeddingType.id, profile);
		}
		return profile;
	}

	private async _getProfileForSearch(): Promise<IToolEmbeddingsProfile> {
		let isNoAuthUser = false;
		try {
			isNoAuthUser = (await this._authService.getCopilotToken()).isNoAuthUser;
		} catch {
			// Fall through to the default embedding type.
		}
		return this._getProfile(isNoAuthUser ? EMBEDDING_TYPE_FOR_NO_AUTH_TOOL_SEARCH : EMBEDDING_TYPE_FOR_TOOL_GROUPING);
	}

	async isEmbeddingModelAvailable(): Promise<boolean> {
		return !!await this._availableEmbeddingTypesService.getPreferredType(true);
	}

	/**
	 * Legacy method name for backward compatibility
	 */
	public async retrieveSimilarEmbeddingsForAvailableTools(queryEmbedding: Embedding, availableToolNames: readonly LanguageModelToolInformation[], count: number, token: CancellationToken): Promise<string[]> {
		return this._retrieveSimilar(this._getProfile(queryEmbedding.type), queryEmbedding, availableToolNames, count, token);
	}

	private async _retrieveSimilar(profile: IToolEmbeddingsProfile, queryEmbedding: Embedding, availableToolNames: readonly LanguageModelToolInformation[], count: number, token: CancellationToken): Promise<string[]> {
		await profile.initialized.value;

		if (token.isCancellationRequested) {
			return [];
		}

		const availableEmbeddings = await this.getAvailableToolEmbeddings(profile, availableToolNames, token);
		if (availableEmbeddings.length === 0) {
			return [];
		}

		const rankedEmbeddings = this.rankEmbeddings(queryEmbedding, availableEmbeddings, count);
		const matched = rankedEmbeddings.map(x => x.value);
		this._logService.trace(`[virtual-tools] Matched ${JSON.stringify(matched)} against the query.`);

		return matched;
	}

	public async searchToolsByQuery(query: string, availableTools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<string[]> {
		if (!query || token.isCancellationRequested) {
			return [];
		}

		const profile = await this._getProfileForSearch();
		await profile.initialized.value;

		const queryEmbedding = await this._embeddingsComputer.computeEmbeddings(profile.embeddingType, [query], { inputType: 'query' }, new TelemetryCorrelationId('ToolEmbeddingsComputer::searchToolsByQuery'), token);
		if (!queryEmbedding || queryEmbedding.values.length === 0) {
			return [];
		}

		return this._retrieveSimilar(profile, queryEmbedding.values[0], availableTools, limit, token);
	}

	private rankEmbeddings(queryEmbedding: Embedding, availableEmbeddings: ReadonlyArray<readonly [string, Embedding]>, count: number) {
		return rankEmbeddings(queryEmbedding, availableEmbeddings, count);
	}

	/**
	 * Computes embeddings for missing tools and stores them
	 */
	private computeMissingEmbeddings(profile: IToolEmbeddingsProfile, missingTools: LanguageModelToolInformation[], token: CancellationToken) {
		if (token.isCancellationRequested || missingTools.length === 0) {
			return;
		}

		const computedEmbeddings = this.computeEmbeddingsForTools(profile.embeddingType, missingTools, token).catch(e => {
			this._logService.error('Failed to compute embeddings for tools', e);
			return undefined;
		});

		for (const tool of missingTools) {
			const promise = computedEmbeddings.then(async (c) => {
				const found = c?.find(([name]) => name === tool.name)?.[1];
				if (found === undefined) {
					profile.store.delete(tool.name);
					return undefined;
				}

				if (!isValidEmbedding(found)) {
					this._logService.warn(`[virtual-tools] Computed embedding for tool ${tool.name} is invalid: ${JSON.stringify(found)}`);
					profile.store.delete(tool.name);
					return undefined;
				}

				for (const cache of profile.caches) {
					cache.set(tool, found);
				}

				return found;
			});

			profile.store.set(tool.name, promise);
		}
	}

	/**
	 * Computes embeddings for a list of tool names
	 */
	private async computeEmbeddingsForTools(embeddingType: EmbeddingType, tools: LanguageModelToolInformation[], token: CancellationToken): Promise<[string, Embedding][] | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const toolNames = tools.map(t => t.name + '\n\n' + t.description);
		const start = new StopWatch();
		const embeddings = await this._embeddingsComputer.computeEmbeddings(embeddingType, toolNames, { inputType: 'document' }, new TelemetryCorrelationId('ToolEmbeddingsComputer::computeEmbeddingsForTools'), token);
		this._logService.trace(`[virtual-tools] Computed embeddings for ${toolNames.length} tools in ${start.elapsed()}ms`);

		if (embeddings?.values.length === 0 || embeddings?.values.length !== toolNames.length) {
			return undefined;
		}

		return toolNames.map((name, index) => [tools[index].name, embeddings.values[index]]);
	}

	/**
	 * Gets embeddings for available tools as an array suitable for ranking
	 */
	private async getAvailableToolEmbeddings(profile: IToolEmbeddingsProfile, tools: readonly LanguageModelToolInformation[], token: CancellationToken): Promise<ReadonlyArray<readonly [string, Embedding]>> {
		const fromCaches = new Map(tools.map(t => {
			for (const cache of profile.caches) {
				const embedding = cache.get(t);
				if (isValidEmbedding(embedding)) {
					return [t.name, embedding] as [string, Embedding];
				}
			}
		}).filter(isDefined));

		const missingTools = tools.filter(t => !profile.store.has(t.name) && !fromCaches.has(t.name));
		this.computeMissingEmbeddings(profile, missingTools, token);

		const result: [string, Embedding][] = [];

		for (const { name } of tools) {
			if (token.isCancellationRequested) {
				return result;
			}

			const cached = fromCaches.get(name);
			if (cached) {
				result.push([name, cached]);
				continue;
			}

			const embedding = await profile.store.get(name);
			if (embedding) {
				result.push([name, embedding]);
			}
		}

		return result;
	}

	/**
	 * Groups tools using embedding-based clustering to optimize for target cluster count
	 */
	async computeToolGroupings(tools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<LanguageModelToolInformation[][]> {
		const profile = this._getProfile(EMBEDDING_TYPE_FOR_TOOL_GROUPING);
		await profile.initialized.value;

		if (token.isCancellationRequested || tools.length === 0) {
			return [];
		}

		// Get embeddings for all tools
		const toolEmbeddings = await this.getAvailableToolEmbeddings(profile, tools, token);
		if (toolEmbeddings.length === 0) {
			this._logService.trace('[virtual-tools] No embeddings available for tools, returning empty groups');
			return [];
		}

		// Create nodes for the EmbeddingsGrouper
		const nodes: Node<LanguageModelToolInformation>[] = [];
		const toolMap = new Map(tools.map(tool => [tool.name, tool]));

		for (const [toolName, embedding] of toolEmbeddings) {
			const tool = toolMap.get(toolName);
			if (tool) {
				nodes.push({
					value: tool,
					embedding
				});
			}
		}

		if (nodes.length === 0) {
			this._logService.trace('[virtual-tools] No valid nodes created for clustering');
			return [];
		}

		// Create EmbeddingsGrouper and add all nodes
		const grouper = new EmbeddingsGrouper<LanguageModelToolInformation>();
		grouper.addNodes(nodes);

		// Optimize clustering to hit target cluster count
		// Target: average of 4 tools per group, but not more than the limit
		const targetClusters = Math.min(limit, Math.ceil(nodes.length / 4));

		if (targetClusters >= nodes.length) {
			// If we need as many clusters as tools, just return individual tools
			this._logService.trace(`[virtual-tools] Target clusters (${targetClusters}) >= tool count (${nodes.length}), returning individual tools`);
			return tools.map(tool => [tool]);
		}

		const tuneResult = grouper.tuneThresholdForTargetClusters(targetClusters);
		this._logService.trace(`[virtual-tools] Tuned clustering: ${tuneResult.clusterCount} clusters with threshold ${tuneResult.threshold} (percentile ${tuneResult.percentile})`);

		// Apply the optimized percentile and get clusters
		grouper.applyPercentileAndRecluster(tuneResult.percentile);
		const clusters = grouper.getClusters();

		// Convert clusters to tool arrays, filtering out small groups
		const groups: LanguageModelToolInformation[][] = [];
		const singletons: LanguageModelToolInformation[] = [];

		for (const cluster of clusters) {
			const toolsInCluster = cluster.nodes.map(node => node.value);

			if (toolsInCluster.length >= MIN_TOOLSET_SIZE_TO_GROUP) {
				groups.push(toolsInCluster);
			} else {
				// Small groups become singletons unless expanding would exceed limit
				singletons.push(...toolsInCluster);
			}
		}

		// Check if adding singletons as individual groups would exceed limit
		const totalGroupsAndSingletons = groups.length + singletons.length;
		if (totalGroupsAndSingletons <= limit) {
			// We have room, add singletons as individual groups
			for (const singleton of singletons) {
				groups.push([singleton]);
			}
		} else {
			// Try to merge singletons into existing groups if possible
			// If we can't, keep them as individual groups up to the limit
			const remainingSlots = limit - groups.length;
			for (let i = 0; i < Math.min(singletons.length, remainingSlots); i++) {
				groups.push([singletons[i]]);
			}

			// Log if we had to drop some tools
			if (singletons.length > remainingSlots) {
				this._logService.warn(`[virtual-tools] Had to drop ${singletons.length - remainingSlots} tools due to limit constraints`);
			}
		}

		this._logService.trace(`[virtual-tools] Created ${groups.length} groups from ${tools.length} tools`);
		return groups;
	}
}
