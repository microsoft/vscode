/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { buildAgentHostChatWorkspace } from '../../common/agentHostSessionWorkspace.js';
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

	test('reports a folder scope\'s own GitHub info on the chat\'s primary folder', () => {
		const scopeGitHubInfo = observableValue<IGitHubInfo | undefined>('scopeGitHubInfo', undefined);
		const otherChat = buildAgentHostChatWorkspace(sessionWorkspace, [other], scopeGitHubInfo);
		const primaryChat = buildAgentHostChatWorkspace(sessionWorkspace, [primary, other], scopeGitHubInfo);
		const summarize = (workspace: ISessionWorkspace | undefined) => ({
			label: workspace?.label,
			isRepository: workspace?.folders[0].gitRepository?.isRepository?.get(),
			branchName: workspace?.folders[0].gitRepository?.branchName,
			gitHubInfo: workspace?.folders[0].gitRepository?.gitHubInfo.get(),
		});

		const beforeResolved = summarize(otherChat);
		scopeGitHubInfo.set({ owner: 'contoso', repo: 'tools' }, undefined);

		assert.deepStrictEqual({
			beforeResolved,
			otherChat: summarize(otherChat),
			primaryChat: summarize(primaryChat),
			defaultScopeChat: buildAgentHostChatWorkspace(sessionWorkspace, undefined) === sessionWorkspace,
			sessionUnchanged: sessionWorkspace.folders[0].gitRepository?.gitHubInfo.get(),
		}, {
			beforeResolved: { label: 'other', isRepository: false, branchName: undefined, gitHubInfo: undefined },
			otherChat: { label: 'other', isRepository: true, branchName: undefined, gitHubInfo: { owner: 'contoso', repo: 'tools' } },
			primaryChat: { label: 'repo', isRepository: undefined, branchName: 'feature', gitHubInfo: { owner: 'contoso', repo: 'tools' } },
			defaultScopeChat: true,
			sessionUnchanged: { owner: 'microsoft', repo: 'vscode' },
		});
	});
});
