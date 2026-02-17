/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { IBrowserViewService, ipcBrowserViewChannelName } from '../common/browserView.js';
import { IPlaywrightService } from '../common/playwrightService.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';

// eslint-disable-next-line local/code-import-patterns
import type { Browser } from 'playwright-core';

/**
 * Shared-process implementation of {@link IPlaywrightService}.
 */
export class PlaywrightService extends Disposable implements IPlaywrightService {
	declare readonly _serviceBrand: undefined;

	private readonly browserViewService: IBrowserViewService;
	private _browser: Browser | undefined;
	private _initPromise: Promise<void> | undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this.browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
	}

	async initialize(): Promise<void> {
		if (this._browser?.isConnected()) {
			return;
		}

		if (this._initPromise) {
			return this._initPromise;
		}

		this._initPromise = (async () => {
			try {
				this.logService.debug('[PlaywrightService] Connecting to browser via CDP');

				const playwright = await import('playwright-core');
				const endpoint = await this.browserViewService.getDebugWebSocketEndpoint();
				const browser = await playwright.chromium.connectOverCDP(endpoint);

				this.logService.debug('[PlaywrightService] Connected to browser');

				browser.on('disconnected', () => {
					this.logService.debug('[PlaywrightService] Browser disconnected');
					if (this._browser === browser) {
						this._browser = undefined;
					}
				});

				// This can happen if the service was disposed while we were waiting for the connection. In that case, clean up immediately.
				if (this._initPromise === undefined) {
					browser.close().catch(() => { /* ignore */ });
					throw new Error('PlaywrightService was disposed during initialization');
				}

				this._browser = browser;
			} finally {
				this._initPromise = undefined;
			}
		})();

		return this._initPromise;
	}

	override dispose(): void {
		if (this._browser) {
			this._browser.close().catch(() => { /* ignore */ });
			this._browser = undefined;
		}
		this._initPromise = undefined;
		super.dispose();
	}
}
