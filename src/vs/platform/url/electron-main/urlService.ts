/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {mapEvent} from 'vs/base/common/event';
import {fromEventEmitter} from 'vs/base/node/event';
import {IURLService} from 'vs/platform/url/common/url';
import product from 'vs/platform/product';
import {app} from 'electron';

export class URLService implements IURLService {

	_serviceBrand: any;

	onOpenURL: Event<string>;

	constructor() {
		const rawOnOpenUrl = fromEventEmitter(app, 'open-url', (event: Electron.Event, url: string) => ({ event, url }));

		this.onOpenURL = mapEvent(rawOnOpenUrl, ({ event, url }) => {
			event.preventDefault();
			return url;
		});

		app.setAsDefaultProtocolClient(product.urlProtocol);
	}
}