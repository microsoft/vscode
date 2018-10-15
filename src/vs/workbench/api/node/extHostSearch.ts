/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import { ILogService } from 'vs/platform/log/common/log';
import { IFolderQuery, IPatternInfo, IRawSearchQuery, ISearchCompleteStats, ISearchQuery } from 'vs/platform/search/common/search';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { FileIndexSearchManager } from 'vs/workbench/api/node/extHostSearch.fileIndex';
import { RipgrepSearchProvider } from 'vs/workbench/services/search/node/ripgrepSearchProvider';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { TextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';
import { FileSearchManager } from 'vs/workbench/services/search/node/fileSearchManager';

export interface ISchemeTransformer {
	transformOutgoing(scheme: string): string;
}

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider>();
	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider>();
	private _internalFileSearchProvider;
	private readonly _fileIndexProvider = new Map<number, vscode.FileIndexProvider>();
	private _handlePool: number = 0;

	private _fileSearchManager: FileSearchManager;
	private _fileIndexSearchManager: FileIndexSearchManager;

	constructor(mainContext: IMainContext, private _schemeTransformer: ISchemeTransformer, logService: ILogService, configService: ExtHostConfiguration, private _extfs = extfs) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
		this._fileSearchManager = new FileSearchManager();
		this._fileIndexSearchManager = new FileIndexSearchManager();

		registerEHProviders(this, logService, configService);
	}

	private _transformScheme(scheme: string): string {
		if (this._schemeTransformer) {
			return this._schemeTransformer.transformOutgoing(scheme);
		}
		return scheme;
	}

	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider): IDisposable {
		const handle = this._handlePool++;
		this._textSearchProvider.set(handle, provider);
		this._proxy.$registerTextSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._textSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider): IDisposable {
		const handle = this._handlePool++;
		this._fileSearchProvider.set(handle, provider);
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerInternalFileSearchProvider(scheme: string, provider): IDisposable {
		const handle = this._handlePool++;
		this._internalFileSearchProvider = provider;
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._internalFileSearchProvider = null;
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileIndexProvider(scheme: string, provider: vscode.FileIndexProvider): IDisposable {
		const handle = this._handlePool++;
		this._fileIndexProvider.set(handle, provider);
		this._proxy.$registerFileIndexProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle); // TODO@roblou - unregisterFileIndexProvider
		});
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawSearchQuery, token: CancellationToken): Thenable<ISearchCompleteStats> {
		const provider = this._fileSearchProvider.get(handle);
		const query = reviveQuery(rawQuery);
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

	$clearCache(cacheKey: string): Thenable<void> {
		if (this._internalFileSearchProvider) {
			this._internalFileSearchProvider.clearCache();
		}

		// Actually called once per provider.
		// Only relevant to file index search.
		return this._fileIndexSearchManager.clearCache(cacheKey);
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, rawQuery: IRawSearchQuery, token: CancellationToken): Thenable<ISearchCompleteStats> {
		const provider = this._textSearchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		const engine = new TextSearchManager(pattern, query, provider, this._extfs);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}
}

function registerEHProviders(extHostSearch: ExtHostSearch, logService: ILogService, configService: ExtHostConfiguration) {
	if (configService.getConfiguration('searchRipgrep').enable) {
		const outputChannel = new OutputChannel(logService);
		extHostSearch.registerTextSearchProvider('file', new RipgrepSearchProvider(outputChannel));
	}
}

function reviveQuery(rawQuery: IRawSearchQuery): ISearchQuery {
	return {
		...rawQuery,
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

