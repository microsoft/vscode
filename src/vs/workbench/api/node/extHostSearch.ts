/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import * as pfs from '../../../base/node/pfs.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostConfiguration } from '../common/extHostConfiguration.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { ExtHostSearch, reviveQuery } from '../common/extHostSearch.js';
import { IURITransformerService } from '../common/extHostUriTransformerService.js';
import { IFileQuery, IRawFileQuery, ISearchCompleteStats, ISerializedSearchProgressItem, isSerializedFileMatch, ITextQuery } from '../../services/search/common/search.js';
import { TextSearchManager } from '../../services/search/common/textSearchManager.js';
import { SearchService } from '../../services/search/node/rawSearchService.js';
import { RipgrepSearchProvider } from '../../services/search/node/ripgrepSearchProvider.js';
import { OutputChannel } from '../../services/search/node/ripgrepSearchUtils.js';
import { NativeTextSearchManager } from '../../services/search/node/textSearchManager.js';
import type * as vscode from 'vscode';

export class NativeExtHostSearch extends ExtHostSearch implements IDisposable {

	protected _pfs: typeof pfs = pfs; // allow extending for tests

	private _internalFileSearchHandle: number = -1;
	private _internalFileSearchProvider: SearchService | null = null;

	private _registeredEHSearchProvider = false;

	private _numThreadsPromise: Promise<number | undefined> | undefined;

	private readonly _disposables = new DisposableStore();

	private isDisposed = false;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IURITransformerService _uriTransformer: IURITransformerService,
		@IExtHostConfiguration private readonly configurationService: IExtHostConfiguration,
		@ILogService _logService: ILogService,
	) {
		super(extHostRpc, _uriTransformer, _logService);
		this.getNumThreads = this.getNumThreads.bind(this);
		this.getNumThreadsCached = this.getNumThreadsCached.bind(this);
		this.handleConfigurationChanged = this.handleConfigurationChanged.bind(this);
		const outputChannel = new OutputChannel('RipgrepSearchUD', this._logService);
		this._disposables.add(this.registerTextSearchProvider(Schemas.vscodeUserData, new RipgrepSearchProvider(outputChannel, this.getNumThreadsCached)));
		if (initData.remote.isRemote && initData.remote.authority) {
			this._registerEHSearchProviders();
		}

		configurationService.getConfigProvider().then(provider => {
			if (this.isDisposed) {
				return;
			}
			this._disposables.add(provider.onDidChangeConfiguration(this.handleConfigurationChanged));
		});
	}

	private handleConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
		if (!event.affectsConfiguration('search')) {
			return;
		}
		this._numThreadsPromise = undefined;
	}

	async getNumThreads(): Promise<number | undefined> {
		const configProvider = await this.configurationService.getConfigProvider();
		const numThreads = configProvider.getConfiguration('search').get<number>('ripgrep.maxThreads');
		return numThreads;
	}

	async getNumThreadsCached(): Promise<number | undefined> {
		if (!this._numThreadsPromise) {
			this._numThreadsPromise = this.getNumThreads();
		}
		return this._numThreadsPromise;
	}

	dispose(): void {
		this.isDisposed = true;
		this._disposables.dispose();
	}

	override $enableExtensionHostSearch(): void {
		this._registerEHSearchProviders();
	}

	private _registerEHSearchProviders(): void {
		if (this._registeredEHSearchProvider) {
			return;
		}

		this._registeredEHSearchProvider = true;
		const outputChannel = new OutputChannel('RipgrepSearchEH', this._logService);
		this._disposables.add(this.registerTextSearchProvider(Schemas.file, new RipgrepSearchProvider(outputChannel, this.getNumThreadsCached)));
		this._disposables.add(this.registerInternalFileSearchProvider(Schemas.file, new SearchService('fileSearchProvider', this.getNumThreadsCached)));
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
			const start = Date.now();
			return this.doInternalFileSearch(handle, session, query, token).then(result => {
				const elapsed = Date.now() - start;
				this._logService.debug(`Ext host file search time: ${elapsed}ms`);
				return result;
			});
		}

		return super.$provideFileSearchResults(handle, session, rawQuery, token);
	}

	override async doInternalFileSearchWithCustomCallback(rawQuery: IFileQuery, token: vscode.CancellationToken, handleFileMatch: (data: URI[]) => void): Promise<ISearchCompleteStats> {
		const onResult = (ev: ISerializedSearchProgressItem) => {
			if (isSerializedFileMatch(ev)) {
				ev = [ev];
			}

			if (Array.isArray(ev)) {
				handleFileMatch(ev.map(m => URI.file(m.path)));
				return;
			}

			if (ev.message) {
				this._logService.debug('ExtHostSearch', ev.message);
			}
		};

		if (!this._internalFileSearchProvider) {
			throw new Error('No internal file search handler');
		}
		const numThreads = await this.getNumThreadsCached();
		return <Promise<ISearchCompleteStats>>this._internalFileSearchProvider.doFileSearch(rawQuery, numThreads, onResult, token);
	}

	private async doInternalFileSearch(handle: number, session: number, rawQuery: IFileQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		return this.doInternalFileSearchWithCustomCallback(rawQuery, token, (data) => {
			this._proxy.$handleFileMatch(handle, session, data);
		});
	}

	override $clearCache(cacheKey: string): Promise<void> {
		this._internalFileSearchProvider?.clearCache(cacheKey);

		return super.$clearCache(cacheKey);
	}

	protected override createTextSearchManager(query: ITextQuery, provider: vscode.TextSearchProvider2): TextSearchManager {
		return new NativeTextSearchManager(query, provider, undefined, 'textSearchProvider');
	}
}
