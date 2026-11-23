/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { commands, extensions, LogOutputChannel, Uri, window } from 'vscode';
import type { API, GitExtension, Repository } from '../api/git';
import { findGit, Git } from '../git';

suite('git.repositories.deleteWorktree', () => {
	let git: Git;
	let api: API;
	let logger: LogOutputChannel;
	let directory: string;
	let root: string;
	let worktreePath: string;
	let errors: string[];
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	async function closeRepository(repositoryRoot: string): Promise<void> {
		if (api.getRepository(Uri.file(repositoryRoot))) {
			await commands.executeCommand('git.close', Uri.file(repositoryRoot));
		}
	}

	async function openRepository(repositoryRoot: string): Promise<Repository> {
		const repository = await api.openRepository(Uri.file(repositoryRoot));
		assert.ok(repository);
		return repository;
	}

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git delete worktree test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-delete-worktree-test', version: foundGit.version });

		const extension = extensions.getExtension<GitExtension>('vscode.git');
		assert.ok(extension);
		await extension.activate();
		api = extension.exports.getAPI(1);
	});

	suiteTeardown(() => {
		if (originalGitConfigCount === undefined) {
			delete process.env.GIT_CONFIG_COUNT;
		} else {
			process.env.GIT_CONFIG_COUNT = originalGitConfigCount;
		}
		logger.dispose();
	});

	setup(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-delete-worktree-'));
		directory = await fs.promises.realpath(directory);
		root = path.join(directory, 'repository');
		worktreePath = path.join(directory, 'feature');
		await fs.promises.mkdir(root);
		await git.init(root, { defaultBranch: 'main' });
		await git.exec(root, ['config', 'user.name', 'Worktree Tester']);
		await git.exec(root, ['config', 'user.email', 'worktree@example.com']);
		await git.exec(root, ['config', 'commit.gpgsign', 'false']);
		await git.exec(root, ['commit', '--allow-empty', '-m', 'base']);
		await git.exec(root, ['worktree', 'add', '-b', 'feature', worktreePath]);

		errors = [];
		sinon.stub(window, 'showErrorMessage').callsFake(async (message: string) => {
			errors.push(message);
			return undefined;
		});
	});

	teardown(async () => {
		sinon.restore();
		await closeRepository(worktreePath);
		await closeRepository(root);
		await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	test('deletes the worktree of the repository it is run on through the main repository', async () => {
		await openRepository(root);
		const worktree = await openRepository(worktreePath);
		// Opening the worktree starts git commands in it. On Windows a running process's current directory can't be
		// removed, so deleting the worktree before they finish fails with "Permission denied".
		await worktree.status();

		await commands.executeCommand('git.repositories.deleteWorktree', worktree.rootUri, { id: worktree.rootUri.fsPath });

		assert.deepStrictEqual({
			errors,
			worktreeExists: fs.existsSync(worktreePath),
			worktreeOpen: !!api.getRepository(Uri.file(worktreePath))
		}, {
			errors: [],
			worktreeExists: false,
			worktreeOpen: false
		});
	});

	test('does not delete the worktree of the repository it is run on when the main repository is not open', async () => {
		const worktree = await openRepository(worktreePath);

		await commands.executeCommand('git.repositories.deleteWorktree', worktree.rootUri, { id: worktree.rootUri.fsPath });

		assert.deepStrictEqual({
			errors,
			worktreeExists: fs.existsSync(worktreePath)
		}, {
			errors: ['You cannot delete the worktree you are currently in. Please switch to the main repository first.'],
			worktreeExists: true
		});
	});
});
