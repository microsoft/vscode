/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import type { ISessionGitState } from '../../../platform/agentHost/common/state/sessionState.js';
import { buildAgentHostChatWorkspace, buildAgentHostSessionWorkspace, type IFolderGitHubInfoResolver } from '../../common/agentHostSessionWorkspace.js';
import { IGitHubInfo, ISessionWorkspace } from '../../services/sessions/common/session.js';

suite('Agent Host Session Workspace', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/repo');
	const other = URI.file('/other');
	const sessionGitHubInfo = constObservable<IGitHubInfo | undefined>({ owner: 'microsoft', repo: 'vscode' });
	const sessionWorkspace: ISessionWorkspace = {
		uri: primary,
		label: 'repo',
		icon: Codicon.repo,
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
		folders: [
			{ root: primary, workingDirectory: primary, name: 'repo', description: undefined, gitRepository: { uri: primary, workTreeUri: undefined, baseBranchName: 'main', branchName: 'feature', gitHubInfo: sessionGitHubInfo } },
			{ root: other, workingDirectory: other, name: 'other', description: undefined },
		],
	};

	test('reports each folder\'s own GitHub info while keeping the session folder\'s', () => {
		const otherGitHubInfo = observableValue<IGitHubInfo | undefined>('otherGitHubInfo', undefined);
		const resolver: IFolderGitHubInfoResolver = workingDirectory => workingDirectory.toString() === other.toString() ? otherGitHubInfo : sessionGitHubInfo;
		const otherChat = buildAgentHostChatWorkspace(sessionWorkspace, [other], resolver);
		const bothFoldersChat = buildAgentHostChatWorkspace(sessionWorkspace, [primary, other], resolver);
		const summarize = (workspace: ISessionWorkspace | undefined) => workspace?.folders.map(folder => ({
			name: folder.name,
			isRepository: folder.gitRepository?.isRepository?.get(),
			branchName: folder.gitRepository?.branchName,
			gitHubInfo: folder.gitRepository?.gitHubInfo.get(),
		}));

		const beforeResolved = summarize(otherChat);
		otherGitHubInfo.set({ owner: 'contoso', repo: 'tools' }, undefined);

		assert.deepStrictEqual({
			beforeResolved,
			otherChat: summarize(otherChat),
			otherChatLabel: otherChat?.label,
			bothFoldersChat: summarize(bothFoldersChat),
			inheritingChatWithoutResolver: buildAgentHostChatWorkspace(sessionWorkspace, undefined) === sessionWorkspace,
			sessionFolderUnchanged: bothFoldersChat?.folders[0] === sessionWorkspace.folders[0],
		}, {
			beforeResolved: [{ name: 'other', isRepository: false, branchName: undefined, gitHubInfo: undefined }],
			otherChat: [{ name: 'other', isRepository: true, branchName: undefined, gitHubInfo: { owner: 'contoso', repo: 'tools' } }],
			otherChatLabel: 'other',
			bothFoldersChat: [
				{ name: 'repo', isRepository: undefined, branchName: 'feature', gitHubInfo: { owner: 'microsoft', repo: 'vscode' } },
				{ name: 'other', isRepository: true, branchName: undefined, gitHubInfo: { owner: 'contoso', repo: 'tools' } },
			],
			inheritingChatWithoutResolver: true,
			sessionFolderUnchanged: true,
		});
	});

	test('a chat in an additional worktree reports the worktree\'s repository as its project', () => {
		const worktree = URI.file('/src/tools.worktrees/task');
		const plainFolder = URI.file('/src/notes');
		const workspace = buildAgentHostSessionWorkspace(
			{ uri: primary, displayName: 'repo' },
			[primary, worktree, plainFolder],
			{ requiresWorkspaceTrust: false, fallbackIcon: Codicon.folder },
			sessionGitHubInfo,
		);
		const worktreeChat = buildAgentHostChatWorkspace(workspace, [worktree]);

		assert.deepStrictEqual({
			additionalFolders: workspace?.folders.slice(1).map(folder => ({
				root: folder.root.toString(),
				workingDirectory: folder.workingDirectory.toString(),
				name: folder.name,
				repository: folder.gitRepository && { uri: folder.gitRepository.uri.toString(), workTreeUri: folder.gitRepository.workTreeUri?.toString() },
			})),
			worktreeChat: { uri: worktreeChat?.uri.toString(), label: worktreeChat?.label },
		}, {
			additionalFolders: [
				{ root: URI.file('/src/tools').toString(), workingDirectory: worktree.toString(), name: 'tools', repository: { uri: URI.file('/src/tools').toString(), workTreeUri: worktree.toString() } },
				{ root: plainFolder.toString(), workingDirectory: plainFolder.toString(), name: 'notes', repository: undefined },
			],
			worktreeChat: { uri: URI.file('/src/tools').toString(), label: 'tools' },
		});
	});

	test('projects chat-scoped Git state onto the chat workspace', () => {
		const gitState: ISessionGitState = {
			branchName: 'peer-feature',
			baseBranchName: 'main',
			hasGitRemote: true,
			hasGitHubRemote: true,
			incomingChanges: 2,
			outgoingChanges: 3,
			uncommittedChanges: 1,
		};
		const workspace = buildAgentHostChatWorkspace(sessionWorkspace, [other], undefined, gitState);

		assert.deepStrictEqual(workspace?.folders.map(folder => ({
			name: folder.name,
			repository: folder.gitRepository && {
				uri: folder.gitRepository.uri.toString(),
				branchName: folder.gitRepository.branchName,
				baseBranchName: folder.gitRepository.baseBranchName,
				hasGitRemote: folder.gitRepository.hasGitRemote,
				hasGitHubRemote: folder.gitRepository.hasGitHubRemote,
				incomingChanges: folder.gitRepository.incomingChanges,
				outgoingChanges: folder.gitRepository.outgoingChanges,
				uncommittedChanges: folder.gitRepository.uncommittedChanges,
			},
		})), [{
			name: 'other',
			repository: {
				uri: other.toString(),
				branchName: 'peer-feature',
				baseBranchName: 'main',
				hasGitRemote: true,
				hasGitHubRemote: true,
				incomingChanges: 2,
				outgoingChanges: 3,
				uncommittedChanges: 1,
			},
		}]);
	});
});
