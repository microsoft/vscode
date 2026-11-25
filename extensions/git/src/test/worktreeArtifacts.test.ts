/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, extensions, LogOutputChannel, Uri, window } from 'vscode';
import type { GitExtension } from '../api/git';
import type { GitExtensionImpl } from '../api/extension';
import { findGit, Git } from '../git';
import type { Model } from '../model';
import type { Repository } from '../repository';
import { eventToPromise, filterEvent } from '../util';

suite('git.artifactProvider.worktrees', () => {
	let git: Git;
	let model: Model;
	let logger: LogOutputChannel;
	let directory: string;
	let root: string;
	let worktreePath: string;
	let otherWorktreePath: string;
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	async function openRepository(repositoryRoot: string): Promise<Repository> {
		await model.openRepository(repositoryRoot, { openIfClosed: true, openIfParent: true });
		const repository = model.getRepository(repositoryRoot);
		assert.ok(repository);
		return repository;
	}

	function onDidChangeWorktrees(repository: Repository): Promise<string[]> {
		return eventToPromise(filterEvent(repository.sourceControl.artifactProvider.onDidChangeArtifacts, groups => groups.includes('worktrees')));
	}

	async function getWorktreeArtifacts(repository: Repository): Promise<string[]> {
		const artifacts = await repository.sourceControl.artifactProvider.provideArtifacts('worktrees');
		return artifacts.map(artifact => artifact.id).sort();
	}

	// The repository's file watchers are requested without waiting for them to start, and a change made before
	// a watcher starts is never reported. Writes a probe file into `folder` until the repository reports it, then
	// deletes the probe and returns its path, so that callers can ignore the events of the probe.
	async function whenWatched(repository: Repository, folder: string): Promise<string> {
		const probe = toFsPath(path.join(folder, '.vscode-watcher-probe'));
		let watched = false;
		const didChangeProbe = eventToPromise(filterEvent(repository.onDidChangeRepository, uri => uri.fsPath === probe)).then(() => watched = true);

		for (let attempt = 0; !watched; attempt++) {
			await fs.promises.writeFile(probe, String(attempt));
			await Promise.race([didChangeProbe, new Promise(resolve => setTimeout(resolve, 100))]);
		}

		await fs.promises.rm(probe, { force: true });
		return probe;
	}

	// On Windows, `Uri.fsPath` lower cases the drive letter while `fs.realpath`
	// preserves it, so paths are compared in their `Uri.fsPath` form
	function toFsPath(fsPath: string): string {
		return Uri.file(fsPath).fsPath;
	}

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git worktree artifacts test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-worktree-artifacts-test', version: foundGit.version });

		const extension = extensions.getExtension<GitExtension>('vscode.git');
		assert.ok(extension);
		await extension.activate();
		const gitExtension = extension.exports as GitExtensionImpl;
		assert.ok(gitExtension.model);
		model = gitExtension.model;
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
		directory = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-worktree-artifacts-')));
		root = path.join(directory, 'repository');
		worktreePath = path.join(directory, 'feature');
		otherWorktreePath = path.join(directory, 'other');
		await fs.promises.mkdir(root);
		await git.init(root, { defaultBranch: 'main' });
		await git.exec(root, ['config', 'user.name', 'Worktree Tester']);
		await git.exec(root, ['config', 'user.email', 'worktree@example.com']);
		await git.exec(root, ['config', 'commit.gpgsign', 'false']);
		await git.exec(root, ['commit', '--allow-empty', '-m', 'base']);
		await git.exec(root, ['worktree', 'add', '-b', 'feature', worktreePath]);
		await git.exec(root, ['worktree', 'add', '-b', 'other', otherWorktreePath]);
	});

	teardown(async () => {
		if (model.getRepository(root)) {
			await commands.executeCommand('git.close', Uri.file(root));
		}
		await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	test('refreshes the worktrees group when a worktree is removed outside of the repository', async () => {
		const repository = await openRepository(root);
		await repository.status();
		const before = await getWorktreeArtifacts(repository);

		const didChangeWorktrees = onDidChangeWorktrees(repository);
		await git.exec(root, ['worktree', 'remove', worktreePath]);
		await repository.status();
		const groups = await didChangeWorktrees;

		assert.deepStrictEqual({
			before: before.map(toFsPath).sort(),
			groups,
			after: (await getWorktreeArtifacts(repository)).map(toFsPath).sort(),
			worktrees: repository.worktrees.map(worktree => toFsPath(worktree.path))
		}, {
			before: [root, worktreePath, otherWorktreePath].map(toFsPath).sort(),
			groups: ['worktrees'],
			after: [root, otherWorktreePath].map(toFsPath).sort(),
			worktrees: [root, otherWorktreePath].map(toFsPath)
		});
	});

	test('notifies about a change in the repository when a worktree is removed outside of the repository', async function () {
		this.timeout(20000);

		const repository = await openRepository(root);
		await repository.status();

		const worktreesFolder = toFsPath(path.join(root, '.git', 'worktrees'));
		const probe = await whenWatched(repository, worktreesFolder);

		const onDidChangeWorktreesFolder = filterEvent(repository.onDidChangeRepository, uri => path.dirname(uri.fsPath) === worktreesFolder && uri.fsPath !== probe);
		const didChangeWorktreesFolder = eventToPromise(onDidChangeWorktreesFolder);
		await git.exec(root, ['worktree', 'remove', worktreePath]);
		const uri = await didChangeWorktreesFolder;

		assert.strictEqual(uri.fsPath, path.join(worktreesFolder, 'feature'));
	});
});
