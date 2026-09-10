/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import * as tar from 'tar';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { join } from '../../../../base/common/path.js';
import { Promises } from '../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import {
	FOUNDRY_LOCAL_SUPPORTED_PLATFORMS,
	foundryLocalPlatformKey,
	isFoundryLocalRuntimeSupported,
	isRuntimeProvisioned,
	promoteDir,
	provisionRuntime,
	requiredRuntimeFileNames,
	resolveProxyUrl,
} from '../../node/foundryLocalRuntime.js';

flakySuite('FoundryLocalRuntime', () => {

	let testDir: string;
	const platformKey = 'linux-x64'; // arbitrary; the cache layout is platform-key agnostic

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'foundry-runtime');
		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => Promises.rm(testDir));

	function writePayload(overrideDir: string, key: string): void {
		const targetDir = join(overrideDir, 'prebuilds', key);
		fs.mkdirSync(targetDir, { recursive: true });
		for (const name of requiredRuntimeFileNames(key)) {
			fs.writeFileSync(join(targetDir, name), 'native');
		}
	}

	function writeMarker(overrideDir: string, key: string): void {
		fs.writeFileSync(join(overrideDir, `.complete-${key}`), '1.2.3\n');
	}

	test('platform key reflects the supported-platform set', () => {
		const expected = FOUNDRY_LOCAL_SUPPORTED_PLATFORMS.has(`${process.platform}-${process.arch}`);
		assert.strictEqual(isFoundryLocalRuntimeSupported(), expected);
		assert.strictEqual(foundryLocalPlatformKey() !== undefined, expected);
	});

	test('isRuntimeProvisioned: false when nothing is present', () => {
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), false);
	});

	test('isRuntimeProvisioned: true only when marker AND payload are present (cache hit)', () => {
		writePayload(testDir, platformKey);
		writeMarker(testDir, platformKey);
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), true);
	});

	test('isRuntimeProvisioned: false when marker present but payload missing (partial cache)', () => {
		writeMarker(testDir, platformKey);
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), false);
	});

	test('isRuntimeProvisioned: false when one shared library is missing (partial cache)', () => {
		writePayload(testDir, platformKey);
		writeMarker(testDir, platformKey);
		fs.rmSync(join(testDir, 'prebuilds', platformKey, 'libonnxruntime-genai.so'));
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), false);
	});

	test('requiredRuntimeFileNames: includes only shared libraries', () => {
		assert.deepStrictEqual({
			linux: requiredRuntimeFileNames('linux-x64'),
			darwin: requiredRuntimeFileNames('darwin-arm64'),
			win32: requiredRuntimeFileNames('win32-x64'),
		}, {
			linux: ['libfoundry_local.so', 'libonnxruntime.so.1', 'libonnxruntime-genai.so'],
			darwin: ['libfoundry_local.dylib', 'libonnxruntime.1.dylib', 'libonnxruntime-genai.dylib'],
			win32: ['foundry_local.dll', 'onnxruntime.dll', 'onnxruntime-genai.dll'],
		});
	});

	test('isRuntimeProvisioned: a different arch marker does not satisfy this arch', () => {
		// A first run for another architecture wrote its marker + payload; this
		// arch has neither and must not be considered provisioned.
		writePayload(testDir, 'win32-x64');
		writeMarker(testDir, 'win32-x64');
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), false);
	});

	test('promoteDir: moves a staged dir into place', async () => {
		const from = join(testDir, 'staging', 'payload');
		fs.mkdirSync(from, { recursive: true });
		fs.writeFileSync(join(from, 'file'), 'data');
		const to = join(testDir, 'final', 'payload');

		await promoteDir(from, to);

		assert.strictEqual(fs.existsSync(join(to, 'file')), true);
		assert.strictEqual(fs.existsSync(from), false);
	});

	test('promoteDir: keeps the existing copy when a concurrent winner already promoted', async () => {
		const to = join(testDir, 'final', 'payload');
		fs.mkdirSync(to, { recursive: true });
		fs.writeFileSync(join(to, 'file'), 'winner');

		const from = join(testDir, 'staging', 'payload');
		fs.mkdirSync(from, { recursive: true });
		fs.writeFileSync(join(from, 'file'), 'loser');

		// Loser's promote must not clobber the winner and must not throw.
		await promoteDir(from, to);

		assert.strictEqual(fs.readFileSync(join(to, 'file'), 'utf8'), 'winner');
	});

	test('resolveProxyUrl: honors scheme-specific vars, ALL_PROXY fallback, and NO_PROXY', () => {
		const actual = {
			none: resolveProxyUrl('https://api.nuget.org/', {}),
			httpsForHttps: resolveProxyUrl('https://api.nuget.org/', { HTTPS_PROXY: 'http://proxy:8080' }),
			httpForHttp: resolveProxyUrl('http://example.com/', { HTTP_PROXY: 'http://proxy:8080', HTTPS_PROXY: 'http://secure:8080' }),
			lowercase: resolveProxyUrl('https://api.nuget.org/', { https_proxy: 'http://proxy:8080' }),
			allProxyFallback: resolveProxyUrl('https://api.nuget.org/', { ALL_PROXY: 'http://proxy:8080' }),
			httpsIgnoresHttpProxy: resolveProxyUrl('https://api.nuget.org/', { HTTP_PROXY: 'http://proxy:8080' }),
			noProxyExact: resolveProxyUrl('https://api.nuget.org/', { HTTPS_PROXY: 'http://proxy:8080', NO_PROXY: 'api.nuget.org' }),
			noProxySuffix: resolveProxyUrl('https://api.nuget.org/', { HTTPS_PROXY: 'http://proxy:8080', NO_PROXY: '.nuget.org' }),
			noProxyWildcard: resolveProxyUrl('https://api.nuget.org/', { HTTPS_PROXY: 'http://proxy:8080', NO_PROXY: '*' }),
			noProxyMiss: resolveProxyUrl('https://api.nuget.org/', { HTTPS_PROXY: 'http://proxy:8080', NO_PROXY: 'example.com' }),
			invalidUrl: resolveProxyUrl('not a url', { HTTPS_PROXY: 'http://proxy:8080' }),
		};

		assert.deepStrictEqual(actual, {
			none: undefined,
			httpsForHttps: 'http://proxy:8080',
			httpForHttp: 'http://proxy:8080',
			lowercase: 'http://proxy:8080',
			allProxyFallback: 'http://proxy:8080',
			httpsIgnoresHttpProxy: undefined,
			noProxyExact: undefined,
			noProxySuffix: undefined,
			noProxyWildcard: undefined,
			noProxyMiss: 'http://proxy:8080',
			invalidUrl: undefined,
		});
	});

	// --- provisionRuntime: download + {target} substitution + extract + verify ---

	/**
	 * Build a runtime tarball fixture (`<target>.tgz`) whose internal layout
	 * matches what `provisionRuntime` extracts and verifies. Set
	 * `omitRuntimeFile` to leave one required file out.
	 */
	async function makeTarball(key: string, opts?: { omitRuntimeFile?: string }): Promise<string> {
		const src = join(testDir, `src-${key}`);
		const targetDir = join(src, 'prebuilds', key);
		fs.mkdirSync(targetDir, { recursive: true });
		for (const name of requiredRuntimeFileNames(key)) {
			if (name !== opts?.omitRuntimeFile) {
				fs.writeFileSync(join(targetDir, name), 'native');
			}
		}
		const tgz = join(testDir, `${key}.tgz`);
		await tar.c({ file: tgz, cwd: src, gzip: true }, ['prebuilds']);
		return tgz;
	}

	/**
	 * Serve `/<name>` → the file at `files[name]` (200), everything else 404.
	 * Records requested paths so `{target}` substitution can be asserted.
	 */
	async function startServer(files: Record<string, string>): Promise<{ url: string; requested: string[]; dispose: () => Promise<void> }> {
		const http = await import('http');
		const requested: string[] = [];
		const server = http.createServer((req, res) => {
			const name = (req.url ?? '').replace(/^\//, '');
			requested.push(name);
			const file = files[name];
			if (!file || !fs.existsSync(file)) {
				res.statusCode = 404;
				res.end('not found');
				return;
			}
			res.statusCode = 200;
			fs.createReadStream(file).pipe(res);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as AddressInfo).port;
		return {
			url: `http://127.0.0.1:${port}`,
			requested,
			dispose: () => new Promise<void>(resolve => server.close(() => resolve())),
		};
	}

	test('provisionRuntime: substitutes {target}, extracts the expected layout, writes the marker', async () => {
		const tgz = await makeTarball(platformKey);
		const server = await startServer({ [`${platformKey}.tgz`]: tgz });
		try {
			const overrideDir = join(testDir, '1.2.3');
			await provisionRuntime(overrideDir, platformKey, `${server.url}/{target}.tgz`, '1.2.3', CancellationToken.None);

			// {target} was substituted with the platform key in the request URL.
			assert.deepStrictEqual(server.requested, [`${platformKey}.tgz`]);
			// Payload extracted into the cache layout + completion marker written.
			for (const name of requiredRuntimeFileNames(platformKey)) {
				assert.strictEqual(fs.existsSync(join(overrideDir, 'prebuilds', platformKey, name)), true);
			}
			assert.strictEqual(isRuntimeProvisioned(overrideDir, platformKey), true);
		} finally {
			await server.dispose();
		}
	});

	test('provisionRuntime: rejects and writes no marker when the download 404s', async () => {
		const server = await startServer({});
		try {
			const overrideDir = join(testDir, '1.2.3');
			await assert.rejects(
				provisionRuntime(overrideDir, platformKey, `${server.url}/{target}.tgz`, '1.2.3', CancellationToken.None),
				/status 404/,
			);
			assert.strictEqual(isRuntimeProvisioned(overrideDir, platformKey), false);
		} finally {
			await server.dispose();
		}
	});

	test('provisionRuntime: rejects an incomplete payload and writes no marker', async () => {
		const tgz = await makeTarball(platformKey, { omitRuntimeFile: 'libfoundry_local.so' });
		const server = await startServer({ [`${platformKey}.tgz`]: tgz });
		try {
			const overrideDir = join(testDir, '1.2.3');
			await assert.rejects(
				provisionRuntime(overrideDir, platformKey, `${server.url}/{target}.tgz`, '1.2.3', CancellationToken.None),
				/expected files are missing/,
			);
			assert.strictEqual(isRuntimeProvisioned(overrideDir, platformKey), false);
		} finally {
			await server.dispose();
		}
	});
});
