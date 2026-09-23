/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { buildAgentHostChatWorkspace, type IFolderGitHubInfoResolver } from '../../common/agentHostSessionWorkspace.js';
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
});
