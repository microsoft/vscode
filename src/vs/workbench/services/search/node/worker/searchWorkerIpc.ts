/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISerializedFileMatch } from '../search';
import { IProgress, ILineMatch, IPatternInfo, ISearchStats } from 'vs/platform/search/common/search';
import { SearchWorker } from './searchWorker';

export interface ISearchWorkerConfig {
	pattern: IPatternInfo;
	id: number;
}

export interface ISearchWorkerSearchArgs {
	absolutePaths: string[];
	maxResults: number;
}

export interface ISearchWorker {
	initialize(config: ISearchWorkerConfig): TPromise<void>;
	search(args: ISearchWorkerSearchArgs): TPromise<ISerializedFileMatch[]>;
	cancel(): TPromise<void>;
}

export interface ISearchWorkerChannel extends IChannel {
	call(command: 'initialize', config: ISearchWorkerConfig): TPromise<void>;
	call(command: 'search', args: ISearchWorkerSearchArgs): TPromise<ISerializedFileMatch[]>;
	call(command: 'cancel'): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class SearchWorkerChannel implements ISearchWorkerChannel {
	constructor(private worker: SearchWorker) {
	}

	call(command: string, arg?: any): TPromise<any> {
		switch(command) {
			case 'initialize': return TPromise.wrap(this.worker.initialize(arg));
			case 'search': return this.worker.search(arg);
			case 'cancel': return this.worker.cancel();
		}
	}
}

export class SearchWorkerChannelClient implements ISearchWorker {
	constructor(private channel: ISearchWorkerChannel) { }

	initialize(config: ISearchWorkerConfig): TPromise<void> {
		return this.channel.call('initialize', config);
	}

	search(args: ISearchWorkerSearchArgs): TPromise<ISerializedFileMatch[]> {
		return this.channel.call('search', args);
	}

	cancel(): TPromise<void> {
		return this.channel.call('cancel');
	}
}
