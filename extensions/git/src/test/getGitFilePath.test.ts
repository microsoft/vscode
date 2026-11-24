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
import { findGit, Git, Repository as GitRepository, SpawnOptions } from '../git';

class RecordingRepository extends GitRepository {
	readonly calls: string[][] = [];

	override async exec(args: string[], options?: SpawnOptions) {
		this.calls.push(args);
		return super.exec(args, options);
	}
}

suite('git getGitFilePath', () => {
	let git: Git;
	let logger: LogOutputChannel;
	let directory: string;
	let repository: RecordingRepository;
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git getGitFilePath test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-get-git-file-path-test', version: foundGit.version });
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
		directory = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-file-path-')));
		await git.init(directory, { defaultBranch: 'main' });
		await git.exec(directory, ['config', 'user.name', 'File Path Tester']);
		await git.exec(directory, ['config', 'user.email', 'file-path@example.com']);
		await git.exec(directory, ['config', 'commit.gpgsign', 'false']);
		await fs.promises.mkdir(path.join(directory, 'Src', 'Nested'), { recursive: true });
		await fs.promises.mkdir(path.join(directory, 'other'));
		await fs.promises.writeFile(path.join(directory, 'Src', 'Nested', 'File.txt'), 'file\n');
		await fs.promises.writeFile(path.join(directory, 'other', 'unrelated.txt'), 'unrelated\n');
		await git.exec(directory, ['add', '.']);
		await git.exec(directory, ['commit', '-m', 'base']);

		repository = new RecordingRepository(git, directory, directory, { path: path.join(directory, '.git'), isBare: false }, logger);
	});

	teardown(async () => {
		await fs.promises.rm(directory, { recursive: true, force: true });
	});

	test('resolves a path with a different case without listing the whole tree', async () => {
		const fileCase = await repository.getGitFilePath('HEAD', path.join(directory, 'Src', 'Nested', 'file.TXT'));
		const folderCase = await repository.getGitFilePath('HEAD', path.join(directory, 'src', 'nested', 'file.TXT'));

		assert.deepStrictEqual({
			fileCase,
			folderCase,
			recursiveListings: repository.calls.filter(args => args[0] === 'ls-tree' && args.includes('-r')).length
		}, {
			fileCase: path.join(directory, 'Src', 'Nested', 'File.txt'),
			folderCase: path.join(directory, 'Src', 'Nested', 'File.txt'),
			recursiveListings: 0
		});
	});

	test('resolves a path in a folder whose name exists in several cases', async () => {
		// Case-insensitive file systems cannot hold both folders, so add the file to the index directly
		const { stdout: blob } = await git.exec(directory, ['rev-parse', 'HEAD:other/unrelated.txt']);
		await git.exec(directory, ['update-index', '--add', '--cacheinfo', `100644,${blob.trim()},src/b.txt`]);
		await git.exec(directory, ['commit', '-m', 'add a folder whose name only differs in case']);

		const gitFilePath = await repository.getGitFilePath('HEAD', path.join(directory, 'SRC', 'B.TXT'));

		assert.strictEqual(gitFilePath, path.join(directory, 'src', 'b.txt'));
	});

	test('does not resolve a path to a folder', async () => {
		await assert.rejects(repository.getGitFilePath('HEAD', path.join(directory, 'sRC')), { message: 'Git relative path not found. Was looking for sRC' });
		await assert.rejects(repository.getGitFilePath('HEAD', path.join(directory, 'src', 'NESTED')), { message: 'Git relative path not found. Was looking for src/NESTED' });
	});

	test('resolves a path with a different case in the index without listing the whole index', async () => {
		const gitFilePath = await repository.getGitFilePath('', path.join(directory, 'SRC', 'Nested', 'file.txt'));

		assert.deepStrictEqual({
			gitFilePath,
			lsFilesCalls: repository.calls.filter(args => args[0] === 'ls-files')
		}, {
			gitFilePath: path.join(directory, 'Src', 'Nested', 'File.txt'),
			lsFilesCalls: [['ls-files', '--stage', '--', ':(icase,literal)SRC/Nested/file.txt']]
		});
	});

	test('does not list the other files of the repository when a path is not found', async () => {
		await fs.promises.writeFile(path.join(directory, 'Src', 'untracked.txt'), 'untracked\n');

		await assert.rejects(repository.getGitFilePath('HEAD', path.join(directory, 'Src', 'untracked.txt')), (error: Error) => {
			assert.strictEqual(error.message, 'Git relative path not found. Was looking for Src/untracked.txt');
			return true;
		});
	});
});
