/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildInstallRemoteCliFromCacheCommand } from '../../node/remoteAgentHostCliCache.js';
import { shellEscape } from '../../node/sshRemoteAgentHostHelpers.js';

const exec = promisify(execFile);
const commit = 'a'.repeat(40);
const folder = '.vscode-server-insiders';
const archive = 'code-insiders';

suite('Remote Agent Host CLI cache commands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects invalid cache keys and paths', () => {
		assert.throws(() => buildInstallRemoteCliFromCacheCommand('relative', folder, 'insider', commit, 'url'));
		assert.throws(() => buildInstallRemoteCliFromCacheCommand('/cache/../elsewhere', folder, 'insider', commit, 'url'));
		assert.throws(() => buildInstallRemoteCliFromCacheCommand('/cache', folder, '../insider', commit, 'url'));
		assert.throws(() => buildInstallRemoteCliFromCacheCommand('/cache', folder, 'insider', 'latest', 'url'));
	});
});

(isLinux ? suite : suite.skip)('Remote Agent Host CLI cache shell', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let root: string;
	let cache: string;
	let tools: string;

	setup(async () => {
		root = await mkdtemp(join(tmpdir(), 'vscode-cli-cache-'));
		cache = join(root, 'shared cache');
		tools = join(root, 'tools');
		await mkdir(cache);
		await mkdir(tools);
		await writeFile(join(tools, 'curl'), [
			'#!/bin/sh',
			'set -eu',
			'printf "download\\n" >> "$TEST_DOWNLOADS"',
			'test "$3" = "-o"',
			'if [ "${TEST_FAIL_DOWNLOAD:-}" = "yes" ]; then echo "download failed" >&2; exit 22; fi',
			'cp "$TEST_ARCHIVE" "$4"',
		].join('\n'), { mode: 0o755 });
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	async function createArchive(version = commit): Promise<string> {
		const content = await mkdtemp(join(root, 'content-'));
		await writeFile(join(content, archive), `#!/bin/sh\nprintf '%s\\n' 'code 1.0.0 (commit ${version})'\n`, { mode: 0o755 });
		const result = `${content}.tar.gz`;
		await exec('tar', ['czf', result, '-C', content, archive]);
		return result;
	}

	function run(home: string, tarball: string, version = commit, env: NodeJS.ProcessEnv = {}, prefix = '') {
		return exec('/bin/sh', ['-c', prefix + buildInstallRemoteCliFromCacheCommand(cache, folder, 'insider', version, 'https://example.invalid/cli')], {
			env: { ...process.env, HOME: home, PATH: `${tools}:${process.env.PATH}`, TEST_ARCHIVE: tarball, TEST_DOWNLOADS: join(root, 'downloads'), ...env },
		});
	}

	const privateBin = (home: string, version = commit) => join(home, folder, `${archive}-${version}`);
	const cachedBin = (directory: string, version = commit) => join(directory, `insider-${version}`, archive);

	test('concurrent cold installs download once and produce independent private copies', async () => {
		const tarball = await createArchive();
		const homes = [join(root, 'first'), join(root, 'second')];
		await Promise.all(homes.map(home => run(home, tarball)));
		const bins = [cachedBin(cache), ...homes.map(home => privateBin(home))];
		const inodes = await Promise.all(bins.map(async bin => (await stat(bin)).ino));
		await writeFile(privateBin(homes[0]), 'updated privately');
		const original = await readFile(cachedBin(cache), 'utf8');
		await rm(join(cache, `insider-${commit}`), { recursive: true });
		assert.deepStrictEqual({
			downloads: await readFile(join(root, 'downloads'), 'utf8'),
			distinctInodes: new Set(inodes).size,
			unaffectedCopy: await readFile(privateBin(homes[1]), 'utf8'),
			leftovers: (await readdir(cache)).filter(name => name.endsWith('.staging')),
			privateEntries: await readdir(join(homes[0], folder)),
		}, {
			downloads: 'download\n',
			distinctInodes: 3,
			unaffectedCopy: original,
			leftovers: [],
			privateEntries: [`${archive}-${commit}`],
		});
	});

	test('a warm cache does not invoke the downloader', async () => {
		const tarball = await createArchive();
		await run(join(root, 'first'), tarball);
		await run(join(root, 'second'), tarball, commit, { TEST_FAIL_DOWNLOAD: 'yes' });
		assert.strictEqual(await readFile(join(root, 'downloads'), 'utf8'), 'download\n');
	});

	test('failed downloads and invalid executables are never published and can be retried', async () => {
		const home = join(root, 'home');
		const tarball = await createArchive();
		await assert.rejects(run(home, tarball, commit, { TEST_FAIL_DOWNLOAD: 'yes' }), /download failed/);
		await assert.rejects(run(home, await createArchive('b'.repeat(40))), /does not match the requested commit/);
		assert.deepStrictEqual(await readdir(cache), ['.locks']);
		await run(home, tarball);
		assert.strictEqual(await readFile(join(root, 'downloads'), 'utf8'), 'download\ndownload\ndownload\n');
	});

	test('recovers staging left by an interrupted owner without leaving stale locks', async () => {
		const staging = join(cache, `.insider-${commit}.staging`);
		await mkdir(join(cache, '.locks'));
		await mkdir(staging);
		await writeFile(join(staging, 'partial'), 'incomplete');
		await exec('/bin/sh', ['-c', 'exec 9>"$1"; flock 9', 'sh', join(cache, '.locks', `insider-${commit}`)]);
		await run(join(root, 'home'), await createArchive());
		assert.deepStrictEqual((await readdir(cache)).sort(), ['.locks', `insider-${commit}`]);
	});

	test('rejects redirected entries and rejects a cached executable with a different commit', async () => {
		const other = join(root, 'other');
		await mkdir(other);
		await symlink(other, join(cache, `insider-${commit}`));
		await assert.rejects(run(join(root, 'home'), await createArchive()));
		await rm(join(cache, `insider-${commit}`));
		await run(join(root, 'first'), await createArchive());
		await writeFile(cachedBin(cache), '#!/bin/sh\necho wrong-commit\n');
		await assert.rejects(run(join(root, 'second'), await createArchive()), /Cached CLI does not match/);
		assert.deepStrictEqual(await readdir(other), []);
	});

	test('retention removes old cache entries without affecting installed copies', async () => {
		const home = join(root, 'home');
		for (let index = 0; index < 6; index++) {
			const version = index.toString().repeat(40);
			await run(home, await createArchive(version), version);
			await utimes(join(cache, `insider-${version}`), index + 1, index + 1);
		}
		assert.deepStrictEqual({
			cached: (await readdir(cache)).filter(name => name.startsWith('insider-')).length,
			private: (await readdir(join(home, folder))).length,
			firstCopy: (await exec(privateBin(home, '0'.repeat(40)), ['--version'])).stdout.trim(),
		}, {
			cached: 5,
			private: 6,
			firstCopy: `code 1.0.0 (commit ${'0'.repeat(40)})`,
		});
	});

	test('retention skips an entry locked by another installer', async () => {
		const home = join(root, 'home');
		for (let index = 0; index < 5; index++) {
			const version = index.toString().repeat(40);
			await run(home, await createArchive(version), version);
			await utimes(join(cache, `insider-${version}`), index + 1, index + 1);
		}
		const lockedVersion = '0'.repeat(40);
		const lock = shellEscape(join(cache, '.locks', `insider-${lockedVersion}`));
		const prefix = `exec 8>${lock}\nflock 8\n`;
		const sixth = '5'.repeat(40);
		await run(home, await createArchive(sixth), sixth, {}, prefix);
		assert.strictEqual((await readdir(cache)).filter(name => name.startsWith('insider-')).length, 6);
		const seventh = '6'.repeat(40);
		await run(home, await createArchive(seventh), seventh);
		assert.deepStrictEqual({
			retained: (await readdir(cache)).filter(name => name.startsWith('insider-')).length,
			privateCopy: (await exec(privateBin(home, lockedVersion), ['--version'])).stdout.trim(),
		}, { retained: 5, privateCopy: `code 1.0.0 (commit ${lockedVersion})` });
	});
});
