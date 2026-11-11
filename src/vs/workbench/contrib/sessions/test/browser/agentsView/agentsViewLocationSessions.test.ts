/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFolderLocationChangeEvent, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsViewFolderLocationService } from '../../../browser/agentsView/agentsViewFolderLocation.js';
import { AgentsViewLocationSessions } from '../../../browser/agentsView/agentsViewLocationSessions.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('AgentsViewLocationSessions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/repo');
	const worktree = URI.file('/repo.worktrees/feature');

	function create(lastSessions: [URI, URI][], sessions: URI[]) {
		const opened: string[] = [];
		const onDidChange = store.add(new Emitter<IFolderLocationChangeEvent>());
		let folder = primary;
		const last = new ResourceMap<URI>(lastSessions);
		const known = new ResourceMap<ISession>(sessions.map((resource): [URI, ISession] => [resource, upcastPartial<ISession>({ resource })]));
		store.add(new AgentsViewLocationSessions(
			upcastPartial<IWorkspaceFolderLocationService>({ onDidChangeCurrentLocation: onDidChange.event }),
			upcastPartial<IAgentsViewFolderLocationService>({ getLastSession: location => last.get(location) }),
			upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: folder })] }) }),
			upcastPartial<ISessionsManagementService>({ getSession: resource => known.get(resource) }),
			upcastPartial<IAgentsChatPartService>({
				openChat: async session => {
					opened.push(session.resource.toString());
					// Opening the session keeps the folder where it is, a change the user did not pick
					onDidChange.fire({ reason: 'programmatic' });
				}
			}),
		));
		const pick = async (location: URI, reason: IFolderLocationChangeEvent['reason']) => {
			folder = location;
			onDidChange.fire({ reason });
			await Promise.resolve();
		};
		return { opened, pick };
	}

	test('picking a location shows the session last picked there, once, and only for changes the user picked', async () => {
		const a = URI.parse('agent-host-copilot:/a');
		const b = URI.parse('agent-host-copilot:/b');
		const { opened, pick } = create([[worktree, a], [primary, b]], [a, b]);

		await pick(worktree, 'programmatic');
		await pick(worktree, 'user');
		// Returning to the primary location is a pick too
		await pick(primary, 'user');

		assert.deepStrictEqual(opened, [a.toString(), b.toString()]);
	});

	test('a location without a remembered session, or whose session is gone, leaves the chat part as it is', async () => {
		const deleted = URI.parse('agent-host-copilot:/deleted');
		const { opened, pick } = create([[worktree, deleted]], []);

		await pick(worktree, 'user');
		await pick(primary, 'user');

		assert.deepStrictEqual(opened, []);
	});
});
