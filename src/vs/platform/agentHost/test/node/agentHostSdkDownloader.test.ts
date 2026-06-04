/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostSdkDownloader, IResolvedPlatform } from '../../node/agentHostSdkDownloader.js';

suite('AgentHostSdkDownloader', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const darwinArm64: IResolvedPlatform = { os: 'darwin', arch: 'arm64', isAlpine: false };

	let tempDir: string;

	setup(async () => {
		tempDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent-host-sdk-test-'));
	});

	teardown(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	function sha256(content: string): string {
		return createHash('sha256').update(content).digest('hex');
	}

	function makeProduct(overrides: Partial<IProductConfiguration>): IProductConfiguration {
		return {
			version: '1.0.0',
			quality: 'insider',
			downloadUrl: 'https://example.test/dbazure/download',
			...overrides,
		} as IProductConfiguration;
	}

	test('returns undefined when SDK is not pinned (OSS/dev)', async () => {
		const downloader = new AgentHostSdkDownloader(makeProduct({ agentHostSdks: undefined }), tempDir, logService, { platform: darwinArm64 });
		assert.strictEqual(await downloader.resolve('codex'), undefined);
	});

	test('returns undefined when downloadUrl is empty (OSS build)', async () => {
		const product = makeProduct({ downloadUrl: '', agentHostSdks: { codex: { version: '1.2.3', platforms: { 'darwin-arm64': { file: 'f.zip', sha256: 'abc' } } } } });
		const downloader = new AgentHostSdkDownloader(product, tempDir, logService, { platform: darwinArm64 });
		assert.strictEqual(await downloader.resolve('codex'), undefined);
	});

	test('returns undefined when no asset matches the platform', async () => {
		const product = makeProduct({ agentHostSdks: { codex: { version: '1.2.3', platforms: { 'linux-x64': { file: 'f.zip', sha256: 'abc' } } } } });
		const downloader = new AgentHostSdkDownloader(product, tempDir, logService, { platform: darwinArm64 });
		assert.strictEqual(await downloader.resolve('codex'), undefined);
	});

	test('returns undefined on checksum mismatch', async () => {
		const product = makeProduct({ agentHostSdks: { codex: { version: '1.2.3', platforms: { 'darwin-arm64': { file: 'codex.zip', sha256: 'deadbeef' } } } } });
		const downloader = new AgentHostSdkDownloader(product, tempDir, logService, {
			platform: darwinArm64,
			download: async (_url, dest) => { await fs.promises.writeFile(dest, 'payload'); },
			extractZip: async () => { throw new Error('should not extract on checksum failure'); },
		});
		assert.strictEqual(await downloader.resolve('codex'), undefined);
	});

	test('downloads, verifies, extracts and returns the codex entry path; second resolve is cached', async () => {
		const payload = 'codex-archive-bytes';
		const product = makeProduct({ agentHostSdks: { codex: { version: '1.2.3', platforms: { 'darwin-arm64': { file: 'codex-darwin-arm64-1.2.3.zip', sha256: sha256(payload) } } } } });

		let downloadUrl: string | undefined;
		let downloadCount = 0;
		const downloader = new AgentHostSdkDownloader(product, tempDir, logService, {
			platform: darwinArm64,
			download: async (url, dest) => {
				downloadUrl = url;
				downloadCount++;
				await fs.promises.writeFile(dest, payload);
			},
			extractZip: async (_archive, targetDir) => {
				await fs.promises.mkdir(join(targetDir, 'bin'), { recursive: true });
				await fs.promises.writeFile(join(targetDir, 'bin', 'codex'), '#!/bin/sh\n');
				await fs.promises.writeFile(join(targetDir, 'agent-host-sdk.json'), JSON.stringify({ kind: 'codex', version: '1.2.3', exec: 'bin/codex' }));
			},
		});

		const resolved = await downloader.resolve('codex', CancellationToken.None);
		assert.strictEqual(downloadUrl, 'https://example.test/dbazure/download/insider/agent-host-sdks/codex-darwin-arm64-1.2.3.zip');
		assert.ok(resolved && resolved.endsWith(join('1.2.3', 'bin', 'codex')), `unexpected path: ${resolved}`);
		assert.ok(fs.existsSync(resolved!), 'entry path should exist on disk');

		// Second resolve uses the on-disk cache (no extra download).
		const again = await downloader.resolve('codex', CancellationToken.None);
		assert.strictEqual(again, resolved);
		assert.strictEqual(downloadCount, 1, 'cached resolve must not re-download');
	});

	test('returns the claude package root from the manifest', async () => {
		const payload = 'claude-archive-bytes';
		const product = makeProduct({ agentHostSdks: { claude: { version: '0.2.0', platforms: { 'darwin-arm64': { file: 'claude.zip', sha256: sha256(payload) } } } } });
		const downloader = new AgentHostSdkDownloader(product, tempDir, logService, {
			platform: darwinArm64,
			download: async (_url, dest) => { await fs.promises.writeFile(dest, payload); },
			extractZip: async (_archive, targetDir) => {
				await fs.promises.mkdir(join(targetDir, 'package'), { recursive: true });
				await fs.promises.writeFile(join(targetDir, 'package', 'sdk.mjs'), '');
				await fs.promises.writeFile(join(targetDir, 'agent-host-sdk.json'), JSON.stringify({ kind: 'claude', version: '0.2.0', packageRoot: 'package' }));
			},
		});
		const resolved = await downloader.resolve('claude', CancellationToken.None);
		assert.ok(resolved && resolved.endsWith(join('0.2.0', 'package')), `unexpected path: ${resolved}`);
	});

	test('maps alpine/linux/win platforms to the right asset key', async () => {
		const payload = 'x';
		const mk = (platform: IResolvedPlatform, key: string) => new AgentHostSdkDownloader(
			makeProduct({ agentHostSdks: { codex: { version: '1', platforms: { [key]: { file: 'f.zip', sha256: sha256(payload) } } } } }),
			tempDir, logService,
			{
				platform,
				download: async (_u, dest) => { await fs.promises.writeFile(dest, payload); },
				extractZip: async (_a, dir) => { await fs.promises.writeFile(join(dir, 'agent-host-sdk.json'), JSON.stringify({ kind: 'codex', version: '1', exec: 'agent-host-sdk.json' })); },
			});

		assert.ok(await mk({ os: 'linux', arch: 'x64', isAlpine: true }, 'alpine-x64').resolve('codex'));
		assert.ok(await mk({ os: 'linux', arch: 'arm', isAlpine: false }, 'linux-armhf').resolve('codex'));
		assert.ok(await mk({ os: 'win32', arch: 'arm64', isAlpine: false }, 'win32-arm64').resolve('codex'));
	});
});
