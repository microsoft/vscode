/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogOutputChannel, window } from 'vscode';
import { findGit, Git, Repository } from '../git';

suite('git fetch', () => {
	let logger: LogOutputChannel;
	let git: Git;
	let repository: Repository;
	let directory: string;
	let fetchHeadPath: string;
	let initialFetchHead: string;
	let remoteHead: string;

	suiteSetup(async () => {
		logger = window.createOutputChannel('git-fetch-test', { log: true });
		const installation = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: installation.path, version: installation.version, userAgent: 'git-fetch-test' });
	});

	suiteTeardown(() => logger.dispose());

	setup(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-fetch-'));
		const remote = path.join(directory, 'remote');
		const local = path.join(directory, 'local');
		await fs.promises.mkdir(remote);
		await git.init(remote);
		await git.exec(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
		await git.exec(remote, ['config', 'user.name', 'Test User']);
		await git.exec(remote, ['config', 'user.email', 'test@example.com']);
		await git.exec(remote, ['config', 'commit.gpgsign', 'false']);
		await git.exec(remote, ['commit', '--allow-empty', '-m', 'initial']);
		await git.exec(directory, ['clone', remote, local]);
		repository = git.open(local, undefined, await git.getRepositoryDotGit(local), logger);
		await repository.fetch();
		fetchHeadPath = path.join(repository.dotGit.path, 'FETCH_HEAD');
		initialFetchHead = await fs.promises.readFile(fetchHeadPath, 'utf8');
		await git.exec(remote, ['commit', '--allow-empty', '-m', 'incoming']);
		remoteHead = (await git.exec(remote, ['rev-parse', 'HEAD'])).stdout.trim();
	});

	teardown(async () => {
		await fs.promises.rm(directory, { recursive: true, force: true });
	});

	for (const all of [false, true]) {
		test(`silent fetch${all ? ' --all' : ''} preserves FETCH_HEAD and updates remote refs`, async function () {
			if (git.compareGitVersionTo('2.29.0') < 0) {
				this.skip();
			}

			await repository.fetch({ silent: true, all });

			assert.deepStrictEqual({
				fetchHead: await fs.promises.readFile(fetchHeadPath, 'utf8'),
				remoteHead: (await git.exec(repository.root, ['rev-parse', 'origin/main'])).stdout.trim()
			}, { fetchHead: initialFetchHead, remoteHead });
		});
	}

	test('silent fetch does not create FETCH_HEAD', async function () {
		if (git.compareGitVersionTo('2.29.0') < 0) {
			this.skip();
		}

		await fs.promises.unlink(fetchHeadPath);
		await repository.fetch({ silent: true });

		assert.strictEqual(fs.existsSync(fetchHeadPath), false);
	});

	test('manual fetch updates FETCH_HEAD', async () => {
		await repository.fetch();

		assert.strictEqual((await git.exec(repository.root, ['rev-parse', 'FETCH_HEAD'])).stdout.trim(), remoteHead);
	});

	test('silent fetch falls back for Git versions before 2.29', async () => {
		const oldGit = new Git({ gitPath: git.path, version: '2.28.0', userAgent: git.userAgent });
		const oldRepository = oldGit.open(repository.root, undefined, repository.dotGit, logger);
		await oldRepository.fetch({ silent: true });

		assert.strictEqual((await git.exec(repository.root, ['rev-parse', 'FETCH_HEAD'])).stdout.trim(), remoteHead);
	});
});
