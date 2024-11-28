/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import type * as vscode from 'vscode';
import { ExtHostSearchShape, MainThreadSearchShape, MainContext } from './extHost.protocol.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { FileSearchManager } from '../../services/search/common/fileSearchManager.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IURITransformerService } from './extHostUriTransformerService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IRawFileQuery, ISearchCompleteStats, IFileQuery, IRawTextQuery, IRawQuery, ITextQuery, IFolderQuery, IRawAITextQuery, IAITextQuery } from '../../services/search/common/search.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { TextSearchManager } from '../../services/search/common/textSearchManager.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { revive } from '../../../base/common/marshalling.js';
import { OldFileSearchProviderConverter, OldTextSearchProviderConverter } from '../../services/search/common/searchExtConversionTypes.js';

export interface IExtHostSearch extends ExtHostSearchShape {
	registerTextSearchProviderOld(scheme: string, provider: vscode.TextSearchProvider): IDisposable;
	registerFileSearchProviderOld(scheme: string, provider: vscode.FileSearchProvider): IDisposable;
	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider2): IDisposable;
	registerAITextSearchProvider(scheme: string, provider: vscode.AITextSearchProvider): IDisposable;
	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider2): IDisposable;
	doInternalFileSearchWithCustomCallback(query: IFileQuery, token: CancellationToken, handleFileMatch: (data: URI[]) => void): Promise<ISearchCompleteStats>;
}

export const IExtHostSearch = createDecorator<IExtHostSearch>('IExtHostSearch');

export class ExtHostSearch implements IExtHostSearch {

	protected readonly _proxy: MainThreadSearchShape = this.extHostRpc.getProxy(MainContext.MainThreadSearch);
	protected _handlePool: number = 0;

	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider2>();
	private readonly _textSearchUsedSchemes = new Set<string>();

	private readonly _aiTextSearchProvider = new Map<number, vscode.AITextSearchProvider>();
	private readonly _aiTextSearchUsedSchemes = new Set<string>();

	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider2>();
	private readonly _fileSearchUsedSchemes = new Set<string>();

	private readonly _fileSearchManager = new FileSearchManager();

	constructor(
		@IExtHostRpcService private extHostRpc: IExtHostRpcService,
		@IURITransformerService protected _uriTransformer: IURITransformerService,
		@ILogService protected _logService: ILogService,
	) { }

	protected _transformScheme(scheme: string): string {
		return this._uriTransformer.transformOutgoingScheme(scheme);
	}

	registerTextSearchProviderOld(scheme: string, provider: vscode.TextSearchProvider): IDisposable {
		if (this._textSearchUsedSchemes.has(scheme)) {
			throw new Error(`a text search provider for the scheme '${scheme}' is already registered`);
		}

		this._textSearchUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._textSearchProvider.set(handle, new OldTextSearchProviderConverter(provider));
		this._proxy.$registerTextSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._textSearchUsedSchemes.delete(scheme);
			this._textSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider2): IDisposable {
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

	registerAITextSearchProvider(scheme: string, provider: vscode.AITextSearchProvider): IDisposable {
		if (this._aiTextSearchUsedSchemes.has(scheme)) {
			throw new Error(`an AI text search provider for the scheme '${scheme}'is already registered`);
		}

		this._aiTextSearchUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._aiTextSearchProvider.set(handle, provider);
		this._proxy.$registerAITextSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._aiTextSearchUsedSchemes.delete(scheme);
			this._aiTextSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileSearchProviderOld(scheme: string, provider: vscode.FileSearchProvider): IDisposable {
		if (this._fileSearchUsedSchemes.has(scheme)) {
			throw new Error(`a file search provider for the scheme '${scheme}' is already registered`);
		}

		this._fileSearchUsedSchemes.add(scheme);
		const handle = this._handlePool++;
		this._fileSearchProvider.set(handle, new OldFileSearchProviderConverter(provider));
		this._proxy.$registerFileSearchProvider(handle, this._transformScheme(scheme));
		return toDisposable(() => {
			this._fileSearchUsedSchemes.delete(scheme);
			this._fileSearchProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider2): IDisposable {
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

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawFileQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		const query = reviveQuery(rawQuery);
		const provider = this._fileSearchProvider.get(handle);
		if (provider) {
			return this._fileSearchManager.fileSearch(query, provider, batch => {
				this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
			}, token);
		} else {
			throw new Error('unknown provider: ' + handle);
		}
	}

	async doInternalFileSearchWithCustomCallback(query: IFileQuery, token: CancellationToken, handleFileMatch: (data: URI[]) => void): Promise<ISearchCompleteStats> {
		return { messages: [] };
	}

	$clearCache(cacheKey: string): Promise<void> {
		this._fileSearchManager.clearCache(cacheKey);

		return Promise.resolve(undefined);
	}

	$provideTextSearchResults(handle: number, session: number, rawQuery: IRawTextQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		const provider = this._textSearchProvider.get(handle);
		if (!provider || !provider.provideTextSearchResults) {
			throw new Error(`Unknown Text Search Provider ${handle}`);
		}

		const query = reviveQuery(rawQuery);
		const engine = this.createTextSearchManager(query, provider);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}

	$provideAITextSearchResults(handle: number, session: number, rawQuery: IRawAITextQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		const provider = this._aiTextSearchProvider.get(handle);
		if (!provider || !provider.provideAITextSearchResults) {
			throw new Error(`Unknown AI Text Search Provider ${handle}`);
		}

		const query = reviveQuery(rawQuery);
		const engine = this.createAITextSearchManager(query, provider);
		return engine.search(progress => this._proxy.$handleTextMatch(handle, session, progress), token);
	}

	$enableExtensionHostSearch(): void { }

	async $getAIName(handle: number): Promise<string | undefined> {
		const provider = this._aiTextSearchProvider.get(handle);
		if (!provider || !provider.provideAITextSearchResults) {
			return undefined;
		}

		// if the provider is defined, but has no name, use default name
		return provider.name ?? 'AI';
	}

	protected createTextSearchManager(query: ITextQuery, provider: vscode.TextSearchProvider2): TextSearchManager {
		return new TextSearchManager({ query, provider }, {
			readdir: resource => Promise.resolve([]),
			toCanonicalName: encoding => encoding
		}, 'textSearchProvider');
	}

	protected createAITextSearchManager(query: IAITextQuery, provider: vscode.AITextSearchProvider): TextSearchManager {
		return new TextSearchManager({ query, provider }, {
			readdir: resource => Promise.resolve([]),
			toCanonicalName: encoding => encoding
		}, 'aiTextSearchProvider');
	}
}

export function reviveQuery<U extends IRawQuery>(rawQuery: U): U extends IRawTextQuery ? ITextQuery : U extends IRawAITextQuery ? IAITextQuery : IFileQuery {
	return {
		...<any>rawQuery, // TODO@rob ???
		...{
			folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
			extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map(components => URI.revive(components))
		}
	};
}

function reviveFolderQuery(rawFolderQuery: IFolderQuery<UriComponents>): IFolderQuery<URI> {
	return revive(rawFolderQuery);
}

