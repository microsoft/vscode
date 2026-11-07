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
import { findGit, Git, GitError, Repository as GitRepository } from '../git';

suite('whole-file merge', () => {
	let git: Git;
	let logger: LogOutputChannel;
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	let directory: string | undefined;

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git whole-file merge test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-whole-file-merge-test', version: foundGit.version });
	});

	suiteTeardown(() => {
		if (originalGitConfigCount === undefined) {
			delete process.env.GIT_CONFIG_COUNT;
		} else {
			process.env.GIT_CONFIG_COUNT = originalGitConfigCount;
		}
		logger?.dispose();
	});

	teardown(async () => {
		if (directory) {
			await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
			directory = undefined;
		}
	});

	async function initRepository(): Promise<{ root: string; repository: GitRepository }> {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-whole-file-'));
		const root = path.join(directory, 'repository');
		await fs.promises.mkdir(root);
		await git.init(root, { defaultBranch: 'main' });
		await git.exec(root, ['config', 'user.name', 'Whole File Tester']);
		await git.exec(root, ['config', 'user.email', 'whole-file@example.com']);
		await git.exec(root, ['config', 'commit.gpgsign', 'false']);
		await git.exec(root, ['config', 'core.autocrlf', 'false']);
		const repository = new GitRepository(git, root, undefined, { path: path.join(root, '.git'), isBare: false }, logger);
		return { root, repository };
	}

	async function commitAll(root: string, message: string): Promise<void> {
		await git.exec(root, ['add', '-A']);
		await git.exec(root, ['commit', '-m', message]);
	}

	async function mergeExpectingConflict(root: string, ref: string): Promise<void> {
		await assert.rejects(git.exec(root, ['merge', ref]), error => error instanceof GitError);
	}

	test('takes one side of an unmerged binary file and stages it', async () => {
		const { root, repository } = await initRepository();
		const file = path.join(root, 'data.bin');
		await fs.promises.writeFile(path.join(root, '.gitattributes'), 'data.bin binary\n');
		await fs.promises.writeFile(file, 'base');
		await commitAll(root, 'base');

		await git.exec(root, ['checkout', '-b', 'feature']);
		await fs.promises.writeFile(file, 'feature');
		await commitAll(root, 'feature');

		await git.exec(root, ['checkout', 'main']);
		await fs.promises.writeFile(file, 'main');
		await commitAll(root, 'main');

		await git.exec(root, ['checkout', 'feature']);
		await mergeExpectingConflict(root, 'main');

		const before = await fs.promises.readFile(file);
		assert.ok(!before.includes(Buffer.from('<<<<<<<')));
		const unmerged = await git.exec(root, ['ls-files', '-u', '--', 'data.bin']);
		assert.ok(unmerged.stdout.includes(' 2\t'));
		assert.ok(unmerged.stdout.includes(' 3\t'));

		assert.strictEqual(await repository.takeConflictSide(file, 'theirs'), true);

		assert.strictEqual(await fs.promises.readFile(file, 'utf8'), 'main');
		const resolved = await git.exec(root, ['ls-files', '-u', '--', 'data.bin']);
		assert.strictEqual(resolved.stdout, '');
		const hashed = await git.exec(root, ['hash-object', '--', 'data.bin']);
		const staged = await git.exec(root, ['rev-parse', ':data.bin']);
		assert.strictEqual(staged.stdout.trim(), hashed.stdout.trim());
	});

	test('removes the file when the selected side deleted it', async () => {
		const { root, repository } = await initRepository();
		const file = path.join(root, 'gone.txt');
		await fs.promises.writeFile(file, 'base\n');
		await commitAll(root, 'base');

		await git.exec(root, ['checkout', '-b', 'feature']);
		await fs.promises.writeFile(file, 'feature\n');
		await commitAll(root, 'feature');

		await git.exec(root, ['checkout', 'main']);
		await git.exec(root, ['rm', 'gone.txt']);
		await git.exec(root, ['commit', '-m', 'main deletes gone.txt']);

		await git.exec(root, ['checkout', 'feature']);
		await mergeExpectingConflict(root, 'main');

		const unmerged = await git.exec(root, ['ls-files', '-u', '--', 'gone.txt']);
		assert.ok(unmerged.stdout.includes(' 2\t'));
		assert.ok(!unmerged.stdout.includes(' 3\t'));

		assert.strictEqual(await repository.takeConflictSide(file, 'theirs'), true);

		await assert.rejects(fs.promises.access(file));
		const resolved = await git.exec(root, ['ls-files', '-u', '--', 'gone.txt']);
		assert.strictEqual(resolved.stdout, '');
		const status = await git.exec(root, ['status', '--porcelain', '--', 'gone.txt']);
		assert.ok(status.stdout.startsWith('D '), status.stdout);
	});

	test('leaves a file alone when it is not unmerged', async () => {
		const { root, repository } = await initRepository();
		const file = path.join(root, 'clean.txt');
		await fs.promises.writeFile(file, 'same\n');
		await commitAll(root, 'base');

		assert.strictEqual(await repository.takeConflictSide(file, 'ours'), false);
		assert.strictEqual(await repository.takeConflictSide(file, 'theirs'), false);

		assert.strictEqual(await fs.promises.readFile(file, 'utf8'), 'same\n');
		const status = await git.exec(root, ['status', '--porcelain']);
		assert.strictEqual(status.stdout, '');
		const unmerged = await git.exec(root, ['ls-files', '-u']);
		assert.strictEqual(unmerged.stdout, '');
	});
});
