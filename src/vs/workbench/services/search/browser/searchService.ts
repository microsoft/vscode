/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IFileMatch, IFileQuery, ISearchComplete, ISearchProgressItem, ISearchResultProvider, ISearchService, ITextQuery, SearchProviderType, TextSearchCompleteMessageType } from '../common/search.js';
import { SearchService } from '../common/searchService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWebWorkerClient, logOnceWebWorkerWarning } from '../../../../base/common/worker/webWorker.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILocalFileSearchWorker, LocalFileSearchWorkerHost } from '../common/localFileSearchWorkerTypes.js';
import { memoize } from '../../../../base/common/decorators.js';
import { HTMLFileSystemProvider } from '../../../../platform/files/browser/htmlFileSystemProvider.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { WebFileSystemAccess } from '../../../../platform/files/browser/webFileSystemAccess.js';
import { revive } from '../../../../base/common/marshalling.js';

export class RemoteSearchService extends SearchService {
	constructor(
		@IModelService modelService: IModelService,
		@IEditorService editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
		const searchProvider = this.instantiationService.createInstance(LocalFileSearchWorkerClient);
		this.registerSearchResultProvider(Schemas.file, SearchProviderType.file, searchProvider);
		this.registerSearchResultProvider(Schemas.file, SearchProviderType.text, searchProvider);
	}
}

export class LocalFileSearchWorkerClient extends Disposable implements ISearchResultProvider {

	protected _worker: IWebWorkerClient<ILocalFileSearchWorker> | null;

	private readonly _onDidReceiveTextSearchMatch = new Emitter<{ match: IFileMatch<UriComponents>; queryId: number }>();
	readonly onDidReceiveTextSearchMatch: Event<{ match: IFileMatch<UriComponents>; queryId: number }> = this._onDidReceiveTextSearchMatch.event;

	private cache: { key: string; cache: ISearchComplete } | undefined;

	private queryId: number = 0;

	constructor(
		@IFileService private fileService: IFileService,
		@IUriIdentityService private uriIdentityService: IUriIdentityService,
		@IWebWorkerService private webWorkerService: IWebWorkerService,
	) {
		super();
		this._worker = null;
	}

	async getAIName(): Promise<string | undefined> {
		return undefined;
	}

	sendTextSearchMatch(match: IFileMatch<UriComponents>, queryId: number): void {
		this._onDidReceiveTextSearchMatch.fire({ match, queryId });
	}

	@memoize
	private get fileSystemProvider(): HTMLFileSystemProvider {
		return this.fileService.getProvider(Schemas.file) as HTMLFileSystemProvider;
	}

	private async cancelQuery(queryId: number) {
		const proxy = this._getOrCreateWorker().proxy;
		proxy.$cancelQuery(queryId);
	}

	async textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
		try {
			const queryDisposables = new DisposableStore();

			const proxy = this._getOrCreateWorker().proxy;
			const results: IFileMatch[] = [];

			let limitHit = false;

			await Promise.all(query.folderQueries.map(async fq => {
				const queryId = this.queryId++;
				queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);

				const handle: FileSystemHandle | undefined = await this.fileSystemProvider.getHandle(fq.folder);
				if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
					console.error('Could not get directory handle for ', fq);
					return;
				}

				// force resource to revive using URI.revive.
				// TODO @andrea see why we can't just use `revive()` below. For some reason, (<MarshalledObject>obj).$mid was undefined for result.resource
				const reviveMatch = (result: IFileMatch<UriComponents>): IFileMatch => ({
					resource: URI.revive(result.resource),
					results: revive(result.results)
				});

				queryDisposables.add(this.onDidReceiveTextSearchMatch(e => {
					if (e.queryId === queryId) {
						onProgress?.(reviveMatch(e.match));
					}
				}));

				const ignorePathCasing = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
				const folderResults = await proxy.$searchDirectory(handle, query, fq, ignorePathCasing, queryId);
				for (const folderResult of folderResults.results) {
					results.push(revive(folderResult));
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

			const proxy = this._getOrCreateWorker().proxy;
			const results: IFileMatch[] = [];
			await Promise.all(query.folderQueries.map(async fq => {
				const queryId = this.queryId++;
				queryDisposables.add(token?.onCancellationRequested(e => this.cancelQuery(queryId)) || Disposable.None);

				const handle: FileSystemHandle | undefined = await this.fileSystemProvider.getHandle(fq.folder);
				if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
					console.error('Could not get directory handle for ', fq);
					return;
				}
				const caseSensitive = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
				const folderResults = await proxy.$listDirectory(handle, query, fq, caseSensitive, queryId);
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

	private _getOrCreateWorker(): IWebWorkerClient<ILocalFileSearchWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(this.webWorkerService.createWorkerClient<ILocalFileSearchWorker>(
					new WebWorkerDescriptor({
						esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/services/search/worker/localFileSearchMain.js'),
						label: 'LocalFileSearchWorker'
					})
				));
				LocalFileSearchWorkerHost.setChannel(this._worker, {
					$sendTextSearchMatch: (match, queryId) => {
						return this.sendTextSearchMatch(match, queryId);
					}
				});
			} catch (err) {
				logOnceWebWorkerWarning(err);
				throw err;
			}
		}
		return this._worker;
	}
}

registerSingleton(ISearchService, RemoteSearchService, InstantiationType.Delayed);
