/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { WorkingDirectoryOriginKind } from '../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { agentHostSessionWorkspaceKey, buildAgentHostChatWorkspace, buildAgentHostSessionWorkspace, withAgentHostWorkingDirectoryInfo } from '../../common/agentHostSessionWorkspace.js';
import { getSessionWorkspaceKind, sessionWorkspaceEqual, SessionWorkspaceKind } from '../../services/sessions/common/session.js';

suite('AgentHostSessionWorkspace directory information', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const options = { fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true };
	const gitHubInfo = constObservable(undefined);
	const source = 'https://example.com/team/app';
	const api = URI.file('/worktrees/topic/packages/api');
	const web = URI.file('/checkouts/app/packages/web');
	const mainWorktree = URI.file('/checkouts/app');

	test('associates repeated repository sources by directory URI, including chat subsets', () => {
		const workspace = withAgentHostWorkingDirectoryInfo(
			buildAgentHostSessionWorkspace({ uri: mainWorktree, displayName: 'app' }, [api, web], options, gitHubInfo),
			[
				{ uri: web.toString(), repo: source, origin: { kind: WorkingDirectoryOriginKind.Repo } },
				{ uri: api.toString(), repo: source, origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: mainWorktree.toString() } },
			],
		);
		const chat = buildAgentHostChatWorkspace(workspace, [web]);
		assert.deepStrictEqual({
			folders: workspace?.folders.map(folder => ({
				root: folder.root.toString(),
				directory: folder.workingDirectory.toString(),
				repository: folder.repository?.toString(),
				origin: folder.origin?.kind,
				mainWorktree: folder.origin?.kind === 'worktree' ? folder.origin.mainWorktree.toString() : undefined,
			})),
			kind: getSessionWorkspaceKind(workspace),
			chatDirectories: chat?.folders.map(folder => folder.workingDirectory.toString()),
			chatRepository: chat?.folders[0].repository?.toString(),
			chatKind: getSessionWorkspaceKind(chat),
		}, {
			folders: [
				{ root: api.toString(), directory: api.toString(), repository: source, origin: 'worktree', mainWorktree: mainWorktree.toString() },
				{ root: web.toString(), directory: web.toString(), repository: source, origin: 'repo', mainWorktree: undefined },
			],
			kind: SessionWorkspaceKind.Worktree,
			chatDirectories: [web.toString()],
			chatRepository: source,
			chatKind: SessionWorkspaceKind.Folder,
		});
	});

	test('does not mistake a local subdirectory for a worktree or add its repository root', () => {
		const workspace = withAgentHostWorkingDirectoryInfo(
			buildAgentHostSessionWorkspace({ uri: mainWorktree, displayName: 'app' }, [web], options, gitHubInfo),
			[{ uri: web.toString(), repo: source, origin: { kind: WorkingDirectoryOriginKind.Local } }],
		);
		assert.deepStrictEqual({
			roots: workspace?.folders.map(folder => folder.root.toString()),
			worktree: workspace?.folders[0].gitRepository?.workTreeUri,
			kind: getSessionWorkspaceKind(workspace),
		}, {
			roots: [web.toString()],
			worktree: undefined,
			kind: SessionWorkspaceKind.Folder,
		});
	});

	test('retains the existing workspace projection for URI-only peers', () => {
		const workspace = buildAgentHostSessionWorkspace({ uri: mainWorktree, displayName: 'app' }, [api], options, gitHubInfo);
		assert.deepStrictEqual(withAgentHostWorkingDirectoryInfo(workspace, [{ uri: api.toString() }]), workspace);
	});

	test('a metadata-only change invalidates workspace equality and the cache key', () => {
		const base = buildAgentHostSessionWorkspace(undefined, [web], options, gitHubInfo);
		const before = withAgentHostWorkingDirectoryInfo(base, [{ uri: web.toString(), repo: source }]);
		const after = withAgentHostWorkingDirectoryInfo(base, [{ uri: web.toString(), repo: 'https://example.com/another/app' }]);
		assert.deepStrictEqual({
			equal: sessionWorkspaceEqual(before, after),
			sameKey: agentHostSessionWorkspaceKey(before) === agentHostSessionWorkspaceKey(after),
		}, { equal: false, sameKey: false });
	});
});
