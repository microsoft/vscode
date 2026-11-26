/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import manifests from '../../cgmanifest.json' with { type: 'json' };

export type HttpGetResult = { readonly ok: true; readonly body: Buffer } | { readonly ok: false; readonly error: string };
export type HttpGet = (url: string, headers: readonly string[]) => HttpGetResult;

interface ChromiumFileSource {
	readonly name: string;
	readonly url: string;
	readonly headers: readonly string[];
	decode(body: Buffer): Buffer;
}

const DEFAULT_RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

/**
 * The Chromium files that the build downloads. On a cache miss, every job that restores the cache prefetches all of them
 * (build/azure-pipelines/linux/steps/restore-chromium-build-files.yml), so that the cache any job saves serves every job.
 */
export const CHROMIUM_BUILD_FILES: readonly string[] = ['tools/clang/scripts/update.py', 'third_party/dpkg-shlibdeps/dpkg-shlibdeps.pl'];

/**
 * The files of earlier downloads, by Chromium version, which the product build restores from a pipeline cache so that
 * its jobs don't depend on GitHub's rate limits (GH-429).
 */
const DEFAULT_CACHE_DIR = path.join(import.meta.dirname, '..', '..', '.build', 'chromium-files');

export function getChromiumVersion(): string {
	const chromiumManifest = manifests.registrations.find(registration => {
		return registration.component.type === 'git' && registration.component.git!.name === 'chromium';
	});
	if (!chromiumManifest?.version) {
		throw new Error('Cannot find the chromium registration version in cgmanifest.json');
	}
	return chromiumManifest.version;
}

// Pass headers through a curl config on stdin so the token does not appear in the process list.
// Bound each request so a stalled connection fails over to the next source instead of hanging.
export function curlGet(url: string, headers: readonly string[]): HttpGetResult {
	const curlConfig = headers.map(header => `header = "${header}"\n`).join('');
	const result = spawnSync('curl', ['-fsSL', '--connect-timeout', '20', '--max-time', '120', '--config', '-', url], { input: curlConfig, maxBuffer: 64 * 1024 * 1024 });
	if (result.status === 0) {
		return { ok: true, body: result.stdout };
	}
	return { ok: false, error: `curl failed (status ${result.status}, signal ${result.signal}${result.error ? `, error ${result.error.message}` : ''}): ${result.stderr?.toString('utf8').trim()}` };
}

function getSources(filePath: string, version: string, token: string | undefined): ChromiumFileSource[] {
	const sources: ChromiumFileSource[] = [];
	const identity = (body: Buffer) => body;
	const rawUrl = `https://raw.githubusercontent.com/chromium/chromium/${version}/${filePath}`;
	if (token) {
		const authorization = `Authorization: Bearer ${token}`;
		// raw.githubusercontent.com rate-limits shared agent IPs per network, even with a token.
		// The REST API limits authenticated requests per token instead.
		sources.push({
			name: 'api.github.com',
			url: `https://api.github.com/repos/chromium/chromium/contents/${filePath}?ref=${version}`,
			headers: [authorization, 'Accept: application/vnd.github.raw+json', 'X-GitHub-Api-Version: 2022-11-28'],
			decode: identity,
		});
		sources.push({ name: 'raw.githubusercontent.com (authenticated)', url: rawUrl, headers: [authorization], decode: identity });
	}
	// An invalid token gets a 404 from GitHub, so also try anonymously.
	sources.push({ name: 'raw.githubusercontent.com', url: rawUrl, headers: [], decode: identity });
	// Chromium's canonical host last: it answers 403 from some cloud agent networks.
	// `format=TEXT` returns base64 content.
	sources.push({
		name: 'chromium.googlesource.com',
		url: `https://chromium.googlesource.com/chromium/src/+/refs/tags/${version}/${filePath}?format=TEXT`,
		headers: [],
		decode: body => Buffer.from(body.toString('ascii'), 'base64'),
	});
	return sources;
}

export interface DownloadChromiumFileOptions {
	readonly version?: string;
	readonly token?: string;
	readonly httpGet?: HttpGet;
	readonly retryDelaysMs?: readonly number[];
	/** Rejects error pages served with a success status. Defaults to requiring a `#!` script header. */
	readonly validate?: (content: Buffer) => boolean;
	/** Where prefetched files are kept by version, and read from first. `false` disables the cache. */
	readonly cacheDir?: string | false;
}

/**
 * Downloads a file from the Chromium source tree at the version pinned in cgmanifest.json, trying
 * the GitHub API, the GitHub raw host and Chromium's Gitiles host, and retrying the set with backoff.
 * A file of the same version in the cache is used instead. Only prefetchChromiumBuildFiles adds files to the cache.
 */
export function downloadChromiumFile(filePath: string, destination: string, options: DownloadChromiumFileOptions = {}): void {
	const version = options.version ?? getChromiumVersion();
	const validate = options.validate ?? (content => content.subarray(0, 2).toString('utf8') === '#!');
	const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
	const cached = cacheDir ? readCachedFile(cacheDir, version, filePath, validate) : undefined;
	if (cached) {
		writeFileSync(destination, cached);
		console.log(`Using Chromium ${version} ${filePath} from the cache`);
		return;
	}

	writeFileSync(destination, fetchChromiumFile(filePath, version, options, validate, options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS));
}

// The SHA-256 of a cached file, recorded when it was downloaded, guards against a damaged cache. A file without one, or
// whose content doesn't match it, counts as missing. The cache's own scope guards against untrusted writers: a pipeline
// cache that a pull request or another branch saves is never restored on main.
function sha256(content: Buffer): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Fills the cache with the Chromium build scripts, with one attempt per source, so that every job that restores the cache
 * also has something to save (Cache@2 fails to save a folder that doesn't exist). It writes all of them or none, since a
 * saved cache can't be completed later. Never throws.
 */
export function prefetchChromiumBuildFiles(options: DownloadChromiumFileOptions = {}): void {
	const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
	if (!cacheDir) {
		return;
	}
	const validate = options.validate ?? (content => content.subarray(0, 2).toString('utf8') === '#!');
	let version: string;
	const missing = new Map<string, Buffer>();
	try {
		version = options.version ?? getChromiumVersion();
		for (const file of CHROMIUM_BUILD_FILES) {
			if (!readCachedFile(cacheDir, version, file, validate)) {
				missing.set(file, fetchChromiumFile(file, version, options, validate, []));
			}
		}
	} catch (err) {
		console.log(`Not caching the Chromium build scripts: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
		return;
	}
	try {
		for (const [file, content] of missing) {
			writeCachedFile(cacheDir, version, file, content);
		}
	} catch (err) {
		console.log(`Not caching the Chromium build scripts: ${err instanceof Error ? err.message : String(err)}`);
		// Saving an incomplete cache would keep it incomplete, so leave nothing to save
		try {
			rmSync(cacheDir, { recursive: true, force: true });
		} catch {
			// best effort
		}
	}
}
function readCachedFile(cacheDir: string, version: string, filePath: string, validate: (content: Buffer) => boolean): Buffer | undefined {
	const file = path.join(cacheDir, version, filePath);
	if (!existsSync(file) || !existsSync(`${file}.sha256`)) {
		return undefined;
	}
	let content: Buffer;
	let hash: string;
	try {
		content = readFileSync(file);
		hash = readFileSync(`${file}.sha256`, 'utf8').trim();
	} catch (err) {
		console.log(`Ignoring the cached Chromium ${version} ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
	if (hash !== sha256(content)) {
		console.log(`Ignoring the cached Chromium ${version} ${filePath}: its content doesn't match its SHA-256`);
		return undefined;
	}
	return validate(content) ? content : undefined;
}

function writeCachedFile(cacheDir: string, version: string, filePath: string, content: Buffer): void {
	const file = path.join(cacheDir, version, filePath);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content);
	writeFileSync(`${file}.sha256`, sha256(content));
}

function fetchChromiumFile(filePath: string, version: string, options: DownloadChromiumFileOptions, validate: (content: Buffer) => boolean, retryDelaysMs: readonly number[]): Buffer {
	const httpGet = options.httpGet ?? curlGet;
	const sources = getSources(filePath, version, options.token ?? process.env['GITHUB_TOKEN']);
	const errors: string[] = [];

	for (let round = 0; round <= retryDelaysMs.length; round++) {
		for (const source of sources) {
			const result = httpGet(source.url, source.headers);
			let error: string;
			if (result.ok) {
				const content = source.decode(result.body);
				if (validate(content)) {
					console.log(`Downloaded Chromium ${version} ${filePath} from ${source.name}`);
					return content;
				}
				error = 'downloaded content is not the expected file';
			} else {
				error = result.error;
			}
			const message = `Attempt ${round + 1}/${retryDelaysMs.length + 1} to download ${filePath} from ${source.name} failed: ${error}`;
			console.error(message);
			errors.push(message);
		}
		if (round < retryDelaysMs.length) {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelaysMs[round]);
		}
	}
	throw new Error(`Cannot download Chromium ${version} ${filePath}.\n${errors.join('\n')}`);
}