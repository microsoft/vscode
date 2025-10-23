/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import VinylFile from 'vinyl';
import log from 'fancy-log';
import ansiColors from 'ansi-colors';
import crypto from 'crypto';
import through2 from 'through2';
import { Stream } from 'stream';

export interface IFetchOptions {
	base?: string;
	nodeFetchOptions?: RequestInit;
	verbose?: boolean;
	checksumSha256?: string;
}

export function fetchUrls(urls: string[] | string, options: IFetchOptions): es.ThroughStream {
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
		fetchUrl(url, options).then(file => {
			cb(undefined, file);
		}, error => {
			cb(error);
		});
	}));
}

export async function fetchUrl(url: string, options: IFetchOptions, retries = 10, retryDelay = 1000): Promise<VinylFile> {
	const verbose = !!options.verbose || !!process.env['CI'] || !!process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] || !!process.env['GITHUB_WORKSPACE'];
	try {
		let startTime = 0;
		if (verbose) {
			log(`Start fetching ${ansiColors.magenta(url)}${retries !== 10 ? ` (${10 - retries} retry)` : ''}`);
			startTime = new Date().getTime();
		}
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30 * 1000);
		try {
			const response = await fetch(url, {
				...options.nodeFetchOptions,
				signal: controller.signal
			});
			if (verbose) {
				log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
			}
			if (response.ok && (response.status >= 200 && response.status < 300)) {
				const contents = Buffer.from(await response.arrayBuffer());
				if (options.checksumSha256) {
					const actualSHA256Checksum = crypto.createHash('sha256').update(contents).digest('hex');
					if (actualSHA256Checksum !== options.checksumSha256) {
						throw new Error(`Checksum mismatch for ${ansiColors.cyan(url)} (expected ${options.checksumSha256}, actual ${actualSHA256Checksum}))`);
					} else if (verbose) {
						log(`Verified SHA256 checksums match for ${ansiColors.cyan(url)}`);
					}
				} else if (verbose) {
					log(`Skipping checksum verification for ${ansiColors.cyan(url)} because no expected checksum was provided`);
				}
				if (verbose) {
					log(`Fetched response body buffer: ${ansiColors.magenta(`${(contents as Buffer).byteLength} bytes`)}`);
				}
				return new VinylFile({
					cwd: '/',
					base: options.base,
					path: url,
					contents
				});
			}
			let err = `Request ${ansiColors.magenta(url)} failed with status code: ${response.status}`;
			if (response.status === 403) {
				err += ' (you may be rate limited)';
			}
			throw new Error(err);
		} finally {
			clearTimeout(timeout);
		}
	} catch (e) {
		if (verbose) {
			log(`Fetching ${ansiColors.cyan(url)} failed: ${e}`);
		}
		if (retries > 0) {
			await new Promise(resolve => setTimeout(resolve, retryDelay));
			return fetchUrl(url, options, retries - 1, retryDelay);
		}
		throw e;
	}
}

const ghApiHeaders: Record<string, string> = {
	Accept: 'application/vnd.github.v3+json',
	'User-Agent': 'VSCode Build',
};
if (process.env.GITHUB_TOKEN) {
	ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
	...ghApiHeaders,
	Accept: 'application/octet-stream',
};

export interface IGitHubAssetOptions {
	version: string;
	name: string | ((name: string) => boolean);
	checksumSha256?: string;
	verbose?: boolean;
}

/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
export function fetchGithub(repo: string, options: IGitHubAssetOptions): Stream {
	return fetchUrls(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${options.version}`, {
		base: 'https://api.github.com',
		verbose: options.verbose,
		nodeFetchOptions: { headers: ghApiHeaders }
	}).pipe(through2.obj(async function (file, _enc, callback) {
		const assetFilter = typeof options.name === 'string' ? (name: string) => name === options.name : options.name;
		const asset = JSON.parse(file.contents.toString()).assets.find((a: { name: string }) => assetFilter(a.name));
		if (!asset) {
			return callback(new Error(`Could not find asset in release of ${repo} @ ${options.version}`));
		}
		try {
			callback(null, await fetchUrl(asset.url, {
				nodeFetchOptions: { headers: ghDownloadHeaders },
				verbose: options.verbose,
				checksumSha256: options.checksumSha256
			}));
		} catch (error) {
			callback(error);
		}
	}));
}
