/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { IRecentWorkspace } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { buildSessionWorkspacePickerCatalog } from '../../browser/sessionWorkspacePickerModel.js';

suite('SessionWorkspacePickerModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds canonical tabs and filters recents and browse actions by group', () => {
		const githubAction = browseAction('github', SESSION_WORKSPACE_GROUP_GITHUB);
		const remoteAction = browseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE);
		const customAction = browseAction('custom', 'Zebra');
		const providers = [
			provider('local', true),
			provider('github', false, githubAction),
			provider('remote', false, remoteAction),
			provider('custom', false, customAction),
		];
		const recents = [
			recent('/github/vscode', 'github', SESSION_WORKSPACE_GROUP_GITHUB),
			recent('/local/vscode', 'local', SESSION_WORKSPACE_GROUP_LOCAL),
		];

		const catalog = buildSessionWorkspacePickerCatalog({
			providers,
			recentWorkspaces: recents,
			localBrowseAction: browseAction('', SESSION_WORKSPACE_GROUP_LOCAL),
			remoteAgentHostsEnabled: true,
			activeGroup: SESSION_WORKSPACE_GROUP_GITHUB,
		});

		assert.deepStrictEqual({
			tabs: catalog.tabs.map(tab => tab.id),
			workspaces: catalog.workspaces.map(workspace => [workspace.workspace.label, workspace.providerId]),
			browseActions: catalog.browseActions.map(action => [action.providerId, action.group]),
		}, {
			tabs: [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_REMOTE, 'Zebra'],
			workspaces: [['vscode', 'github']],
			browseActions: [['github', SESSION_WORKSPACE_GROUP_GITHUB]],
		});
	});

	test('preserves recency and provider identity for duplicate workspace URIs', () => {
		const shared = URI.file('/work/shared');
		const catalog = buildSessionWorkspacePickerCatalog({
			providers: [provider('first'), provider('second')],
			recentWorkspaces: [
				recentWorkspace(shared, 'second', false),
				recentWorkspace(shared, 'first', false),
			],
			remoteAgentHostsEnabled: false,
		});

		assert.deepStrictEqual(catalog.workspaces.map(workspace => ({
			uri: workspace.workspace.folders[0].root.toString(),
			providerId: workspace.providerId,
		})), [
			{ uri: shared.toString(), providerId: 'second' },
			{ uri: shared.toString(), providerId: 'first' },
		]);
	});

	test('restores checked selection before recents and skips unavailable or worktree fallbacks', () => {
		const checked = recent('/remote/checked', 'remote', SESSION_WORKSPACE_GROUP_REMOTE, true);
		const unavailable = recent('/remote/unavailable', 'remote', SESSION_WORKSPACE_GROUP_REMOTE);
		const worktree = recent('/work/copilot-worktrees/repo', 'local', SESSION_WORKSPACE_GROUP_LOCAL);
		const fallback = recent('/local/fallback', 'local', SESSION_WORKSPACE_GROUP_LOCAL);
		const providers = [provider('remote'), provider('local')];

		const checkedCatalog = buildSessionWorkspacePickerCatalog({
			providers,
			recentWorkspaces: [unavailable, worktree, fallback],
			ownRecentWorkspaces: [checked],
			remoteAgentHostsEnabled: true,
			isProviderUnavailable: providerId => providerId === 'remote',
		});
		const fallbackCatalog = buildSessionWorkspacePickerCatalog({
			providers,
			recentWorkspaces: [unavailable, worktree, fallback],
			ownRecentWorkspaces: [],
			remoteAgentHostsEnabled: true,
			isProviderUnavailable: providerId => providerId === 'remote',
		});

		assert.deepStrictEqual({
			checked: checkedCatalog.defaultWorkspace?.workspace.label,
			fallback: fallbackCatalog.defaultWorkspace?.workspace.label,
		}, {
			checked: 'checked',
			fallback: 'fallback',
		});
	});
});

function provider(id: string, supportsLocalWorkspaces = false, ...browseActions: ISessionWorkspaceBrowseAction[]): ISessionsProvider {
	return upcastPartial<ISessionsProvider>({
		id,
		order: 0,
		supportsLocalWorkspaces,
		browseActions,
	});
}

function browseAction(providerId: string, group: string): ISessionWorkspaceBrowseAction {
	return {
		label: 'Select...',
		group,
		icon: Codicon.folderOpened,
		providerId,
		run: async () => undefined,
	};
}

function recent(path: string, providerId: string, group: string, checked = false): IRecentWorkspace {
	return recentWorkspace(URI.file(path), providerId, checked, group);
}

function recentWorkspace(uri: URI, providerId: string, checked: boolean, group?: string): IRecentWorkspace {
	const label = uri.path.split('/').filter(Boolean).at(-1) ?? uri.path;
	const workspace: ISessionWorkspace = {
		uri,
		label,
		group,
		icon: Codicon.folder,
		folders: [{
			root: uri,
			workingDirectory: uri,
			name: label,
			description: undefined,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return { workspace, providerId, checked };
}
