/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, Event as ElectronEvent } from 'electron';
import { disposableTimeout } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IURLService } from 'vs/platform/url/common/url';
import { IProtocolUrl } from 'vs/platform/url/electron-main/url';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

/**
 * A listener for URLs that are opened from the OS and handled by VSCode.
 * Depending on the platform, this works differently:
 * - Windows: we use `app.setAsDefaultProtocolClient()` to register VSCode with the OS
 *            and additionally add the `open-url` command line argument to identify.
 * - macOS:   we rely on `app.on('open-url')` to be called by the OS
 * - Linux:   we have a special shortcut installed (`resources/linux/code-url-handler.desktop`)
 *            that calls VSCode with the `open-url` command line argument
 *            (https://github.com/microsoft/vscode/pull/56727)
 */
export class ElectronURLListener extends Disposable {

	private uris: IProtocolUrl[] = [];
	private retryCount = 0;

	constructor(
		initialProtocolUrls: IProtocolUrl[] | undefined,
		private readonly urlService: IURLService,
		windowsMainService: IWindowsMainService,
		environmentMainService: IEnvironmentMainService,
		productService: IProductService,
		private readonly logService: ILogService
	) {
		super();

		if (initialProtocolUrls) {
			logService.trace('ElectronURLListener initialUrisToHandle:', initialProtocolUrls.map(url => url.originalUrl));

			// the initial set of URIs we need to handle once the window is ready
			this.uris = initialProtocolUrls;
		}

		// Windows: install as protocol handler
		if (isWindows) {
			const windowsParameters = environmentMainService.isBuilt ? [] : [`"${environmentMainService.appRoot}"`];
			windowsParameters.push('--open-url', '--');
			app.setAsDefaultProtocolClient(productService.urlProtocol, process.execPath, windowsParameters);
		}

		// macOS: listen to `open-url` events from here on to handle
		const onOpenElectronUrl = Event.map(
			Event.fromNodeEventEmitter(app, 'open-url', (event: ElectronEvent, url: string) => ({ event, url })),
			({ event, url }) => {
				event.preventDefault(); // always prevent default and return the url as string

				return url;
			});

		this._register(onOpenElectronUrl(url => {
			const uri = this.uriFromRawUrl(url);
			if (!uri) {
				return;
			}

			this.urlService.open(uri, { originalUrl: url });
		}));

		// Send initial links to the window once it has loaded
		const isWindowReady = windowsMainService.getWindows()
			.filter(window => window.isReady)
			.length > 0;

		if (isWindowReady) {
			logService.trace('ElectronURLListener: window is ready to handle URLs');

			this.flush();
		} else {
			logService.trace('ElectronURLListener: waiting for window to be ready to handle URLs...');

			this._register(Event.once(windowsMainService.onDidSignalReadyWindow)(() => this.flush()));
		}
	}

	private uriFromRawUrl(url: string): URI | undefined {
		try {
			return URI.parse(url);
		} catch (e) {
			return undefined;
		}
	}

	private async flush(): Promise<void> {
		if (this.retryCount++ > 10) {
			this.logService.trace('ElectronURLListener#flush(): giving up after 10 retries');

			return;
		}

		this.logService.trace('ElectronURLListener#flush(): flushing URLs');

		const uris: IProtocolUrl[] = [];

		for (const obj of this.uris) {
			const handled = await this.urlService.open(obj.uri, { originalUrl: obj.originalUrl });
			if (handled) {
				this.logService.trace('ElectronURLListener#flush(): URL was handled', obj.originalUrl);
			} else {
				this.logService.trace('ElectronURLListener#flush(): URL was not yet handled', obj.originalUrl);

				uris.push(obj);
			}
		}

		if (uris.length === 0) {
			return;
		}

		this.uris = uris;
		disposableTimeout(() => this.flush(), 500, this._store);
	}
}
