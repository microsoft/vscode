/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { LEGACY_AGENT_SESSIONS_VIEW_ID } from '../../common/constants.js';
import { AGENT_SESSIONS_VIEW_ID } from '../agentSessions/agentSessions.js';

/**
 * Shows a notification when closing a chat with an active response, informing the user
 * that the chat will continue running in the background. The notification includes a button
 * to open the Agent Sessions view and a "Don't Show Again" option.
 */
export function showCloseActiveChatNotification(accessor: ServicesAccessor): void {
	const notificationService = accessor.get(INotificationService);
	const configurationService = accessor.get(IConfigurationService);
	const commandService = accessor.get(ICommandService);

	notificationService.prompt(
		Severity.Info,
		nls.localize('chat.closeWithActiveResponse', "A chat session is in progress. It will continue running in the background."),
		[
			{
				label: nls.localize('chat.openAgentSessions', "Open Agent Sessions"),
				run: async () => {
					// TODO@bpasero remove this check once settled
					if (configurationService.getValue('chat.agentSessionsViewLocation') === 'single-view') {
						commandService.executeCommand(AGENT_SESSIONS_VIEW_ID);
					} else {
						commandService.executeCommand(LEGACY_AGENT_SESSIONS_VIEW_ID);
					}
				}
			}
		],
		{
			neverShowAgain: {
				id: 'chat.closeWithActiveResponse.doNotShowAgain',
				scope: NeverShowAgainScope.APPLICATION
			}
		}
	);
}
