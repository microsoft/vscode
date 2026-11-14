/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsListFixtureState, ISessionsViewFixtureOptions, renderSessionsViewFixture } from './sessionsListFixtureUtils.js';

/** The Sessions view of an editor window with the Agents view, which shows the Sessions list as the Agents window does. */
function viewletFixture(state: ISessionsListFixtureState, description: string, options?: ISessionsViewFixtureOptions) {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [description],
		render: async context => { await renderSessionsViewFixture(context, state, options); },


	});
}

/** Sessions of the editor window's workspace, `vscode`, and of three other workspaces. */
const scopedSessions: ISessionsListFixtureState = {
	sessions: [
		{ id: 'working', title: 'Add regression tests', workspace: 'vscode', status: SessionStatus.InProgress },
		{ id: 'completed', title: 'Review the navigation fix', workspace: 'vscode', minutesAgo: 2 },
		{ id: 'tools', title: 'Fix failing CI checks', workspace: 'vscode-tools', minutesAgo: 20 },
		{ id: 'docs', title: 'Update the release notes', workspace: 'vscode-docs', minutesAgo: 45 },
		{ id: 'website', title: 'Refresh the download page', workspace: 'website', minutesAgo: 90 },
	],
};

export default defineThemedFixtureGroup({ path: 'sessions/agentsView/' }, {
	Viewlet: viewletFixture({
		sessions: [
			{ id: 'working', title: 'Add regression tests', workspace: 'vscode', status: SessionStatus.InProgress },
			{ id: 'input', title: 'Approve the test run', workspace: 'vscode', status: SessionStatus.NeedsInput, minutesAgo: 15 },
			{ id: 'completed', title: 'Review the navigation fix', workspace: 'vscode', minutesAgo: 2 },
			{ id: 'tools', title: 'Fix failing CI checks', workspace: 'vscode-tools', minutesAgo: 20 },
		],
	}, 'The Sessions view in the Primary Side Bar of an editor window, without any class of the Agents window: its title shows the actions of the sessions header, such as New Session, and the list shows the sessions by workspace, as in the Agents window, with no Customizations section.'),
	ViewletScoped: viewletFixture(scopedSessions, 'The Sessions view of an editor window whose workspace is vscode: it lists only the two sessions of vscode, and none of the sessions of the three other workspaces, with no row to show more workspaces.', { scopeWorkspaces: ['vscode'] }),
	ViewletEmpty: viewletFixture({
		sessions: [],
	}, 'The Sessions view of an editor window with no sessions: its list is empty, below the title with the actions of the sessions header, such as New Session.'),
});
