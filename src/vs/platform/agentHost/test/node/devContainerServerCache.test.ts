/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, mkdir, readFile, readlink, readdir, rm, symlink, writeFile } from 'fs/promises';
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
});
