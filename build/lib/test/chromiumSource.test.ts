/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { CHROMIUM_BUILD_FILES, downloadChromiumFile, getChromiumVersion, prefetchChromiumBuildFiles, type HttpGetResult } from '../chromiumSource.ts';

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
			cacheDir: false,
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
			cacheDir: false,
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
			cacheDir: false,
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
			cacheDir: false,
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

	test('uses a cached file of the same version without downloading', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'a'), { recursive: true });
		fs.writeFileSync(path.join(cacheDir, '1.2.3.4', 'a', 'b.pl'), script);
		fs.writeFileSync(path.join(cacheDir, '1.2.3.4', 'a', 'b.pl.sha256'), createHash('sha256').update(script).digest('hex'));
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			cacheDir,
			retryDelaysMs: [],
			httpGet: () => assert.fail('downloads despite the cache'),
		});
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('ignores a cached file of another version or an invalid one, and adds nothing to the cache', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		fs.mkdirSync(path.join(cacheDir, '1.2.3.3', 'third_party', 'dpkg-shlibdeps'), { recursive: true });
		fs.writeFileSync(path.join(cacheDir, '1.2.3.3', CHROMIUM_BUILD_FILES[1]), script);
		fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'third_party', 'dpkg-shlibdeps'), { recursive: true });
		fs.writeFileSync(path.join(cacheDir, '1.2.3.4', CHROMIUM_BUILD_FILES[1]), '429: Too Many Requests');
		const requested: string[] = [];
		downloadChromiumFile(CHROMIUM_BUILD_FILES[1], destination, {
			version: '1.2.3.4',
			token: 'secret',
			cacheDir,
			retryDelaysMs: [],
			httpGet: url => {
				requested.push(new URL(url).pathname.split('/').pop()!);
				return { ok: true, body: Buffer.from(script) };
			},
		});
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
		assert.deepStrictEqual(requested, ['dpkg-shlibdeps.pl']);
		assert.strictEqual(fs.readFileSync(path.join(cacheDir, '1.2.3.4', CHROMIUM_BUILD_FILES[1]), 'utf8'), '429: Too Many Requests');
		assert.strictEqual(fs.existsSync(path.join(cacheDir, '1.2.3.4', `${CHROMIUM_BUILD_FILES[1]}.sha256`)), false);
	}));

	test('a cache entry that can\'t be read is downloaded again', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'a', 'b.pl'), { recursive: true });
		fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'a', 'b.pl.sha256'), { recursive: true });
		downloadChromiumFile('a/b.pl', destination, {
			version: '1.2.3.4',
			cacheDir,
			retryDelaysMs: [],
			httpGet: () => ({ ok: true, body: Buffer.from(script) }),
		});
		assert.strictEqual(fs.readFileSync(destination, 'utf8'), script);
	}));

	test('a cached file whose content doesn\'t match its SHA-256, or that has none, is downloaded again', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		const tampered = '#!/usr/bin/env perl\nsystem("curl evil");\n';
		for (const [file, hash] of [['a/b.pl', createHash('sha256').update(script).digest('hex')], ['a/c.pl', undefined]] as const) {
			fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'a'), { recursive: true });
			fs.writeFileSync(path.join(cacheDir, '1.2.3.4', file), tampered);
			if (hash) {
				fs.writeFileSync(path.join(cacheDir, '1.2.3.4', `${file}.sha256`), hash);
			}
			let calls = 0;
			downloadChromiumFile(file, destination, {
				version: '1.2.3.4',
				token: 'secret',
				cacheDir,
				retryDelaysMs: [],
				httpGet: url => {
					calls += url.includes(file) ? 1 : 0;
					return { ok: true, body: Buffer.from(script) };
				},
			});
			assert.strictEqual(calls, 1, file);
			assert.strictEqual(fs.readFileSync(destination, 'utf8'), script, file);
			assert.strictEqual(fs.readFileSync(path.join(cacheDir, '1.2.3.4', file), 'utf8'), tampered, file);
		}
	}));

	test('prefetching fills the cache with every build script or none, and never throws', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		let calls = 0;
		prefetchChromiumBuildFiles({ version: '1.2.3.4', token: 'secret', cacheDir, httpGet: () => { calls++; return rateLimited; } });
		// one attempt per source, and none for the other script once one failed
		assert.strictEqual(calls, 4);
		assert.strictEqual(fs.existsSync(cacheDir), false);

		prefetchChromiumBuildFiles({ version: '1.2.3.4', token: 'secret', cacheDir, httpGet: url => url.includes('update.py') ? { ok: true, body: Buffer.from(script) } : rateLimited });
		assert.strictEqual(fs.existsSync(cacheDir), false);

		calls = 0;
		const options = { version: '1.2.3.4', token: 'secret', cacheDir, httpGet: () => { calls++; return { ok: true, body: Buffer.from(script) } as HttpGetResult; } };
		prefetchChromiumBuildFiles(options);
		prefetchChromiumBuildFiles(options);
		assert.strictEqual(calls, CHROMIUM_BUILD_FILES.length);
		for (const file of CHROMIUM_BUILD_FILES) {
			assert.strictEqual(fs.readFileSync(path.join(cacheDir, '1.2.3.4', file), 'utf8'), script);
			assert.strictEqual(fs.readFileSync(path.join(cacheDir, '1.2.3.4', `${file}.sha256`), 'utf8'), createHash('sha256').update(script).digest('hex'));
		}
	}));

	test('prefetching leaves no cache when it can\'t write every build script', () => withTempFile(destination => {
		const cacheDir = path.join(path.dirname(destination), 'cache');
		fs.mkdirSync(path.join(cacheDir, '1.2.3.4', 'third_party'), { recursive: true });
		fs.writeFileSync(path.join(cacheDir, '1.2.3.4', 'third_party', 'dpkg-shlibdeps'), 'not a folder');
		prefetchChromiumBuildFiles({ version: '1.2.3.4', token: 'secret', cacheDir, httpGet: () => ({ ok: true, body: Buffer.from(script) }) });
		assert.strictEqual(fs.existsSync(cacheDir), false);
	}));
});