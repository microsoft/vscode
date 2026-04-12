/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChatConfiguration, isAutoApproveLevel } from '../../../../chat/common/constants.js';
/**
 * Returns true if the chat session's permission level (Autopilot/Bypass Approvals)
 * auto-approves all tool calls, unless enterprise policy restricts it.
 * Checks both the request-stamped level and the live picker level.
 */
export function isSessionAutoApproveLevel(chatSessionResource, configurationService, chatWidgetService, chatService) {
    const inspected = configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
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
export function isToolEligibleForTerminalAutoApproval(toolReferenceName, configurationService, legacyToolReferenceFullNames) {
    const config = configurationService.getValue(ChatConfiguration.EligibleForAutoApproval);
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
export function isTerminalAutoApproveAllowed(toolReferenceName, configurationService, storageService, legacyToolReferenceFullNames) {
    const isEligible = isToolEligibleForTerminalAutoApproval(toolReferenceName, configurationService, legacyToolReferenceFullNames);
    const isAutoApproveEnabled = configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */) === true;
    const isAutoApproveWarningAccepted = storageService.getBoolean("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, -1 /* StorageScope.APPLICATION */, false);
    return isEligible && isAutoApproveEnabled && isAutoApproveWarningAccepted;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUb29sQXV0b0FwcHJvdmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90ZXJtaW5hbFRvb2xBdXRvQXBwcm92ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVFoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUc3Rjs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QixDQUN4QyxtQkFBd0IsRUFDeEIsb0JBQTJDLEVBQzNDLGlCQUFxQyxFQUNyQyxXQUF5QjtJQUV6QixNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQVUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM3RixJQUFJLFNBQVMsQ0FBQyxXQUFXLEtBQUssS0FBSyxFQUFFLENBQUM7UUFDckMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QscUVBQXFFO0lBQ3JFLDRFQUE0RTtJQUM1RSxtREFBbUQ7SUFDbkQsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsMEJBQTBCLENBQUMsbUJBQW1CLENBQUM7V0FDNUUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUM7SUFDeEMsSUFBSSxNQUFNLElBQUksa0JBQWtCLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUNoRixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCx5Q0FBeUM7SUFDekMsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQzFELE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QyxPQUFPLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUM7QUFDL0QsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUscUNBQXFDLENBQ3BELGlCQUF5QixFQUN6QixvQkFBMkMsRUFDM0MsNEJBQXVDO0lBRXZDLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBMEIsaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUNqSCxJQUFJLE1BQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxQyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsRUFBRSxDQUFDO1lBQ3JFLE9BQU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELElBQUksNEJBQTRCLEVBQUUsQ0FBQztZQUNsQyxLQUFLLE1BQU0sVUFBVSxJQUFJLDRCQUE0QixFQUFFLENBQUM7Z0JBQ3ZELElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUM5RCxPQUFPLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDM0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELFVBQVU7SUFDVixPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsNEJBQTRCLENBQzNDLGlCQUF5QixFQUN6QixvQkFBMkMsRUFDM0MsY0FBK0IsRUFDL0IsNEJBQXVDO0lBRXZDLE1BQU0sVUFBVSxHQUFHLHFDQUFxQyxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixFQUFFLDRCQUE0QixDQUFDLENBQUM7SUFDaEksTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLGlHQUFtRCxLQUFLLElBQUksQ0FBQztJQUN2SCxNQUFNLDRCQUE0QixHQUFHLGNBQWMsQ0FBQyxVQUFVLG9LQUFtRyxLQUFLLENBQUMsQ0FBQztJQUN4SyxPQUFPLFVBQVUsSUFBSSxvQkFBb0IsSUFBSSw0QkFBNEIsQ0FBQztBQUMzRSxDQUFDIn0=