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
	requiredCoreLibraryNames,
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
		fs.mkdirSync(join(overrideDir, 'prebuilds', key), { recursive: true });
		fs.writeFileSync(join(overrideDir, 'prebuilds', key, 'foundry_local_napi.node'), 'addon');
		const coreDir = join(overrideDir, 'foundry-local-core', key);
		fs.mkdirSync(coreDir, { recursive: true });
		for (const name of requiredCoreLibraryNames()) {
			fs.writeFileSync(join(coreDir, name), 'lib');
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

	test('isRuntimeProvisioned: false when one core library is missing (partial cache)', () => {
		writePayload(testDir, platformKey);
		writeMarker(testDir, platformKey);
		fs.rmSync(join(testDir, 'foundry-local-core', platformKey, requiredCoreLibraryNames()[0]));
		assert.strictEqual(isRuntimeProvisioned(testDir, platformKey), false);
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
	 * matches what `provisionRuntime` extracts and verifies. Set `omitCoreLib`
	 * to leave one required core library out (an incomplete/corrupt payload).
	 */
	async function makeTarball(key: string, opts?: { omitCoreLib?: boolean }): Promise<string> {
		const src = join(testDir, `src-${key}`);
		fs.mkdirSync(join(src, 'prebuilds', key), { recursive: true });
		fs.writeFileSync(join(src, 'prebuilds', key, 'foundry_local_napi.node'), 'addon');
		const coreDir = join(src, 'foundry-local-core', key);
		fs.mkdirSync(coreDir, { recursive: true });
		const libs = requiredCoreLibraryNames();
		for (const name of opts?.omitCoreLib ? libs.slice(1) : libs) {
			fs.writeFileSync(join(coreDir, name), 'lib');
		}
		const tgz = join(testDir, `${key}.tgz`);
		await tar.c({ file: tgz, cwd: src, gzip: true }, ['prebuilds', 'foundry-local-core']);
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
			assert.strictEqual(fs.existsSync(join(overrideDir, 'prebuilds', platformKey, 'foundry_local_napi.node')), true);
			for (const name of requiredCoreLibraryNames()) {
				assert.strictEqual(fs.existsSync(join(overrideDir, 'foundry-local-core', platformKey, name)), true);
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

	test('provisionRuntime: rejects an incomplete payload (missing core library) and writes no marker', async () => {
		const tgz = await makeTarball(platformKey, { omitCoreLib: true });
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
