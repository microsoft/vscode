/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import product from '../../../../../platform/product/common/product.js';
import { isObject } from '../../../../../base/common/types.js';

export const defaultChat = {
	completionsEnablementSetting: product.defaultChatAgent?.completionsEnablementSetting ?? '',
	nextEditSuggestionsSetting: product.defaultChatAgent?.nextEditSuggestionsSetting ?? '',
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	manageOverageUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};


export function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.installed ||					// chat not installed
		chatEntitlementService.entitlement === ChatEntitlement.Available;	// not yet signed up to chat
}

export function canUseChat(chatEntitlementService: IChatEntitlementService): boolean {
	if (!chatEntitlementService.sentiment.installed || chatEntitlementService.sentiment.disabled || chatEntitlementService.sentiment.untrusted) {
		return false; // chat not installed or not enabled
	}

	if (chatEntitlementService.entitlement === ChatEntitlement.Unknown || chatEntitlementService.entitlement === ChatEntitlement.Available) {
		return chatEntitlementService.anonymous; // signed out or not-yet-signed-up users can only use Chat if anonymous access is allowed
	}

	if (chatEntitlementService.entitlement === ChatEntitlement.Free && chatEntitlementService.quotas.chat?.percentRemaining === 0 && chatEntitlementService.quotas.completions?.percentRemaining === 0) {
		return false; // free user with no quota left
	}

	return true;
}

export function isCompletionsEnabled(configurationService: IConfigurationService, modeId: string = '*'): boolean {
	const result = configurationService.getValue<Record<string, boolean>>(defaultChat.completionsEnablementSetting);
	if (!isObject(result)) {
		return false;
	}

	if (typeof result[modeId] !== 'undefined') {
		return Boolean(result[modeId]); // go with setting if explicitly defined
	}

	return Boolean(result['*']); // fallback to global setting otherwise
}
