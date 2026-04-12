/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defaultTerminalAccessibilityCommandsToSkipShell } from '../terminalContrib/accessibility/common/terminal.accessibility.js';
import { terminalAccessibilityConfiguration } from '../terminalContrib/accessibility/common/terminalAccessibilityConfiguration.js';
import { terminalAutoRepliesConfiguration } from '../terminalContrib/autoReplies/common/terminalAutoRepliesConfiguration.js';
import { terminalInitialHintConfiguration } from '../terminalContrib/inlineHint/common/terminalInitialHintConfiguration.js';
import { terminalChatAgentToolsConfiguration } from '../terminalContrib/chatAgentTools/common/terminalChatAgentToolsConfiguration.js';
import { terminalCommandGuideConfiguration } from '../terminalContrib/commandGuide/common/terminalCommandGuideConfiguration.js';
import { defaultTerminalFindCommandToSkipShell } from '../terminalContrib/find/common/terminal.find.js';
import { defaultTerminalHistoryCommandsToSkipShell, terminalHistoryConfiguration } from '../terminalContrib/history/common/terminal.history.js';
import { terminalOscNotificationsConfiguration } from '../terminalContrib/notification/common/terminalNotificationConfiguration.js';
import { terminalStickyScrollConfiguration } from '../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';
import { defaultTerminalSuggestCommandsToSkipShell } from '../terminalContrib/suggest/common/terminal.suggest.js';
import { terminalSuggestConfiguration } from '../terminalContrib/suggest/common/terminalSuggestConfiguration.js';
import { terminalTypeAheadConfiguration } from '../terminalContrib/typeAhead/common/terminalTypeAheadConfiguration.js';
import { terminalZoomConfiguration } from '../terminalContrib/zoom/common/terminal.zoom.js';
// HACK: Export some commands from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export var TerminalContribCommandId;
(function (TerminalContribCommandId) {
    TerminalContribCommandId["A11yFocusAccessibleBuffer"] = "workbench.action.terminal.focusAccessibleBuffer";
    TerminalContribCommandId["DeveloperRestartPtyHost"] = "workbench.action.terminal.restartPtyHost";
    TerminalContribCommandId["OpenTerminalSettingsLink"] = "workbench.action.terminal.chat.openTerminalSettingsLink";
    TerminalContribCommandId["DisableSessionAutoApproval"] = "workbench.action.terminal.chat.disableSessionAutoApproval";
    TerminalContribCommandId["FocusMostRecentChatTerminalOutput"] = "workbench.action.terminal.chat.focusMostRecentChatTerminalOutput";
    TerminalContribCommandId["FocusMostRecentChatTerminal"] = "workbench.action.terminal.chat.focusMostRecentChatTerminal";
    TerminalContribCommandId["ToggleChatTerminalOutput"] = "workbench.action.terminal.chat.toggleChatTerminalOutput";
    TerminalContribCommandId["FocusChatInstanceAction"] = "workbench.action.terminal.chat.focusChatInstance";
    TerminalContribCommandId["ContinueInBackground"] = "workbench.action.terminal.chat.continueInBackground";
})(TerminalContribCommandId || (TerminalContribCommandId = {}));
// HACK: Export some settings from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export var TerminalContribSettingId;
(function (TerminalContribSettingId) {
    TerminalContribSettingId["StickyScrollEnabled"] = "terminal.integrated.stickyScroll.enabled";
    TerminalContribSettingId["SuggestEnabled"] = "terminal.integrated.suggest.enabled";
    TerminalContribSettingId["AutoApprove"] = "chat.tools.terminal.autoApprove";
    TerminalContribSettingId["EnableAutoApprove"] = "chat.tools.terminal.enableAutoApprove";
    TerminalContribSettingId["ShellIntegrationTimeout"] = "chat.tools.terminal.shellIntegrationTimeout";
    TerminalContribSettingId["OutputLocation"] = "chat.tools.terminal.outputLocation";
    TerminalContribSettingId["AgentSandboxEnabled"] = "chat.agent.sandbox.enabled";
    TerminalContribSettingId["DeprecatedAgentSandboxEnabled"] = "chat.agent.sandbox";
    TerminalContribSettingId["DeprecatedAgentSandboxNetworkAllowedDomains"] = "chat.agent.sandboxNetwork.allowedDomains";
    TerminalContribSettingId["DeprecatedAgentSandboxNetworkDeniedDomains"] = "chat.agent.sandboxNetwork.deniedDomains";
    TerminalContribSettingId["DeprecatedAgentSandboxLinuxFileSystem"] = "chat.agent.sandboxFileSystem.linux";
    TerminalContribSettingId["DeprecatedAgentSandboxMacFileSystem"] = "chat.agent.sandboxFileSystem.mac";
    TerminalContribSettingId["AgentSandboxNetworkAllowedDomains"] = "chat.agent.sandbox.allowedNetworkDomains";
    TerminalContribSettingId["AgentSandboxNetworkDeniedDomains"] = "chat.agent.sandbox.deniedNetworkDomains";
    TerminalContribSettingId["AgentSandboxLinuxFileSystem"] = "chat.agent.sandbox.fileSystem.linux";
    TerminalContribSettingId["AgentSandboxMacFileSystem"] = "chat.agent.sandbox.fileSystem.mac";
})(TerminalContribSettingId || (TerminalContribSettingId = {}));
// HACK: Export some context key strings from `terminalContrib/` that are depended upon elsewhere.
// These are soft layer breakers between `terminal/` and `terminalContrib/` but there are
// difficulties in removing the dependency. These are explicitly defined here to avoid an eslint
// line override.
export var TerminalContribContextKeyStrings;
(function (TerminalContribContextKeyStrings) {
    TerminalContribContextKeyStrings["ChatHasTerminals"] = "hasChatTerminals";
    TerminalContribContextKeyStrings["ChatHasHiddenTerminals"] = "hasHiddenChatTerminals";
})(TerminalContribContextKeyStrings || (TerminalContribContextKeyStrings = {}));
// Export configuration schemes from terminalContrib - this is an exception to the eslint rule since
// they need to be declared at part of the rest of the terminal configuration
export const terminalContribConfiguration = {
    ...terminalAccessibilityConfiguration,
    ...terminalAutoRepliesConfiguration,
    ...terminalChatAgentToolsConfiguration,
    ...terminalInitialHintConfiguration,
    ...terminalCommandGuideConfiguration,
    ...terminalHistoryConfiguration,
    ...terminalOscNotificationsConfiguration,
    ...terminalStickyScrollConfiguration,
    ...terminalSuggestConfiguration,
    ...terminalTypeAheadConfiguration,
    ...terminalZoomConfiguration,
};
// Export commands to skip shell from terminalContrib - this is an exception to the eslint rule
// since they need to be included in the terminal module
export const defaultTerminalContribCommandsToSkipShell = [
    ...defaultTerminalAccessibilityCommandsToSkipShell,
    ...defaultTerminalFindCommandToSkipShell,
    ...defaultTerminalHistoryCommandsToSkipShell,
    ...defaultTerminalSuggestCommandsToSkipShell,
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb250cmliRXhwb3J0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFrQywrQ0FBK0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3BLLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ25JLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBRTdILE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQzVILE9BQU8sRUFBRSxtQ0FBbUMsRUFBbUMsTUFBTSxpRkFBaUYsQ0FBQztBQUN2SyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUVoSSxPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUseUNBQXlDLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNoSixPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUNwSSxPQUFPLEVBQWlDLGlDQUFpQyxFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDL0osT0FBTyxFQUFFLHlDQUF5QyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDbEgsT0FBTyxFQUE0Qiw0QkFBNEIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzNJLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ3ZILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRTVGLGlHQUFpRztBQUNqRywrRkFBK0Y7QUFDL0YsK0ZBQStGO0FBQy9GLE1BQU0sQ0FBTixJQUFrQix3QkFVakI7QUFWRCxXQUFrQix3QkFBd0I7SUFDekMseUdBQWdGLENBQUE7SUFDaEYsZ0dBQW1FLENBQUE7SUFDbkUsZ0hBQXlFLENBQUE7SUFDekUsb0hBQTZFLENBQUE7SUFDN0Usa0lBQTJGLENBQUE7SUFDM0Ysc0hBQStFLENBQUE7SUFDL0UsZ0hBQXlFLENBQUE7SUFDekUsd0dBQXVFLENBQUE7SUFDdkUsd0dBQWlFLENBQUE7QUFDbEUsQ0FBQyxFQVZpQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBVXpDO0FBRUQsaUdBQWlHO0FBQ2pHLCtGQUErRjtBQUMvRiwrRkFBK0Y7QUFDL0YsTUFBTSxDQUFOLElBQWtCLHdCQWlCakI7QUFqQkQsV0FBa0Isd0JBQXdCO0lBQ3pDLDRGQUEyRCxDQUFBO0lBQzNELGtGQUFpRCxDQUFBO0lBQ2pELDJFQUF5RCxDQUFBO0lBQ3pELHVGQUFxRSxDQUFBO0lBQ3JFLG1HQUFpRixDQUFBO0lBQ2pGLGlGQUErRCxDQUFBO0lBQy9ELDhFQUF5RSxDQUFBO0lBQ3pFLGdGQUE2RixDQUFBO0lBQzdGLG9IQUF5SCxDQUFBO0lBQ3pILGtIQUF1SCxDQUFBO0lBQ3ZILHdHQUE2RyxDQUFBO0lBQzdHLG9HQUF5RyxDQUFBO0lBQ3pHLDBHQUFxRyxDQUFBO0lBQ3JHLHdHQUFtRyxDQUFBO0lBQ25HLCtGQUF5RixDQUFBO0lBQ3pGLDJGQUFxRixDQUFBO0FBQ3RGLENBQUMsRUFqQmlCLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFpQnpDO0FBRUQsa0dBQWtHO0FBQ2xHLHlGQUF5RjtBQUN6RixnR0FBZ0c7QUFDaEcsaUJBQWlCO0FBQ2pCLE1BQU0sQ0FBTixJQUFrQixnQ0FHakI7QUFIRCxXQUFrQixnQ0FBZ0M7SUFDakQseUVBQWlFLENBQUE7SUFDakUscUZBQTZFLENBQUE7QUFDOUUsQ0FBQyxFQUhpQixnQ0FBZ0MsS0FBaEMsZ0NBQWdDLFFBR2pEO0FBRUQsb0dBQW9HO0FBQ3BHLDZFQUE2RTtBQUM3RSxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBcUM7SUFDN0UsR0FBRyxrQ0FBa0M7SUFDckMsR0FBRyxnQ0FBZ0M7SUFDbkMsR0FBRyxtQ0FBbUM7SUFDdEMsR0FBRyxnQ0FBZ0M7SUFDbkMsR0FBRyxpQ0FBaUM7SUFDcEMsR0FBRyw0QkFBNEI7SUFDL0IsR0FBRyxxQ0FBcUM7SUFDeEMsR0FBRyxpQ0FBaUM7SUFDcEMsR0FBRyw0QkFBNEI7SUFDL0IsR0FBRyw4QkFBOEI7SUFDakMsR0FBRyx5QkFBeUI7Q0FDNUIsQ0FBQztBQUVGLCtGQUErRjtBQUMvRix3REFBd0Q7QUFDeEQsTUFBTSxDQUFDLE1BQU0seUNBQXlDLEdBQUc7SUFDeEQsR0FBRywrQ0FBK0M7SUFDbEQsR0FBRyxxQ0FBcUM7SUFDeEMsR0FBRyx5Q0FBeUM7SUFDNUMsR0FBRyx5Q0FBeUM7Q0FDNUMsQ0FBQyJ9