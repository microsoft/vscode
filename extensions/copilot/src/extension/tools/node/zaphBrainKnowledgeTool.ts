/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { LanguageModelTextPart } from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IZaphBrainRagService } from '../../../platform/zaphBrainRag/common/zaphBrainRagService';
import { ExtendedLanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';

export interface IZaphBrainKnowledgeParams {
	query: string;
	/** Search pre-indexed knowledge only (fast). Default true. */
	searchIndex?: boolean;
	/** Live-fetch from matching scrapers using non-automated HTTP. Default false. */
	liveFetch?: boolean;
	/** Max results to return. Default 8. */
	maxResults?: number;
	/** Optional category filter: programming, frameworks, cloud, security, etc. */
	category?: string;
}

export class ZaphBrainKnowledgeTool implements vscode.LanguageModelTool<IZaphBrainKnowledgeParams> {
	public static readonly toolName = ToolName.ZaphBrainKnowledge;
	public static readonly nonDeferred = true;

	constructor(
		@IZaphBrainRagService private readonly _brainService: IZaphBrainRagService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IZaphBrainKnowledgeParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const query = options.input.query?.trim();
		if (!query) {
			throw new Error('Query is required');
		}

		const maxResults = options.input.maxResults ?? 8;
		const searchIndex = options.input.searchIndex !== false;
		const liveFetch = options.input.liveFetch === true;

		const parts: string[] = [];
		parts.push(`# Zaph Brain Knowledge Search`);
		parts.push(`Query: ${query}`);
		parts.push(`Corpus: ${this._brainService.getScraperCount()} non-automated web scrapers, ${this._brainService.getKnowledgeChunkCount()} RAG chunks`);
		parts.push('');

		if (searchIndex) {
			const results = await this._brainService.searchKnowledge(query, maxResults, token);
			if (results.length === 0) {
				parts.push('_No matching knowledge chunks found in the Zaph brain index._');
			} else {
				parts.push(`## Indexed Knowledge (${results.length} results)`);
				for (const [i, r] of results.entries()) {
					parts.push(`### ${i + 1}. ${r.chunk.metadata.category} — ${r.scraper?.name ?? r.chunk.scraperId}`);
					parts.push(`Score: ${r.score.toFixed(3)} | Source: ${r.chunk.metadata.url}`);
					parts.push('');
					parts.push(r.chunk.text.slice(0, 3000));
					parts.push('');
					parts.push('---');
					parts.push('');
				}
			}
		}

		if (liveFetch) {
			const scrapers = this._brainService.findScrapers(query, {
				category: options.input.category,
				maxResults: Math.min(3, maxResults),
			});

			if (scrapers.length === 0) {
				parts.push('_No matching scrapers found for live fetch._');
			} else {
				parts.push(`## Live Fetch Results`);
				const fetched = await this._brainService.scrapeAndSearch(query, 3, token);
				for (const [i, f] of fetched.entries()) {
					const def = scrapers.find(s => s.id === f.scraperId);
					parts.push(`### ${i + 1}. ${def?.name ?? f.scraperId}`);
					parts.push(`URL: ${f.url}`);
					parts.push('');
					parts.push(f.content.slice(0, 4000));
					parts.push('');
					parts.push('---');
					parts.push('');
				}
			}
		}

		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelTextPart(parts.join('\n'))
		]);
		result.toolResultMessage = new MarkdownString(l10n.t`Searched Zaph brain knowledge for "${query}"`);
		return result;
	}
}

ToolRegistry.registerTool(ZaphBrainKnowledgeTool);
