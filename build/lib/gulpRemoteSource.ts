/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import fetch, { RequestInit } from 'node-fetch';
import * as File from 'vinyl';
import * as through2 from 'through2';

export interface IOptions {
	base?: string;
	buffer?: boolean;
	fetchOptions?: RequestInit;
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

	return es.readArray(urls).pipe(es.map<string, File | undefined>((data: string, cb) => {
		const url = [options.base, data].join('');
		fetchToFile(url, options).then(file => {
			cb(undefined, file);
		}, error => {
			cb(error);
		});
		return undefined;
	}));
}

async function fetchToFile(url: string, options: IOptions, retries = 3, retryDelay = 1000): Promise<File> {
	try {
		const response = await fetch(url, options.fetchOptions);
		if (response.ok && (response.status >= 200 && response.status < 300)) {
			// request must be piped out once created, or we'll get this error: "You cannot pipe after data has been emitted from the response."
			const contents = options.buffer ? await response.buffer() : response.body.pipe(through2());
			return new File({
				cwd: '/',
				base: options.base,
				path: url,
				contents
			});
		}
		throw new Error(`Request ${url} failed with status code: ${response.status}`);
	} catch (e) {
		if (retries > 0) {
			await new Promise(c => setTimeout(c, 1000));
			return fetchToFile(url, options, retries - 1, retryDelay * 3);
		}
		throw e;
	}
}




