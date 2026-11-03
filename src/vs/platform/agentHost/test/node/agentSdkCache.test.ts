/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fsp from 'fs/promises';
import * as os from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { removeUnusedAgentSdkVersions } from '../../node/agentSdkCache.js';

const DAY_MS = 24 * 60 * 60 * 1000;

suite('removeUnusedAgentSdkVersions', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	let cacheRoot: string;

	setup(async () => {
		cacheRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sdk-cache-'));
	});

	teardown(async () => {
		await fsp.rm(cacheRoot, { recursive: true, force: true });
	});

	/** Creates a cache entry and marks it and its version dir as last used `ageDays` ago. */
	async function cacheEntry(relativePath: string, ageDays: number, complete: boolean): Promise<void> {
		const dir = path.join(cacheRoot, relativePath);
		await fsp.mkdir(dir, { recursive: true });
		await fsp.writeFile(path.join(dir, 'sdk.mjs'), '');
		const time = new Date(Date.now() - ageDays * DAY_MS);
		if (complete) {
			await fsp.writeFile(path.join(dir, '.complete'), '');
			await fsp.utimes(path.join(dir, '.complete'), time, time);
		}
		await fsp.utimes(dir, time, time);
		await fsp.utimes(path.dirname(dir), time, time);
	}

	test('keeps the requested version and versions used or being downloaded within a week', async () => {
		await cacheEntry('claude/1.0.0/linux-x64', 30, true); // requested, but unused for a month
		await cacheEntry('claude/1.0.0/darwin-arm64', 30, true); // another target of the requested version
		await cacheEntry('claude/1.0.0/linux-x64.tmp.1', 2, false); // interrupted download
		await cacheEntry('claude/1.0.0/linux-x64.tmp.2', 0, false); // download in progress
		await cacheEntry('claude/0.9.0/linux-x64', 8, true); // no use for over a week
		await cacheEntry('claude/0.9.5/linux-x64', 6, true); // used by another process this week
		await cacheEntry('claude/0.9.5/linux-x64.tmp.5', 2, false); // interrupted download of a kept old version
		await cacheEntry('claude/0.9.6/linux-x64.tmp.3', 8, false); // interrupted download of an old version
		await cacheEntry('claude/0.9.7/linux-x64', 8, true); // old target, while another process
		await cacheEntry('claude/0.9.7/darwin-arm64.tmp.4', 0, false); // downloads a new one
		await cacheEntry('claude/0.8.0.42.deleting/linux-x64', 0, false); // left by an interrupted removal
		await cacheEntry('codex/0.1.0/linux-x64', 8, true); // SDK the product doesn't request

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(new NullLogService()))));
		await removeUnusedAgentSdkVersions(URI.file(cacheRoot), { claude: { version: '1.0.0', urlTemplate: '' } }, fileService, new NullLogService());

		const remaining: string[] = [];
		for (const packageId of await fsp.readdir(cacheRoot)) {
			for (const version of await fsp.readdir(path.join(cacheRoot, packageId))) {
				for (const entry of await fsp.readdir(path.join(cacheRoot, packageId, version))) {
					remaining.push(`${packageId}/${version}/${entry}`);
				}
			}
		}
		assert.deepStrictEqual(remaining.sort(), [
			'claude/0.9.5/linux-x64',
			'claude/0.9.7/darwin-arm64.tmp.4',
			'claude/0.9.7/linux-x64',
			'claude/1.0.0/darwin-arm64',
			'claude/1.0.0/linux-x64',
			'claude/1.0.0/linux-x64.tmp.2',
		]);
	});
});
