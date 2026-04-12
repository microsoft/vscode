/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { foreground, listActiveSelectionForeground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
export var AgentSessionProviders;
(function (AgentSessionProviders) {
    AgentSessionProviders["Local"] = "local";
    AgentSessionProviders["Background"] = "copilotcli";
    AgentSessionProviders["Cloud"] = "copilot-cloud-agent";
    AgentSessionProviders["Claude"] = "claude-code";
    AgentSessionProviders["Codex"] = "openai-codex";
    AgentSessionProviders["Growth"] = "copilot-growth";
    AgentSessionProviders["AgentHostCopilot"] = "agent-host-copilot";
})(AgentSessionProviders || (AgentSessionProviders = {}));
export function isBuiltInAgentSessionProvider(provider) {
    return provider === AgentSessionProviders.Local ||
        provider === AgentSessionProviders.Background ||
        provider === AgentSessionProviders.Cloud ||
        provider === AgentSessionProviders.Claude;
}
export function getAgentSessionProvider(sessionResource) {
    const type = URI.isUri(sessionResource) ? getChatSessionType(sessionResource) : sessionResource;
    switch (type) {
        case AgentSessionProviders.Local:
        case AgentSessionProviders.Background:
        case AgentSessionProviders.Cloud:
        case AgentSessionProviders.Claude:
        case AgentSessionProviders.Codex:
        case AgentSessionProviders.AgentHostCopilot:
            return type;
        default:
            return undefined;
    }
}
export function getAgentSessionProviderName(provider) {
    switch (provider) {
        case AgentSessionProviders.Local:
            return localize('chat.session.providerLabel.local', "Local");
        case AgentSessionProviders.Background:
            return localize('chat.session.providerLabel.background', "Copilot CLI");
        case AgentSessionProviders.Cloud:
            return localize('chat.session.providerLabel.cloud', "Cloud");
        case AgentSessionProviders.Claude:
            return 'Claude';
        case AgentSessionProviders.Codex:
            return 'Codex';
        case AgentSessionProviders.Growth:
            return 'Growth';
        case AgentSessionProviders.AgentHostCopilot:
            return 'Agent Host - Copilot';
        default:
            return provider;
    }
}
export function getAgentSessionProviderIcon(provider) {
    switch (provider) {
        case AgentSessionProviders.Local:
            return Codicon.vm;
        case AgentSessionProviders.Background:
            return Codicon.worktree;
        case AgentSessionProviders.Cloud:
            return Codicon.cloud;
        case AgentSessionProviders.Codex:
            return Codicon.openai;
        case AgentSessionProviders.Claude:
            return Codicon.claude;
        case AgentSessionProviders.Growth:
            return Codicon.lightbulb;
        case AgentSessionProviders.AgentHostCopilot:
            return Codicon.vscodeInsiders; // default; use getAgentHostIcon() for quality-aware icon
        default:
            return Codicon.extensions;
    }
}
/**
 * Returns the VS Code or VS Code Insiders icon depending on product quality.
 */
export function getAgentHostIcon(productService) {
    return productService.quality === 'stable' ? Codicon.vscode : Codicon.vscodeInsiders;
}
export function isFirstPartyAgentSessionProvider(provider) {
    switch (provider) {
        case AgentSessionProviders.Local:
        case AgentSessionProviders.Background:
        case AgentSessionProviders.Cloud:
        case AgentSessionProviders.AgentHostCopilot:
            return true;
        case AgentSessionProviders.Claude:
        case AgentSessionProviders.Codex:
        case AgentSessionProviders.Growth:
            return false;
        default:
            return false;
    }
}
/**
 * Returns whether the given session type is an agent host target.
 * Matches the local agent host (`agent-host-*`) and remote agent hosts (`remote-*`).
 *
 * Note: The `remote-` prefix convention is established by
 * {@link RemoteAgentHostContribution} which generates session types as
 * `remote-{sanitizedAddress}-{provider}`. If future remote providers that
 * are NOT agent hosts need a different prefix, this function must be updated.
 */
export function isAgentHostTarget(target) {
    return target === AgentSessionProviders.AgentHostCopilot ||
        target.startsWith('agent-host-') ||
        target.startsWith('remote-');
}
export function getAgentCanContinueIn(provider) {
    switch (provider) {
        case AgentSessionProviders.Local:
        case AgentSessionProviders.Background:
        case AgentSessionProviders.Cloud:
            return true;
        case AgentSessionProviders.Claude:
        case AgentSessionProviders.Codex:
        case AgentSessionProviders.Growth:
        case AgentSessionProviders.AgentHostCopilot:
            return false;
        default:
            return false;
    }
}
export function getAgentSessionProviderDescription(provider) {
    switch (provider) {
        case AgentSessionProviders.Local:
            return localize('chat.session.providerDescription.local', "Run tasks within VS Code chat. The agent iterates via chat and works interactively to implement changes on your main workspace.");
        case AgentSessionProviders.Background:
            return localize('chat.session.providerDescription.background', "Delegate tasks to a background agent running locally on your machine. The agent iterates via chat and works asynchronously in a Git worktree to implement changes isolated from your main workspace using the GitHub Copilot CLI.");
        case AgentSessionProviders.Cloud:
            return localize('chat.session.providerDescription.cloud', "Delegate tasks to the GitHub Copilot coding agent. The agent iterates via chat and works asynchronously in the cloud to implement changes and pull requests as needed.");
        case AgentSessionProviders.Claude:
            return localize('chat.session.providerDescription.claude', "Delegate tasks to the Claude Agent SDK using the Claude models included in your GitHub Copilot subscription. The agent iterates via chat and works interactively to implement changes on your main workspace.");
        case AgentSessionProviders.Codex:
            return localize('chat.session.providerDescription.codex', "Opens a new Codex session in the editor. Codex sessions can be managed from the chat sessions view.");
        case AgentSessionProviders.Growth:
            return localize('chat.session.providerDescription.growth', "Learn about Copilot features.");
        case AgentSessionProviders.AgentHostCopilot:
            return 'Run a Copilot SDK agent in a dedicated process.';
        default:
            return '';
    }
}
export var AgentSessionsViewerOrientation;
(function (AgentSessionsViewerOrientation) {
    AgentSessionsViewerOrientation[AgentSessionsViewerOrientation["Stacked"] = 1] = "Stacked";
    AgentSessionsViewerOrientation[AgentSessionsViewerOrientation["SideBySide"] = 2] = "SideBySide";
})(AgentSessionsViewerOrientation || (AgentSessionsViewerOrientation = {}));
export var AgentSessionsViewerPosition;
(function (AgentSessionsViewerPosition) {
    AgentSessionsViewerPosition[AgentSessionsViewerPosition["Left"] = 1] = "Left";
    AgentSessionsViewerPosition[AgentSessionsViewerPosition["Right"] = 2] = "Right";
})(AgentSessionsViewerPosition || (AgentSessionsViewerPosition = {}));
export const agentSessionReadIndicatorForeground = registerColor('agentSessionReadIndicator.foreground', { dark: transparent(foreground, 0.2), light: transparent(foreground, 0.2), hcDark: null, hcLight: null }, localize('agentSessionReadIndicatorForeground', "Foreground color for the read indicator in an agent session."));
export const agentSessionSelectedBadgeBorder = registerColor('agentSessionSelectedBadge.border', { dark: transparent(listActiveSelectionForeground, 0.3), light: transparent(listActiveSelectionForeground, 0.3), hcDark: foreground, hcLight: foreground }, localize('agentSessionSelectedBadgeBorder', "Border color for the badges in selected agent session items."));
export const agentSessionSelectedUnfocusedBadgeBorder = registerColor('agentSessionSelectedUnfocusedBadge.border', { dark: transparent(foreground, 0.3), light: transparent(foreground, 0.3), hcDark: foreground, hcLight: foreground }, localize('agentSessionSelectedUnfocusedBadgeBorder', "Border color for the badges in selected agent session items when the view is unfocused."));
export const AGENT_SESSION_RENAME_ACTION_ID = 'agentSession.rename';
export const AGENT_SESSION_DELETE_ACTION_ID = 'agentSession.delete';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSw2QkFBNkIsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHbkUsTUFBTSxDQUFOLElBQVkscUJBUVg7QUFSRCxXQUFZLHFCQUFxQjtJQUNoQyx3Q0FBZSxDQUFBO0lBQ2Ysa0RBQXlCLENBQUE7SUFDekIsc0RBQTZCLENBQUE7SUFDN0IsK0NBQXNCLENBQUE7SUFDdEIsK0NBQXNCLENBQUE7SUFDdEIsa0RBQXlCLENBQUE7SUFDekIsZ0VBQXVDLENBQUE7QUFDeEMsQ0FBQyxFQVJXLHFCQUFxQixLQUFyQixxQkFBcUIsUUFRaEM7QUFVRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsUUFBNEI7SUFDekUsT0FBTyxRQUFRLEtBQUsscUJBQXFCLENBQUMsS0FBSztRQUM5QyxRQUFRLEtBQUsscUJBQXFCLENBQUMsVUFBVTtRQUM3QyxRQUFRLEtBQUsscUJBQXFCLENBQUMsS0FBSztRQUN4QyxRQUFRLEtBQUsscUJBQXFCLENBQUMsTUFBTSxDQUFDO0FBQzVDLENBQUM7QUFFRCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsZUFBNkI7SUFDcEUsTUFBTSxJ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