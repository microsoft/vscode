/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { Promises } from '../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { projectFromCopilotContext, projectFromRepository, resolveGitProject } from '../../node/copilot/copilotGitProject.js';

function execGit(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		cp.execFile('git', args, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr || error.message));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

suite('Copilot Git Project', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'copilot-git-project');
		await fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(async () => {
		await Promises.rm(testDir);
	});

	async function createRepository(name: string): Promise<string> {
		const repositoryPath = join(testDir, name);
		await fs.promises.mkdir(repositoryPath, { recursive: true });
		await execGit(repositoryPath, ['init']);
		await execGit(repositoryPath, ['config', 'user.email', 'test@example.com']);
		await execGit(repositoryPath, ['config', 'user.name', 'Test User']);
		await fs.promises.writeFile(join(repositoryPath, 'README.md'), '# Test\n');
		await execGit(repositoryPath, ['add', 'README.md']);
		await execGit(repositoryPath, ['commit', '-m', 'initial']);
		return repositoryPath;
	}

	test('resolves a repository project from a worktree working directory', async () => {
		const repositoryPath = await createRepository('source-repo');
		const canonicalRepositoryPath = await fs.promises.realpath(repositoryPath);
		const worktreePath = join(testDir, 'worktree-checkout');
		await execGit(repositoryPath, ['worktree', 'add', worktreePath]);

		const project = await resolveGitProject(URI.file(worktreePath));

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file(canonicalRepositoryPath).toString(),
			displayName: 'source-repo',
		});
	});

	test('resolves the repository itself for a normal git working directory', async () => {
		const repositoryPath = await createRepository('normal-repo');
		const canonicalRepositoryPath = await fs.promises.realpath(repositoryPath);

		const project = await resolveGitProject(URI.file(repositoryPath));

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file(canonicalRepositoryPath).toString(),
			displayName: 'normal-repo',
		});
	});

	test('returns undefined outside a git working tree', async () => {
		const folder = join(testDir, 'plain-folder');
		await fs.promises.mkdir(folder);

		assert.strictEqual(await resolveGitProject(URI.file(folder)), undefined);
	});

	test('falls back to repository context when no git project is available', async () => {
		const project = await projectFromCopilotContext({ repository: 'microsoft/vscode' });

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: 'https://github.com/microsoft/vscode',
			displayName: 'vscode',
		});
	});

	test('parses repository URLs', () => {
		const project = projectFromRepository('https://github.com/microsoft/vscode.git');

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: 'https://github.com/microsoft/vscode.git',
			displayName: 'vscode',
		});
	});
});
