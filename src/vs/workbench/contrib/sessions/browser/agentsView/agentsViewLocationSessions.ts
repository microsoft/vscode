/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { IAgentsViewFolderLocationService } from './agentsViewFolderLocation.js';

/**
 * As the user picks a location of the window's folder, such as from the folder location picker or by returning to its
 * primary location, the chat part shows the session the user last picked at that location, if any. Changes that the
 * user did not pick, such as one that opening a session makes, a restore, or the return as AI features are disabled,
 * open nothing, so opening that session, which keeps the folder where it is, does not come back here.
 */
export class AgentsViewLocationSessions extends Disposable {

	constructor(
		@IWorkspaceFolderLocationService workspaceFolderLocationService: IWorkspaceFolderLocationService,
		@IAgentsViewFolderLocationService private readonly _agentsViewFolderLocationService: IAgentsViewFolderLocationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentsChatPartService private readonly _agentsChatPartService: IAgentsChatPartService,
	) {
		super();
		this._register(workspaceFolderLocationService.onDidChangeCurrentLocation(e => {
			if (e.reason === 'user') {
				this._showLastSession().catch(onUnexpectedError);
			}
		}));
	}

	private async _showLastSession(): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const resource = folder && this._agentsViewFolderLocationService.getLastSession(folder.uri);
		// A session that is no longer known, such as one deleted meanwhile, shows nothing
		const session = resource && this._sessionsManagementService.getSession(resource);
		if (session) {
			await this._agentsChatPartService.openChat(session, undefined);
		}
	}
}
