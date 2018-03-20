/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { mapEvent, fromNodeEventEmitter, filterEvent } from 'vs/base/common/event';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import product from 'vs/platform/node/product';
import { app } from 'electron';
import URI from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Limiter } from 'vs/base/common/async';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { ReadyState } from 'vs/platform/windows/common/windows';

function uriFromRawUrl(url: string): URI | null {
	try {
		return URI.parse(url);
	} catch (e) {
		return null;
	}
}

export class URLService implements IURLService {

	_serviceBrand: any;

	private buffer: URI[];
	private handlers: IURLHandler[] = [];
	private handlerLimiter = new Limiter<void>(1);
	private disposables: IDisposable[] = [];

	constructor(
		initial: string | string[],
		@ILogService private logService: ILogService
	) {
		const globalBuffer = (global.getOpenUrls() || []) as string[];
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
		onOpenUrl(this.openURI, this, this.disposables);
	}

	open(uri: URI): TPromise<boolean> {
		// const uri = uriFromRawUrl(url);

		// if (!uri) {
		// 	return ;
		// }

		return this.openURI(uri);
	}

	private async openURI(uri: URI, handlers = this.handlers): TPromise<boolean> {
		this.logService.trace('urlService#handleURI', uri.toString());

		for (const handler of handlers) {
			if (await handler.handleURL(uri)) {
				return true;
			}
		}

		return false;
	}

	private async flushBuffer(handler: IURLHandler): TPromise<void> {
		const buffer = [...this.buffer];

		for (const uri of buffer) {
			if (await handler.handleURL(uri)) {
				this.buffer.splice(this.buffer.indexOf(uri, 1));
			}
		}
	}

	registerHandler(handler: IURLHandler): IDisposable {
		this.handlers.push(handler);
		this.handlerLimiter.queue(() => this.flushBuffer(handler));

		return toDisposable(() => {
			const index = this.handlers.indexOf(handler);

			if (index === -1) {
				return;
			}

			this.handlers.splice(index, 1);
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
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
		const globalBuffer = (global.getOpenUrls() || []) as string[];
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