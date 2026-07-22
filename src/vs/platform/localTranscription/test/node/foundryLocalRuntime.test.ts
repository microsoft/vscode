/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
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
});
