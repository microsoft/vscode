/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISerializedFileMatch } from '../search';
import { IPatternInfo } from 'vs/platform/search/common/search';
import { SearchWorkerManager } from './searchWorker';

export interface ISearchWorkerSearchArgs {
	pattern: IPatternInfo;
	fileEncoding: string;
	absolutePaths: string[];
	maxResults?: number;
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
	constructor(private worker: SearchWorkerManager) {
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
