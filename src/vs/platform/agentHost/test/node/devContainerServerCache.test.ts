/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { chmod, lstat, mkdtemp, mkdir, readFile, readlink, readdir, rm, stat, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildCreateDevContainerCacheCommand, buildLinkDevContainerServerCacheCommand, canAddDevContainerServerCacheMount, getDevContainerCliCachePath, getDevContainerServerCachePath } from '../../node/devContainerServerCache.js';

suite('Dev Container server cache', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the product server folder and the container platform', () => {
		assert.deepStrictEqual([
			getDevContainerServerCachePath('.vscode-server-insiders', { os: 'linux', arch: 'arm64' }),
			getDevContainerServerCachePath('.vscode-server', { os: 'alpine', arch: 'x64' }),
			getDevContainerServerCachePath('.vscode-server-oss', { os: 'linux', arch: 'armhf' }),
			getDevContainerCliCachePath('.vscode-server-insiders', { os: 'linux', arch: 'arm64' }),
			getDevContainerCliCachePath('.vscode-server', { os: 'alpine', arch: 'x64' }),
		], [
			'/vscode/vscode-server-insiders/cli/servers/linux-arm64',
			'/vscode/vscode-server/cli/servers/alpine-x64',
			'/vscode/vscode-server-oss/cli/servers/linux-armhf',
			'/vscode/vscode-server-insiders/cli/bin/linux-arm64',
			'/vscode/vscode-server/cli/bin/alpine-x64',
		]);
	});

	test('rejects unsafe path and ownership arguments', () => {
		assert.throws(() => getDevContainerServerCachePath('../other', { os: 'linux', arch: 'x64' }));
		assert.throws(() => getDevContainerServerCachePath('..', { os: 'linux', arch: 'x64' }));
		assert.throws(() => getDevContainerServerCachePath('.vscode-server', { os: 'linux', arch: 'x64;false' }));
		assert.throws(() => buildCreateDevContainerCacheCommand('/vscode/../other', '1000', '1000'));
		assert.throws(() => buildCreateDevContainerCacheCommand('/vscode/cache', '1000;false', '1000'));
		assert.throws(() => buildCreateDevContainerCacheCommand('/tmp/cache', '1000', '1000'));
		assert.throws(() => buildCreateDevContainerCacheCommand('/tmp/cache', '1000', '1000', '/'));
		assert.throws(() => buildCreateDevContainerCacheCommand('/tmp/cache', '1000', '1000', '/tmp/..'));
	});

	(isLinux ? test : test.skip)('creates cache directories concurrently and preserves existing ownership', async () => {
		assert.ok(process.getuid && process.getgid);
		const uid = process.getuid();
		const gid = process.getgid();
		const root = await mkdtemp(join(tmpdir(), 'vscode-cache-creation-'));
		try {
			const parents = ['product', 'product/cli', 'product/cli/servers'].map(path => join(root, path));
			const cache = join(parents[2], 'linux-arm64');
			const run = (owner = uid) => promisify(execFile)('/bin/sh', ['-c', buildCreateDevContainerCacheCommand(cache, String(owner), String(gid), root)]);
			await Promise.all([run(), run(), run()]);
			const created = await stat(cache);
			await run(uid + 1);
			const existing = await stat(cache);
			assert.deepStrictEqual({
				created: { uid: created.uid, gid: created.gid, mode: created.mode & 0o777 },
				existing: { uid: existing.uid, gid: existing.gid, inode: existing.ino },
				parents: await Promise.all(parents.map(async path => (await stat(path)).isDirectory())),
			}, {
				created: { uid, gid, mode: 0o755 },
				existing: { uid, gid, inode: created.ino },
				parents: [true, true, true],
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	(isLinux ? test : test.skip)('cache directory creation rejects symlinked parents and cache directories', async () => {
		assert.ok(process.getuid && process.getgid);
		const uid = String(process.getuid());
		const gid = String(process.getgid());
		const root = await mkdtemp(join(tmpdir(), 'vscode-cache-creation-'));
		try {
			const outside = join(root, 'outside');
			const parent = join(root, 'product');
			const cache = join(parent, 'cli', 'servers', 'linux-arm64');
			const run = () => promisify(execFile)('/bin/sh', ['-c', buildCreateDevContainerCacheCommand(cache, uid, gid, root)]);
			await mkdir(outside);
			await symlink(outside, parent);
			await assert.rejects(run());
			await rm(parent);
			await mkdir(join(parent, 'cli', 'servers'), { recursive: true });
			await symlink(outside, cache);
			await assert.rejects(run());
			assert.deepStrictEqual({
				target: await readlink(cache),
				outsideEntries: await readdir(outside),
			}, { target: outside, outsideEntries: [] });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('only adds a mount when it will not conflict with configured mounts', () => {
		const canAdd = (configuration: object, mounts: readonly (string | { target: string })[] = []) => canAddDevContainerServerCacheMount(JSON.stringify({ configuration, mergedConfiguration: { mounts } }));
		assert.deepStrictEqual([
			canAdd({}),
			canAdd({}, ['type=volume,source=vscode,target=/vscode']),
			canAdd({}, [{ target: '/vscode' }]),
			canAdd({}, [{ target: '/vscode/other' }]),
			canAdd({ runArgs: ['-v', 'custom:/vscode:ro'] }),
			canAdd({ workspaceMount: 'type=bind,source=/workspace,target=/vscode' }),
			canAdd({ dockerComposeFile: 'compose.yml' }),
			canAdd({}, [{ target: '/vscode-other' }]),
		], [true, false, false, false, false, false, false, true]);
	});

	(isLinux ? test : test.skip)('shares extracted installs while leaving credentials private and supports concurrent setup', async () => {
		const root = await mkdtemp(join(tmpdir(), 'vscode-server-cache-'));
		try {
			const cache = join(root, 'shared cache');
			const homes = [join(root, 'first'), join(root, 'second')];
			await mkdir(cache);
			const run = async (home: string) => {
				await promisify(execFile)('/bin/sh', ['-c', buildLinkDevContainerServerCacheCommand('.vscode-server-insiders', cache)], { env: { ...process.env, HOME: home } });
			};
			await Promise.all(homes.map(home => mkdir(join(home, '.vscode-server-insiders', 'cli'), { recursive: true })));
			await Promise.all([run(homes[0]), run(homes[0]), run(homes[1])]);
			const cli = (home: string) => join(home, '.vscode-server-insiders', 'cli');
			await mkdir(join(cli(homes[0]), 'servers', 'Insiders-commit', 'server'), { recursive: true });
			await writeFile(join(cli(homes[0]), 'servers', 'Insiders-commit', 'server', 'product.json'), '{"commit":"commit"}');
			await writeFile(join(cli(homes[0]), 'token.json'), 'private');
			assert.deepStrictEqual({
				targets: await Promise.all(homes.map(home => readlink(join(cli(home), 'servers')))),
				product: await readFile(join(cli(homes[1]), 'servers', 'Insiders-commit', 'server', 'product.json'), 'utf8'),
				secondPrivateEntries: await readdir(cli(homes[1])),
				cacheEntries: await readdir(cache),
			}, {
				targets: [cache, cache],
				product: '{"commit":"commit"}',
				secondPrivateEntries: ['servers'],
				cacheEntries: ['Insiders-commit'],
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	(isLinux ? test : test.skip)('preserves existing private directories and different symlinks', async () => {
		const root = await mkdtemp(join(tmpdir(), 'vscode-server-cache-'));
		try {
			const cache = join(root, 'shared');
			const cli = join(root, '.vscode-server', 'cli');
			const servers = join(cli, 'servers');
			await mkdir(cache);
			await mkdir(servers, { recursive: true });
			await writeFile(join(servers, 'keep'), 'private');
			const run = () => promisify(execFile)('/bin/sh', ['-c', buildLinkDevContainerServerCacheCommand('.vscode-server', cache)], { env: { ...process.env, HOME: root } });
			await assert.rejects(run(), /Preserving existing private server cache/);
			assert.strictEqual(await readFile(join(servers, 'keep'), 'utf8'), 'private');
			await rm(servers, { recursive: true });
			await symlink(join(root, 'other-cache'), servers);
			await assert.rejects(run(), /Preserving existing servers symlink/);
			assert.strictEqual(await readlink(servers), join(root, 'other-cache'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	(isLinux ? test : test.skip)('removes only the same-target link when shared storage or metadata is unavailable', async () => {
		const root = await mkdtemp(join(tmpdir(), 'vscode-cache-fallback-'));
		try {
			const cache = join(root, 'shared');
			const cli = join(root, '.vscode-server', 'cli');
			const servers = join(cli, 'servers');
			const run = () => promisify(execFile)('/bin/sh', ['-c', buildLinkDevContainerServerCacheCommand('.vscode-server', cache)], { env: { ...process.env, HOME: root } });
			await mkdir(cli, { recursive: true });
			await symlink(cache, servers);
			await assert.rejects(run(), /Shared server cache is not writable/);
			await mkdir(servers);
			await writeFile(join(servers, 'private'), 'keep');
			await assert.rejects(run(), /Preserving existing private server cache/);
			assert.strictEqual(await readFile(join(servers, 'private'), 'utf8'), 'keep');
			await rm(servers, { recursive: true });
			await symlink(join(root, 'other'), servers);
			await assert.rejects(run(), /Preserving existing servers symlink/);
			assert.strictEqual(await readlink(servers), join(root, 'other'));
			await rm(servers);
			await mkdir(cache);
			await writeFile(join(cache, 'keep'), 'shared');
			for (const name of ['lru.json', '.locks']) {
				await symlink(cache, servers);
				await symlink(join(root, 'other'), join(cache, name));
				await assert.rejects(run(), /Shared server cache metadata is not writable/);
				await mkdir(servers);
				assert.deepStrictEqual({
					privateDirectory: (await lstat(servers)).isDirectory(),
					sharedData: await readFile(join(cache, 'keep'), 'utf8'),
				}, { privateDirectory: true, sharedData: 'shared' });
				await rm(servers, { recursive: true });
				await rm(join(cache, name));
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	(isLinux && process.getuid?.() !== 0 ? test : test.skip)('unwritable shared directories and metadata fall back to a writable private cache', async () => {
		const root = await mkdtemp(join(tmpdir(), 'vscode-cache-permissions-'));
		try {
			const cache = join(root, 'shared');
			const servers = join(root, '.vscode-server', 'cli', 'servers');
			const run = () => promisify(execFile)('/bin/sh', ['-c', buildLinkDevContainerServerCacheCommand('.vscode-server', cache)], { env: { ...process.env, HOME: root } });
			await mkdir(cache);
			await writeFile(join(cache, 'lru.json'), '[]');
			await mkdir(join(cache, '.locks'));
			for (const path of [cache, join(cache, 'lru.json'), join(cache, '.locks')]) {
				await run();
				await chmod(path, 0o555);
				try {
					await assert.rejects(run(), /Shared server cache.*is not writable/);
					await mkdir(servers);
					await writeFile(join(servers, 'private'), 'installed');
					assert.strictEqual(await readFile(join(servers, 'private'), 'utf8'), 'installed');
					await rm(servers, { recursive: true });
				} finally {
					await chmod(path, 0o755);
				}
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
