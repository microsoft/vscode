/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { link, lstat, mkdir, mkdtemp, open, opendir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { measureWorktreeDiskUsage } from '../../node/worktreeDiskUsage.js';

suite('HostWorktreeDiskUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: string;

	setup(async () => {
		root = URI.file(await mkdtemp(join(tmpdir(), 'worktree-disk-usage-'))).fsPath;
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('sums allocated bytes including dependencies without following directory symlinks', async () => {
		await mkdir(join(root, 'node_modules'));
		await writeFile(join(root, 'README.md'), '12345');
		await writeFile(join(root, 'node_modules', 'package.json'), '1234567890');
		await symlink(root, join(root, 'node_modules', 'cycle'), 'junction');

		const stats = await Promise.all(['README.md', 'node_modules/package.json'].map(path => lstat(join(root, path), { bigint: true })));
		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(stats.reduce((total, stat) => total + stat.blocks * 512n, 0n)));
	});

	test('counts sparse-file allocation rather than apparent size', async () => {
		const path = join(root, 'sparse');
		const file = await open(path, 'w');
		try {
			await file.truncate(64 * 1024 * 1024);
		} finally {
			await file.close();
		}
		const stat = await lstat(path, { bigint: true });
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None);
		assert.strictEqual(size, Number(stat.blocks * 512n));
		if (!isWindows) {
			assert.ok(stat.blocks * 512n < stat.size);
		}
	});

	test('measures asar files and directories as ordinary filesystem entries', async () => {
		await mkdir(join(root, 'directory.asar'));
		await writeFile(join(root, 'directory.asar', 'file'), 'data');
		await writeFile(join(root, 'file.asar'), 'not an asar archive');

		// Run with the host bootstrap's ASAR-unaware fs mapping, which the test renderer does not install.
		await promisify(execFile)(process.execPath, [
			'--import', new URL('../../../../../bootstrap-esm.js', import.meta.url).href,
			'--input-type=module',
			'--eval', `
				import assert from 'assert';
				import { promises as fs } from 'fs';
				import { CancellationToken } from ${JSON.stringify(new URL('../../../../base/common/cancellation.js', import.meta.url).href)};
				import { URI } from ${JSON.stringify(new URL('../../../../base/common/uri.js', import.meta.url).href)};
				import { measureWorktreeDiskUsage } from ${JSON.stringify(new URL('../../node/worktreeDiskUsage.js', import.meta.url).href)};

				const root = ${JSON.stringify(root)};
				try {
					const paths = [root + '/directory.asar/file', root + '/file.asar'];
					const stats = await Promise.all(paths.map(path => fs.lstat(path, { bigint: true })));
					assert.deepStrictEqual(await Promise.all([root, root + '/directory.asar'].map(path =>
						measureWorktreeDiskUsage(URI.file(path), CancellationToken.None)
					)), [
						Number(stats.reduce((total, stat) => total + stat.blocks * 512n, 0n)),
						Number(stats[0].blocks * 512n),
					]);
				} finally {
					await fs.rm(root, { recursive: true, force: true });
				}
			`,
		], { env: { ...process.env, ELECTRON_RUN_AS_NODE: process.versions.electron ? '1' : undefined, VSCODE_DEV: '1' } });
	});

	test('counts internal hard links once and excludes links outside the measured worktree', async () => {
		await mkdir(join(root, 'nested'));
		await writeFile(join(root, 'original'), 'data'.repeat(2048));
		await link(join(root, 'original'), join(root, 'nested', 'linked'));
		const stat = await lstat(join(root, 'original'), { bigint: true });

		assert.deepStrictEqual(await Promise.all([root, join(root, 'nested')].map(path =>
			measureWorktreeDiskUsage(URI.file(path), CancellationToken.None)
		)), [Number(stat.blocks * 512n), 0]);
	});

	test('tracks hard links across file-stat batches', async () => {
		await writeFile(join(root, 'original'), 'data'.repeat(2048));
		await Promise.all(Array.from({ length: 24 }, (_, index) => link(join(root, 'original'), join(root, `linked-${index}`))));
		const stat = await lstat(join(root, 'original'), { bigint: true });

		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(stat.blocks * 512n));
	});

	test('preserves distinct 64-bit file identities when accounting for hard links', async () => {
		await Promise.all(['a', 'b', 'c', 'd'].map(name => writeFile(join(root, name), 'data')));
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path !== root) {
					const first = path.endsWith('a') || path.endsWith('b');
					Object.assign(stat, { ino: 2n ** 53n + (first ? 0n : 1n), nlink: 2n, blocks: first ? 1n : 2n });
				}
				return stat;
			},
		});

		assert.strictEqual(size, 1536);
	});

	test('does not traverse nested filesystems or count files on another volume', async () => {
		await mkdir(join(root, 'mounted'));
		await writeFile(join(root, 'mounted', 'file'), 'data');
		await writeFile(join(root, 'other-volume-file'), 'data');
		await writeFile(join(root, 'local'), 'data');
		const opened: string[] = [];
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir: async path => {
				opened.push(path);
				return opendir(path);
			},
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path === join(root, 'mounted') || path === join(root, 'other-volume-file')) {
					stat.dev++;
				}
				stat.blocks = 1n;
				return stat;
			},
		});

		assert.deepStrictEqual({ size, opened }, { size: 512, opened: [root] });
	});

	test('does not fall back to logical bytes when allocated blocks are zero', async () => {
		await writeFile(join(root, 'file'), 'data');
		const size = await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => Object.assign(await lstat(path, { bigint: true }), { blocks: 0n }),
		});

		assert.strictEqual(size, 0);
	});

	test('rejects unavailable allocation metadata and unsafe byte totals', async () => {
		await writeFile(join(root, 'file'), 'data');
		for (const blocks of [-1n, 2n ** 53n]) {
			await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
				opendir,
				lstat: async path => Object.assign(await lstat(path, { bigint: true }), { blocks }),
			}), blocks < 0n ? /Allocated file size is unavailable/ : /exceeds the supported byte range/);
		}
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
					return lstat(path, { bigint: true });
				}
				fileStats++;
				active++;
				maximum = Math.max(maximum, active);
				if (active === 8) {
					saturated.complete();
				}
				await gate.p;
				try {
					return await lstat(path, { bigint: true });
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
		const stat = await lstat(join(root, '0'), { bigint: true });
		assert.strictEqual(await measureWorktreeDiskUsage(URI.file(root), CancellationToken.None), Number(25n * stat.blocks * 512n));
	});

	test('drains sibling file stats before propagating a batch failure', async () => {
		await Promise.all(Array.from({ length: 9 }, (_, index) => writeFile(join(root, `${index}`), 'data')));
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		const denied = new Error('permission denied');
		let fileStats = 0;
		let active = 0;
		let settled = false;
		const measurement = measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async path => {
				if (path === root) {
					return lstat(path, { bigint: true });
				}
				fileStats++;
				if (fileStats === 1) {
					throw denied;
				}
				active++;
				if (fileStats === 8) {
					saturated.complete();
				}
				await gate.p;
				try {
					return await lstat(path, { bigint: true });
				} finally {
					active--;
				}
			},
		});
		const completed = measurement.then(() => { settled = true; }, () => { settled = true; });
		await saturated.p;
		await timeout(10);
		const beforeRelease = { settled, active, fileStats };
		gate.complete();
		await assert.rejects(measurement, error => error === denied);
		await completed;
		assert.deepStrictEqual({ beforeRelease, active, fileStats }, {
			beforeRelease: { settled: false, active: 7, fileStats: 8 }, active: 0, fileStats: 8,
		});
	});

	test('does not start I/O when already cancelled', async () => {
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.Cancelled), isCancellationError);
	});

	test('does not open a nested directory after cancellation during its volume check', async () => {
		await mkdir(join(root, 'nested'));
		const cancellation = disposables.add(new CancellationTokenSource());
		const opened: string[] = [];
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), cancellation.token, {
			opendir: async path => {
				opened.push(path);
				return opendir(path);
			},
			lstat: async path => {
				const stat = await lstat(path, { bigint: true });
				if (path !== root) {
					cancellation.cancel();
				}
				return stat;
			},
		}), isCancellationError);
		assert.deepStrictEqual(opened, [root]);
	});

	test('surfaces filesystem failures instead of returning a partial size', async () => {
		const denied = new Error('permission denied');
		await assert.rejects(measureWorktreeDiskUsage(URI.file(root), CancellationToken.None, {
			opendir,
			lstat: async () => { throw denied; },
		}), error => error === denied);
	});
});
