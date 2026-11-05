/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
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
}

/**
 * Downloads a file from the Chromium source tree at the version pinned in cgmanifest.json, trying
 * the GitHub API, the GitHub raw host and Chromium's Gitiles host, and retrying the set with backoff.
 */
export function downloadChromiumFile(filePath: string, destination: string, options: DownloadChromiumFileOptions = {}): void {
	const version = options.version ?? getChromiumVersion();
	const httpGet = options.httpGet ?? curlGet;
	const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
	const validate = options.validate ?? (content => content.subarray(0, 2).toString('utf8') === '#!');
	const sources = getSources(filePath, version, options.token ?? process.env['GITHUB_TOKEN']);
	const errors: string[] = [];

	for (let round = 0; round <= retryDelaysMs.length; round++) {
		for (const source of sources) {
			const result = httpGet(source.url, source.headers);
			let error: string;
			if (result.ok) {
				const content = source.decode(result.body);
				if (validate(content)) {
					writeFileSync(destination, content);
					console.log(`Downloaded Chromium ${version} ${filePath} from ${source.name}`);
					return;
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
