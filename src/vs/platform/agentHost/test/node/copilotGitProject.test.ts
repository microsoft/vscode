/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { tryResolvePrimaryWorktreeRoot } from '../../common/agentHostGitService.js';
import { TestAgentHostGitService as BaseTestAgentHostGitService } from '../common/testAgentHostGitService.js';
import { projectFromCopilotContext, projectFromRepository, resolveGitProject } from '../../node/copilot/copilotGitProject.js';

class TestAgentHostGitService extends BaseTestAgentHostGitService {
	repositoryRoot: URI | undefined;
	worktreeRoots: URI[] = [];
	worktreeRootCalls = 0;

	override async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	override async getWorktreeRoots(): Promise<URI[]> {
		this.worktreeRootCalls++;
		return this.worktreeRoots;
	}
}

suite('Copilot Git Project', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let gitService: TestAgentHostGitService;

	setup(() => {
		gitService = new TestAgentHostGitService();
	});

	test('resolves a repository project from a worktree working directory', async () => {
		gitService.repositoryRoot = URI.file('/workspace/worktree-checkout');
		gitService.worktreeRoots = [URI.file('/workspace/source-repo')];

		const project = await resolveGitProject(URI.file('/workspace/worktree-checkout'), gitService);

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file('/workspace/source-repo').toString(),
			displayName: 'source-repo',
		});
	});

	test('resolves the repository itself for a normal git working directory', async () => {
		gitService.repositoryRoot = URI.file('/workspace/normal-repo');

		const project = await resolveGitProject(URI.file('/workspace/normal-repo'), gitService);

		assert.deepStrictEqual({
			uri: project?.uri.toString(),
			displayName: project?.displayName,
		}, {
			uri: URI.file('/workspace/normal-repo').toString(),
			displayName: 'normal-repo',
		});
	});

	test('deduplicates concurrent resolution across linked worktrees', async () => {
		const primaryRoot = URI.file('/workspace/source-repo');
		const checkoutA = URI.file('/workspace/source-repo.worktrees/a');
		const checkoutB = URI.file('/workspace/source-repo.worktrees/b');
		gitService.worktreeRoots = [primaryRoot, checkoutA, checkoutB];

		const roots = await Promise.all([
			tryResolvePrimaryWorktreeRoot(gitService, checkoutA),
			tryResolvePrimaryWorktreeRoot(gitService, checkoutB),
		]);

		assert.deepStrictEqual({
			worktreeRootCalls: gitService.worktreeRootCalls,
			roots: roots.map(root => root?.toString()),
		}, {
			worktreeRootCalls: 1,
			roots: [primaryRoot.toString(), primaryRoot.toString()],
		});
	});

	test('returns undefined outside a git working tree', async () => {
		assert.strictEqual(await resolveGitProject(URI.file('/workspace/plain-folder'), gitService), undefined);
	});

	test('falls back to repository context when no git project is available', async () => {
		const project = await projectFromCopilotContext({ repository: 'microsoft/vscode' }, gitService);

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
