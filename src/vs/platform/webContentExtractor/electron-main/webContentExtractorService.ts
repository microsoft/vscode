/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, Event as ElectronEvent, WebContentsWillNavigateEventParams, WebContentsWillRedirectEventParams } from 'electron';
import { IWebContentExtractorOptions, IWebContentExtractorService, WebContentExtractResult } from '../common/webContentExtractor.js';
import { URI } from '../../../base/common/uri.js';
import { AXNode, convertAXTreeToMarkdown } from './cdpAccessibilityDomain.js';
import { Limiter } from '../../../base/common/async.js';
import { ResourceMap } from '../../../base/common/map.js';
import { ILogService } from '../../log/common/log.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationError } from '../../../base/common/errors.js';
import { generateUuid } from '../../../base/common/uuid.js';

interface CacheEntry {
	result: string;
	timestamp: number;
	finalURI: URI;
}

export class NativeWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	// Only allow 3 windows to be opened at a time
	// to avoid overwhelming the system with too many processes.
	private _limiter = new Limiter<WebContentExtractResult>(3);
	private _webContentsCache = new ResourceMap<CacheEntry>();
	private readonly _cacheDuration = 24 * 60 * 60 * 1000; // 1 day in milliseconds

	constructor(@ILogService private readonly _logger: ILogService) { }

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this._cacheDuration;
	}

	extract(uris: URI[], options?: IWebContentExtractorOptions): Promise<WebContentExtractResult[]> {
		if (uris.length === 0) {
			this._logger.info('[NativeWebContentExtractorService] No URIs provided for extraction');
			return Promise.resolve([]);
		}
		this._logger.info(`[NativeWebContentExtractorService] Extracting content from ${uris.length} URIs`);
		return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri, options))));
	}

	async doExtract(uri: URI, options: IWebContentExtractorOptions | undefined): Promise<WebContentExtractResult> {
		const cached = this._webContentsCache.get(uri);
		if (cached) {
			this._logger.info(`[NativeWebContentExtractorService] Found cached content for ${uri}`);
			if (this.isExpired(cached)) {
				this._logger.info(`[NativeWebContentExtractorService] Cache expired for ${uri}, removing entry...`);
				this._webContentsCache.delete(uri);
			} else if (!options?.followRedirects && cached.finalURI.authority !== uri.authority) {
				return { status: 'redirect', toURI: cached.finalURI };
			} else {
				return { status: 'ok', result: cached.result };
			}
		}

		this._logger.info(`[NativeWebContentExtractorService] Extracting content from ${uri}...`);
		const store = new DisposableStore();
		const win = new BrowserWindow({
			width: 800,
			height: 600,
			show: false,
			webPreferences: {
				partition: generateUuid(), // do not share any state with the default renderer session
				javascript: true,
				offscreen: true,
				sandbox: true,
				webgl: false
			}
		});

		store.add(toDisposable(() => win.destroy()));

		try {
			const result = options?.followRedirects
				? await this.extractAX(win, uri)
				: await Promise.race([this.interceptRedirects(win, uri, store), this.extractAX(win, uri)]);

			if (result.status === 'ok') {
				this._webContentsCache.set(uri, { result: result.result, timestamp: Date.now(), finalURI: URI.parse(win.webContents.getURL()) });
			}

			return result;
		} catch (err) {
			this._logger.error(`[NativeWebContentExtractorService] Error extracting content from ${uri}: ${err}`);
			return { status: 'error', error: String(err) };
		} finally {
			store.dispose();
		}
	}

	private async extractAX(win: BrowserWindow, uri: URI): Promise<WebContentExtractResult> {
		await win.loadURL(uri.toString(true));
		win.webContents.debugger.attach('1.1');
		const result: { nodes: AXNode[] } = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
		const str = convertAXTreeToMarkdown(uri, result.nodes);
		this._logger.info(`[NativeWebContentExtractorService] Content extracted from ${uri}`);
		this._logger.trace(`[NativeWebContentExtractorService] Extracted content: ${str}`);
		return { status: 'ok', result: str };
	}

	private interceptRedirects(win: BrowserWindow, uri: URI, store: DisposableStore) {
		return new Promise<WebContentExtractResult>((resolve, reject) => {
			const onNavigation = (e: ElectronEvent<WebContentsWillNavigateEventParams | WebContentsWillRedirectEventParams>) => {
				const newURI = URI.parse(e.url);
				if (newURI.authority !== uri.authority) {
					e.preventDefault();
					resolve({ status: 'redirect', toURI: newURI });
				}
			};

			win.webContents.on('will-navigate', onNavigation);
			win.webContents.on('will-redirect', onNavigation);

			store.add(toDisposable(() => {
				reject(new CancellationError());
			}));
		});
	}
}
