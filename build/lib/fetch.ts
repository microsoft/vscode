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
		let timeout = setTimeout(() => controller.abort(), 30 * 1000);
		try {
			const response = await fetch(url, {
				...options.nodeFetchOptions,
				signal: controller.signal
			});
			if (verbose) {
				log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
			}
			if (response.ok && (response.status >= 200 && response.status < 300)) {
				// Reset timeout for body download - large files need more time
				clearTimeout(timeout);
				timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
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
	/**
	 * When set, ignore {@link IGitHubAssetOptions.version} and resolve the asset from the latest
	 * published GitHub release (including pre-releases) instead of a specific tagged release.
	 */
	latest?: boolean;
}

interface IGitHubRelease {
	draft?: boolean;
	published_at?: string;
	assets: { name: string; url: string }[];
}

/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
export function fetchGithub(repo: string, options: IGitHubAssetOptions): Stream {
	const cleanRepo = repo.replace(/^\/|\/$/g, '');
	// When `latest` is set, list all releases and pick the most recently published one (ignoring the
	// requested version). Otherwise fetch the specific tagged release.
	const releaseUrl = options.latest
		? `/repos/${cleanRepo}/releases?per_page=100`
		: `/repos/${cleanRepo}/releases/tags/v${options.version}`;
	return fetchUrls(releaseUrl, {
		base: 'https://api.github.com',
		verbose: options.verbose,
		nodeFetchOptions: { headers: ghApiHeaders }
	}).pipe(through2.obj(async function (file, _enc, callback) {
		const json = JSON.parse(file.contents.toString());
		const assetFilter = typeof options.name === 'string' ? (name: string) => name === options.name : options.name;
		let release: IGitHubRelease | undefined;
		let asset: { name: string; url: string } | undefined;
		if (options.latest) {
			// Pick the most recently published non-draft release that actually contains the
			// requested asset. Sort by `published_at` (when the release was made public) rather than
			// `created_at` (when the draft was first created); treat a missing/unparseable timestamp
			// as 0 so it sorts to the end deterministically. Skipping releases without the asset makes
			// this resilient to releases that ship other artifacts (e.g. tarballs) but no matching VSIX.
			const publishedTime = (r: IGitHubRelease) => {
				const time = Date.parse(r.published_at ?? '');
				return isNaN(time) ? 0 : time;
			};
			const releases = (json as IGitHubRelease[])
				.filter(r => !r.draft)
				.sort((a, b) => publishedTime(b) - publishedTime(a));
			for (const candidate of releases) {
				const candidateAsset = candidate.assets.find(a => assetFilter(a.name));
				if (candidateAsset) {
					release = candidate;
					asset = candidateAsset;
					break;
				}
			}
		} else {
			release = json as IGitHubRelease;
			asset = release.assets.find(a => assetFilter(a.name));
		}
		if (!asset) {
			return callback(new Error(`Could not find asset in release of ${repo} @ ${options.latest ? 'latest' : options.version}`));
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
