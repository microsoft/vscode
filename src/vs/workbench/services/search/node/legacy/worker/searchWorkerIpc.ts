/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
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
	initialize(): Promise<void>;
	search(args: ISearchWorkerSearchArgs): Promise<ISearchWorkerSearchResult | null>;
	cancel(): Promise<void>;
}

export class SearchWorkerChannel implements IServerChannel {
	constructor(private worker: SearchWorker) {
	}

	listen<T>(): Event<T> {
		throw new Error('No events');
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'initialize': return this.worker.initialize();
			case 'search': return this.worker.search(arg);
			case 'cancel': return this.worker.cancel();
		}
		throw new Error(`Call not found: ${command}`);
	}
}

export class SearchWorkerChannelClient implements ISearchWorker {
	constructor(private channel: IChannel) { }

	initialize(): Promise<void> {
		return this.channel.call('initialize');
	}

	search(args: ISearchWorkerSearchArgs): Promise<ISearchWorkerSearchResult> {
		return this.channel.call('search', args);
	}

	cancel(): Promise<void> {
		return this.channel.call('cancel');
	}
}
