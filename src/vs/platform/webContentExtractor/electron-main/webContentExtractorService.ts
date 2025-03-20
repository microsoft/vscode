/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { IWebContentExtractorService } from '../common/webContentExtractor.js';
import { URI } from '../../../base/common/uri.js';
import { AXNode, convertToReadibleFormat } from './cdpAccessibilityDomain.js';
import { Limiter } from '../../../base/common/async.js';
import { ResourceMap } from '../../../base/common/map.js';
import { VSBuffer } from '../../../base/common/buffer.js';

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

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this._cacheDuration;
	}

	extract(uris: URI[]): Promise<string[]> {
		if (uris.length === 0) {
			return Promise.resolve([]);
		}
		return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri))));
	}

	extractUrls(uris: URI): Promise<Uint8Array> {
		return this.doExtractImage(uris);
	}

	private async doExtractImage(uri: URI): Promise<Uint8Array> {
		try {
			const response = await fetch(uri.toString());
			const contentType = response.headers.get('content-type');
			if (!response.ok || !contentType?.startsWith('image/') || !/(webp|jpg|jpeg|gif|png|bmp)$/i.test(contentType)) {
				return new Uint8Array();
			}
			const blob = await response.blob();
			return VSBuffer.wrap(await blob.bytes()).buffer;
		} catch (err) {
			console.log(err);
			return new Uint8Array();
		}
	}

	async doExtract(uri: URI): Promise<string> {
		const cached = this._webContentsCache.get(uri);
		if (cached) {
			if (this.isExpired(cached)) {
				this._webContentsCache.delete(uri);
			} else {
				return cached.content;
			}
		}

		const win = new BrowserWindow({
			width: 800,
			height: 600,
			show: false,
			webPreferences: {
				javascript: false,
				offscreen: true,
				sandbox: true,
				webgl: false
			}
		});
		try {
			await win.loadURL(uri.toString(true));
			win.webContents.debugger.attach('1.1');
			const result: { nodes: AXNode[] } = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
			const str = convertToReadibleFormat(result.nodes);
			this._webContentsCache.set(uri, { content: str, timestamp: Date.now() });
			return str;
		} catch (err) {
			console.log(err);
		} finally {
			win.destroy();
		}
		return '';
	}
}
