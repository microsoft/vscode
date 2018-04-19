/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { mapEvent, fromNodeEventEmitter, filterEvent } from 'vs/base/common/event';
import { IURLService } from 'vs/platform/url/common/url';
import product from 'vs/platform/node/product';
import { app } from 'electron';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { ReadyState } from 'vs/platform/windows/common/windows';

function uriFromRawUrl(url: string): URI | null {
	try {
		return URI.parse(url);
	} catch (e) {
		return null;
	}
}

export class ElectronURLListener {

	private buffer: URI[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		initial: string | string[],
		@IURLService private urlService: IURLService,
		@IWindowsMainService private windowsService: IWindowsMainService
	) {
		const globalBuffer = ((<any>global).getOpenUrls() || []) as string[];
		const rawBuffer = [
			...(typeof initial === 'string' ? [initial] : initial),
			...globalBuffer
		];

		this.buffer = rawBuffer.map(uriFromRawUrl).filter(uri => !!uri);

		app.setAsDefaultProtocolClient(product.urlProtocol, process.execPath, ['--open-url', '--']);

		const onOpenElectronUrl = mapEvent(
			fromNodeEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url })),
			({ event, url }) => {
				// always prevent default and return the url as string
				event.preventDefault();
				return url;
			});

		const onOpenUrl = filterEvent(mapEvent(onOpenElectronUrl, uriFromRawUrl), uri => !!uri);
		onOpenUrl(this.open, this, this.disposables);

		this.windowsService.onWindowReady(this.flushBuffer, this, this.disposables);
		this.flushBuffer();
	}

	private open(uri: URI): void {
		const shouldBuffer = this.windowsService.getWindows()
			.filter(w => w.readyState === ReadyState.READY)
			.length === 0;

		if (shouldBuffer) {
			this.buffer.push(uri);
		} else {
			this.urlService.open(uri).then(handled => {
				if (!handled) {
					this.buffer.push(uri);
				}
			});
		}
	}

	private flushBuffer(): void {
		const buffer = this.buffer;
		this.buffer = [];

		for (const uri of buffer) {
			this.open(uri);
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}