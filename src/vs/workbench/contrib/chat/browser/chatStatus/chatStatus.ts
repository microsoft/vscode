/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

export function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.installed ||					// chat not installed
		chatEntitlementService.entitlement === ChatEntitlement.Available;	// not yet signed up to chat
}
