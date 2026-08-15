/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation, LanguageModelToolResult } from 'vscode';
import { createServiceIdentifier } from '../../../../util/common/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IObservable } from '../../../../util/vs/base/common/observableInternal';
import { VirtualTool } from './virtualTool';

export interface IToolGrouping {
	/**
	 * Gets or sets the list of tools available for the group.
	 */
	tools: readonly LanguageModelToolInformation[];

	/**
	 * Should be called for each model tool call. Returns a tool result if the
	 * call was a virtual tool call that was expanded.
	 */
	didCall(localTurnNumber: number, toolCallName: string): LanguageModelToolResult | undefined;

	/**
	 * Should be called for each conversation turn. This is used to monitor
	 * recency of tools and collapse older.
	 */
	didTakeTurn(): void;

	/**
	 * Should be called when something happens to invalidate the conversation
	 * cache. This is an opportunity for the grouping to groom its toolset
	 * without invalidating the cache.
	 */
	didInvalidateCache(): void;

	/**
	 * Gets the virtual tool containing the given tool, or undefined.
	 */
	getContainerFor(toolName: string): VirtualTool | undefined;

	/**
	 * Ensures the given tool is available in the next call to `compute`.
	 */
	ensureExpanded(toolName: string): void;

	/**
	 * Returns a list of tools that should be used for the given request.
	 * Internally re-reads the request and conversation state.
	 */
	compute(query: string, token: CancellationToken): Promise<LanguageModelToolInformation[]>;

	/**
	 * Returns the complete tree of tools, used for diagnostic purposes.
	 */
	computeAll(query: string, token: CancellationToken): Promise<(LanguageModelToolInformation | VirtualTool)[]>;
}

export interface IToolGroupingService {
	_serviceBrand: undefined;
	/**
	 * The current tool count threshold for grouping to kick in.
	 */
	threshold: IObservable<number>;
	/**
	 * Creates a tool grouping for a request, based on its conversation and the
	 * initial set of tools.
	 */
	create(sessionId: string, tools: readonly LanguageModelToolInformation[]): IToolGrouping;
}

export const IToolGroupingService = createServiceIdentifier<IToolGroupingService>('IToolGroupingService');

export interface IToolGroupingCache {
	_serviceBrand: undefined;

	/**
	 * Clears the tool group cache.
	 */
	clear(): Promise<void>;

	/**
	 * Saves the state of the cache.
	 */
	flush(): Promise<void>;

	/**
	 * Gets or inserts the grouping for the given set of tools.
	 */
	getDescription(tools: LanguageModelToolInformation[]): Promise<ISummarizedToolCategoryUpdatable>;
}

export const IToolGroupingCache = createServiceIdentifier<IToolGroupingCache>('IToolGroupingCache');


export interface IToolCategorization {
	/**
	 * Called whenever new tools are added. The function should add each tool into
	 * the appropriate virtual tool or top-level tool in the `root`.
	 */
	addGroups(query: string, root: VirtualTool, tools: LanguageModelToolInformation[], token: CancellationToken): Promise<void>;

	/**
	 * Recalculates the "embeddings" group, when enabled, so relevant tools
	 * for the query are shown at the top level.
	 */
	recomputeEmbeddingRankings(query: string, root: VirtualTool, token: CancellationToken): Promise<void>;
}

export interface ISummarizedToolCategory {
	summary: string;
	name: string;
	tools: LanguageModelToolInformation[];
}

export interface ISummarizedToolCategoryUpdatable {
	category: ISummarizedToolCategory | undefined;
	tools: LanguageModelToolInformation[];
	update(up: ISummarizedToolCategory): void;
}

export class SummarizerError extends Error { }
