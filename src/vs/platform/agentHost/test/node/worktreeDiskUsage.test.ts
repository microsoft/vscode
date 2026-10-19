/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { lstat, mkdir, mkdtemp, opendir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { measureWorktreeDiskUsage } from '../../node/worktreeDiskUsage.js';

suite('HostWorktreeDiskUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: string;

	setup(async () => {
		root = await mkdtemp(join(tmpdir(), 'worktree-disk-usage-'));
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('sums nested regular files including dependencies without following directory symlinks', async () => {
		await mkdir(join(root, 'node_modules'));
		await writeFile(join(root, 'README.md'), '12345');
		await writeFile(join(root, 'node_modules', 'package.json'), '1234567890');
		await symlink(root, join(root, 'node_modules', 'cycle'), 'junction');

		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), 15);
	});

	test('returns undefined for missing roots, files and symlink roots', async () => {
		await writeFile(join(root, 'file'), 'data');
		await symlink(root, join(root, 'link'), 'junction');
		assert.deepStrictEqual(await Promise.all(['missing', 'file', 'link'].map(name =>
			measureWorktreeDiskUsage(URI.file(join(root, name)), CancellationToken.None)
		)), [undefined, undefined, undefined]);
	});

	test('bounds file stat concurrency to eight and stops scheduling after cancellation', async () => {
		await Promise.all(Array.from({ length: 25 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		const cancellation = disposables.add(new CancellationTokenSource());
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		let active = 0;
		let maximum = 0;
		let fileStats = 0;
		const measurement = measureWorktreeDiskUsage(URI.file(root), cancellation.token, {
			opendir,
			lstat: async path => {
				if (path === root) {
					return lstat(path);
				}
				fileStats++;
				active++;
				maximum = Math.max(maximum, active);
				if (active === 8) {
					saturated.complete();
				}
				await gate.p;
				try {
					return await lstat(path);
				} finally {
					active--;
				}
			},
		});
		await saturated.p;
		cancellation.cancel();
		gate.complete();
		await assert.rejects(measurement, isCancellationError);
		assert.deepStrictEqual({ maximum, fileStats, active }, { maximum: 8, fileStats: 8, active: 0 });
	});

	test('sums more than one batch of file stats', async () => {
		await Promise.all(Array.from({ length: 25 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), 100);
	});

	test('does not start I/O when already cancelled', async () => {
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.Cancelled), isCancellationError);
	});

	test('surfaces filesystem failures instead of returning a partial size', async () => {
		const denied = new Error('permission denied');
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async () => { throw denied; },
		}), error => error === denied);
	});
});
