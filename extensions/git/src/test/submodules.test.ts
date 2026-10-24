/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { commands, extensions, LogOutputChannel, Uri, window, workspace } from 'vscode';
import type { GitExtension } from '../api/git';
import { findGit, Git, Repository, Submodule } from '../git';

suite('git submodules', () => {
	let git: Git;
	let logger: LogOutputChannel;
	let root: string;
	let repository: Repository;
	let commit: string;

	suiteSetup(async () => {
		logger = window.createOutputChannel('git submodules test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-submodules-test', version: foundGit.version });
	});

	suiteTeardown(() => logger?.dispose());

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-git-submodules-'));
		await git.init(root, { defaultBranch: 'main' });
		repository = git.open(root, undefined, { path: path.join(root, '.git'), isBare: false }, logger);
		await repository.exec(['config', 'user.name', 'Submodule Tester']);
		await repository.exec(['config', 'user.email', 'submodules@example.com']);
		await repository.exec(['config', 'commit.gpgsign', 'false']);
		await repository.exec(['config', 'core.autocrlf', 'false']);
		await repository.exec(['commit', '--allow-empty', '-m', 'initial']);
		commit = (await repository.exec(['rev-parse', 'HEAD'])).stdout.trim();
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	});

	async function configureSubmodules(paths: string[]): Promise<Submodule[]> {
		const submodules = paths.map((submodulePath, index) => ({
			name: `module${index}`,
			path: submodulePath,
			url: `https://example.com/module${index}.git`
		}));
		await fs.writeFile(path.join(root, '.gitmodules'), submodules.map(submodule =>
			`[submodule "${submodule.name}"]\n\tpath = "${submodule.path}"\n\turl = ${submodule.url}\n`
		).join(''));
		return submodules;
	}

	async function addGitlink(submodulePath: string, object = commit): Promise<void> {
		await repository.exec(['update-index', '--add', '--cacheinfo', '160000', object, submodulePath]);
	}

	test('excludes expanded directories, regular files and stale gitmodules entries', async () => {
		await configureSubmodules(['infra', 'ordinary.txt', 'missing']);
		await fs.mkdir(path.join(root, 'infra'));
		await fs.writeFile(path.join(root, 'infra', 'README.md'), 'expanded\n');
		await fs.writeFile(path.join(root, 'ordinary.txt'), 'ordinary\n');
		await repository.exec(['add', '.']);

		assert.deepStrictEqual(await repository.getSubmodules(), []);
	});

	test('preserves initialized and uninitialized gitlinks in configured order', async () => {
		const submodules = await configureSubmodules(['uninitialized', 'infra', 'initialized']);
		await fs.mkdir(path.join(root, 'infra'));
		await fs.writeFile(path.join(root, 'infra', 'README.md'), 'expanded\n');
		await repository.exec(['add', '.']);
		await fs.mkdir(path.join(root, 'initialized'));
		const initializedRoot = path.join(root, 'initialized');
		await git.init(initializedRoot, { defaultBranch: 'main' });
		await git.exec(initializedRoot, ['-c', 'user.name=Submodule Tester', '-c', 'user.email=submodules@example.com', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'initial']);
		const initializedCommit = (await git.exec(initializedRoot, ['rev-parse', 'HEAD'])).stdout.trim();
		await addGitlink('initialized', initializedCommit);
		await addGitlink('uninitialized');

		assert.deepStrictEqual(await repository.getSubmodules(), [submodules[0], submodules[2]]);
	});

	test('uses staged conversions between expanded directories and gitlinks', async () => {
		const submodules = await configureSubmodules(['infra']);
		await fs.mkdir(path.join(root, 'infra'));
		await fs.writeFile(path.join(root, 'infra', 'README.md'), 'expanded\n');
		await repository.exec(['add', '.']);
		await repository.exec(['commit', '-m', 'expanded']);
		const expanded = await repository.getSubmodules();

		await repository.exec(['update-index', '--force-remove', '--', 'infra/README.md']);
		await addGitlink('infra');
		const gitlink = await repository.getSubmodules();

		await repository.exec(['update-index', '--force-remove', '--', 'infra']);
		await repository.exec(['add', '--', 'infra/README.md']);
		const expandedAgain = await repository.getSubmodules();

		assert.deepStrictEqual({ expanded, gitlink, expandedAgain }, { expanded: [], gitlink: submodules, expandedAgain: [] });
	});

	test('retains conflicted gitlinks at nonzero index stages', async () => {
		const submodules = await configureSubmodules(['conflicted']);
		await repository.exec(['update-index', '-z', '--index-info'], {
			input: `160000 ${commit} 1\tconflicted\0` + `160000 ${commit} 3\tconflicted\0`
		});

		assert.deepStrictEqual(await repository.getSubmodules(), submodules);
	});

	test('matches exact literal paths with spaces, Unicode, tabs and pathspec characters', async () => {
		const paths = ['libs/é module [one]', ...(process.platform === 'win32' ? [] : ['tab\tmodule']), 'lib[1]', 'expanded'];
		const submodules = await configureSubmodules(paths);
		for (const submodulePath of paths.slice(0, -2)) {
			await addGitlink(submodulePath);
		}
		await addGitlink('lib1');
		await addGitlink('expanded/nested');

		assert.deepStrictEqual(await repository.getSubmodules(), submodules.slice(0, -2));
	});

	test('does not query Git for missing, empty or invalid gitmodules entries', async () => {
		repository.exec = async () => { throw new Error('Unexpected Git query'); };
		const missing = await repository.getSubmodules();
		await fs.writeFile(path.join(root, '.gitmodules'), '');
		const empty = await repository.getSubmodules();
		await fs.writeFile(path.join(root, '.gitmodules'), '[submodule "incomplete"]\npath = infra\n');
		const invalid = await repository.getSubmodules();

		assert.deepStrictEqual({ missing, empty, invalid }, { missing: [], empty: [], invalid: [] });
	});

	test('propagates Git query failures', async () => {
		await configureSubmodules(['infra']);
		const error = new Error('Git query failed: ENOENT');
		repository.exec = async () => { throw error; };

		await assert.rejects(repository.getSubmodules(), candidate => candidate === error);
	});

	test('propagates gitmodules read failures', async () => {
		await fs.mkdir(path.join(root, '.gitmodules'));

		await assert.rejects(repository.getSubmodules());
	});

	test('resolves both historical Git URIs beneath an expanded directory', async () => {
		await configureSubmodules(['infra']);
		const filePath = path.join(root, 'infra', 'README.md');
		await fs.mkdir(path.dirname(filePath));
		await fs.writeFile(filePath, 'original\n');
		await repository.exec(['add', '.']);
		await repository.exec(['commit', '-m', 'original']);
		const originalRef = (await repository.exec(['rev-parse', 'HEAD'])).stdout.trim();
		await fs.writeFile(filePath, 'modified\n');
		await repository.exec(['commit', '-am', 'modified']);
		const modifiedRef = (await repository.exec(['rev-parse', 'HEAD'])).stdout.trim();

		const extension = extensions.getExtension<GitExtension>('vscode.git');
		assert.ok(extension);
		await extension.activate();
		const api = extension.exports.getAPI(1);
		const opened = await api.openRepository(Uri.file(root));
		assert.ok(opened);
		try {
			const fileUri = Uri.file(filePath);
			const contents: string[] = [];
			for (const ref of [originalRef, modifiedRef]) {
				const uri = api.toGitUri(fileUri, ref);
				await workspace.fs.stat(uri);
				contents.push((await workspace.openTextDocument(uri)).getText());
			}

			assert.deepStrictEqual({ root: api.getRepository(fileUri)?.rootUri.fsPath, contents }, {
				root: opened.rootUri.fsPath,
				contents: ['original\n', 'modified\n']
			});
		} finally {
			await commands.executeCommand('git.close', opened.rootUri);
		}
	});
});
