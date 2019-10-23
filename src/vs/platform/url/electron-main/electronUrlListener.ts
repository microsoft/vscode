/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IURLService } from 'vs/platform/url/common/url';
import product from 'vs/platform/product/common/product';
import { app, Event as ElectronEvent } from 'electron';
import { URI } from 'vs/base/common/uri';
import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { isWindows } from 'vs/base/common/platform';
import { coalesce } from 'vs/base/common/arrays';
import { disposableTimeout } from 'vs/base/common/async';

function uriFromRawUrl(url: string): URI | null {
	try {
		return URI.parse(url);
	} catch (e) {
		return null;
	}
}

export class ElectronURLListener {

	private uris: URI[] = [];
	private retryCount = 0;
	private flushDisposable: IDisposable = Disposable.None;
	private disposables = new DisposableStore();

	constructor(
		initial: string | string[],
		@IURLService private readonly urlService: IURLService,
		@IWindowsMainService windowsMainService: IWindowsMainService
	) {
		const globalBuffer = ((<any>global).getOpenUrls() || []) as string[];
		const rawBuffer = [
			...(typeof initial === 'string' ? [initial] : initial),
			...globalBuffer
		];

		this.uris = coalesce(rawBuffer.map(uriFromRawUrl));

		if (isWindows) {
			app.setAsDefaultProtocolClient(product.urlProtocol, process.execPath, ['--open-url', '--']);
		}

		const onOpenElectronUrl = Event.map(
			Event.fromNodeEventEmitter(app, 'open-url', (event: ElectronEvent, url: string) => ({ event, url })),
			({ event, url }) => {
				// always prevent default and return the url as string
				event.preventDefault();
				return url;
			});

		const onOpenUrl = Event.filter(Event.map(onOpenElectronUrl, uriFromRawUrl), uri => !!uri);
		onOpenUrl(this.urlService.open, this.urlService, this.disposables);

		const isWindowReady = windowsMainService.getWindows()
			.filter(w => w.isReady)
			.length > 0;

		if (isWindowReady) {
			this.flush();
		} else {
			Event.once(windowsMainService.onWindowReady)(this.flush, this, this.disposables);
		}
	}

	private async flush(): Promise<void> {
		if (this.retryCount++ > 10) {
			return;
		}

		const uris: URI[] = [];

		for (const uri of this.uris) {
			const handled = await this.urlService.open(uri);

			if (!handled) {
				uris.push(uri);
			}
		}

		if (uris.length === 0) {
			return;
		}

		this.uris = uris;
		this.flushDisposable = disposableTimeout(() => this.flush(), 500);
	}

	dispose(): void {
		this.disposables.dispose();
		this.flushDisposable.dispose();
	}
}
