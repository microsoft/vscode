/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { URI } from 'vs/base/common/uri';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { URLServiceChannelClient, URLHandlerChannel } from 'vs/platform/url/node/urlIpc';
import { URLService } from 'vs/platform/url/common/urlService';

export class RelayURLService extends URLService implements IURLHandler {
	private urlService: IURLService;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super();

		this.urlService = new URLServiceChannelClient(mainProcessService.getChannel('url'));

		mainProcessService.registerChannel('urlHandler', new URLHandlerChannel(this));
	}

	open(uri: URI): Promise<boolean> {
		return this.urlService.open(uri);
	}

	handleURL(uri: URI): Promise<boolean> {
		return super.open(uri);
	}
}
