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
}

/** Keeps provisional navigation icons separate from the committed document. */
export class BrowserFavicon extends Disposable {
	private _document: FaviconDocument | undefined;
	private _navigation: FaviconDocument | undefined;
	private _requestId = 0;

	private readonly _onDidLoad = this._register(new Emitter<string | undefined>());
	/** Fires when a fetch updates the committed document; navigation changes are published by the view. */
	readonly onDidLoad = this._onDidLoad.event;

	constructor(
		url: string,
		private readonly fetchFavicon: (url: string) => Promise<string>,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._document = { url, favicon: undefined };
	}

	get favicon(): string | undefined {
		return this._document?.favicon;
	}

	beginNavigation(url: string): void {
		this._requestId++;
		this._navigation = {
			url,
			favicon: URL.parse(url)?.host === URL.parse(this._document?.url ?? '')?.host ? this.favicon : undefined,
		};
	}

	redirectNavigation(url: string): void {
		if (!this._navigation) {
			this.beginNavigation(url);
			return;
		}
		if (URL.parse(url)?.host !== URL.parse(this._navigation.url)?.host) {
			this._requestId++;
			this._navigation.favicon = undefined;
		}
		this._navigation.url = url;
	}

	/** Promotes the candidate before the view records history and publishes its navigation events. */
	commitNavigation(url: string, sameDocument = false): void {
		if (sameDocument) {
			if (this._document) {
				this._document.url = url;
			}
			return;
		}
		this.redirectNavigation(url);
		this._document = this._navigation;
		this._navigation = undefined;
	}

	abortNavigation(): void {
		if (this._navigation) {
			this._requestId++;
			this._navigation = undefined;
		}
	}

	failNavigation(): void {
		this._requestId++;
		this._navigation = undefined;
		this._document = undefined;
	}

	async load(urls: readonly string[]): Promise<void> {
		const document = this._navigation ?? this._document;
		if (this._store.isDisposed || !document) {
			return;
		}
		const requestId = ++this._requestId;
		let favicon: string | undefined;
		for (const url of urls) {
			try {
				favicon = await this.fetchFavicon(url);
			} catch (error) {
				this.logService.trace('[BrowserFavicon] Failed to fetch favicon, trying the next candidate.', error);
			}
			if (this._store.isDisposed || requestId !== this._requestId) {
				return;
			}
			if (favicon !== undefined) {
				break;
			}
		}
		const changed = document.favicon !== favicon;
		document.favicon = favicon;
		if (document === this._document && changed) {
			this._onDidLoad.fire(favicon);
		}
	}
}
