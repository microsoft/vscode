/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as pfs from 'vs/base/node/pfs';
import { ILogService } from 'vs/platform/log/common/log';
import { IFileQuery, IFolderQuery, IRawFileQuery, IRawQuery, IRawTextQuery, ISearchCompleteStats, ITextQuery, isSerializedFileMatch, ISerializedSearchProgressItem } from 'vs/workbench/services/search/common/search';
import { FileSearchManager } from 'vs/workbench/services/search/node/fileSearchManager';
import { SearchService } from 'vs/workbench/services/search/node/rawSearchService';
import { RipgrepSearchProvider } from 'vs/workbench/services/search/node/ripgrepSearchProvider';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { TextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import * as vscode from 'vscode';
import { ExtHostSearchShape, MainContext, MainThreadSearchShape } from '../common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IURITransformerService } from 'vs/workbench/api/common/extHostUriTransformerService';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider>();
	private readonly _textSearchUsedSchemes = new Set<string>();
	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider>();
	private readonly _fileSearchUsedSchemes = new Set<string>();
	private _handlePool: number = 0;

	private _internalFileSearchHandle: number;
	private _internalFileSearchProvider: SearchService | null;

	private _fileSearchManager: FileSearchManager;

	protected _pfs: typeof pfs = pfs; // allow extending for tests

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IURITransformerService private _uriTransformer: IURITransformerService,
		@ILogService private _logService: ILogService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager();

		if (initData.remote.isRemote && initData.remote.authority) {
			this._registerEHSearchProviders();
		}
	}

	private _registerEHSearchProviders(): void {
		const outputChannel = new OutputChannel(this._logService);
		this.registerTextSearchProvider('file', new RipgrepSearchProvider(outputChannel));
		this.registerInternalFileSearchProvider('file', new SearchService());
	}

	private _transformScheme(scheme: string): string {
		return this._uriTransformer.transformOutgoingScheme(scheme);
	}

	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider): IDisposable {
		if (this._textSearchUsedSchemes.has(scheme)) {
			throw new Error(`a text search provider for the scheme '${scheme}' is already registered`);
		}

		this._textSearchUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._textSearchProvider.set(handle, provider);
		this._proxy.$registerTextSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._textSearchUsedSchemes.delete(scheme);
			this._textSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider): IDisposable {
		if (this._fileSearchUsedSchemes.has(scheme)) {
			throw new Error(`a file search provider for the scheme '${scheme}' is already registered`);
		}

		this._fileSearchUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._fileSearchProvider.set(handle, provider);
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchUsedSchemes.delete(scheme);
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerInternalFileSearchProvider(scheme: string, provider: SearchService): IDisposable {
		const handle = this._handlePool++;
		this._internalFileSearchProvider = provider;
		this._internalFileSearchHandle = handle;
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._internalFileSearchProvider = null;
			this._proxy.$unregisterProvider(handle);
		});
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawFileQuery, token: CancellationToken): Promise<ISearchCompleteStats> {
		const query = reviveQuery(rawQuery);
		if (handle === this._internalFileSearchHandle) {
			return this.doInternalFileSearch(handle, session, query, token);
		} else {
			const provider = this._fileSearchProvider.get(handle);
			if (provider) {
				return this._fileSearchManager.fileSearch(query, provider, batch => {
					this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
				}, token);
			} else {
				throw new Error('unknown provider: ' + handle);
			}
		}
	}

	private doInternalFileSearch(handle: number, session: number, rawQuery: IFileQuery, token: CancellationToken): Promise<ISearchCompleteStats> {
		const onResult = (ev: ISerializedSearchProgressItem) => {
			if (isSerializedFileMatch(ev)) {
				ev = [ev];
			}

			if (Array.isArray(ev)) {
				this._proxy.$handleFileMatch(handle, session, ev.map(m => URI.file(m.path)));
				return;
			}

			if (ev.message) {
				this._logService.debug('ExtHostSearch', ev.message);
			}
		};

		if (!this._internalFileSearchProvider) {
			throw new Error('No internal file search handler');
		}

		return <Promise<ISearchCompleteStats>>this._internalFileSearchProvider.doFileSearch(rawQuery, onResult, token);
	}

	$clearCache(cacheKey: string): Promise<void> {
		if (this._internalFileSearchProvider) {
			this._internalFileSearchProvider.clearCache(cacheKey);
		}

		this._fileSearchManager.clearCache(cacheKey);

		return Promise.resolve(undefined);
	}

	$provideTextSearchResults(handle: number, session: number, rawQuery: IRawTextQuery, token: CancellationToken): Promise<ISearchCompleteStats> {
		const provider = this._textSearchProvider.get(handle);
		if (!provider || !provider.provideTextSearchResults) {
			throw new Error(`Unknown provider ${handle}`);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchManager(query, provider, this._pfs);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}
}

function reviveQuery<U extends IRawQuery>(rawQuery: U): U extends IRawTextQuery ? ITextQuery : IFileQuery {
	return {
		...<any>rawQuery, // TODO
		...{
			folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
			extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map(components => URI.revive(components))
		}
	};
}

function reviveFolderQuery(rawFolderQuery: IFolderQuery<UriComponents>): IFolderQuery<URI> {
	return {
		...rawFolderQuery,
		folder: URI.revive(rawFolderQuery.folder)
	};
}

