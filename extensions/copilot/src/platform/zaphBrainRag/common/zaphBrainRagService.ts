/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IZaphBrainSearchResult, IZaphScrapeResult, IZaphScraperDefinition } from './zaphBrainTypes';

export const IZaphBrainRagService = createServiceIdentifier<IZaphBrainRagService>('IZaphBrainRagService');

export interface IZaphBrainRagService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the Zaph brain knowledge index has been loaded.
	 */
	isReady(): boolean;

	/**
	 * Total number of indexed scrapers in the registry.
	 */
	getScraperCount(): number;

	/**
	 * Total number of RAG knowledge chunks loaded.
	 */
	getKnowledgeChunkCount(): number;

	/**
	 * Search the pre-indexed Zaph brain knowledge corpus using TF-IDF ranking.
	 */
	searchKnowledge(query: string, maxResults: number, token: CancellationToken): Promise<IZaphBrainSearchResult[]>;

	/**
	 * Find scrapers matching a query or category filter.
	 */
	findScrapers(query: string, options?: { category?: string; maxResults?: number }): IZaphScraperDefinition[];

	/**
	 * Live-fetch content from a registered scraper using non-automated HTTP (no headless browser).
	 */
	scrapeById(scraperId: string, token: CancellationToken): Promise<IZaphScrapeResult | undefined>;

	/**
	 * Live-fetch and search: scrape matching sources then rank content against query.
	 */
	scrapeAndSearch(query: string, maxScrapers: number, token: CancellationToken): Promise<IZaphScrapeResult[]>;
}
