/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Repository } from '../repository';
import { createWorktreeSymlink, filterWorktreeSymlinkFolders, getWorktreeSymlinkFolderCandidates } from '../worktreeSymlink';

interface IWorktreeSymlinkHarness {
	logger: { warn(message: string): void };
	_getWorktreeSymlinkFolders(): Promise<string[]>;
}

const symlinkWorktreeFolders = Reflect.get(Repository.prototype, '_symlinkWorktreeFolders') as (this: IWorktreeSymlinkHarness, worktreePath: string) => Promise<string[]>;

suite('worktreeSymlink', () => {
	const nul = (...entries: string[]) => entries.map(entry => `${entry}\x00`).join('');

	let testRoot: string;
	let repositoryRoot: string;
	let worktreeRoot: string;

	setup(async () => {
		testRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-worktree-symlink-'));
		repositoryRoot = path.join(testRoot, 'repository');
		worktreeRoot = path.join(testRoot, 'worktree');
		await Promise.all([
			fsPromises.mkdir(repositoryRoot),
			fsPromises.mkdir(worktreeRoot)
		]);
	});

	teardown(async () => {
		await fsPromises.rm(testRoot, { recursive: true, force: true });
	});

	test('resolves directories that match configured and repository ignore patterns', () => {
		const ignored = nul(
			'node_modules/a/index.js',
			'node_modules/b/index.js',
			'packages/a/cache/data',
			'unignored/cache/data',
			'tracked-cache/ignored',
			'partial-cache/drop/data'
		);
		const matched = nul(
			'node_modules/a/index.js',
			'node_modules/b/index.js',
			'packages/a/cache/data',
			'unignored/cache/data',
			'tracked-cache/ignored',
			'partial-cache/drop/data',
			'partial-cache/keep/data',
			'other/file'
		);
		const candidates = getWorktreeSymlinkFolderCandidates(ignored, matched);

		assert.deepStrictEqual({
			candidates,
			directories: filterWorktreeSymlinkFolders(
				candidates,
				nul('node_modules/', 'node_modules/a/', 'node_modules/b/', 'packages/a/cache/', 'unignored/cache/', 'tracked-cache/', 'partial-cache/', 'partial-cache/drop/'),
				nul('node_modules/', 'node_modules/a/', 'node_modules/b/', 'packages/', 'packages/a/', 'packages/a/cache/', 'unignored/', 'tracked-cache/', 'partial-cache/', 'partial-cache/drop/'),
				nul('node_modules/', 'packages/', 'unignored/', 'partial-cache/drop/')
			),
		}, {
			candidates: [
				'node_modules/a',
				'node_modules',
				'node_modules/b',
				'packages/a/cache',
				'packages/a',
				'packages',
				'unignored/cache',
				'unignored',
				'tracked-cache',
				'partial-cache/drop',
				'partial-cache'
			],
			directories: [
				'node_modules',
				'packages/a/cache',
				'partial-cache/drop'
			]
		});
	});

	test('createWorktreeSymlink creates a directory symlink to the repository', async () => {
		const sourceDirectory = path.join(repositoryRoot, 'node_modules');
		const targetDirectory = path.join(worktreeRoot, 'node_modules');
		await fsPromises.mkdir(sourceDirectory);
		await fsPromises.writeFile(path.join(sourceDirectory, 'package.txt'), 'contents');

		const status = await createWorktreeSymlink(repositoryRoot, worktreeRoot, 'node_modules');

		assert.deepStrictEqual({
			status,
			isSymbolicLink: (await fsPromises.lstat(targetDirectory)).isSymbolicLink(),
			target: await fsPromises.realpath(targetDirectory),
			contents: await fsPromises.readFile(path.join(targetDirectory, 'package.txt'), 'utf8')
		}, {
			status: 'created',
			isSymbolicLink: true,
			target: await fsPromises.realpath(sourceDirectory),
			contents: 'contents'
		});
	});

	test('createWorktreeSymlink skips existing targets', async () => {
		await fsPromises.mkdir(path.join(repositoryRoot, 'existing'));
		await fsPromises.mkdir(path.join(worktreeRoot, 'existing'));

		assert.strictEqual(
			await createWorktreeSymlink(repositoryRoot, worktreeRoot, 'existing'),
			'targetExists'
		);
	});

	test('createWorktreeSymlink rejects a symlinked target parent', async () => {
		const externalDirectory = path.join(testRoot, 'external');
		await Promise.all([
			fsPromises.mkdir(path.join(repositoryRoot, 'parent', 'child'), { recursive: true }),
			fsPromises.mkdir(externalDirectory)
		]);
		await fsPromises.symlink(externalDirectory, path.join(worktreeRoot, 'parent'), process.platform === 'win32' ? 'junction' : 'dir');

		await assert.rejects(
			createWorktreeSymlink(repositoryRoot, worktreeRoot, path.join('parent', 'child')),
			/target parent .* is a symbolic link/
		);
	});

	test('createWorktreeSymlink skips directories containing the worktree', async () => {
		const nestedWorktree = path.join(repositoryRoot, '.worktrees', 'feature');
		await fsPromises.mkdir(nestedWorktree, { recursive: true });

		assert.strictEqual(
			await createWorktreeSymlink(repositoryRoot, nestedWorktree, '.worktrees'),
			'sourceContainsWorktree'
		);
	});

	test('symlinking worktree directories is best effort', async () => {
		const warnings: string[] = [];
		const harness: IWorktreeSymlinkHarness = {
			logger: { warn: message => warnings.push(message) },
			_getWorktreeSymlinkFolders: async () => {
				throw new Error('detection failed');
			}
		};

		const folders = await symlinkWorktreeFolders.call(harness, worktreeRoot);

		assert.deepStrictEqual({ folders, warnings }, {
			folders: [],
			warnings: ['[Repository][_symlinkWorktreeFolders] Failed to symlink folders to worktree: Error: detection failed']
		});
	});
});
