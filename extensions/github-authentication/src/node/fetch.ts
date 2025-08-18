/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'vscode';
import { Log } from '../common/logger';

const acceptJSON = ['application/json', 'application/vnd.github+json'] as const;

export interface FetchOptions {
	logger: Log;
	method?: 'GET' | 'POST' | 'DELETE';
	headers?: Record<string, string> & { Accept?: typeof acceptJSON[number] };
	body?: string;
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

let _fetcher: Fetcher | undefined;

export const fetching: Fetch = async (url, options) => {
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
				if (!options.headers?.Accept || !acceptJSON.includes(options.headers?.Accept)) {
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
