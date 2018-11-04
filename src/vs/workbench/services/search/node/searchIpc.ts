/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IRawFileQuery, IRawTextQuery } from 'vs/platform/search/common/search';
import { IRawSearchService, ISerializedSearchComplete, ISerializedSearchProgressItem } from './search';

export interface ISearchChannel extends IChannel {
	listen(event: 'fileSearch', search: IRawFileQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	listen(event: 'textSearch', search: IRawTextQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	call(command: 'clearCache', cacheKey: string): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class SearchChannel implements ISearchChannel {

	constructor(private service: IRawSearchService) { }

	listen<T>(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'fileSearch': return this.service.fileSearch(arg);
			case 'textSearch': return this.service.textSearch(arg);
		}
		throw new Error('Event not found');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'clearCache': return this.service.clearCache(arg);
		}
		throw new Error('Call not found');
	}
}

export class SearchChannelClient implements IRawSearchService {

	constructor(private channel: ISearchChannel) { }

	fileSearch(search: IRawFileQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete> {
		return this.channel.listen('fileSearch', search);
	}

	textSearch(search: IRawTextQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete> {
		return this.channel.listen('textSearch', search);
	}

	clearCache(cacheKey: string): TPromise<void> {
		return this.channel.call('clearCache', cacheKey);
	}
}