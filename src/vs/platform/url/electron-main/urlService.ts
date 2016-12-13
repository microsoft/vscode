/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { mapEvent, chain, buffer, Emitter, any } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { IURLService } from 'vs/platform/url/common/url';
import product from 'vs/platform/node/product';
import { app } from 'electron';
import URI from 'vs/base/common/uri';

export class URLService implements IURLService {

	_serviceBrand: any;

	private openUrlEmitter: Emitter<string> = new Emitter<string>();
	onOpenURL: Event<URI>;

	constructor(initial: string | string[] = []) {
		const globalBuffer = (global.getOpenUrls() || []) as string[];
		const initialBuffer = [
			...(typeof initial === 'string' ? [initial] : initial),
			...globalBuffer
		];

		app.setAsDefaultProtocolClient(product.urlProtocol, process.execPath, ['--open-url']);

		const rawOnOpenUrl = fromEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url }));

		// always prevent default and return the url as string
		const preventedOnOpenUrl = mapEvent(rawOnOpenUrl, ({ event, url }) => {
			event.preventDefault();
			return url;
		});

		// buffer all `onOpenUrl` events until someone starts listening
		const bufferedOnOpenUrl = buffer(preventedOnOpenUrl, true, initialBuffer);

		this.onOpenURL = chain(any(bufferedOnOpenUrl, this.openUrlEmitter.event))
			.map(url => {
				try {
					return URI.parse(url);
				} catch (e) {
					return null;
				}
			})
			.filter(uri => !!uri)
			.event;
	}

	open(url: string): void {
		this.openUrlEmitter.fire(url);
	}
}