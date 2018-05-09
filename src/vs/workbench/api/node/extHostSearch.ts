/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPatternInfo, IFolderQuery, IRawSearchQuery, IRawFileMatch, IFileMatch } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';
import URI, { UriComponents } from 'vs/base/common/uri';

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private _handlePool: number = 0;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
	}

	registerSearchProvider(scheme: string, provider: vscode.SearchProvider) {
		const handle = this._handlePool++;
		this._searchProvider.set(handle, provider);
		this._proxy.$registerSearchProvider(handle, scheme);
		return {
			dispose: () => {
				this._searchProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$provideFileSearchResults(handle: number, session: number, query: string): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}
		const progress = {
			report: (uri) => {
				this._proxy.$handleFindMatch(handle, session, uri);
			}
		};
		return asWinJsPromise(token => provider.provideFileSearchResults(query, progress, token));
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, query: IRawSearchQuery): TPromise<void> {
		return TPromise.join(
			query.folderQueries.map(fq => this.provideTextSearchResultsForFolder(handle, session, pattern, query, fq))
		).then(
			() => { },
			(err: Error[]) => {
				return TPromise.wrapError(err[0]);
			});
	}

	private provideTextSearchResultsForFolder(handle: number, session: number, pattern: IPatternInfo, query: IRawSearchQuery, folderQuery: IFolderQuery<UriComponents>): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const includes: string[] = query.includePattern ? Object.keys(query.includePattern) : [];
		if (folderQuery.includePattern) {
			includes.push(...Object.keys(folderQuery.includePattern));
		}

		const excludes: string[] = query.excludePattern ? Object.keys(query.excludePattern) : [];
		if (folderQuery.excludePattern) {
			excludes.push(...Object.keys(folderQuery.excludePattern));
		}

		const searchOptions: vscode.TextSearchOptions = {
			folder: URI.from(folderQuery.folder),
			excludes,
			includes,
			disregardIgnoreFiles: query.disregardIgnoreFiles,
			ignoreSymlinks: query.ignoreSymlinks,
			encoding: query.fileEncoding
		};

		const collector = new TextSearchResultsCollector(handle, session, this._proxy);
		const progress = {
			report: (data: vscode.TextSearchResult) => {
				collector.add(data);
			}
		};
		return asWinJsPromise(token => provider.provideTextSearchResults(pattern, searchOptions, progress, token))
			.then(() => collector.flush());
	}
}

class TextSearchResultsCollector {
	private _batchedCollector: BatchedCollector<IRawFileMatch>;

	private _currentFileMatch: IFileMatch;

	constructor(private _handle: number, private _session: number, private _proxy: MainThreadSearchShape) {
		this._batchedCollector = new BatchedCollector<IRawFileMatch>(512, items => this.sendItems(items));
	}

	add(data: vscode.TextSearchResult): void {
		// Collects TextSearchResults into IRawFileMatches and collates using BatchedCollector.
		// This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
		// providers that send results in random order. We could do this step afterwards instead.
		if (this._currentFileMatch && this._currentFileMatch.resource.toString() !== data.uri.toString()) {
			this.pushToCollector();
			this._currentFileMatch = null;
		}

		if (!this._currentFileMatch) {
			this._currentFileMatch = {
				resource: data.uri,
				lineMatches: []
			};
		}

		// TODO@roblou - line text is sent for every match
		this._currentFileMatch.lineMatches.push({
			lineNumber: data.range.start.line,
			preview: data.preview.leading + data.preview.matching + data.preview.trailing,
			offsetAndLengths: [[data.preview.leading.length, data.preview.matching.length]]
		});
	}

	private pushToCollector(): void {
		const size = this._currentFileMatch.lineMatches.reduce((acc, match) => acc + match.offsetAndLengths.length, 0);
		this._batchedCollector.addItem(this._currentFileMatch, size);
	}

	flush(): void {
		this.pushToCollector();
		this._batchedCollector.flush();
	}

	private sendItems(items: IRawFileMatch | IRawFileMatch[]): void {
		items = Array.isArray(items) ? items : [items];
		this._proxy.$handleFindMatch(this._handle, this._session, items);
	}
}

/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
class BatchedCollector<T> {
	private static readonly TIMEOUT = 4000;

	// After START_BATCH_AFTER_COUNT items have been collected, stop flushing on timeout
	private static readonly START_BATCH_AFTER_COUNT = 50;

	private totalNumberCompleted = 0;
	private batch: T[] = [];
	private batchSize = 0;
	private timeoutHandle: number;

	constructor(private maxBatchSize: number, private cb: (items: T | T[]) => void) {
	}

	addItem(item: T, size: number): void {
		if (!item) {
			return;
		}

		if (this.maxBatchSize > 0) {
			this.addItemToBatch(item, size);
		} else {
			this.cb(item);
		}
	}

	addItems(items: T[], size: number): void {
		if (!items) {
			return;
		}

		if (this.maxBatchSize > 0) {
			this.addItemsToBatch(items, size);
		} else {
			this.cb(items);
		}
	}

	private addItemToBatch(item: T, size: number): void {
		this.batch.push(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private addItemsToBatch(item: T[], size: number): void {
		this.batch = this.batch.concat(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private onUpdate(): void {
		if (this.totalNumberCompleted < BatchedCollector.START_BATCH_AFTER_COUNT) {
			// Flush because we aren't batching yet
			this.flush();
		} else if (this.batchSize >= this.maxBatchSize) {
			// Flush because the batch is full
			this.flush();
		} else if (!this.timeoutHandle) {
			// No timeout running, start a timeout to flush
			this.timeoutHandle = setTimeout(() => {
				this.flush();
			}, BatchedCollector.TIMEOUT);
		}
	}

	flush(): void {
		if (this.batchSize) {
			this.totalNumberCompleted += this.batchSize;
			this.cb(this.batch);
			this.batch = [];
			this.batchSize = 0;

			if (this.timeoutHandle) {
				clearTimeout(this.timeoutHandle);
				this.timeoutHandle = 0;
			}
		}
	}
}
