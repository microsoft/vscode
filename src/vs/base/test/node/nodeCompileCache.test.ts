/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from '../../common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

// The compile-cache APIs are not available in the Electron renderer test runtime.
(process.versions.electron ? suite.skip : suite)('Node compile cache readiness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let cache: typeof import('../../node/nodeCompileCache.js');
	let root: string;
	let previousRoot: string | undefined;

	setup(async () => {
		cache = await import('../../node/nodeCompileCache.js');
		const buildDirectory = join(process.cwd(), '.build');
		await mkdir(buildDirectory, { recursive: true });
		root = await mkdtemp(join(buildDirectory, 'node-compile-cache-'));
		previousRoot = process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'];
		process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = root;
	});

	teardown(async () => {
		if (previousRoot === undefined) {
			delete process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'];
		} else {
			process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = previousRoot;
		}
		await rm(root, { recursive: true, force: true });
	});

	async function markReady(kind: typeof cache.nodeCompileCacheKinds[number]): Promise<void> {
		await mkdir(join(root, kind), { recursive: true });
		await writeFile(join(root, kind, '.ready'), '');
	}

	test('completes when all process markers already exist', async () => {
		await Promise.all(cache.nodeCompileCacheKinds.map(kind => markReady(kind)));
		await cache.waitForNodeCompileCacheReady();
	});

	test('waits for a missing process marker', async () => {
		const lastKind = cache.nodeCompileCacheKinds.at(-1)!;
		await Promise.all(cache.nodeCompileCacheKinds.filter(kind => kind !== lastKind).map(kind => markReady(kind)));
		let completed = false;
		const pending = cache.waitForNodeCompileCacheReady().then(() => { completed = true; });
		await new Promise<void>(resolve => setImmediate(resolve));
		const completedBeforeLastMarker = completed;
		try {
			await markReady(lastKind);
			await pending;
			assert.deepStrictEqual({ completedBeforeLastMarker, completed }, { completedBeforeLastMarker: false, completed: true });
		} finally {
			await markReady(lastKind);
			await pending;
		}
	});
});
