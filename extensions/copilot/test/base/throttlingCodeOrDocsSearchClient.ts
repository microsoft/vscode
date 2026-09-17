/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { ICodeOrDocsSearchItem, ICodeOrDocsSearchMultiRepoScopingQuery, ICodeOrDocsSearchOptions, ICodeOrDocsSearchResult, ICodeOrDocsSearchSingleRepoScopingQuery, IDocsSearchClient } from '../../src/platform/remoteSearch/common/codeOrDocsSearchClient';
import { ThrottledWorker } from '../../src/util/vs/base/common/async';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';


export class ThrottlingCodeOrDocsSearchClient implements IDocsSearchClient {

	declare readonly _serviceBrand: undefined;
	private readonly _throttler: ThrottledWorker<() => Promise<void>>;
	private readonly searchClient: IDocsSearchClient;

	constructor(
		descriptor: SyncDescriptor<IDocsSearchClient>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.searchClient = instantiationService.createInstance(descriptor);
		this._throttler = new ThrottledWorker({
			maxBufferedWork: undefined, // We want to hold as many requests as possible
			maxWorkChunkSize: 1,
			waitThrottleDelayBetweenWorkUnits: true,
			throttleDelay: 1000
		}, async (tasks) => {
			for (const task of tasks) {
				await task();
			}
		});
	}

	search(query: string, scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchItem[]>;
	search(query: string, scopingQuery: ICodeOrDocsSearchMultiRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchResult>;
	search(query: string,
		scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery | ICodeOrDocsSearchMultiRepoScopingQuery,
		options: ICodeOrDocsSearchOptions = {},
		cancellationToken?: CancellationToken
	): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult> {
		return new Promise((resolve, reject) => {
			this._throttler.work([async () => {
				try {
					if (Array.isArray(scopingQuery.repo)) {
						const result = await this.searchClient.search(
							query,
							scopingQuery as ICodeOrDocsSearchMultiRepoScopingQuery,
							options,
							cancellationToken
						);
						resolve(result);
					} else {
						const result = await this.searchClient.search(
							query,
							scopingQuery as ICodeOrDocsSearchSingleRepoScopingQuery,
							options,
							cancellationToken
						);
						resolve(result);
					}
				} catch (error) {
					reject(error);
				}
			}]);
		});
	}
}
