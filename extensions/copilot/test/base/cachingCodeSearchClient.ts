/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { ICodeOrDocsSearchBaseScopingQuery, ICodeOrDocsSearchItem, ICodeOrDocsSearchMultiRepoScopingQuery, ICodeOrDocsSearchOptions, ICodeOrDocsSearchResult, ICodeOrDocsSearchSingleRepoScopingQuery, IDocsSearchClient } from '../../src/platform/remoteSearch/common/codeOrDocsSearchClient';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CODE_SEARCH_CACHE_SALT } from '../cacheSalt';
import { SQLiteCache } from './cache';
import { computeSHA256 } from './hash';
import { CurrentTestRunInfo } from './simulationContext';

class CacheableCodeOrDocSearchRequest {

	readonly hash: string;
	readonly obj: unknown;

	constructor(
		readonly query: string,
		readonly scopingQuery: ICodeOrDocsSearchBaseScopingQuery,
		readonly requestOptions: ICodeOrDocsSearchOptions,
	) {
		this.obj = { query, scopingQuery, requestOptions };
		this.hash = computeSHA256(CODE_SEARCH_CACHE_SALT + JSON.stringify(this.obj));
	}

	toJSON() {
		return this.obj;
	}
}

interface ICodeOrDocSearchCache {
	get(req: CacheableCodeOrDocSearchRequest): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult | undefined>;
	set(req: CacheableCodeOrDocSearchRequest, cachedResponse: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult): Promise<void>;
}

export class CodeOrDocSearchSQLiteCache extends SQLiteCache<CacheableCodeOrDocSearchRequest, ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult> implements ICodeOrDocSearchCache {

	constructor(salt: string, currentTestRunInfo: CurrentTestRunInfo) {
		super('docs-search', salt, currentTestRunInfo);
	}
}

export class CachingCodeOrDocSearchClient implements IDocsSearchClient {
	declare readonly _serviceBrand: undefined;
	private readonly searchClient: IDocsSearchClient;

	constructor(
		searchClientDesc: SyncDescriptor<IDocsSearchClient>,
		private readonly cache: ICodeOrDocSearchCache,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.searchClient = instantiationService.createInstance(searchClientDesc);
	}

	search(query: string, scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchItem[]>;
	search(query: string, scopingQuery: ICodeOrDocsSearchMultiRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchResult>;
	async search(query: string,
		scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery | ICodeOrDocsSearchMultiRepoScopingQuery,
		options: ICodeOrDocsSearchOptions = {},
		cancellationToken?: CancellationToken
	): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult> {
		options.limit ??= 6;
		options.similarity ??= 0.766;

		const req = new CacheableCodeOrDocSearchRequest(query, scopingQuery, options);
		const cacheValue = await this.cache.get(req);
		if (cacheValue) {
			return cacheValue;
		}

		let result: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult;
		if (Array.isArray(scopingQuery.repo)) {
			result = await this.searchClient.search(
				query,
				scopingQuery as ICodeOrDocsSearchMultiRepoScopingQuery,
				options,
				cancellationToken
			);
		} else {
			result = await this.searchClient.search(
				query,
				scopingQuery as ICodeOrDocsSearchSingleRepoScopingQuery,
				options,
				cancellationToken
			);
		}
		await this.cache.set(req, result);
		return result;
	}
}
