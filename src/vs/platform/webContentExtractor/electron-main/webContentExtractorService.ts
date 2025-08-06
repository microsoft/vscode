/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { IWebContentExtractorService } from '../common/webContentExtractor.js';
import { URI } from '../../../base/common/uri.js';
import { AXNode, convertAXTreeToMarkdown } from './cdpAccessibilityDomain.js';
import { Limiter } from '../../../base/common/async.js';
import { ResourceMap } from '../../../base/common/map.js';
import { ILogService } from '../../log/common/log.js';

interface CacheEntry {
	content: string;
	timestamp: number;
}

export class NativeWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	// Only allow 3 windows to be opened at a time
	// to avoid overwhelming the system with too many processes.
	private _limiter = new Limiter<string>(3);
	private _webContentsCache = new ResourceMap<CacheEntry>();
	private readonly _cacheDuration = 24 * 60 * 60 * 1000; // 1 day in milliseconds

	constructor(@ILogService private readonly _logger: ILogService) { }

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this._cacheDuration;
	}

	extract(uris: URI[]): Promise<string[]> {
		if (uris.length === 0) {
			this._logger.info('[NativeWebContentExtractorService] No URIs provided for extraction');
			return Promise.resolve([]);
		}
		this._logger.info(`[NativeWebContentExtractorService] Extracting content from ${uris.length} URIs`);
		return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri))));
	}

	async doExtract(uri: URI): Promise<string> {
		const cached = this._webContentsCache.get(uri);
		if (cached) {
			this._logger.info(`[NativeWebContentExtractorService] Found cached content for ${uri}`);
			if (this.isExpired(cached)) {
				this._logger.info(`[NativeWebContentExtractorService] Cache expired for ${uri}, removing entry...`);
				this._webContentsCache.delete(uri);
			} else {
				return cached.content;
			}
		}

		this._logger.info(`[NativeWebContentExtractorService] Extracting content from ${uri}...`);
		const win = new BrowserWindow({
			width: 800,
			height: 600,
			show: false,
			webPreferences: {
				javascript: true,
				offscreen: true,
				sandbox: true,
				webgl: false
			}
		});
		try {
			await win.loadURL(uri.toString(true));
			win.webContents.debugger.attach('1.1');
			const result: { nodes: AXNode[] } = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
			const str = convertAXTreeToMarkdown(uri, result.nodes);
			this._logger.info(`[NativeWebContentExtractorService] Content extracted from ${uri}`);
			this._logger.trace(`[NativeWebContentExtractorService] Extracted content: ${str}`);
			this._webContentsCache.set(uri, { content: str, timestamp: Date.now() });
			return str;
		} catch (err) {
			this._logger.error(`[NativeWebContentExtractorService] Error extracting content from ${uri}: ${err}`);
		} finally {
			win.destroy();
		}
		return '';
	}
}
