/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IRawSearchService, IRawSearch, ISerializedSearchComplete, ISerializedSearchProgressItem, ITelemetryEvent } from './search';

export interface ISearchChannel extends IChannel {
	call(command: 'fileSearch', search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	call(command: 'textSearch', search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	call(command: 'clearCache', cacheKey: string): TPromise<void>;
	call(command: 'fetchTelemetry'): PPromise<void, ITelemetryEvent>;
	call(command: string, arg: any): TPromise<any>;
}

export class SearchChannel implements ISearchChannel {

	constructor(private service: IRawSearchService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'fileSearch': return this.service.fileSearch(arg);
			case 'textSearch': return this.service.textSearch(arg);
			case 'clearCache': return this.service.clearCache(arg);
			case 'fetchTelemetry': return this.service.fetchTelemetry();
		}
		return undefined;
	}
}

export class SearchChannelClient implements IRawSearchService {

	constructor(private channel: ISearchChannel) { }

	fileSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return this.channel.call('fileSearch', search);
	}

	textSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return this.channel.call('textSearch', search);
	}

	clearCache(cacheKey: string): TPromise<void> {
		return this.channel.call('clearCache', cacheKey);
	}

	fetchTelemetry(): PPromise<void, ITelemetryEvent> {
		return this.channel.call('fetchTelemetry');
	}
}