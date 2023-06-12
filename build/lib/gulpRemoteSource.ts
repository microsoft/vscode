/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import fetch, { RequestInit } from 'node-fetch';
import * as VinylFile from 'vinyl';
import * as log from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as crypto from 'crypto';

export interface IOptions {
	base?: string;
	fetchOptions?: RequestInit;
	verbose?: boolean;
	checksumSha256?: string;
}

export function remote(urls: string[] | string, options: IOptions): es.ThroughStream {
	if (options === undefined) {
		options = {};
	}

	if (typeof options.base !== 'string' && options.base !== null) {
		options.base = '/';
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

async function fetchWithRetry(url: string, options: IOptions, retries = 10, retryDelay = 1000): Promise<VinylFile> {
	try {
		let startTime = 0;
		if (options.verbose) {
			log(`Start fetching ${ansiColors.magenta(url)}${retries !== 10 ? `(${10 - retries} retry}` : ''}`);
			startTime = new Date().getTime();
		}
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30 * 1000);
		try {
			const response = await fetch(url, {
				...options.fetchOptions,
				signal: controller.signal as any /* Typings issue with lib.dom.d.ts */
			});
			if (options.verbose) {
				log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
			}
			if (response.ok && (response.status >= 200 && response.status < 300)) {
				const contents = await response.buffer();
				if (options.checksumSha256) {
					const hash = crypto.createHash('sha256');
					hash.update(contents);
					if (hash.digest('hex') !== options.checksumSha256) {
						throw new Error(`Checksum mismatch for ${url}`);
					}
				}
				if (options.verbose) {
					log(`Fetched response body buffer: ${ansiColors.magenta(`${(contents as Buffer).byteLength} bytes`)}`);
				}
				return new VinylFile({
					cwd: '/',
					base: options.base,
					path: url,
					contents
				});
			}
			throw new Error(`Request ${ansiColors.magenta(url)} failed with status code: ${response.status}`);
		} finally {
			clearTimeout(timeout);
		}
	} catch (e) {
		if (options.verbose) {
			log(`Fetching ${ansiColors.cyan(url)} failed: ${e}`);
		}
		if (retries > 0) {
			await new Promise(resolve => setTimeout(resolve, retryDelay));
			return fetchWithRetry(url, options, retries - 1, retryDelay);
		}
		throw e;
	}
}
