/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ScraperMethod = 'fetch';

export type ScraperExtractor = 'main' | 'article' | 'pre' | 'json' | 'markdown';

export interface IZaphScraperDefinition {
	readonly id: string;
	readonly name: string;
	readonly category: string;
	readonly subcategory: string;
	readonly url: string;
	readonly domain: string;
	readonly method: ScraperMethod;
	readonly extractor: ScraperExtractor;
	readonly selectors: readonly string[];
	readonly tags: readonly string[];
	readonly priority: number;
	readonly description: string;
}

export interface IZaphBrainManifest {
	readonly version: number;
	readonly totalScrapers: number;
	readonly categories: Record<string, { readonly count: number; readonly file: string }>;
}

export interface IZaphKnowledgeChunk {
	readonly id: string;
	readonly scraperId: string;
	readonly text: string;
	readonly metadata: {
		readonly category: string;
		readonly subcategory: string;
		readonly domain: string;
		readonly url: string;
		readonly tags: readonly string[];
	};
}

export interface IZaphKnowledgeManifest {
	readonly version: number;
	readonly totalChunks: number;
	readonly chunkFiles: number;
	readonly chunkSize: number;
}

export interface IZaphBrainSearchResult {
	readonly chunk: IZaphKnowledgeChunk;
	readonly score: number;
	readonly scraper?: IZaphScraperDefinition;
}

export interface IZaphScrapeResult {
	readonly scraperId: string;
	readonly url: string;
	readonly content: string;
	readonly fetchedAt: number;
}
