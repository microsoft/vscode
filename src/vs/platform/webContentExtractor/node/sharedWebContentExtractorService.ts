/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedWebContentExtractorService } from '../common/webContentExtractor.js';
import { URI } from '../../../base/common/uri.js';
import { ResourceMap } from '../../../base/common/map.js';
import { VSBuffer } from '../../../base/common/buffer.js';

interface CacheEntry {
	content: Uint8Array;
	timestamp: number;
}

export class SharedWebContentExtractorService implements ISharedWebContentExtractorService {
	_serviceBrand: undefined;
	private _webContentsCache = new ResourceMap<CacheEntry>();
	private readonly _cacheDuration = 24 * 60 * 60 * 1000; // 1 day in milliseconds

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this._cacheDuration;
	}

	extractUrls(uris: URI): Promise<Uint8Array> {
		return this.doExtractImage(uris);
	}

	private async doExtractImage(uri: URI): Promise<Uint8Array> {
		const cached = this._webContentsCache.get(uri);
		if (cached) {
			if (this.isExpired(cached)) {
				this._webContentsCache.delete(uri);
			} else {
				return cached.content;
			}
		}

		try {
			const response = await fetch(uri.toString(), {
				headers: {
					'Accept': 'image/*',
					'User-Agent': 'Mozilla/5.0'
				}
			});
			const contentType = response.headers.get('content-type');
			if (!response.ok || !contentType?.startsWith('image/') || !/(webp|jpg|jpeg|gif|png|bmp)$/i.test(contentType)) {
				return new Uint8Array();
			}
			const blob = await response.blob();
			const content = VSBuffer.wrap(await blob.bytes()).buffer;
			this._webContentsCache.set(uri, { content, timestamp: Date.now() });
			return content;
		} catch (err) {
			console.log(err);
			return new Uint8Array();
		}
	}
}
