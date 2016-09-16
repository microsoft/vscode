/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {chain, mapEvent, buffer} from 'vs/base/common/event';
import {fromEventEmitter} from 'vs/base/node/event';
import {IURLService} from 'vs/platform/url/common/url';
import product from 'vs/platform/product';
import {app} from 'electron';
import URI from 'vs/base/common/uri';

export class URLService implements IURLService {

	_serviceBrand: any;

	onOpenURL: Event<URI>;

	constructor() {
		app.setAsDefaultProtocolClient(product.urlProtocol);

		const rawOnOpenUrl = fromEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url }));

		// always prevent default and return the url as string
		const onOpenUrl = mapEvent(rawOnOpenUrl, ({ event, url }) => {
			event.preventDefault();
			return url;
		});

		// buffer all `onOpenUrl` events until someone starts listening
		const bufferedOnOpenUrl = buffer(onOpenUrl, true, global.getOpenUrls());

		this.onOpenURL = chain(bufferedOnOpenUrl)
			.map(url => {
				try {
					return URI.parse(url);
				} catch(e) {
					return null;
				}
			})
			.filter(uri => !!uri)
			.event;
	}
}