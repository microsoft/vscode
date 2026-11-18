/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../util/vs/base/common/event';
import { IEnvService } from '../../../env/common/envService';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection, WebSocketConnectOptions } from '../../common/fetcherService';
import { createWebSocket, NodeFetchFetcher } from '../nodeFetchFetcher';

export class NodeFetcherService implements IFetcherService {

	declare readonly _serviceBrand: undefined;
	readonly onDidFetch = Event.None;
	readonly onDidCompleteFetch = Event.None;

	private readonly _fetcher = new NodeFetchFetcher(this._envService);

	constructor(
		@IEnvService private readonly _envService: IEnvService
	) { }

	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		return this._fetcher.fetchWithPagination(baseUrl, options);
	}

	getUserAgentLibrary(): string {
		return this._fetcher.getUserAgentLibrary();
	}

	fetch(url: string, options: FetchOptions): Promise<Response> {
		return this._fetcher.fetch(url, options);
	}
	createWebSocket(url: string, options?: WebSocketConnectOptions): WebSocketConnection {
		return createWebSocket(url, options);
	}
	disconnectAll(): Promise<unknown> {
		return this._fetcher.disconnectAll();
	}
	makeAbortController(): IAbortController {
		return this._fetcher.makeAbortController();
	}
	isAbortError(e: any): boolean {
		return this._fetcher.isAbortError(e);
	}
	isInternetDisconnectedError(e: any): boolean {
		return this._fetcher.isInternetDisconnectedError(e);
	}
	isFetcherError(e: any): boolean {
		return this._fetcher.isFetcherError(e);
	}
	isNetworkProcessCrashedError(e: any): boolean {
		return this._fetcher.isNetworkProcessCrashedError(e);
	}
	getUserMessageForFetcherError(err: any): string {
		return this._fetcher.getUserMessageForFetcherError(err);
	}
}
