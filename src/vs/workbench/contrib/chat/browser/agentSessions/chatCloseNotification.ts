/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AGENT_SESSIONS_VIEW_ID } from './agentSessions.js';

const STORAGE_KEY = 'chat.closeWithActiveResponse.doNotShowAgain2';

/**
 * Shows a notification when closing a chat with an active response, informing the user
 * that the chat will continue running in the background. The notification includes a button
 * to open the Agent Sessions view and a "Don't Show Again" option.
 */
export function showCloseActiveChatNotification(
	accessor: ServicesAccessor
): void {
	const notificationService = accessor.get(INotificationService);
	const viewsService = accessor.get(IViewsService);

	notificationService.prompt(
		Severity.Info,
		nls.localize('chat.closeWithActiveResponse', "A chat session is in progress. It will continue running in the background."),
		[
			{
				label: nls.localize('chat.openAgentSessions', "Open Agent Sessions"),
				run: async () => {
					await viewsService.openView(AGENT_SESSIONS_VIEW_ID, true);
				}
			}
		],
		{
			neverShowAgain: {
				id: STORAGE_KEY,
				scope: NeverShowAgainScope.APPLICATION
			}
		}
	);
}
