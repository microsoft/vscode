/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ChatConfiguration, isAutoApproveLevel } from '../../../../chat/common/constants.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

/**
 * Returns true if the chat session's permission level (Autopilot/Bypass Approvals)
 * auto-approves all tool calls, unless enterprise policy restricts it.
 * Checks both the request-stamped level and the live picker level.
 */
export function isSessionAutoApproveLevel(
	chatSessionResource: URI,
	configurationService: IConfigurationService,
	chatWidgetService: IChatWidgetService,
	chatService: IChatService,
): boolean {
	const inspected = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove);
	if (inspected.policyValue === false) {
		return false;
	}
	// Check the live widget picker level (handles mid-session switches).
	// Fall back to lastFocusedWidget if the session-specific widget isn't found
	// (e.g., widget was backgrounded or URI mismatch).
	const widget = chatWidgetService.getWidgetBySessionResource(chatSessionResource)
		?? chatWidgetService.lastFocusedWidget;
	if (widget && isAutoApproveLevel(widget.input.currentModeInfo.permissionLevel)) {
		return true;
	}
	// Fall back to the request-stamped level
	const model = chatService.getSession(chatSessionResource);
	const request = model?.getRequests().at(-1);
	return isAutoApproveLevel(request?.modeInfo?.permissionLevel);
}

/**
 * Checks whether a terminal tool is eligible for auto-approval based on user configuration.
 * @param toolReferenceName The tool's reference name (e.g. 'runInTerminal', 'sendToTerminal').
 * @param legacyToolReferenceFullNames Legacy names to check for backward compatibility.
 */
export function isToolEligibleForTerminalAutoApproval(
	toolReferenceName: string,
	configurationService: IConfigurationService,
	legacyToolReferenceFullNames?: string[],
): boolean {
	const config = configurationService.getValue<Record<string, boolean>>(ChatConfiguration.EligibleForAutoApproval);
	if (config && typeof config === 'object') {
		if (Object.prototype.hasOwnProperty.call(config, toolReferenceName)) {
			return config[toolReferenceName];
		}
		if (legacyToolReferenceFullNames) {
			for (const legacyName of legacyToolReferenceFullNames) {
				if (Object.prototype.hasOwnProperty.call(config, legacyName)) {
					return config[legacyName];
				}
			}
		}
	}
	// Default
	return true;
}

/**
 * Determines whether terminal auto-approve rules are allowed to take effect.
 * This checks the setting enablement, the opt-in warning acceptance, and the per-tool eligibility.
 */
export function isTerminalAutoApproveAllowed(
	toolReferenceName: string,
	configurationService: IConfigurationService,
	storageService: IStorageService,
	legacyToolReferenceFullNames?: string[],
): boolean {
	const isEligible = isToolEligibleForTerminalAutoApproval(toolReferenceName, configurationService, legacyToolReferenceFullNames);
	const isAutoApproveEnabled = configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
	const isAutoApproveWarningAccepted = storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
	return isEligible && isAutoApproveEnabled && isAutoApproveWarningAccepted;
}
