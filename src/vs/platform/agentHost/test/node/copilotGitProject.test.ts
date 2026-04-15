/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { projectFromCopilotContext, projectFromRepository, resolveGitProject } from '../../node/copilot/copilotGitProject.js';

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	insideWorkTree = true;
	repositoryRoot: URI | undefined;
	worktreeRoots: URI[] = [];

	async isInsideWorkTree(): Promise<boolean> { return this.insideWorkTree; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return this.worktreeRoots; }
	async addWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
}

suite('Copilot Git Project', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let gitService: TestAgentHostGitService;

	setup(() => {
		gitService = new TestAgentHostGitService();
	});

	test('resolves a repository project from a worktree working directory', async () => {
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

	test('returns undefined outside a git working tree', async () => {
		gitService.insideWorkTree = false;

		assert.strictEqual(await resolveGitProject(URI.file('/workspace/plain-folder'), gitService), undefined);
	});

	test('falls back to repository context when no git project is available', async () => {
		gitService.insideWorkTree = false;

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
