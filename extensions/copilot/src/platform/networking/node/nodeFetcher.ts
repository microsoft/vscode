/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import { Readable } from 'stream';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IEnvService } from '../../env/common/envService';
import { collectSingleLineErrorMessage } from '../../log/common/logService';
import { FetchOptions, HeadersImpl, IAbortController, IHeaders, PaginationOptions, ReportFetchEvent, Response, safeGetHostname } from '../common/fetcherService';
import { IFetcher, userAgentLibraryHeader } from '../common/networking';

export class NodeFetcher implements IFetcher {

	static readonly ID = 'node-http' as const;

	constructor(
		private readonly _envService: IEnvService,
		private readonly _reportEvent: ReportFetchEvent = () => { },
		private readonly _userAgentLibraryUpdate?: (original: string) => string,
	) {
	}

	getUserAgentLibrary(): string {
		return NodeFetcher.ID;
	}

	async fetch(url: string, options: FetchOptions): Promise<Response> {
		const headers = { ...options.headers };
		if (!headers['User-Agent']) {
			headers['User-Agent'] = `GitHubCopilotChat/${this._envService.getVersion()}`;
		}
		headers[userAgentLibraryHeader] = this._userAgentLibraryUpdate ? this._userAgentLibraryUpdate(this.getUserAgentLibrary()) : this.getUserAgentLibrary();

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
			this._reportEvent({ internalId, timestamp: Date.now(), outcome: 'success', phase: 'requestResponse', fetcher: NodeFetcher.ID, hostname, statusCode: response.status });
			return response;
		} catch (e) {
			e.fetcherId = NodeFetcher.ID;
			const outcome = e && !isAbortError(e) ? 'error' as const : 'cancel' as const;
			this._reportEvent({ internalId, timestamp: Date.now(), outcome, phase: 'requestResponse', fetcher: NodeFetcher.ID, hostname, reason: e });
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

	private _fetch(url: string, method: 'GET' | 'POST' | 'PUT', headers: { [name: string]: string }, body: string | undefined, signal: AbortSignal, internalId: string, hostname: string): Promise<Response> {
		return new Promise((resolve, reject) => {
			const module = url.startsWith('https:') ? https : http;
			const req = module.request(url, { method, headers }, res => {
				if (signal.aborted) {
					res.destroy();
					req.destroy();
					reject(makeAbortError(signal));
					return;
				}

				const nodeFetcherResponse = new NodeFetcherResponse(req, res, signal);
				resolve(new Response(
					res.statusCode || 0,
					res.statusMessage || '',
					nodeFetcherResponse.headers,
					nodeFetcherResponse.body(),
					NodeFetcher.ID,
					this._reportEvent,
					internalId,
					hostname,
				));
			});
			req.setTimeout(60 * 1000); // time out after 60s of receiving no data
			req.on('error', reject);

			if (body) {
				req.write(body);
			}
			req.end();
		});
	}
	async disconnectAll(): Promise<void> {
		// Nothing to do
	}
	makeAbortController(): IAbortController {
		return new AbortController();
	}
	isAbortError(e: any): boolean {
		return isAbortError(e);
	}
	isInternetDisconnectedError(_e: any): boolean {
		return false;
	}
	isFetcherError(e: any): boolean {
		return e && ['EADDRINUSE', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT'].includes(e.code);
	}
	isNetworkProcessCrashedError(_e: any): boolean {
		return false;
	}
	getUserMessageForFetcherError(err: any): string {
		return `Please check your firewall rules and network connection then try again. Error Code: ${collectSingleLineErrorMessage(err)}.`;
	}
}

function makeAbortError(signal: AbortSignal): Error {
	// see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
	return signal.reason;
}
function isAbortError(e: any): boolean {
	// see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
	return e && e.name === 'AbortError';
}

class NodeFetcherResponse {

	readonly headers: IHeaders;

	constructor(
		readonly req: http.ClientRequest,
		readonly res: http.IncomingMessage,
		readonly signal: AbortSignal
	) {
		this.headers = new HeadersImpl(res.headers);
	}

	public text(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			this.res.on('data', chunk => chunks.push(chunk));
			this.res.on('end', () => resolve(Buffer.concat(chunks).toString()));
			this.res.on('error', reject);
			this.signal.addEventListener('abort', () => {
				this.res.destroy();
				this.req.destroy();
				reject(makeAbortError(this.signal));
			});
		});
	}

	public async json(): Promise<any> {
		const text = await this.text();
		return JSON.parse(text);
	}

	public body(): ReadableStream<Uint8Array> {
		this.signal.addEventListener('abort', () => {
			this.res.emit('error', makeAbortError(this.signal));
			this.res.destroy();
			this.req.destroy();
		});
		return Readable.toWeb(this.res);
	}
}
