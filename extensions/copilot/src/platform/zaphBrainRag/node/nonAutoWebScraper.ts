/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ILogService } from '../../log/common/logService';
import { IZaphScraperDefinition } from '../common/zaphBrainTypes';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Non-automated web scraper: uses plain HTTP fetch only (no Puppeteer/Playwright).
 */
export class NonAutoWebScraper {

	constructor(
		private readonly _fetcherService: IFetcherService,
		private readonly _logService: ILogService,
	) { }

	async scrape(definition: IZaphScraperDefinition, token: CancellationToken): Promise<string | undefined> {
		try {
			const controller = this._fetcherService.makeAbortController();
			const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

			try {
				const response = await raceCancellationError(
					this._fetcherService.fetch(definition.url, {
						method: 'GET',
						headers: {
							'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
							'Accept-Language': 'en-US,en;q=0.9',
						},
						signal: controller.signal,
					}),
					token
				);

				if (!response.ok) {
					this._logService.warn(`ZaphBrain scraper ${definition.id}: HTTP ${response.status} for ${definition.url}`);
					return undefined;
				}

				const buffer = await raceCancellationError(response.arrayBuffer(), token);
				if (buffer.byteLength > MAX_RESPONSE_BYTES) {
					this._logService.warn(`ZaphBrain scraper ${definition.id}: response too large (${buffer.byteLength} bytes)`);
					return undefined;
				}

				const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
				return this.extractContent(raw, definition);
			} finally {
				clearTimeout(timeout);
			}
		} catch (err) {
			this._logService.warn(`ZaphBrain scraper ${definition.id} failed: ${err}`);
			return undefined;
		}
	}

	private extractContent(html: string, definition: IZaphScraperDefinition): string {
		if (definition.extractor === 'json') {
			try {
				const parsed = JSON.parse(html);
				return JSON.stringify(parsed, null, 2).slice(0, 100_000);
			} catch {
				return html.slice(0, 100_000);
			}
		}

		if (definition.extractor === 'pre') {
			const preBlocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)]
				.map(m => this.decodeHtml(m[1]))
				.filter(t => t.length > 20);
			if (preBlocks.length) {
				return preBlocks.join('\n\n').slice(0, 100_000);
			}
		}

		// Try CSS-selector-like tag extraction
		for (const selector of definition.selectors) {
			const tag = selector.replace(/^[.#]/, '').split(/[\s>+~]/)[0];
			if (!tag || tag.includes('.')) {
				continue;
			}
			const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
			const matches = [...html.matchAll(pattern)]
				.map(m => this.stripTags(this.decodeHtml(m[1])))
				.filter(t => t.trim().length > 50);
			if (matches.length) {
				return matches.join('\n\n').slice(0, 100_000);
			}
		}

		// Fallback: strip all HTML tags
		const text = this.stripTags(this.decodeHtml(html));
		return text.replace(/\s{3,}/g, '\n\n').trim().slice(0, 100_000);
	}

	private stripTags(html: string): string {
		return html
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	private decodeHtml(text: string): string {
		return text
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, ' ');
	}
}
