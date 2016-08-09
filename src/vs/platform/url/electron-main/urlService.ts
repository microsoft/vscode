/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {mapEvent,filterEvent} from 'vs/base/common/event';
import {fromEventEmitter} from 'vs/base/node/event';
import {IURLService} from 'vs/platform/url/common/url';
import product from 'vs/platform/product';
import {app} from 'electron';
import URI from 'vs/base/common/uri';

export class URLService implements IURLService {

	_serviceBrand: any;

	onOpenURL: Event<URI>;

	constructor() {
		const rawOnOpenUrl = fromEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url }));

		const uriEvent = mapEvent(rawOnOpenUrl, ({ event, url }) => {
			event.preventDefault();

			try {
				return URI.parse(url);
			} catch(e) {
				return null;
			}
		});

		this.onOpenURL = filterEvent(uriEvent, uri => !!uri);

		app.setAsDefaultProtocolClient(product.urlProtocol);
	}
}