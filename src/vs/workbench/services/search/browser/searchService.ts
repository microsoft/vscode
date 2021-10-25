/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFileMatch, IFileQuery, ISearchComplete, ISearchProgressItem, ISearchResultProvider, ISearchService, ITextQuery, TextSearchCompleteMessageType } from 'vs/workbench/services/search/common/search';
import { SearchService } from 'vs/workbench/services/search/common/searchService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IWorkerClient, logOnceWebWorkerWarning, SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { DefaultWorkerFactory } from 'vs/base/worker/defaultWorkerFactory';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocalFileSearchSimpleWorker, ILocalFileSearchSimpleWorkerHost } from 'vs/workbench/services/search/common/localFileSearchWorkerTypes';
import { memoize } from 'vs/base/common/decorators';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';

export class RemoteSearchService extends SearchService {
	constructor(
		@IModelService modelService: IModelService,
		@IEditorService editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
		this.diskSearch = this.instantiationService.createInstance(LocalFileSearchWorkerClient);
	}
}

export class LocalFileSearchWorkerClient extends Disposable implements ISearchResultProvider, ILocalFileSearchSimpleWorkerHost {

	protected _worker: IWorkerClient<ILocalFileSearchSimpleWorker> | null;
	protected readonly _workerFactory: DefaultWorkerFactory;

	private readonly _onDidRecieveTextSearchMatch = new Emitter<{ match: IFileMatch<UriComponents>, queryId: number }>();
	readonly onDidRecieveTextSearchMatch: Event<{ match: IFileMatch<UriComponents>, queryId: number }> = this._onDidRecieveTextSearchMatch.event;

	private cache: { key: string, cache: ISearchComplete } | undefined;

	private queryId: number = 0;

	constructor(
		@IFileService private fileService: IFileService,
	) {
		super();
		this._worker = null;
		this._workerFactory = new DefaultWorkerFactory('localFileSearchWorker');
	}

	sendTextSearchMatch(match: IFileMatch<UriComponents>, queryId: number): void {
		this._onDidRecieveTextSearchMatch.fire({ match, queryId });
	}

	@memoize
	private get fileSystemProvider(): HTMLFileSystemProvider {
		return this.fileService.getProvider(Schemas.file) as HTMLFileSystemProvider;
	}

	private async cancelQuery(queryId: number) {
		const proxy = await this._getOrCreateWorker().getProxyObject();
		proxy.cancelQuery(queryId);
	}

	async textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
		try {
			const queryDisposables = new DisposableStore();

			const proxy = await this._getOrCreateWorker().getProxyObject();
			const results: IFileMatch[] = [];

			let limitHit = false;

			await Promise.all(query.folderQueries.map(async fq => {
				const queryId = this.queryId++;
				queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);

				const handle = await this.fileSystemProvider.getHandle(fq.folder);
				if (!handle || handle.kind !== 'directory') {
					console.error('Could not get directory handle for ', fq);
					return;
				}

				const reviveMatch = (result: IFileMatch<UriComponents>): IFileMatch => ({
					resource: URI.revive(result.resource),
					results: result.results
				});

				queryDisposables.add(this.onDidRecieveTextSearchMatch(e => {
					if (e.queryId === queryId) {
						onProgress?.(reviveMatch(e.match));
					}
				}));

				const folderResults = await proxy.searchDirectory(handle, query, fq, queryId);
				for (const folderResult of folderResults.results) {
					results.push(reviveMatch(folderResult));
				}

				if (folderResults.limitHit) {
					limitHit = true;
				}

			}));

			queryDisposables.dispose();
			const result = { messages: [], results, limitHit };
			return result;
		} catch (e) {
			console.error('Error performing web worker text search', e);
			return {
				results: [],
				messages: [{
					text: localize('errorSearchText', "Unable to search with Web Worker text searcher"), type: TextSearchCompleteMessageType.Warning
				}],
			};
		}
	}

	async fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
		try {
			const queryDisposables = new DisposableStore();
			let limitHit = false;

			const proxy = await this._getOrCreateWorker().getProxyObject();
			const results: IFileMatch[] = [];
			await Promise.all(query.folderQueries.map(async fq => {
				const queryId = this.queryId++;
				queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);

				const handle = await this.fileSystemProvider.getHandle(fq.folder);
				if (!handle || handle.kind !== 'directory') {
					console.error('Could not get directory handle for ', fq);
					return;
				}

				const folderResults = await proxy.listDirectory(handle, query, fq, queryId);
				for (const folderResult of folderResults.results) {
					results.push({ resource: URI.joinPath(fq.folder, folderResult) });
				}
				if (folderResults.limitHit) { limitHit = true; }
			}));

			queryDisposables.dispose();

			const result = { messages: [], results, limitHit };
			return result;
		} catch (e) {
			console.error('Error performing web worker file search', e);
			return {
				results: [],
				messages: [{
					text: localize('errorSearchFile', "Unable to search with Web Worker file searcher"), type: TextSearchCompleteMessageType.Warning
				}],
			};
		}
	}

	async clearCache(cacheKey: string): Promise<void> {
		if (this.cache?.key === cacheKey) { this.cache = undefined; }
	}

	private _getOrCreateWorker(): IWorkerClient<ILocalFileSearchSimpleWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(new SimpleWorkerClient<ILocalFileSearchSimpleWorker, ILocalFileSearchSimpleWorkerHost>(
					this._workerFactory,
					'vs/workbench/services/search/worker/localFileSearch',
					this,
				));
			} catch (err) {
				logOnceWebWorkerWarning(err);
				throw err;
			}
		}
		return this._worker;
	}
}

registerSingleton(ISearchService, RemoteSearchService, true);
