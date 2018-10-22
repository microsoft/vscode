/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IPatternInfo, ITextSearchPreviewOptions } from 'vs/platform/search/common/search';
import { SearchWorker } from './searchWorker';
import { Event } from 'vs/base/common/event';
import { ISerializedFileMatch } from 'vs/workbench/services/search/node/search';

export interface ISearchWorkerSearchArgs {
	pattern: IPatternInfo;
	fileEncoding: string;
	absolutePaths: string[];
	maxResults?: number;
	previewOptions?: ITextSearchPreviewOptions;
}

export interface ISearchWorkerSearchResult {
	matches: ISerializedFileMatch[];
	numMatches: number;
	limitReached: boolean;
}

export interface ISearchWorker {
	initialize(): TPromise<void>;
	search(args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult>;
	cancel(): TPromise<void>;
}

export interface ISearchWorkerChannel extends IChannel {
	call(command: 'initialize'): TPromise<void>;
	call(command: 'search', args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult>;
	call(command: 'cancel'): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class SearchWorkerChannel implements ISearchWorkerChannel {
	constructor(private worker: SearchWorker) {
	}

	listen<T>(event: string, arg?: any): Event<T> {
		throw new Error('No events');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'initialize': return this.worker.initialize();
			case 'search': return this.worker.search(arg);
			case 'cancel': return this.worker.cancel();
		}
		return undefined;
	}
}

export class SearchWorkerChannelClient implements ISearchWorker {
	constructor(private channel: ISearchWorkerChannel) { }

	initialize(): TPromise<void> {
		return this.channel.call('initialize');
	}

	search(args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult> {
		return this.channel.call('search', args);
	}

	cancel(): TPromise<void> {
		return this.channel.call('cancel');
	}
}
