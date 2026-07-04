/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ILogService } from '../../log/common/logService';
import { IZaphBrainRagService } from '../common/zaphBrainRagService';
import {
	IZaphBrainManifest,
	IZaphBrainSearchResult,
	IZaphKnowledgeChunk,
	IZaphKnowledgeManifest,
	IZaphScrapeResult,
	IZaphScraperDefinition,
} from '../common/zaphBrainTypes';
import { NonAutoWebScraper } from './nonAutoWebScraper';
import { ZaphBrainRagIndex } from './zaphBrainRagIndex';

export class ZaphBrainRagService extends Disposable implements IZaphBrainRagService {
	declare readonly _serviceBrand: undefined;

	private _ready = false;
	private _scrapers: IZaphScraperDefinition[] = [];
	private readonly _scraperById = new Map<string, IZaphScraperDefinition>();
	private _index: ZaphBrainRagIndex | undefined;
	private readonly _webScraper: NonAutoWebScraper;

	constructor(
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly _logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
	) {
		super();
		this._webScraper = new NonAutoWebScraper(fetcherService, _logService);
		void this._load();
	}

	isReady(): boolean {
		return this._ready;
	}

	getScraperCount(): number {
		return this._scrapers.length;
	}

	getKnowledgeChunkCount(): number {
		return this._index?.size ?? 0;
	}

	async searchKnowledge(query: string, maxResults: number, token: CancellationToken): Promise<IZaphBrainSearchResult[]> {
		await this._ensureReady(token);
		if (!this._index) {
			return [];
		}

		const results = this._index.search(query, maxResults, token);
		return results.map(r => ({
			...r,
			scraper: this._scraperById.get(r.chunk.scraperId),
		}));
	}

	findScrapers(query: string, options?: { category?: string; maxResults?: number }): IZaphScraperDefinition[] {
		const max = options?.maxResults ?? 20;
		const q = query.toLowerCase();
		let pool = this._scrapers;

		if (options?.category) {
			pool = pool.filter(s => s.category === options.category);
		}

		if (!q) {
			return pool.slice(0, max);
		}

		const scored = pool.map(s => {
			const haystack = `${s.name} ${s.description} ${s.tags.join(' ')} ${s.category} ${s.subcategory}`.toLowerCase();
			let score = 0;
			for (const word of q.split(/\s+/)) {
				if (word.length > 2 && haystack.includes(word)) {
					score++;
				}
			}
			return { s, score };
		}).filter(x => x.score > 0);

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, max).map(x => x.s);
	}

	async scrapeById(scraperId: string, token: CancellationToken): Promise<IZaphScrapeResult | undefined> {
		await this._ensureReady(token);
		const def = this._scraperById.get(scraperId);
		if (!def) {
			return undefined;
		}
		return this._scrapeDefinition(def, token);
	}

	async scrapeAndSearch(query: string, maxScrapers: number, token: CancellationToken): Promise<IZaphScrapeResult[]> {
		await this._ensureReady(token);
		const scrapers = this.findScrapers(query, { maxResults: maxScrapers });
		const results: IZaphScrapeResult[] = [];

		for (const def of scrapers) {
			if (token.isCancellationRequested) {
				break;
			}
			const result = await this._scrapeDefinition(def, token);
			if (result) {
				results.push(result);
			}
		}

		return results;
	}

	private async _scrapeDefinition(def: IZaphScraperDefinition, token: CancellationToken): Promise<IZaphScrapeResult | undefined> {
		const content = await raceCancellationError(this._webScraper.scrape(def, token), token);
		if (!content) {
			return undefined;
		}
		return {
			scraperId: def.id,
			url: def.url,
			content,
			fetchedAt: Date.now(),
		};
	}

	private async _ensureReady(token: CancellationToken): Promise<void> {
		while (!this._ready && !token.isCancellationRequested) {
			await new Promise(r => setTimeout(r, 50));
		}
	}

	private async _load(): Promise<void> {
		try {
			const brainRoot = path.join(this._extensionContext.extensionUri.fsPath, 'data', 'zaph-brain');
			const manifestPath = path.join(brainRoot, 'manifest.json');

			if (!fs.existsSync(manifestPath)) {
				this._logService.warn(`ZaphBrainRag: manifest not found at ${manifestPath}`);
				return;
			}

			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IZaphBrainManifest;
			const scrapers: IZaphScraperDefinition[] = [];

			for (const { file } of Object.values(manifest.categories)) {
				const filePath = path.join(brainRoot, 'scrapers', file);
				if (fs.existsSync(filePath)) {
					const batch = JSON.parse(fs.readFileSync(filePath, 'utf8')) as IZaphScraperDefinition[];
					scrapers.push(...batch);
				}
			}

			this._scrapers = scrapers;
			for (const s of scrapers) {
				this._scraperById.set(s.id, s);
			}

			const knowledgeRoot = path.join(brainRoot, 'knowledge');
			const knowledgeManifestPath = path.join(knowledgeRoot, 'manifest.json');
			const chunks: IZaphKnowledgeChunk[] = [];

			if (fs.existsSync(knowledgeManifestPath)) {
				const kManifest = JSON.parse(fs.readFileSync(knowledgeManifestPath, 'utf8')) as IZaphKnowledgeManifest;
				for (let i = 0; i < kManifest.chunkFiles; i++) {
					const chunkPath = path.join(knowledgeRoot, `chunks-${i}.json`);
					if (fs.existsSync(chunkPath)) {
						const batch = JSON.parse(fs.readFileSync(chunkPath, 'utf8')) as IZaphKnowledgeChunk[];
						chunks.push(...batch);
					}
				}
			}

			this._index = new ZaphBrainRagIndex(chunks);
			this._ready = true;

			this._logService.info(`ZaphBrainRag: loaded ${scrapers.length} scrapers and ${chunks.length} knowledge chunks`);
		} catch (err) {
			this._logService.error(`ZaphBrainRag: failed to load: ${err}`);
		}
	}
}
