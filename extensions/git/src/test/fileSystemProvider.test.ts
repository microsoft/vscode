/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, extensions, LogOutputChannel, Uri, window, workspace } from 'vscode';
import type { API, GitExtension, Repository } from '../api/git';
import { findGit, Git } from '../git';

suite('git file system provider', () => {
	let git: Git;
	let api: API;
	let logger: LogOutputChannel;
	let directory: string;
	let repositories: Repository[] = [];
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	async function exec(cwd: string, args: string[]): Promise<string> {
		const result = await git.exec(cwd, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'protocol.file.allow=always', ...args]);
		return result.stdout.trim();
	}

	async function createRepository(root: string, fileName: string, content: string): Promise<string> {
		await fs.promises.mkdir(root);
		await git.init(root, { defaultBranch: 'main' });
		await fs.promises.writeFile(path.join(root, fileName), content);
		await exec(root, ['add', '.']);
		await exec(root, ['commit', '-m', 'initial commit']);
		return exec(root, ['rev-parse', 'HEAD']);
	}

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git file system provider test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-file-system-provider-test', version: foundGit.version });

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
		logger?.dispose();
	});

	setup(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-fs-provider-'));
	});

	teardown(async () => {
		for (const repository of repositories) {
			await commands.executeCommand('git.close', repository.rootUri);
		}
		repositories = [];
		await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	test('reads the commit of a submodule at a commit', async () => {
		const submoduleRoot = path.join(directory, 'lib');
		const firstSubmoduleCommit = await createRepository(submoduleRoot, 'lib.txt', 'v1\n');

		const root = path.join(directory, 'app');
		await createRepository(root, 'app.txt', 'app\n');
		await exec(root, ['submodule', 'add', '-q', submoduleRoot, 'lib']);
		await exec(root, ['commit', '-m', 'add submodule']);

		await fs.promises.writeFile(path.join(submoduleRoot, 'lib.txt'), 'v2\n');
		await exec(submoduleRoot, ['commit', '-am', 'update']);
		const secondSubmoduleCommit = await exec(submoduleRoot, ['rev-parse', 'HEAD']);
		await exec(path.join(root, 'lib'), ['pull', '-q', 'origin', 'main']);
		await exec(root, ['commit', '-am', 'bump submodule']);

		const submoduleUri = Uri.file(path.join(root, 'lib'));

		// The submodule is opened as a repository of its own, like the Source Control view does
		const repository = await api.openRepository(Uri.file(root));
		const submoduleRepository = await api.openRepository(submoduleUri);
		assert.ok(repository);
		assert.ok(submoduleRepository);
		repositories = [submoduleRepository, repository];
		await repository.status();
		const read = () => Promise.all(['HEAD~1', 'HEAD'].map(async ref => new TextDecoder().decode(await workspace.fs.readFile(api.toGitUri(submoduleUri, ref)))));
		const expected = [`Subproject commit ${firstSubmoduleCommit}\n`, `Subproject commit ${secondSubmoduleCommit}\n`];

		const withoutSubmoduleCommits = await read();

		// `git show` prints the commits of the submodule when they are also present in the parent repository
		await exec(root, ['fetch', '-q', submoduleRoot, 'main']);
		const withSubmoduleCommits = await read();

		assert.deepStrictEqual({ withoutSubmoduleCommits, withSubmoduleCommits }, { withoutSubmoduleCommits: expected, withSubmoduleCommits: expected });
	});
});
