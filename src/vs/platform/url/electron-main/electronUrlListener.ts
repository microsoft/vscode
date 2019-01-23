/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IURLService } from 'vs/platform/url/common/url';
import product from 'vs/platform/node/product';
import { app } from 'electron';
import { URI } from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { isWindows } from 'vs/base/common/platform';
import { coalesce } from 'vs/base/common/arrays';

function uriFromRawUrl(url: string): URI | null {
	try {
		return URI.parse(url);
	} catch (e) {
		return null;
	}
}

export class ElectronURLListener {

	private disposables: IDisposable[] = [];

	constructor(
		initial: string | string[],
		@IURLService private readonly urlService: IURLService,
		@IWindowsMainService windowsService: IWindowsMainService
	) {
		const globalBuffer = ((<any>global).getOpenUrls() || []) as string[];
		const rawBuffer = [
			...(typeof initial === 'string' ? [initial] : initial),
			...globalBuffer
		];

		const buffer = coalesce(rawBuffer.map(uriFromRawUrl));
		const flush = () => buffer.forEach(uri => {
			if (uri) {
				urlService.open(uri);
			}
		});

		if (isWindows) {
			app.setAsDefaultProtocolClient(product.urlProtocol, process.execPath, ['--open-url', '--']);
		}

		const onOpenElectronUrl = Event.map(
			Event.fromNodeEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url })),
			({ event, url }) => {
				// always prevent default and return the url as string
				event.preventDefault();
				return url;
			});

		const onOpenUrl = Event.filter(Event.map(onOpenElectronUrl, uriFromRawUrl), uri => !!uri);
		onOpenUrl(this.urlService.open, this.urlService, this.disposables);

		const isWindowReady = windowsService.getWindows()
			.filter(w => w.isReady)
			.length > 0;

		if (isWindowReady) {
			flush();
		} else {
			Event.once(windowsService.onWindowReady)(flush);
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}