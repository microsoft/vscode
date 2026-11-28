/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { mayBeInRepository } from '../repositoryDetection';

suite('mayBeInRepository', () => {
	let directory: string;

	/** Uses an empty environment, so a `GIT_DIR` from the test runner cannot change the answer. */
	function check(folder: string): Promise<boolean> {
		return mayBeInRepository(URI.file(folder), {});
	}

	async function makeFolder(...segments: string[]): Promise<string> {
		const folder = join(directory, ...segments);
		await mkdir(folder, { recursive: true });
		return folder;
	}

	beforeEach(async () => {
		// Outside the working directory, which is in a repository.
		directory = await realpath(await mkdtemp(join(tmpdir(), 'repository-detection-')));
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	test('is false for a folder with no .git entry above it', async () => {
		expect(await check(await makeFolder('plain', 'nested'))).toBe(false);
	});

	test('is true for a folder with a .git directory', async () => {
		const repo = await makeFolder('repo');
		await makeFolder('repo', '.git');

		expect(await check(repo)).toBe(true);
	});

	test('is true for a folder below a .git directory', async () => {
		await makeFolder('repo', '.git');

		expect(await check(await makeFolder('repo', 'src', 'deep'))).toBe(true);
	});

	test('is true for a linked worktree, whose .git entry is a file', async () => {
		const worktree = await makeFolder('worktree');
		await writeFile(join(worktree, '.git'), 'gitdir: /elsewhere/.git/worktrees/worktree');

		expect(await check(await makeFolder('worktree', 'src'))).toBe(true);
	});

	test('is true for a git directory, which has a HEAD entry and no .git entry', async () => {
		const gitDirectory = await makeFolder('metadata.git');
		await writeFile(join(gitDirectory, 'HEAD'), 'ref: refs/heads/main');

		expect(await check(await makeFolder('metadata.git', 'hooks'))).toBe(true);
	});

	test('is true for a symbolic link into a repository', async () => {
		await makeFolder('repo', '.git');
		const target = await makeFolder('repo', 'src');
		const link = join(await makeFolder('plain'), 'link');
		await symlink(target, link, 'junction');

		expect(await check(link)).toBe(true);
	});

	test('is false for a symbolic link out of a repository, as git searches from the real path', async () => {
		await makeFolder('repo', '.git');
		const link = join(directory, 'repo', 'link');
		await symlink(await makeFolder('plain'), link, 'junction');

		expect(await check(link)).toBe(false);
	});

	test('is true when the folder cannot be resolved', async () => {
		expect(await check(join(directory, 'missing'))).toBe(true);
	});

	// Permissions don't restrict root, and Windows ignores these modes.
	test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('is true when a .git entry cannot be checked', async () => {
		const folder = await makeFolder('unreadable');
		await chmod(folder, 0o000);
		try {
			expect(await check(folder)).toBe(true);
		} finally {
			await chmod(folder, 0o700);
		}
	});

	test('is true when the environment names a repository', async () => {
		const folder = URI.file(await makeFolder('plain'));

		expect({
			gitDir: await mayBeInRepository(folder, { GIT_DIR: '/elsewhere/.git' }),
			gitWorkTree: await mayBeInRepository(folder, { GIT_WORK_TREE: '/elsewhere' }),
		}).toEqual({ gitDir: true, gitWorkTree: true });
	});
});
