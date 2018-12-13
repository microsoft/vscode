/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as extfs from 'vs/base/node/extfs';
import { ILogService } from 'vs/platform/log/common/log';
import { IFileQuery, IFolderQuery, IRawFileQuery, IRawQuery, IRawTextQuery, ISearchCompleteStats, ITextQuery } from 'vs/platform/search/common/search';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { FileIndexSearchManager } from 'vs/workbench/api/node/extHostSearch.fileIndex';
import { FileSearchManager } from 'vs/workbench/services/search/node/fileSearchManager';
import { SearchService } from 'vs/workbench/services/search/node/rawSearchService';
import { RipgrepSearchProvider } from 'vs/workbench/services/search/node/ripgrepSearchProvider';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { isSerializedFileMatch } from 'vs/workbench/services/search/node/search';
import { TextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider>();
	private readonly _textSearchUsedSchemes = new Set<string>();
	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider>();
	private readonly _fileSearchUsedSchemes = new Set<string>();
	private readonly _fileIndexProvider = new Map<number, vscode.FileIndexProvider>();
	private readonly _fileIndexUsedSchemes = new Set<string>();
	private _handlePool: number = 0;

	private _internalFileSearchHandle: number;
	private _internalFileSearchProvider: SearchService;

	private _fileSearchManager: FileSearchManager;
	private _fileIndexSearchManager: FileIndexSearchManager;

	constructor(mainContext: IMainContext, private _schemeTransformer: ISchemeTransformer, private _logService: ILogService, configService: ExtHostConfiguration, private _extfs = extfs) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager();
		this._fileIndexSearchManager = new FileIndexSearchManager();

		registerEHProviders(this, _logService, configService);
	}

	private _transformScheme(scheme: string): string {
		if (this._schemeTransformer) {
			return this._schemeTransformer.transformOutgoing(scheme);
		}
		return scheme;
	}

	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider): IDisposable {
		if (this._textSearchUsedSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
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
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
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

	registerFileIndexProvider(scheme: string, provider: vscode.FileIndexProvider): IDisposable {
		if (this._fileIndexUsedSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
		}

		this._fileIndexUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._fileIndexProvider.set(handle, provider);
		this._proxy.$registerFileIndexProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileIndexUsedSchemes.delete(scheme);
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle); // TODO@roblou - unregisterFileIndexProvider
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
				const indexProvider = this._fileIndexProvider.get(handle);
				return this._fileIndexSearchManager.fileSearch(query, indexProvider, batch => {
					this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
				}, token);
			}
		}
	}

	private doInternalFileSearch(handle: number, session: number, rawQuery: IFileQuery, token: CancellationToken): Promise<ISearchCompleteStats> {
		const onResult = (ev) => {
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

		return this._internalFileSearchProvider.doFileSearch(rawQuery, onResult, token);
	}

	$clearCache(cacheKey: string): Promise<void> {
		if (this._internalFileSearchProvider) {
			this._internalFileSearchProvider.clearCache(cacheKey);
		}

		this._fileSearchManager.clearCache(cacheKey);
		this._fileIndexSearchManager.clearCache(cacheKey);

		return Promise.resolve(undefined);
	}

	$provideTextSearchResults(handle: number, session: number, rawQuery: IRawTextQuery, token: CancellationToken): Promise<ISearchCompleteStats> {
		const provider = this._textSearchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return Promise.resolve(undefined);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchManager(query, provider, this._extfs);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}
}

function registerEHProviders(extHostSearch: ExtHostSearch, logService: ILogService, configService: ExtHostConfiguration) {
	if (configService.getConfiguration('searchRipgrep').enable || configService.getConfiguration('search').runInExtensionHost) {
		const outputChannel = new OutputChannel(logService);
		extHostSearch.registerTextSearchProvider('file', new RipgrepSearchProvider(outputChannel));

		extHostSearch.registerInternalFileSearchProvider('file', new SearchService());
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

