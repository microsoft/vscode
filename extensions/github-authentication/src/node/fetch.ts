/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import { workspace } from 'vscode';
import { Log } from '../common/logger';

export interface FetchOptions {
	logger: Log;
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
	let _fetcher: Fetcher | undefined;
	return async (url, options) => {
		if (!_fetcher) {
			let firstResponse: FetchResponse | undefined;
			let firstError: any;
			for (const fetcher of _fetchers) {
				try {
					const res = await fetcher.fetch(url, options);
					if (fetcher === _fetchers[0]) {
						firstResponse = res;
					}
					if (!res.ok) {
						options.logger.info(`fetching: ${fetcher.name} failed with status: ${res.status} ${res.statusText}`);
						continue;
					}
					if (!options.expectJSON) {
						options.logger.info(`fetching: ${fetcher.name} succeeded (not JSON)`);
						_fetcher = fetcher;
						return res;
					}
					const text = await res.text();
					if (fetcher === _fetchers[0]) {
						// Update to unconsumed response
						firstResponse = new FetchResponseImpl(
							res.status,
							res.statusText,
							res.headers,
							async () => text,
							async () => JSON.parse(text),
						);
					}
					const json = JSON.parse(text); // Verify JSON
					options.logger.info(`fetching: ${fetcher.name} succeeded (JSON)`);
					_fetcher = fetcher;
					return new FetchResponseImpl(
						res.status,
						res.statusText,
						res.headers,
						async () => text,
						async () => json,
					);
				} catch (err) {
					if (fetcher === _fetchers[0]) {
						firstError = err;
					}
					options.logger.info(`fetching: ${fetcher.name} failed with error: ${err.message}`);
				}
			}
			_fetcher = _fetchers[0]; // Do this only once
			if (firstResponse) {
				return firstResponse;
			}
			throw firstError;
		}
		return _fetcher.fetch(url, options);
	};
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
