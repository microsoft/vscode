/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import { workspace } from 'vscode';
import { Log } from '../common/logger';
import { Readable } from 'stream';

export interface FetchOptions {
	logger: Log;
	retryFallbacks: boolean;
	expectJSON: boolean;
	method?: 'GET' | 'POST' | 'DELETE';
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}

export interface FetchHeaders {
	get(name: string): string | null;
}

export interface FetchResponse {
	ok: boolean;
	status: number;
	statusText: string;
	headers: FetchHeaders;
	text(): Promise<string>;
	json(): Promise<any>;
}

export type Fetch = (url: string, options: FetchOptions) => Promise<FetchResponse>;

interface Fetcher {
	name: string;
	fetch: Fetch;
}

const _fetchers: Fetcher[] = [];
try {
	_fetchers.push({
		name: 'Electron fetch',
		fetch: require('electron').net.fetch
	});
} catch {
	// ignore
}

const nodeFetch = {
	name: 'Node fetch',
	fetch,
};
const useElectronFetch = workspace.getConfiguration('github-authentication').get<boolean>('useElectronFetch', true);
if (useElectronFetch) {
	_fetchers.push(nodeFetch);
} else {
	_fetchers.unshift(nodeFetch);
}

_fetchers.push({
	name: 'Node http/s',
	fetch: nodeHTTP,
});

export function createFetch(): Fetch {
	let fetchers: readonly Fetcher[] = _fetchers;
	return async (url, options) => {
		const result = await fetchWithFallbacks(fetchers, url, options, options.logger);
		if (result.updatedFetchers) {
			fetchers = result.updatedFetchers;
		}
		return result.response;
	};
}

function shouldNotRetry(status: number): boolean {
	// Don't retry with other fetchers for these HTTP status codes:
	// - 429 Too Many Requests (rate limiting)
	// - 401 Unauthorized (authentication issue)
	// - 403 Forbidden (authorization issue)
	// - 404 Not Found (resource doesn't exist)
	// These are application-level errors where retrying with a different fetcher won't help
	return status === 429 || status === 401 || status === 403 || status === 404;
}

async function fetchWithFallbacks(availableFetchers: readonly Fetcher[], url: string, options: FetchOptions, logService: Log): Promise<{ response: FetchResponse; updatedFetchers?: Fetcher[] }> {
	if (options.retryFallbacks && availableFetchers.length > 1) {
		let firstResult: { ok: boolean; response: FetchResponse } | { ok: false; err: any } | undefined;
		for (const fetcher of availableFetchers) {
			const result = await tryFetch(fetcher, url, options, logService);
			if (fetcher === availableFetchers[0]) {
				firstResult = result;
			}
			if (!result.ok) {
				// For certain HTTP status codes, don't retry with other fetchers
				// These are application-level errors, not network-level errors
				if ('response' in result && shouldNotRetry(result.response.status)) {
					return { response: result.response };
				}
				continue;
			}
			if (fetcher !== availableFetchers[0]) {
				const retry = await tryFetch(availableFetchers[0], url, options, logService);
				if (retry.ok) {
					return { response: retry.response };
				}
				logService.info(`FetcherService: using ${fetcher.name} from now on`);
				const updatedFetchers = availableFetchers.slice();
				updatedFetchers.splice(updatedFetchers.indexOf(fetcher), 1);
				updatedFetchers.unshift(fetcher);
				return { response: result.response, updatedFetchers };
			}
			return { response: result.response };
		}
		if ('response' in firstResult!) {
			return { response: firstResult.response };
		}
		throw firstResult!.err;
	}
	return { response: await availableFetchers[0].fetch(url, options) };
}

async function tryFetch(fetcher: Fetcher, url: string, options: FetchOptions, logService: Log): Promise<{ ok: boolean; response: FetchResponse } | { ok: false; err: any }> {
	try {
		logService.debug(`FetcherService: trying fetcher ${fetcher.name} for ${url}`);
		const response = await fetcher.fetch(url, options);
		if (!response.ok) {
			logService.info(`FetcherService: ${fetcher.name} failed with status: ${response.status} ${response.statusText}`);
			return { ok: false, response };
		}
		if (!options.expectJSON) {
			logService.debug(`FetcherService: ${fetcher.name} succeeded (not JSON)`);
			return { ok: response.ok, response };
		}
		const text = await response.text();
		try {
			const json = JSON.parse(text); // Verify JSON
			logService.debug(`FetcherService: ${fetcher.name} succeeded (JSON)`);
			return { ok: true, response: new FetchResponseImpl(response.status, response.statusText, response.headers, async () => text, async () => json, async () => Readable.from([text])) };
		} catch (err) {
			logService.info(`FetcherService: ${fetcher.name} failed to parse JSON: ${err.message}`);
			return { ok: false, err, response: new FetchResponseImpl(response.status, response.statusText, response.headers, async () => text, async () => { throw err; }, async () => Readable.from([text])) };
		}
	} catch (err) {
		logService.info(`FetcherService: ${fetcher.name} failed with error: ${err.message}`);
		return { ok: false, err };
	}
}

export const fetching = createFetch();

class FetchResponseImpl implements FetchResponse {
	public readonly ok: boolean;
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly headers: FetchHeaders,
		public readonly text: () => Promise<string>,
		public readonly json: () => Promise<any>,
		public readonly body: () => Promise<NodeJS.ReadableStream | null>,
	) {
		this.ok = this.status >= 200 && this.status < 300;
	}
}

async function nodeHTTP(url: string, options: FetchOptions): Promise<FetchResponse> {
	return new Promise((resolve, reject) => {
		const { method, headers, body, signal } = options;
		const module = url.startsWith('https:') ? https : http;
		const req = module.request(url, { method, headers }, res => {
			if (signal?.aborted) {
				res.destroy();
				req.destroy();
				reject(makeAbortError(signal));
				return;
			}

			const nodeFetcherResponse = new NodeFetcherResponse(req, res, signal);
			resolve(new FetchResponseImpl(
				res.statusCode || 0,
				res.statusMessage || '',
				nodeFetcherResponse.headers,
				async () => nodeFetcherResponse.text(),
				async () => nodeFetcherResponse.json(),
				async () => nodeFetcherResponse.body(),
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

class NodeFetcherResponse {

	readonly headers: FetchHeaders;

	constructor(
		readonly req: http.ClientRequest,
		readonly res: http.IncomingMessage,
		readonly signal: AbortSignal | undefined,
	) {
		this.headers = new class implements FetchHeaders {
			get(name: string): string | null {
				const result = res.headers[name];
				return Array.isArray(result) ? result[0] : result ?? null;
			}
			[Symbol.iterator](): Iterator<[string, string], any, undefined> {
				const keys = Object.keys(res.headers);
				let index = 0;
				return {
					next: (): IteratorResult<[string, string]> => {
						if (index >= keys.length) {
							return { done: true, value: undefined };
						}
						const key = keys[index++];
						return { done: false, value: [key, this.get(key)!] };
					}
				};
			}
		};
	}

	public text(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			this.res.on('data', chunk => chunks.push(chunk));
			this.res.on('end', () => resolve(Buffer.concat(chunks).toString()));
			this.res.on('error', reject);
			this.signal?.addEventListener('abort', () => {
				this.res.destroy();
				this.req.destroy();
				reject(makeAbortError(this.signal!));
			});
		});
	}

	public async json(): Promise<any> {
		const text = await this.text();
		return JSON.parse(text);
	}

	public async body(): Promise<NodeJS.ReadableStream | null> {
		this.signal?.addEventListener('abort', () => {
			this.res.emit('error', makeAbortError(this.signal!));
			this.res.destroy();
			this.req.destroy();
		});
		return this.res;
	}
}

function makeAbortError(signal: AbortSignal): Error {
	// see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
	return signal.reason;
}
