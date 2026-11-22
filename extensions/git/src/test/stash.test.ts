/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LogOutputChannel, window } from 'vscode';
import { Status } from '../api/git.constants';
import { findGit, Git } from '../git';
import { isWindows } from '../util';

// Creating a symbolic link requires extra privileges on Windows
(isWindows ? suite.skip : suite)('git stash', () => {
	let git: Git;
	let logger: LogOutputChannel;
	let repositoryRoot: string;

	suiteSetup(async () => {
		logger = window.createOutputChannel('git stash test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-stash-test', version: foundGit.version });
	});

	suiteTeardown(() => {
		logger?.dispose();
	});

	setup(async () => {
		repositoryRoot = await fsPromises.realpath(await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-stash-')));
		await git.init(repositoryRoot, { defaultBranch: 'main' });
		await git.exec(repositoryRoot, ['config', 'user.name', 'testuser']);
		await git.exec(repositoryRoot, ['config', 'user.email', 'monacotools@example.com']);
		await git.exec(repositoryRoot, ['config', 'commit.gpgsign', 'false']);
	});

	teardown(async () => {
		await fsPromises.rm(repositoryRoot, { recursive: true, force: true });
	});

	test('showStash lists the changes that follow a type change', async () => {
		await fsPromises.writeFile(path.join(repositoryRoot, 'a.txt'), 'a');
		await fsPromises.writeFile(path.join(repositoryRoot, 'z.txt'), 'z');
		await git.exec(repositoryRoot, ['add', '.']);
		await git.exec(repositoryRoot, ['commit', '-m', 'initial commit']);

		await fsPromises.rm(path.join(repositoryRoot, 'a.txt'));
		await fsPromises.symlink('z.txt', path.join(repositoryRoot, 'a.txt'));
		await fsPromises.writeFile(path.join(repositoryRoot, 'z.txt'), 'zz');
		await git.exec(repositoryRoot, ['stash']);

		const repository = git.open(repositoryRoot, undefined, await git.getRepositoryDotGit(repositoryRoot), logger);
		const changes = await repository.showStash(0);

		assert.deepStrictEqual(changes?.map(c => [c.status, path.relative(repositoryRoot, c.uri.fsPath)]), [
			[Status.TYPE_CHANGED, 'a.txt'],
			[Status.MODIFIED, 'z.txt']
		]);
	});
});
