/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { IRawFileQuery, IRawTextQuery } from 'vs/platform/search/common/search';
import { IRawSearchService, ISerializedSearchComplete, ISerializedSearchProgressItem } from './search';

export class SearchChannel implements IServerChannel {

	constructor(private service: IRawSearchService) { }

	listen<T>(_, event: string, arg?: any): Event<any> {
		switch (event) {
			case 'fileSearch': return this.service.fileSearch(arg);
			case 'textSearch': return this.service.textSearch(arg);
		}
		throw new Error('Event not found');
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'clearCache': return this.service.clearCache(arg);
		}
		throw new Error('Call not found');
	}
}

export class SearchChannelClient implements IRawSearchService {

	constructor(private channel: IChannel) { }

	fileSearch(search: IRawFileQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete> {
		return this.channel.listen('fileSearch', search);
	}

	textSearch(search: IRawTextQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete> {
		return this.channel.listen('textSearch', search);
	}

	clearCache(cacheKey: string): Promise<void> {
		return this.channel.call('clearCache', cacheKey);
	}
}