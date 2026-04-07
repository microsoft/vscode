/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IEnvService } from '../../env/common/envService';
import { collectSingleLineErrorMessage } from '../../log/common/logService';
import { FetcherId, FetchOptions, IAbortController, isAbortError, PaginationOptions, ReportFetchEvent, Response, safeGetHostname } from '../common/fetcherService';
import { IFetcher, userAgentLibraryHeader } from '../common/networking';

export abstract class BaseFetchFetcher implements IFetcher {

	constructor(
		private readonly _fetchImpl: typeof fetch | typeof import('electron').net.fetch,
		private readonly _envService: IEnvService,
		private readonly _fetcherId: FetcherId,
		private readonly _reportEvent: ReportFetchEvent,
		private readonly userAgentLibraryUpdate?: (original: string) => string,
	) {
	}

	abstract getUserAgentLibrary(): string;

	async fetch(url: string, options: FetchOptions): Promise<Response> {
		const headers = { ...options.headers };
		if (!headers['User-Agent']) {
			headers['User-Agent'] = `GitHubCopilotChat/${this._envService.getVersion()}`;
		}
		headers[userAgentLibraryHeader] = this.userAgentLibraryUpdate ? this.userAgentLibraryUpdate(this.getUserAgentLibrary()) : this.getUserAgentLibrary();

		let body = options.body;
		if (options.json) {
			if (options.body) {
				throw new Error(`Illegal arguments! Cannot pass in both 'body' and 'json'!`);
			}
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(options.json);
		}

		const method = options.method || 'GET';
		if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
			throw new Error(`Illegal arguments! 'method' must be 'GET', 'POST', or 'PUT'!`);
		}

		const signal = options.signal ?? new AbortController().signal;
		if (signal && !(signal instanceof AbortSignal)) {
			throw new Error(`Illegal arguments! 'signal' must be an instance of AbortSignal!`);
		}

		const internalId = generateUuid();
		const hostname = safeGetHostname(url);
		try {
			const response = await this._fetch(url, method, headers, body, signal, internalId, hostname);
			this._reportEvent({ internalId, timestamp: Date.now(), outcome: 'success', phase: 'requestResponse', fetcher: this._fetcherId, hostname, statusCode: response.status });
			return response;
		} catch (e) {
			e.fetcherId = this._fetcherId;
			const outcome = e && !isAbortError(e) ? 'error' as const : 'cancel' as const;
			this._reportEvent({ internalId, timestamp: Date.now(), outcome, phase: 'requestResponse', fetcher: this._fetcherId, hostname, reason: e });
			throw e;
		}
	}

	async fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		const items: T[] = [];
		const pageSize = options.pageSize ?? 20;
		let page = options.startPage ?? 1;
		let hasNextPage = false;

		do {
			const url = options.buildUrl(baseUrl, pageSize, page);
			const response = await this.fetch(url, options);

			if (!response.ok) {
				// Return what we've collected so far if request fails
				return items;
			}

			const data = await response.json();
			const pageItems = options.getItemsFromResponse(data);
			items.push(...pageItems);

			hasNextPage = pageItems.length === pageSize;
			page++;
		} while (hasNextPage);

		return items;
	}

	private async _fetch(url: string, method: 'GET' | 'POST' | 'PUT', headers: { [name: string]: string }, body: string | undefined, signal: AbortSignal, internalId: string, hostname: string): Promise<Response> {
		const resp = await this._fetchImpl(url, { method, headers, body, signal });
		return new Response(
			resp.status,
			resp.statusText,
			resp.headers,
			resp.body,
			this._fetcherId,
			this._reportEvent,
			internalId,
			hostname,
		);
	}

	async disconnectAll(): Promise<void> {
		// Nothing to do
	}
	makeAbortController(): IAbortController {
		return new AbortController();
	}
	isAbortError(e: any): boolean {
		// see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
		return e && e.name === 'AbortError';
	}
	abstract isInternetDisconnectedError(e: any): boolean;
	abstract isFetcherError(e: any): boolean;
	isNetworkProcessCrashedError(_e: any): boolean {
		return false;
	}
	getUserMessageForFetcherError(err: any): string {
		return `Please check your firewall rules and network connection then try again. Error Code: ${collectSingleLineErrorMessage(err)}.`;
	}
}
