/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitExecutableResolver, mayBeInGitRepository } from '../../node/gitProcess.js';
import { FakeGitFileSystem, fakeFsError } from './fakeGitFileSystem.js';

suite('GitExecutableResolver', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the first executable git on PATH once per PATH', async () => {
		const fileSystem = new FakeGitFileSystem([
			['/opt/folder/git', 'directory'],
			['/opt/plain/git', 'file'],
			['/usr/local/bin/git', 'executable'],
			['/usr/bin/git', 'executable'],
		]);
		const resolver = new GitExecutableResolver(false, fileSystem);
		const env = { PATH: '/opt/folder:/opt/plain:/usr/local/bin:/usr/bin', path: '/ignored' };

		const first = await resolver.resolve(env);
		const firstProbes = fileSystem.probes.length;
		const cached = await Promise.all([resolver.resolve(env), resolver.resolve({ ...env, OTHER: 'value' })]);
		const cachedProbes = fileSystem.probes.length;
		const otherPath = await resolver.resolve({ PATH: '/usr/bin' });

		assert.deepStrictEqual({ first, firstProbes, cached, cachedProbes, otherPath }, {
			first: '/usr/local/bin/git',
			firstProbes: 5,
			cached: ['/usr/local/bin/git', '/usr/local/bin/git'],
			cachedProbes: 5,
			otherPath: '/usr/bin/git',
		});
	});

	test('mirrors the Windows spawn lookup, which ignores PATHEXT', async () => {
		const fileSystem = new FakeGitFileSystem([
			['C:\\shims\\git.cmd', 'file'],
			['C:\\shims\\git', 'file'],
			['C:\\Program Files\\Git\\cmd\\git.exe', 'file'],
			['C:\\Program Files\\Git\\cmd\\git.com', 'directory'],
			['C:\\WindowsApps\\git.exe', 'unreadable'],
		]);
		const resolver = new GitExecutableResolver(true, fileSystem);

		assert.deepStrictEqual({
			quotedAfterEmptyEntry: await resolver.resolve({ Path: 'C:\\shims;;"C:\\Program Files\\Git\\cmd"', PATHEXT: '.CMD;.EXE' }),
			appExecutionAlias: await resolver.resolve({ Path: 'C:\\WindowsApps;C:\\Program Files\\Git\\cmd' }),
		}, {
			quotedAfterEmptyEntry: 'C:\\Program Files\\Git\\cmd\\git.exe',
			appExecutionAlias: 'C:\\WindowsApps\\git.exe',
		});
	});

	test('falls back to bare git when the spawn might find a different git', async () => {
		const fileSystem = new FakeGitFileSystem([
			['/usr/bin/git', 'executable'],
			['C:\\Git\\cmd\\git.exe', 'file'],
		]);
		const posix = new GitExecutableResolver(false, fileSystem);
		const windows = new GitExecutableResolver(true, fileSystem);

		assert.deepStrictEqual({
			noPath: await posix.resolve({}),
			notFound: await posix.resolve({ PATH: '/opt/bin' }),
			relativeEntryFirst: await posix.resolve({ PATH: 'bin:/usr/bin' }),
			emptyEntryFirst: await posix.resolve({ PATH: ':/usr/bin' }),
			emptyEntryAfterGit: await posix.resolve({ PATH: '/usr/bin:' }),
			driveRelativeEntryFirst: await windows.resolve({ PATH: '\\tools;C:\\Git\\cmd' }),
		}, {
			noPath: 'git',
			notFound: 'git',
			relativeEntryFirst: 'git',
			emptyEntryFirst: 'git',
			emptyEntryAfterGit: '/usr/bin/git',
			driveRelativeEntryFirst: 'git',
		});
	});

	test('searches again only after a resolved git is missing', async () => {
		const fileSystem = new FakeGitFileSystem([['/usr/local/bin/git', 'executable'], ['/usr/bin/git', 'executable']]);
		const resolver = new GitExecutableResolver(false, fileSystem);
		const env = { PATH: '/usr/local/bin:/usr/bin' };
		const missing = new FakeGitFileSystem([]);
		const bare = new GitExecutableResolver(false, missing);

		const before = await resolver.resolve(env);
		resolver.handleSpawnError(env, before, fakeFsError('EACCES', before));
		const afterOtherError = await resolver.resolve(env);
		fileSystem.entries.delete('/usr/local/bin/git');
		resolver.handleSpawnError(env, before, fakeFsError('ENOENT', before));
		const afterMissing = await resolver.resolve(env);
		const bareGit = await bare.resolve(env);
		const bareProbes = missing.probes.length;
		bare.handleSpawnError(env, bareGit, fakeFsError('ENOENT', bareGit));
		await bare.resolve(env);

		assert.deepStrictEqual({ before, afterOtherError, afterMissing, bareGit, bareProbes, bareProbesAfterError: missing.probes.length }, {
			before: '/usr/local/bin/git',
			afterOtherError: '/usr/local/bin/git',
			afterMissing: '/usr/bin/git',
			bareGit: 'git',
			bareProbes: 2,
			bareProbesAfterError: 2,
		});
	});
});

suite('mayBeInGitRepository', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const root = path.resolve('/agent-host-git');
	const at = (...segments: string[]) => path.join(root, ...segments);

	test('reports a repository only when a .git entry exists in the folder, its real path, or their parents', async () => {
		const fileSystem = new FakeGitFileSystem([
			[at('plain'), 'directory'],
			[at('repo'), 'directory'],
			[at('repo', '.git'), 'directory'],
			[at('repo', 'src'), 'directory'],
			[at('worktree'), 'directory'],
			[at('worktree', '.git'), 'file'],
			[at('link'), 'directory'],
			[at('guarded'), 'directory'],
			[at('guarded', '.git'), 'unreadable'],
		], new Map([[at('link'), at('repo', 'src')]]));
		const lstatThrowsEacces = new class extends FakeGitFileSystem {
			override async lstat(fsPath: string): Promise<unknown> {
				if (fsPath === at('guarded', '.git')) {
					throw fakeFsError('EACCES', fsPath);
				}
				return super.lstat(fsPath);
			}
		}(fileSystem.entries);

		assert.deepStrictEqual({
			plain: await mayBeInGitRepository(at('plain'), {}, fileSystem),
			nested: await mayBeInGitRepository(at('repo', 'src'), {}, fileSystem),
			worktree: await mayBeInGitRepository(at('worktree'), {}, fileSystem),
			symlinkIntoRepository: await mayBeInGitRepository(at('link'), {}, fileSystem),
			unresolvable: await mayBeInGitRepository(at('missing'), {}, fileSystem),
			unreadableGitEntry: await mayBeInGitRepository(at('guarded'), {}, lstatThrowsEacces),
		}, {
			plain: false,
			nested: true,
			worktree: true,
			symlinkIntoRepository: true,
			unresolvable: true,
			unreadableGitEntry: true,
		});
	});

	test('checks every parent of a folder outside any repository', async () => {
		const fileSystem = new FakeGitFileSystem([[at('plain', 'nested'), 'directory']]);
		await mayBeInGitRepository(at('plain', 'nested'), {}, fileSystem);

		const ancestors: string[] = [];
		for (let directory = at('plain', 'nested'); ; directory = path.dirname(directory)) {
			ancestors.push(path.join(directory, '.git'));
			if (path.dirname(directory) === directory) {
				break;
			}
		}
		assert.deepStrictEqual(fileSystem.probes, [at('plain', 'nested'), ...ancestors]);
	});

	test('defers to git when the environment names a repository', async () => {
		const fileSystem = new FakeGitFileSystem([[at('plain'), 'directory']]);

		assert.deepStrictEqual({
			gitDir: await mayBeInGitRepository(at('plain'), { GIT_DIR: at('elsewhere', '.git') }, fileSystem),
			gitWorkTree: await mayBeInGitRepository(at('plain'), { GIT_WORK_TREE: at('elsewhere') }, fileSystem),
			differentCase: await mayBeInGitRepository(at('plain'), { git_dir: at('elsewhere', '.git') }, fileSystem),
			probes: fileSystem.probes,
		}, {
			gitDir: true,
			gitWorkTree: true,
			differentCase: true,
			probes: [],
		});
	});
});
