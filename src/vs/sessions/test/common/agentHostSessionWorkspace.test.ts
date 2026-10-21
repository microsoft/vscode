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
import { buildAgentHostChatWorkspace, buildAgentHostChatWorkspaceWithScratchFolders, buildAgentHostSessionWorkspace, type IFolderGitHubInfoResolver } from '../../common/agentHostSessionWorkspace.js';
import { getSessionWorkspaceKind, IGitHubInfo, ISessionWorkspace, SessionWorkspaceKind } from '../../services/sessions/common/session.js';

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

	test('a chat with a folder of its own in a quick chat reports the folder\'s own GitHub info, keeping its Git state', () => {
		const scratch = URI.file('/home/.copilot/chats/s-a');
		const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
		const otherGitHubInfo = constObservable<IGitHubInfo | undefined>({ owner: 'contoso', repo: 'tools', pullRequest: { number: 7, uri: URI.parse('https://github.com/contoso/tools/pull/7') } });
		const resolver: IFolderGitHubInfoResolver = workingDirectory => workingDirectory.toString() === other.toString() ? otherGitHubInfo : undefined;
		const buildOwnWorkspace = (folders: readonly URI[]): ISessionWorkspace => ({
			uri: folders[0], label: 'other', icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: folders.map(folder => ({ root: folder, workingDirectory: folder, name: 'other', description: undefined, gitRepository: { uri: folder, workTreeUri: undefined, baseBranchName: gitState.baseBranchName, branchName: gitState.branchName, gitHubInfo: constObservable(undefined) } })),
		});
		const workspace = buildAgentHostChatWorkspaceWithScratchFolders(undefined, [scratch, other], { has: folder => folder.toString() === scratch.toString() }, buildOwnWorkspace, resolver, gitState, false);

		assert.deepStrictEqual({
			uri: workspace?.uri.toString(),
			label: workspace?.label,
			folders: workspace?.folders.map(folder => ({ workingDirectory: folder.workingDirectory.toString(), branchName: folder.gitRepository?.branchName, gitHubInfo: folder.gitRepository?.gitHubInfo.get() })),
		}, {
			uri: other.toString(),
			label: 'other',
			folders: [{ workingDirectory: other.toString(), branchName: 'feature', gitHubInfo: otherGitHubInfo.get() }],
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

	test('resolves detached folders on their own only when asked', () => {
		const worktree = URI.file('/src/tools.worktrees/task');
		const plainFolder = URI.file('/src/notes');
		const gitState: ISessionGitState = { branchName: 'agents/task', baseBranchName: 'main' };
		const summarize = (workspace: ISessionWorkspace | undefined) => workspace && {
			uri: workspace.uri.toString(),
			label: workspace.label,
			folders: workspace.folders.map(folder => ({
				root: folder.root.toString(),
				workingDirectory: folder.workingDirectory.toString(),
				repository: folder.gitRepository && { uri: folder.gitRepository.uri.toString(), workTreeUri: folder.gitRepository.workTreeUri?.toString(), branchName: folder.gitRepository.branchName },
			})),
		};

		assert.deepStrictEqual({
			attachedOnly: buildAgentHostChatWorkspace(sessionWorkspace, [worktree], undefined, gitState),
			detached: summarize(buildAgentHostChatWorkspace(sessionWorkspace, [worktree, plainFolder], undefined, gitState, true)),
		}, {
			attachedOnly: undefined,
			detached: {
				uri: URI.file('/src/tools').toString(),
				label: 'tools',
				folders: [
					{ root: URI.file('/src/tools').toString(), workingDirectory: worktree.toString(), repository: { uri: URI.file('/src/tools').toString(), workTreeUri: worktree.toString(), branchName: 'agents/task' } },
					{ root: plainFolder.toString(), workingDirectory: plainFolder.toString(), repository: undefined },
				],
			},
		});
	});

	test('projects chat-scoped Git state onto the chat workspace', () => {
		const gitState: ISessionGitState = {
			branchName: 'peer-feature',
			baseBranchName: 'main',
			defaultBranchName: 'main',
			defaultRemoteBranchName: 'origin/main',
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
				defaultBranchName: folder.gitRepository.defaultBranchName,
				defaultRemoteBranchName: folder.gitRepository.defaultRemoteBranchName,
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
				defaultBranchName: 'main',
				defaultRemoteBranchName: 'origin/main',
				hasGitRemote: true,
				hasGitHubRemote: true,
				incomingChanges: 2,
				outgoingChanges: 3,
				uncommittedChanges: 1,
			},
		}]);
	});
	test('a session whose project is the repository of its primary worktree folder presents as a worktree session, with the branch and base branch of its git state (a promoted worktree chat, Block 5)', () => {
		const worktree = URI.file('/repo.worktrees/promoted');
		const options = { providerLabel: undefined, fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true, description: undefined, branchProtectionPatterns: [], group: undefined };
		const gitState: ISessionGitState = { branchName: 'agents/promoted', baseBranchName: 'main' };
		const asWorktree = buildAgentHostSessionWorkspace({ uri: primary, displayName: 'repo' }, [worktree], options, constObservable(undefined), gitState);
		const asFolder = buildAgentHostSessionWorkspace(undefined, [worktree], options, constObservable(undefined), gitState);
		const summarize = (workspace: ISessionWorkspace | undefined) => ({
			kind: getSessionWorkspaceKind(workspace),
			label: workspace?.label,
			workTree: workspace?.folders[0].gitRepository?.workTreeUri?.toString(),
			branch: workspace?.folders[0].gitRepository?.branchName,
			baseBranch: workspace?.folders[0].gitRepository?.baseBranchName,
		});
		assert.deepStrictEqual({ asWorktree: summarize(asWorktree), asFolder: summarize(asFolder) }, {
			asWorktree: { kind: SessionWorkspaceKind.Worktree, label: 'repo', workTree: worktree.toString(), branch: 'agents/promoted', baseBranch: 'main' },
			asFolder: { kind: SessionWorkspaceKind.Folder, label: 'promoted', workTree: undefined, branch: 'agents/promoted', baseBranch: 'main' },
		});
	});
});
