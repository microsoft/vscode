/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { URI } from 'vs/base/common/uri';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { URLServiceChannelClient, URLHandlerChannel } from 'vs/platform/url/node/urlIpc';
import { URLService } from 'vs/platform/url/common/urlService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import product from 'vs/platform/product/node/product';

export class RelayURLService extends URLService implements IURLHandler {

	private urlService: IURLService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IOpenerService openerService: IOpenerService
	) {
		super();

		this.urlService = new URLServiceChannelClient(mainProcessService.getChannel('url'));

		mainProcessService.registerChannel('urlHandler', new URLHandlerChannel(this));
		openerService.registerOpener(this);
	}

	async open(uri: URI): Promise<boolean> {
		if (uri.scheme !== product.urlProtocol) {
			return false;
		}

		return await this.urlService.open(uri);
	}

	handleURL(uri: URI): Promise<boolean> {
		return super.open(uri);
	}
}
