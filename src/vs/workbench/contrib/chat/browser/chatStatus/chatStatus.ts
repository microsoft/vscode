/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

/**
 * Shows the Copilot dashboard in the hover of the Copilot status bar entry.
 * Returns whether it shows, which it does not when the status bar hides the entry.
 */
export const SHOW_CHAT_STATUS_DASHBOARD_COMMAND_ID = '_chat.showStatusDashboard';

export function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.completed ||					// setup not completed
		chatEntitlementService.entitlement === ChatEntitlement.Available;	// not yet signed up to chat
}
