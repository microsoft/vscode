/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { IAgentsViewFolderLocationService } from './agentsViewFolderLocation.js';

/**
 * As the user picks a location of the window's folder, such as from the folder location picker or by returning to its
 * primary location, the chat part shows the session the user last picked at that location, if any. Changes that the
 * user did not pick, such as one that opening a session makes, a restore, or the return as AI features are disabled,
 * open nothing. Showing the session keeps the folder at the picked location, so it neither comes back here nor moves on.
 */
export class AgentsViewLocationSessions extends Disposable {

	constructor(
		@IWorkspaceFolderLocationService workspaceFolderLocationService: IWorkspaceFolderLocationService,
		@IAgentsViewFolderLocationService private readonly _agentsViewFolderLocationService: IAgentsViewFolderLocationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentsChatPartService private readonly _agentsChatPartService: IAgentsChatPartService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._register(workspaceFolderLocationService.onDidChangeLocation(e => {
			// Read as the change comes: a pick still under way as AI features were disabled shows no chat once it completes
			if (e.reason === 'user' && this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key)) {
				this._showLastSession(e.folder.uri).catch(onUnexpectedError);
			}
		}));
	}

	private async _showLastSession(location: URI): Promise<void> {
		const resource = this._agentsViewFolderLocationService.getLastSession(location);
		// A session that is no longer known, such as one deleted meanwhile, shows nothing
		const session = resource && this._sessionsManagementService.getSession(resource);
		if (session) {
			// The folder stays at the location the user picked, also when the session has come to work elsewhere since
			await this._agentsChatPartService.openChat(session, undefined, { keepFolder: true });
			// Not opened through a move of the folder, which is what marks a location as used otherwise
			this._agentsViewFolderLocationService.touchLocation(location);
		}
	}
}
