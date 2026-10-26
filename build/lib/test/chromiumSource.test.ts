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

	test('downloads from Gitiles and decodes the base64 body', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('tools/clang/scripts/update.py', destination, {
			version: '1.2.3.4',
			token: 'secret',
			retryDelaysMs: [],
			httpGet: (url, token) => {
				requests.push(`${url} ${token ?? '-'}`);
				return { ok: true, body: Buffer.from(Buffer.from(script).toString('base64')) };
			},
		});
		assert.deepStrictEqual(requests, ['https://chromium.googlesource.com/chromium/src/+/refs/tags/1.2.3.4/tools/clang/scripts/update.py?format=TEXT -']);
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('falls back to GitHub, authenticated then anonymous', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			token: 'secret',
			retryDelaysMs: [],
			httpGet: (url, token) => {
				requests.push(`${url} ${token ?? '-'}`);
				return requests.length < 3 ? rateLimited : { ok: true, body: Buffer.from(script) };
			},
		});
		assert.deepStrictEqual(requests, [
			'https://chromium.googlesource.com/chromium/src/+/refs/tags/1.2.3.4/a/b.pl?format=TEXT -',
			'https://raw.githubusercontent.com/chromium/chromium/1.2.3.4/a/b.pl secret',
			'https://raw.githubusercontent.com/chromium/chromium/1.2.3.4/a/b.pl -',
		]);
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('rejects error pages served with a success status and retries every source', () => withTempFile(destination => {
		const requests: string[] = [];
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			token: '',
			retryDelaysMs: [0],
			httpGet: url => {
				requests.push(new URL(url).host);
				if (url.includes('githubusercontent')) {
					return { ok: true, body: Buffer.from('429: Too Many Requests') };
				}
				const content = requests.length === 1 ? '<!DOCTYPE html>' : script;
				return { ok: true, body: Buffer.from(Buffer.from(content).toString('base64')) };
			},
		});
		assert.deepStrictEqual(requests, ['chromium.googlesource.com', 'raw.githubusercontent.com', 'chromium.googlesource.com']);
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
		}), (error: Error) => error.message.includes('Cannot download Chromium 1.2.3.4 a/b.pl') && error.message.includes('Attempt 3/3'));
		assert.strictEqual(calls, 9);
		assert.strictEqual(fs.existsSync(destination), false);
	}));
});
