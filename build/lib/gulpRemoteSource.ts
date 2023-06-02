/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import fetch, { RequestInit } from 'node-fetch';
import * as VinylFile from 'vinyl';
import * as through2 from 'through2';
import * as log from 'fancy-log';
import * as ansiColors from 'ansi-colors';

export interface IOptions {
	base?: string;
	buffer?: boolean;
	fetchOptions?: RequestInit;
	verbose?: boolean;
}

export function remote(urls: string[] | string, options: IOptions): es.ThroughStream {
	if (options === undefined) {
		options = {};
	}

	if (typeof options.base !== 'string' && options.base !== null) {
		options.base = '/';
	}

	if (typeof options.buffer !== 'boolean') {
		options.buffer = true;
	}

	if (!Array.isArray(urls)) {
		urls = [urls];
	}

	return es.readArray(urls).pipe(es.map<string, VinylFile | void>((data: string, cb) => {
		const url = [options.base, data].join('');
		fetchWithRetry(url, options).then(file => {
			cb(undefined, file);
		}, error => {
			cb(error);
		});
	}));
}

async function fetchWithRetry(url: string, options: IOptions, retries = 3, retryDelay = 250): Promise<VinylFile> {
	try {
		let startTime = 0;
		if (options.verbose) {
			log(`Start fetching ${ansiColors.magenta(url)}${retries !== 3 ? `(${3 - retries} retry}` : ''}`);
			startTime = new Date().getTime();
		}
		const response = await fetch(url, options.fetchOptions);
		if (options.verbose) {
			log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
		}
		if (response.ok && (response.status >= 200 && response.status < 300)) {
			// request must be piped out once created, or we'll get this error: "You cannot pipe after data has been emitted from the response."
			const contents = options.buffer ? await response.buffer() : response.body.pipe(through2());
			return new VinylFile({
				cwd: '/',
				base: options.base,
				path: url,
				contents
			});
		}
		throw new Error(`Request ${ansiColors.magenta(url)} failed with status code: ${response.status}`);
	} catch (e) {
		if (retries > 0) {
			await new Promise(c => setTimeout(c, retryDelay));
			return fetchWithRetry(url, options, retries - 1, retryDelay * 3);
		}
		if (options.verbose) {
			log(`Fetching ${ansiColors.cyan(url)} failed: ${e}`);
		}
		throw e;
	}
}




