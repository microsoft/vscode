/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { downloadChromiumFile, getChromiumVersion, type HttpGetResult } from '../chromiumSource.ts';

const script = '#!/usr/bin/env python3\nprint("hello")\n';
const rateLimited: HttpGetResult = { ok: false, error: 'curl failed (status 22): The requested URL returned error: 429' };

function withTempFile(fn: (destination: string) => void): void {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-source-test-'));
	try {
		fn(path.join(dir, 'file'));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

suite('chromiumSource', () => {
	test('reads the pinned version from cgmanifest.json', () => {
		assert.match(getChromiumVersion(), /^\d+\.\d+\.\d+\.\d+$/);
	});

	test('downloads from the GitHub API with the token first', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('tools/clang/scripts/update.py', destination, {
			version: '1.2.3.4',
			token: 'secret',
			retryDelaysMs: [],
			httpGet: (url, headers) => {
				requests.push(`${url} ${headers.join('|')}`);
				return { ok: true, body: Buffer.from(script) };
			},
		});
		assert.deepStrictEqual(requests, ['https://api.github.com/repos/chromium/chromium/contents/tools/clang/scripts/update.py?ref=1.2.3.4 Authorization: Bearer secret|Accept: application/vnd.github.raw+json|X-GitHub-Api-Version: 2022-11-28']);
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('falls back to raw GitHub, then Gitiles, decoding its base64 body', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			token: 'secret',
			retryDelaysMs: [],
			httpGet: (url, headers) => {
				requests.push(`${new URL(url).host} ${headers.length ? headers[0] : '-'}`);
				return url.includes('googlesource') ? { ok: true, body: Buffer.from(Buffer.from(script).toString('base64')) } : rateLimited;
			},
		});
		assert.deepStrictEqual(requests, [
			'api.github.com Authorization: Bearer secret',
			'raw.githubusercontent.com Authorization: Bearer secret',
			'raw.githubusercontent.com -',
			'chromium.googlesource.com -',
		]);
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('skips the GitHub API without a token and rejects error pages served with a success status', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			token: '',
			retryDelaysMs: [0],
			httpGet: url => {
				requests.push(new URL(url).host);
				if (url.includes('githubusercontent')) {
					return requests.length === 3 ? { ok: true, body: Buffer.from(script) } : { ok: true, body: Buffer.from('429: Too Many Requests') };
				}
				return { ok: true, body: Buffer.from(Buffer.from('<!DOCTYPE html>').toString('base64')) };
			},
		});
		assert.deepStrictEqual(requests, ['raw.githubusercontent.com', 'chromium.googlesource.com', 'raw.githubusercontent.com']);
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('throws with every attempt once all rounds fail, and writes nothing', () => withTempFile(destination => {
		let calls = 0;
		assert.throws(() => downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			token: 'secret',
			retryDelaysMs: [0, 0],
			httpGet: () => {
				calls++;
				return rateLimited;
			},
		}), (error: Error) => error.message.includes('Cannot download Chromium 1.2.3.4 a/b.pl') && error.message.includes('Attempt 3/3') && error.message.includes('api.github.com'));
		assert.strictEqual(calls, 12);
		assert.strictEqual(fs.existsSync(destination), false);
	}));
});
