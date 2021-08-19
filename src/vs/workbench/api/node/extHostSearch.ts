/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import * as pfs from 'vs/base/node/pfs';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ExtHostSearch, reviveQuery } from 'vs/workbench/api/common/extHostSearch';
import { IURITransformerService } from 'vs/workbench/api/common/extHostUriTransformerService';
import { IFileQuery, IRawFileQuery, ISearchCompleteStats, ISerializedSearchProgressItem, isSerializedFileMatch, ITextQuery } from 'vs/workbench/services/search/common/search';
import { TextSearchManager } from 'vs/workbench/services/search/common/textSearchManager';
import { SearchService } from 'vs/workbench/services/search/node/rawSearchService';
import { RipgrepSearchProvider } from 'vs/workbench/services/search/node/ripgrepSearchProvider';
import { OutputChannel } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { NativeTextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import type * as vscode from 'vscode';

export class NativeExtHostSearch extends ExtHostSearch {

	protected _pfs: typeof pfs = pfs; // allow extending for tests

	private _internalFileSearchHandle: number = -1;
	private _internalFileSearchProvider: SearchService | null = null;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IURITransformerService _uriTransformer: IURITransformerService,
		@ILogService _logService: ILogService,
	) {
		super(extHostRpc, _uriTransformer, _logService);

		const outputChannel = new OutputChannel('RipgrepSearchUD', this._logService);
		this.registerTextSearchProvider(Schemas.userData, new RipgrepSearchProvider(outputChannel));
	}

	override $enableExtensionHostSearch(): void {
		const outputChannel = new OutputChannel('RipgrepSearchEH', this._logService);
		this.registerTextSearchProvider(Schemas.file, new RipgrepSearchProvider(outputChannel));
		this.registerInternalFileSearchProvider(Schemas.file, new SearchService('fileSearchProvider'));
	}

	private registerInternalFileSearchProvider(scheme: string, provider: SearchService): IDisposable {
		const handle = this._handlePool++;
		this._internalFileSearchProvider = provider;
		this._internalFileSearchHandle = handle;
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._internalFileSearchProvider = null;
			this._proxy.$unregisterProvider(handle);
		});
	}

	override $provideFileSearchResults(handle: number, session: number, rawQuery: IRawFileQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		const query = reviveQuery(rawQuery);
		if (handle === this._internalFileSearchHandle) {
			return this.doInternalFileSearch(handle, session, query, token);
		}

		return super.$provideFileSearchResults(handle, session, rawQuery, token);
	}

	private doInternalFileSearch(handle: number, session: number, rawQuery: IFileQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
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

	override $clearCache(cacheKey: string): Promise<void> {
		if (this._internalFileSearchProvider) {
			this._internalFileSearchProvider.clearCache(cacheKey);
		}

		return super.$clearCache(cacheKey);
	}

	protected override createTextSearchManager(query: ITextQuery, provider: vscode.TextSearchProvider): TextSearchManager {
		return new NativeTextSearchManager(query, provider);
	}
}
