/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRepositoryRootFromWorktree, isAgentWorktreeBranch } from '../../common/worktreePaths.js';

suite('worktreePaths', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes prefixed branches from the original branch and worktree path without the current setting', () => {
		const repository = URI.file('/src/repo');
		const worktree = URI.file('/src/repo.worktrees/task');
		const branches = ['agents/task', 'user/agents/task', 'team/user/agents/task', 'user-agents/task', 'agents/team/agents/task', 'agents/old-name'];
		assert.deepStrictEqual(branches.map(branch => isAgentWorktreeBranch(branch, worktree, repository)), branches.map(() => true));
	});

	test('requires the complete generated name and repository layout for prefixed branches', () => {
		const repository = URI.file('/src/repo');
		const worktree = URI.file('/src/repo.worktrees/task');
		assert.deepStrictEqual({
			branches: ['main', 'task', 'agents-task', 'user/agents/other', 'user/agents/task-extra', 'user/agents/task/extra', 'user/agents/', '', 'agents/team/agents/other'].map(branch => isAgentWorktreeBranch(branch, worktree, repository)),
			paths: ['/src/repo', '/src/repo.worktrees', '/src/repo.worktrees/other/task', '/src/other.worktrees/task', '/elsewhere/task'].map(path => isAgentWorktreeBranch('user/agents/task', URI.file(path), repository)),
		}, { branches: Array(9).fill(false), paths: Array(5).fill(false) });
	});

	test('recognizes prefixed branches in mapped remote URI spaces without crossing repositories', () => {
		const repository = URI.parse('vscode-agent-host://remote/src/repo');
		const worktree = URI.parse('vscode-agent-host://remote/src/repo.worktrees/task');
		assert.deepStrictEqual([
			isAgentWorktreeBranch('user/agents/task', worktree, repository),
			isAgentWorktreeBranch('user/agents/task', worktree, repository.with({ authority: 'other' })),
		], [true, false]);
	});

	test('derives the repository of a VS Code-created worktree from its path', () => {
		const derive = (uri: URI) => getRepositoryRootFromWorktree(uri)?.toString();

		assert.deepStrictEqual({
			local: derive(URI.file('/src/vscode.worktrees/task')),
			remote: derive(URI.parse('vscode-agent-host://remote/home/me/app.worktrees/task')),
			notAWorktree: derive(URI.file('/src/vscode')),
			nested: derive(URI.file('/src/vscode.worktrees/task/packages')),
			unnamed: derive(URI.file('/src/.worktrees/task')),
		}, {
			local: URI.file('/src/vscode').toString(),
			remote: 'vscode-agent-host://remote/home/me/app',
			notAWorktree: undefined,
			nested: undefined,
			unnamed: undefined,
		});
	});
});
