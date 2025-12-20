/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { Limiter } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { isURLDomainTrusted } from '../../url/common/trustedDomains.js';
import { IWebContentExtractorOptions, IWebContentExtractorService, WebContentExtractResult } from '../common/webContentExtractor.js';
import { WebContentCache } from './webContentCache.js';
import { WebPageLoader } from './webPageLoader.js';

export class NativeWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	// Only allow 3 windows to be opened at a time
	// to avoid overwhelming the system with too many processes.
	private _limiter = new Limiter<WebContentExtractResult>(3);
	private _webContentsCache = new WebContentCache();

	constructor(@ILogService private readonly _logger: ILogService) { }

	extract(uris: URI[], options?: IWebContentExtractorOptions): Promise<WebContentExtractResult[]> {
		if (uris.length === 0) {
			this._logger.info('No URIs provided for extraction');
			return Promise.resolve([]);
		}
		this._logger.info(`Extracting content from ${uris.length} URIs`);
		return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri, options))));
	}

	async doExtract(uri: URI, options: IWebContentExtractorOptions | undefined): Promise<WebContentExtractResult> {
		const cached = this._webContentsCache.tryGet(uri, options);
		if (cached !== undefined) {
			this._logger.info(`Found cached content for ${uri.toString()}`);
			return cached;
		}

		const loader = new WebPageLoader(
			(options) => new BrowserWindow(options),
			this._logger,
			uri,
			options,
			(uri) => isURLDomainTrusted(uri, options?.trustedDomains || []));

		try {
			const result = await loader.load();
			this._webContentsCache.add(uri, options, result);
			return result;
		} finally {
			loader.dispose();
		}
	}
}
