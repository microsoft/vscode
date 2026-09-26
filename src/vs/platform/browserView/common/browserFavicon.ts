/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';

interface FaviconDocument {
	url: string;
	favicon: string | undefined;
	requestId: number;
	readId: number;
}

/** Keeps favicon requests with their committed document until it is replaced. */
export class BrowserFavicon extends Disposable {
	private _document: FaviconDocument | undefined;

	private readonly _onDidLoad = this._register(new Emitter<string | undefined>());
	/** Fires when a fetch updates the committed document; navigation changes are published by the view. */
	readonly onDidLoad = this._onDidLoad.event;

	constructor(
		url: string,
		private readonly readFaviconUrls: () => Promise<readonly string[] | undefined>,
		private readonly fetchFavicon: (url: string) => Promise<string>,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._document = { url, favicon: undefined, requestId: 0, readId: 0 };
	}

	get favicon(): string | undefined {
		return this._document?.favicon;
	}

	/** Changes ownership before the view records history and publishes navigation events. */
	commitNavigation(url: string, sameDocument = false): void {
		if (sameDocument) {
			if (this._document) {
				this._document.url = url;
			}
			return;
		}
		this._document = {
			url,
			favicon: URL.parse(url)?.host === URL.parse(this._document?.url ?? '')?.host ? this.favicon : undefined,
			requestId: 0,
			readId: 0,
		};
	}

	failNavigation(): void {
		this._document = undefined;
	}

	/** Reacquires candidates when Electron suppresses an unchanged URL set across documents. */
	async refresh(): Promise<void> {
		const document = this._document;
		if (this._store.isDisposed || !document) {
			return;
		}
		const requestId = document.requestId;
		const readId = ++document.readId;
		let urls: readonly string[] | undefined;
		try {
			urls = await this.readFaviconUrls();
		} catch (error) {
			this.logService.trace('[BrowserFavicon] Failed to read document favicons.', error);
			return;
		}
		if (urls !== undefined && readId === document.readId && this.isCurrentRequest(document, requestId)) {
			await this.load(urls);
		}
	}

	async load(urls: readonly string[]): Promise<void> {
		const document = this._document;
		if (this._store.isDisposed || !document) {
			return;
		}
		const requestId = ++document.requestId;
		let favicon: string | undefined;
		for (const url of urls) {
			try {
				favicon = await this.fetchFavicon(url);
			} catch (error) {
				this.logService.trace('[BrowserFavicon] Failed to fetch favicon, trying the next candidate.', error);
			}
			if (!this.isCurrentRequest(document, requestId)) {
				return;
			}
			if (favicon !== undefined) {
				break;
			}
		}
		const changed = document.favicon !== favicon;
		document.favicon = favicon;
		if (changed) {
			this._onDidLoad.fire(favicon);
		}
	}

	private isCurrentRequest(document: FaviconDocument, requestId: number): boolean {
		return !this._store.isDisposed && document === this._document && requestId === document.requestId;
	}
}
