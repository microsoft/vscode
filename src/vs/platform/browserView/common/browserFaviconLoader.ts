/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';

export class BrowserFaviconLoader extends Disposable {
	private _requestId = 0;

	constructor(
		private readonly fetchFavicon: (url: string) => Promise<string>,
		private readonly applyFavicon: (favicon: string | undefined) => void,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	invalidate(): void {
		this._requestId++;
	}

	async load(urls: readonly string[]): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		const requestId = ++this._requestId;
		for (const url of urls) {
			let favicon: string | undefined;
			try {
				favicon = await this.fetchFavicon(url);
			} catch (error) {
				this.logService.trace('[BrowserFaviconLoader] Failed to fetch favicon, trying the next candidate.', error);
			}
			if (!this.isCurrent(requestId)) {
				return;
			}
			if (favicon !== undefined) {
				this.applyFavicon(favicon);
				return;
			}
		}
		if (this.isCurrent(requestId)) {
			this.applyFavicon(undefined);
		}
	}

	private isCurrent(requestId: number): boolean {
		return requestId === this._requestId && !this._store.isDisposed;
	}
}
