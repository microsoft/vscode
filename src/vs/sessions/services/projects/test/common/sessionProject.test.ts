/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionFolder } from '../../../sessions/common/session.js';
import { getSessionFolderProjectIdentity, getSessionProjectIdentity } from '../../common/sessionProject.js';

function folder(root: URI, git?: { readonly uri: URI; readonly workTreeUri?: URI; readonly owner?: string; readonly repo?: string }): ISessionFolder {
	return {
		root,
		workingDirectory: root,
		name: root.path.split('/').pop() ?? '',
		description: undefined,
		gitRepository: git && {
			uri: git.uri,
			workTreeUri: git.workTreeUri,
			baseBranchName: undefined,
			gitHubInfo: constObservable(git.owner && git.repo ? { owner: git.owner, repo: git.repo } : undefined),
		},
	};
}

suite('SessionProject', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies projects by repository, subfolder, and host-scoped folder', () => {
		const repo = URI.file('/src/vscode');
		const keyOf = (f: ISessionFolder) => getSessionFolderProjectIdentity(f).key;
		assert.deepStrictEqual({
			checkout: keyOf(folder(repo, { uri: repo, owner: 'Microsoft', repo: 'VSCode' })),
			otherCheckoutOnAnotherHost: keyOf(folder(URI.from({ scheme: 'vscode-agent-host', authority: 'ssh-box', path: '/home/me/vscode' }), { uri: URI.from({ scheme: 'vscode-agent-host', authority: 'ssh-box', path: '/home/me/vscode' }), owner: 'microsoft', repo: 'vscode' })),
			worktree: keyOf(folder(URI.file('/src/vscode.worktrees/feature'), { uri: repo, workTreeUri: URI.file('/src/vscode.worktrees/feature'), owner: 'microsoft', repo: 'vscode' })),
			subfolder: keyOf(folder(URI.file('/src/vscode/extensions/git'), { uri: repo, owner: 'microsoft', repo: 'vscode' })),
			fork: keyOf(folder(URI.file('/src/fork'), { uri: URI.file('/src/fork'), owner: 'someone', repo: 'vscode' })),
			cloud: keyOf(folder(URI.from({ scheme: 'github-remote-file', authority: 'github', path: '/microsoft/vscode/main' }))),
			cloudPending: keyOf(folder(URI.parse('https://github.com/microsoft/vscode'))),
			nonGitHubRepository: keyOf(folder(URI.file('/src/tool'), { uri: URI.file('/src/tool') })),
			nonGitHubWorktree: keyOf(folder(URI.file('/src/tool.worktrees/a'), { uri: URI.file('/src/tool'), workTreeUri: URI.file('/src/tool.worktrees/a') })),
			worktreeReportingItselfAsRepository: keyOf(folder(URI.file('/src/tool.worktrees/b'), { uri: URI.file('/src/tool.worktrees/b') })),
			folderOutsideItsPendingWorktree: keyOf(folder(repo, { uri: repo, workTreeUri: URI.file('/src/vscode.worktrees/pending'), owner: 'microsoft', repo: 'vscode' })),
			plainFolder: keyOf(folder(URI.file('/notes'))),
		}, {
			checkout: 'github:microsoft/vscode',
			otherCheckoutOnAnotherHost: 'github:microsoft/vscode',
			worktree: 'github:microsoft/vscode',
			subfolder: 'github:microsoft/vscode/extensions/git',
			fork: 'github:someone/vscode',
			cloud: 'github:microsoft/vscode',
			cloudPending: 'github:microsoft/vscode',
			nonGitHubRepository: 'git:file:///src/tool',
			nonGitHubWorktree: 'git:file:///src/tool',
			worktreeReportingItselfAsRepository: 'git:file:///src/tool',
			folderOutsideItsPendingWorktree: 'github:microsoft/vscode',
			plainFolder: 'folder:file:///notes',
		});
	});

	test('names a subfolder project with its relative directory', () => {
		const identity = getSessionProjectIdentity({
			root: URI.file('/src/vscode/extensions/git'),
			name: 'git',
			gitHubRepository: { owner: 'microsoft', repo: 'vscode' },
			repositoryUri: URI.file('/src/vscode'),
		});
		assert.deepStrictEqual({ ...identity, repositoryUri: identity.repositoryUri?.toString() }, {
			key: 'github:microsoft/vscode/extensions/git',
			kind: 'repository',
			label: 'vscode/extensions/git',
			gitHubRepository: { owner: 'microsoft', repo: 'vscode' },
			relativePath: 'extensions/git',
			repositoryUri: 'file:///src/vscode',
		});
	});
});
