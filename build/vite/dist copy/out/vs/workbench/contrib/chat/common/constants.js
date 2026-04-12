/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export var ChatConfiguration;
(function (ChatConfiguration) {
    ChatConfiguration["AIDisabled"] = "chat.disableAIFeatures";
    ChatConfiguration["PluginsEnabled"] = "chat.plugins.enabled";
    ChatConfiguration["PluginLocations"] = "chat.pluginLocations";
    ChatConfiguration["PluginMarketplaces"] = "chat.plugins.marketplaces";
    ChatConfiguration["AgentEnabled"] = "chat.agent.enabled";
    ChatConfiguration["PlanAgentDefaultModel"] = "chat.planAgent.defaultModel";
    ChatConfiguration["ExploreAgentDefaultModel"] = "chat.exploreAgent.defaultModel";
    ChatConfiguration["RequestQueueingDefaultAction"] = "chat.requestQueuing.defaultAction";
    ChatConfiguration["AgentStatusEnabled"] = "chat.agentsControl.enabled";
    ChatConfiguration["EditorAssociations"] = "chat.editorAssociations";
    ChatConfiguration["UnifiedAgentsBar"] = "chat.unifiedAgentsBar.enabled";
    ChatConfiguration["AgentSessionProjectionEnabled"] = "chat.agentSessionProjection.enabled";
    ChatConfiguration["EditModeHidden"] = "chat.editMode.hidden";
    ChatConfiguration["ExtensionToolsEnabled"] = "chat.extensionTools.enabled";
    ChatConfiguration["RepoInfoEnabled"] = "chat.repoInfo.enabled";
    ChatConfiguration["EditRequests"] = "chat.editRequests";
    ChatConfiguration["InlineReferencesStyle"] = "chat.inlineReferences.style";
    ChatConfiguration["AutoReply"] = "chat.autoReply";
    ChatConfiguration["GlobalAutoApprove"] = "chat.tools.global.autoApprove";
    ChatConfiguration["AutoApproveEdits"] = "chat.tools.edits.autoApprove";
    ChatConfiguration["AutoApprovedUrls"] = "chat.tools.urls.autoApprove";
    ChatConfiguration["EligibleForAutoApproval"] = "chat.tools.eligibleForAutoApproval";
    ChatConfiguration["EnableMath"] = "chat.math.enabled";
    ChatConfiguration["CheckpointsEnabled"] = "chat.checkpoints.enabled";
    ChatConfiguration["ThinkingStyle"] = "chat.agent.thinkingStyle";
    ChatConfiguration["ThinkingGenerateTitles"] = "chat.agent.thinking.generateTitles";
    ChatConfiguration["TerminalToolsInThinking"] = "chat.agent.thinking.terminalTools";
    ChatConfiguration["SimpleTerminalCollapsible"] = "chat.tools.terminal.simpleCollapsible";
    ChatConfiguration["ThinkingPhrases"] = "chat.agent.thinking.phrases";
    ChatConfiguration["AutoExpandToolFailures"] = "chat.tools.autoExpandFailures";
    ChatConfiguration["TodosShowWidget"] = "chat.tools.todos.showWidget";
    ChatConfiguration["NotifyWindowOnConfirmation"] = "chat.notifyWindowOnConfirmation";
    ChatConfiguration["NotifyWindowOnResponseReceived"] = "chat.notifyWindowOnResponseReceived";
    ChatConfiguration["ChatViewSessionsEnabled"] = "chat.viewSessions.enabled";
    ChatConfiguration["ChatViewSessionsGrouping"] = "chat.viewSessions.grouping";
    ChatConfiguration["ChatViewSessionsOrientation"] = "chat.viewSessions.orientation";
    ChatConfiguration["ChatViewProgressBadgeEnabled"] = "chat.viewProgressBadge.enabled";
    ChatConfiguration["ChatContextUsageEnabled"] = "chat.contextUsage.enabled";
    ChatConfiguration["SubagentToolCustomAgents"] = "chat.customAgentInSubagent.enabled";
    ChatConfiguration["GeneralPurposeAgentEnabled"] = "chat.generalPurposeAgent.enabled";
    ChatConfiguration["SubagentsAllowInvocationsFromSubagents"] = "chat.subagents.allowInvocationsFromSubagents";
    ChatConfiguration["ShowCodeBlockProgressAnimation"] = "chat.agent.codeBlockProgress";
    ChatConfiguration["RestoreLastPanelSession"] = "chat.restoreLastPanelSession";
    ChatConfiguration["ExitAfterDelegation"] = "chat.exitAfterDelegation";
    ChatConfiguration["ExplainChangesEnabled"] = "chat.editing.explainChanges.enabled";
    ChatConfiguration["RevealNextChangeOnResolve"] = "chat.editing.revealNextChangeOnResolve";
    ChatConfiguration["GrowthNotificationEnabled"] = "chat.growthNotification.enabled";
    ChatConfiguration["SignInTitleBarEnabled"] = "chat.signInTitleBar.enabled";
    ChatConfiguration["ChatCustomizationMenuEnabled"] = "chat.customizationsMenu.enabled";
    ChatConfiguration["ChatCustomizationHarnessSelectorEnabled"] = "chat.customizations.harnessSelector.enabled";
    ChatConfiguration["AutopilotEnabled"] = "chat.autopilot.enabled";
    ChatConfiguration["ImageCarouselEnabled"] = "imageCarousel.chat.enabled";
    ChatConfiguration["ArtifactsEnabled"] = "chat.artifacts.enabled";
    ChatConfiguration["ArtifactsMode"] = "chat.artifacts.mode";
    ChatConfiguration["ArtifactsRulesByMimeType"] = "chat.artifacts.rules.byMimeType";
    ChatConfiguration["ArtifactsRulesByFilePath"] = "chat.artifacts.rules.byFilePath";
    ChatConfiguration["CustomizationsProviderApi"] = "chat.customizations.providerApi.enabled";
    ChatConfiguration["DefaultNewSessionMode"] = "chat.newSession.defaultMode";
})(ChatConfiguration || (ChatConfiguration = {}));
/**
 * The "kind" of agents for custom agents.
 */
export var ChatModeKind;
(function (ChatModeKind) {
    ChatModeKind["Ask"] = "ask";
    ChatModeKind["Edit"] = "edit";
    ChatModeKind["Agent"] = "agent";
})(ChatModeKind || (ChatModeKind = {}));
/**
 * The permission level controlling tool auto-approval behavior.
 */
export var ChatPermissionLevel;
(function (ChatPermissionLevel) {
    /** Use existing auto-approve settings */
    ChatPermissionLevel["Default"] = "default";
    /** Auto-approve all tool calls, auto-retry on error */
    ChatPermissionLevel["AutoApprove"] = "autoApprove";
    /** Everything AutoApprove does plus an internal stop hook that continues until the task is done */
    ChatPermissionLevel["Autopilot"] = "autopilot";
})(ChatPermissionLevel || (ChatPermissionLevel = {}));
/**
 * Returns true if the permission level enables auto-approval of all tool calls.
 * Both {@link ChatPermissionLevel.AutoApprove} and {@link ChatPermissionLevel.Autopilot} enable auto-approval.
 */
export function isAutoApproveLevel(level) {
    return level === ChatPermissionLevel.AutoApprove || level === ChatPermissionLevel.Autopilot;
}
// Thinking display modes for pinned content
export var ThinkingDisplayMode;
(function (ThinkingDisplayMode) {
    ThinkingDisplayMode["Collapsed"] = "collapsed";
    ThinkingDisplayMode["CollapsedPreview"] = "collapsedPreview";
    ThinkingDisplayMode["FixedScrolling"] = "fixedScrolling";
})(ThinkingDisplayMode || (ThinkingDisplayMode = {}));
export var CollapsedToolsDisplayMode;
(function (CollapsedToolsDisplayMode) {
    CollapsedToolsDisplayMode["Off"] = "off";
    CollapsedToolsDisplayMode["WithThinking"] = "withThinking";
    CollapsedToolsDisplayMode["Always"] = "always";
})(CollapsedToolsDisplayMode || (CollapsedToolsDisplayMode = {}));
export var ChatNotificationMode;
(function (ChatNotificationMode) {
    ChatNotificationMode["Off"] = "off";
    ChatNotificationMode["WindowNotFocused"] = "windowNotFocused";
    ChatNotificationMode["Always"] = "always";
})(ChatNotificationMode || (ChatNotificationMode = {}));
export var ChatAgentLocation;
(function (ChatAgentLocation) {
    /**
     * This is chat, whether it's in the sidebar, a chat editor, or quick chat.
     * Leaving the values alone as they are in stored data so we don't have to normalize them.
     */
    ChatAgentLocation["Chat"] = "panel";
    ChatAgentLocation["Terminal"] = "terminal";
    ChatAgentLocation["Notebook"] = "notebook";
    /**
     * EditorInline means inline chat in a text editor.
     */
    ChatAgentLocation["EditorInline"] = "editor";
})(ChatAgentLocation || (ChatAgentLocation = {}));
(function (ChatAgentLocation) {
    function fromRaw(value) {
        switch (value) {
            case 'panel': return ChatAgentLocation.Chat;
            case 'terminal': return ChatAgentLocation.Terminal;
            case 'notebook': return ChatAgentLocation.Notebook;
            case 'editor': return ChatAgentLocation.EditorInline;
        }
        return ChatAgentLocation.Chat;
    }
    ChatAgentLocation.fromRaw = fromRaw;
})(ChatAgentLocation || (ChatAgentLocation = {}));
/**
 * List of file schemes that are always unsupported for use in chat
 */
const chatAlwaysUnsupportedFileSchemes = new Set([
    Schemas.vscodeChatEditor,
    Schemas.walkThrough,
    Schemas.vscodeLocalChatSession,
    Schemas.vscodeSettings,
    Schemas.webviewPanel,
    Schemas.vscodeUserData,
    Schemas.extension,
    'ccreq',
    'openai-codex', // Codex session custom editor scheme
]);
export function isSupportedChatFileScheme(accessor, scheme) {
    const chatService = accessor.get(IChatSessionsService);
    // Exclude schemes we always know are bad
    if (chatAlwaysUnsupportedFileSchemes.has(scheme)) {
        return false;
    }
    // Plus any schemes used by content providers
    if (chatService.getContentProviderSchemes().includes(scheme)) {
        return false;
    }
    // Everything else is supported
    return true;
}
export const MANAGE_CHAT_COMMAND_ID = 'workbench.action.chat.manage';
export const ChatEditorTitleMaxLength = 30;
export const CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES = 1000;
export const CONTEXT_MODELS_EDITOR = new RawContextKey('inModelsEditor', false);
export const CONTEXT_MODELS_SEARCH_FOCUS = new RawContextKey('inModelsSearch', false);
/**
 * The built-in general-purpose agent name. When the model uses this name,
 * the subagent inherits the parent's system prompt, model, and tools.
 */
export const GeneralPurposeAgentName = 'General Purpose';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVoRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckYsTUFBTSxDQUFOLElBQVksaUJBMkRYO0FBM0RELFdBQVksaUJBQWlCO0lBQzVCLDBEQUFxQyxDQUFBO0lBQ3JDLDREQUF1QyxDQUFBO0lBQ3ZDLDZEQUF3QyxDQUFBO0lBQ3hDLHFFQUFnRCxDQUFBO0lBQ2hELHdEQUFtQyxDQUFBO0lBQ25DLDBFQUFxRCxDQUFBO0lBQ3JELGdGQUEyRCxDQUFBO0lBQzNELHVGQUFrRSxDQUFBO0lBQ2xFLHNFQUFpRCxDQUFBO0lBQ2pELG1FQUE4QyxDQUFBO0lBQzlDLHVFQUFrRCxDQUFBO0lBQ2xELDBGQUFxRSxDQUFBO0lBQ3JFLDREQUF1QyxDQUFBO0lBQ3ZDLDBFQUFxRCxDQUFBO0lBQ3JELDhEQUF5QyxDQUFBO0lBQ3pDLHVEQUFrQyxDQUFBO0lBQ2xDLDBFQUFxRCxDQUFBO0lBQ3JELGlEQUE0QixDQUFBO0lBQzVCLHdFQUFtRCxDQUFBO0lBQ25ELHNFQUFpRCxDQUFBO0lBQ2pELHFFQUFnRCxDQUFBO0lBQ2hELG1GQUE4RCxDQUFBO0lBQzlELHFEQUFnQyxDQUFBO0lBQ2hDLG9FQUErQyxDQUFBO0lBQy9DLCtEQUEwQyxDQUFBO0lBQzFDLGtGQUE2RCxDQUFBO0lBQzdELGtGQUE2RCxDQUFBO0lBQzdELHdGQUFtRSxDQUFBO0lBQ25FLG9FQUErQyxDQUFBO0lBQy9DLDZFQUF3RCxD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