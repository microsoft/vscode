/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { openAgentSessionsView } from '../agentSessions/agentSessions.js';
import { IChatWidgetService } from '../chat.js';

/**
 * Shows a notification when closing a chat with an active response, informing the user
 * that the chat will continue running in the background. The notification includes a button
 * to open the Agent Sessions view and a "Don't Show Again" option.
 */
export function showCloseActiveChatNotification(accessor: ServicesAccessor, sessionResource?: URI): void {
	const notificationService = accessor.get(INotificationService);
	const chatWidgetService = accessor.get(IChatWidgetService);
	const instantiationService = accessor.get(IInstantiationService);

	const waitAndShowIfNeeded = async () => {
		// Wait to be sure the session wasn't just moving
		await timeout(100);

		if (sessionResource && chatWidgetService.getWidgetBySessionResource(sessionResource)) {
			return;
		}

		notificationService.prompt(
			Severity.Info,
			nls.localize('chat.closeWithActiveResponse', "A chat session is in progress. It will continue running in the background."),
			[
				{
					label: nls.localize('chat.openAgentSessions', "Open Agent Sessions"),
					run: async () => instantiationService.invokeFunction(openAgentSessionsView)
				}
			],
			{
				neverShowAgain: {
					id: 'chat.closeWithActiveResponse.doNotShowAgain2',
					scope: NeverShowAgainScope.APPLICATION
				}
			}
		);
	};

	void waitAndShowIfNeeded();
}
