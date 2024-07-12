/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import type * as vscode from 'vscode';
import { ExtHostSearchShape, MainThreadSearchShape, MainContext } from '../common/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { FileSearchManager } from 'vs/workbench/services/search/common/fileSearchManager';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IURITransformerService } from 'vs/workbench/api/common/extHostUriTransformerService';
import { ILogService } from 'vs/platform/log/common/log';
import { IRawFileQuery, ISearchCompleteStats, IFileQuery, IRawTextQuery, IRawQuery, ITextQuery, IFolderQuery, IRawAITextQuery, IAITextQuery } from 'vs/workbench/services/search/common/search';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TextSearchManager } from 'vs/workbench/services/search/common/textSearchManager';
import { CancellationToken } from 'vs/base/common/cancellation';

export interface IExtHostSearch extends ExtHostSearchShape {
	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider): IDisposable;
	registerAITextSearchProvider(scheme: string, provider: vscode.AITextSearchProvider): IDisposable;
	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider): IDisposable;
	doInternalFileSearchWithCustomCallback(query: IFileQuery, token: CancellationToken, handleFileMatch: (data: URI[]) => void): Promise<ISearchCompleteStats>;
}

export const IExtHostSearch = createDecorator<IExtHostSearch>('IExtHostSearch');

export class ExtHostSearch implements IExtHostSearch {

	protected readonly _proxy: MainThreadSearchShape = this.extHostRpc.getProxy(MainContext.MainThreadSearch);
	protected _handlePool: number = 0;

	private readonly _textSearchProvider = new Map<number, vscode.TextSearchProvider>();
	private readonly _textSearchUsedSchemes = new Set<string>();

	private readonly _aiTextSearchProvider = new Map<number, vscode.AITextSearchProvider>();
	private readonly _aiTextSearchUsedSchemes = new Set<string>();

	private readonly _fileSearchProvider = new Map<number, vscode.FileSearchProvider>();
	private readonly _fileSearchUsedSchemes = new Set<string>();

	private readonly _fileSearchManager = new FileSearchManager();

	constructor(
		@IExtHostRpcService private extHostRpc: IExtHostRpcService,
		@IURITransformerService protected _uriTransformer: IURITransformerService,
		@ILogService protected _logService: ILogService
	) { }

	protected _transformScheme(scheme: string): string {
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

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawFileQuery, token: vscode.CancellationToken): Promise<ISearchCompleteStats> {
		const query = reviveQuery(rawQuery);
		const provider = this._fileSearchProvider.get(handle);
		if (provider) {
			return this._fileSearchManager.fileSearch(query, provider, batch => {
				this._proxy.$handleFileMatch(handle, session, batch.map(p => p.resource));
			}, token);
		} else {
			throw new Error('3 unknown provider: ' + handle);
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

	protected createTextSearchManager(query: ITextQuery, provider: vscode.TextSearchProvider): TextSearchManager {
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
	return {
		...rawFolderQuery,
		folder: URI.revive(rawFolderQuery.folder)
	};
}
