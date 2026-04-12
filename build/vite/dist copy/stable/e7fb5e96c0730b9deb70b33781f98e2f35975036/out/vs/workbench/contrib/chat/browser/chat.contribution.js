/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { AgentHostEnabledSettingId, AgentHostIpcLoggingSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { registerEditorFeature } from '../../../../editor/common/editorFeatures.js';
import * as nls from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { mcpAccessConfig, mcpAutoStartConfig, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig, mcpAppsEnabledConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { Extensions } from '../../../common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AssistedTypes } from '../../mcp/browser/mcpCommandsAddConfiguration.js';
import { allDiscoverySources, discoverySourceSettingsLabel, mcpDiscoverySection, mcpServerSamplingSection } from '../../mcp/common/mcpConfiguration.js';
import { ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from '../common/participants/chatAgents.js';
import { CodeMapperService, ICodeMapperService } from '../common/editing/chatCodeMapperService.js';
import '../common/widget/chatColors.js';
import { IChatEditingService } from '../common/editing/chatEditingService.js';
import { IChatLayoutService } from '../common/widget/chatLayoutService.js';
import { ChatModeService, IChatModeService } from '../common/chatModes.js';
import { ChatResponseResourceFileSystemProvider, ChatResponseResourceWorkbenchContribution, IChatResponseResourceFileSystemProvider } from '../common/widget/chatResponseResourceFileSystemProvider.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatService } from '../common/chatService/chatServiceImpl.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { ChatArtifactsService, IChatArtifactsService } from '../common/tools/chatArtifactsService.js';
import { ChatTodoListService, IChatTodoListService } from '../common/tools/chatTodoListService.js';
import { ChatTransferService, IChatTransferService } from '../common/model/chatTransferService.js';
import { IChatVariablesService } from '../common/attachments/chatVariables.js';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from '../common/widget/chatWidgetHistoryService.js';
import { ChatAgentLocation, ChatConfiguration, ChatNotificationMode } from '../common/constants.js';
import { ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService } from '../common/ignoredFiles.js';
import { ILanguageModelsService, LanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelStatsService, LanguageModelStatsService } from '../common/languageModelStats.js';
import { ILanguageModelToolsConfirmationService } from '../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import { agentPluginDiscoveryRegistry, IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { ChatPromptFilesExtensionPointHandler } from '../common/promptSyntax/chatPromptFilesContribution.js';
import { isTildePath, PromptsConfig } from '../common/promptSyntax/config/config.js';
import { INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION, DEFAULT_SKILL_SOURCE_FOLDERS, AGENTS_SOURCE_FOLDER, AGENT_FILE_EXTENSION, SKILL_FILENAME, CLAUDE_AGENTS_SOURCE_FOLDER, DEFAULT_HOOK_FILE_PATHS, DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS, COPILOT_USER_AGENTS_SOURCE_FOLDER } from '../common/promptSyntax/config/promptFileLocations.js';
import { PromptLanguageFeaturesProvider } from './promptSyntax/promptFileContributions.js';
import { AGENT_DOCUMENTATION_URL, INSTRUCTIONS_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, SKILL_DOCUMENTATION_URL, HOOK_DOCUMENTATION_URL, PromptsType, PromptFileSource } from '../common/promptSyntax/promptTypes.js';
import { hookFileSchema, HOOK_SCHEMA_URI } from '../common/promptSyntax/hookSchema.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../common/promptSyntax/service/promptsServiceImpl.js';
import { LanguageModelToolsExtensionPointHandler } from '../common/tools/languageModelToolsContribution.js';
import { BuiltinToolsContribution } from '../common/tools/builtinTools/tools.js';
import { RenameToolContribution } from './tools/renameTool.js';
import { UsagesToolContribution } from './tools/usagesTool.js';
import { IVoiceChatService, VoiceChatService } from '../common/voiceChatService.js';
import { registerChatAccessibilityActions } from './actions/chatAccessibilityActions.js';
import { AgentChatAccessibilityHelp, EditsChatAccessibilityHelp, PanelChatAccessibilityHelp, QuickChatAccessibilityHelp } from './actions/chatAccessibilityHelp.js';
import { ModeOpenChatGlobalAction, registerChatActions } from './actions/chatActions.js';
import { CodeBlockActionRendering, registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from './actions/chatCodeblockActions.js';
import { ChatContextContributions } from './actions/chatContext.js';
import { registerChatContextActions } from './actions/chatContextActions.js';
import { registerChatCopyActions } from './actions/chatCopyActions.js';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions.js';
import { registerChatExecuteActions } from './actions/chatExecuteActions.js';
import { registerChatFileTreeActions } from './actions/chatFileTreeActions.js';
import { ChatGettingStartedContribution } from './actions/chatGettingStarted.js';
import { registerChatForkActions } from './actions/chatForkActions.js';
import { registerChatExportActions } from './actions/chatImportExport.js';
import { registerLanguageModelActions } from './actions/chatLanguageModelActions.js';
import { registerChatPluginActions } from './actions/chatPluginActions.js';
import { registerMoveActions } from './actions/chatMoveActions.js';
import { registerNewChatActions } from './actions/chatNewActions.js';
import { registerChatPromptNavigationActions } from './actions/chatPromptNavigationActions.js';
import { registerChatQueueActions } from './actions/chatQueueActions.js';
import { registerQuickChatActions } from './actions/chatQuickInputActions.js';
import { ChatAgentRecommendation } from './actions/chatAgentRecommendationActions.js';
import { registerChatTitleActions } from './actions/chatTitleActions.js';
import { registerChatElicitationActions } from './actions/chatElicitationActions.js';
import { registerChatToolActions } from './actions/chatToolActions.js';
import { ChatTransferContribution } from './actions/chatTransfer.js';
import { registerChatOpenAgentDebugPanelAction } from './actions/chatOpenAgentDebugPanelAction.js';
import { IChatDebugService } from '../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../common/chatDebugServiceImpl.js';
import { ChatDebugEditor } from './chatDebug/chatDebugEditor.js';
import { PromptsDebugContribution } from './promptsDebugContribution.js';
import { ChatDebugEditorInput, ChatDebugEditorInputSerializer } from './chatDebug/chatDebugEditorInput.js';
import './agentSessions/agentSessions.contribution.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatViewId, IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatWidgetService, IQuickChatService, isIChatResourceViewContext, isIChatViewViewContext } from './chat.js';
import { ChatAccessibilityService } from './accessibility/chatAccessibilityService.js';
import './attachments/chatAttachmentModel.js';
import './widget/input/chatStatusWidget.js';
import { ChatAttachmentResolveService, IChatAttachmentResolveService } from './attachments/chatAttachmentResolveService.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from './attachments/chatAttachmentWidgetRegistry.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from './widget/chatContentParts/chatMarkdownAnchorService.js';
import { ChatContextPickService, IChatContextPickService } from './attachments/chatContextPickService.js';
import { ChatInputBoxContentProvider } from './widget/input/editor/chatEditorInputContentProvider.js';
import { ChatEditingEditorAccessibility } from './chatEditing/chatEditingEditorAccessibility.js';
import { registerChatEditorActions } from './chatEditing/chatEditingEditorActions.js';
import { ChatEditingEditorContextKeys } from './chatEditing/chatEditingEditorContextKeys.js';
import { ChatEditingEditorOverlay } from './chatEditing/chatEditingEditorOverlay.js';
import { ChatEditingService } from './chatEditing/chatEditingServiceImpl.js';
import { ChatEditingNotebookFileSystemProviderContrib } from './chatEditing/notebook/chatEditingNotebookFileSystemProvider.js';
import { SimpleBrowserOverlay } from './attachments/simpleBrowserEditorOverlay.js';
import { ChatEditor } from './widgetHosts/editor/chatEditor.js';
import { ChatEditorInput, ChatEditorInputSerializer } from './widgetHosts/editor/chatEditorInput.js';
import { ChatLayoutService } from './widget/chatLayoutService.js';
import { ChatLanguageModelsDataContribution, LanguageModelsConfigurationService } from './languageModelsConfigurationService.js';
import './chatManagement/chatManagement.contribution.js';
import './aiCustomization/aiCustomizationWorkspaceService.js';
import './aiCustomization/customizationHarnessService.js';
import './aiCustomization/aiCustomizationManagement.contribution.js';
import { ChatOutputRendererService, IChatOutputRendererService } from './chatOutputItemRenderer.js';
import { ChatCompatibilityNotifier, ChatExtensionPointHandler } from './chatParticipant.contribution.js';
import { ChatPasteProvidersFeature } from './widget/input/editor/chatPasteProviders.js';
import { QuickChatService } from './widgetHosts/chatQuick.js';
import { ChatResponseAccessibleView } from './accessibility/chatResponseAccessibleView.js';
import { ChatTerminalOutputAccessibleView } from './accessibility/chatTerminalOutputAccessibleView.js';
import { ChatSetupContribution, ChatTeardownContribution } from './chatSetup/chatSetupContributions.js';
import { ChatStatusBarEntry } from './chatStatus/chatStatusEntry.js';
import { ChatVariablesService } from './attachments/chatVariables.js';
import { ChatWidget } from './widget/chatWidget.js';
import { ChatCodeBlockContextProviderService } from './codeBlockContextProviderService.js';
import { ChatDynamicVariableModel } from './attachments/chatDynamicVariables.js';
import { ChatImplicitContextContribution } from './attachments/chatImplicitContext.js';
import './widget/input/editor/chatInputCompletions.js';
import './widget/input/editor/chatInputEditorContrib.js';
import './widget/input/editor/chatInputEditorHover.js';
import { LanguageModelToolsConfirmationService } from './tools/languageModelToolsConfirmationService.js';
import { LanguageModelToolsService, globalAutoApproveDescription } from './tools/languageModelToolsService.js';
import { AgentPluginService, ConfiguredAgentPluginDiscovery, ExtensionAgentPluginDiscovery, MarketplaceAgentPluginDiscovery } from '../common/plugins/agentPluginServiceImpl.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, PluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
import { WorkspacePluginSettingsService, IWorkspacePluginSettingsService } from '../common/plugins/workspacePluginSettingsService.js';
import { AgentPluginsViewsContribution } from './agentPluginsView.js';
import { AgentPluginRecommendations } from './claudePluginRecommendations.js';
import { AgentPluginEditor } from './agentPluginEditor/agentPluginEditor.js';
import { AgentPluginEditorInput } from './agentPluginEditor/agentPluginEditorInput.js';
import { AgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { PluginInstallService } from './pluginInstallService.js';
import './promptSyntax/promptCodingAgentActionContribution.js';
import './promptSyntax/promptToolsCodeLensProvider.js';
import { ChatSlashCommandsContribution } from './chatSlashCommands.js';
import { PluginUrlHandler } from './pluginUrlHandler.js';
import { PromptUrlHandler } from './promptSyntax/promptUrlHandler.js';
import { ConfigureToolSets, UserToolSetsContributions } from './tools/toolSetsContribution.js';
import { ChatViewsWelcomeHandler } from './viewsWelcome/chatViewsWelcomeHandler.js';
import { ChatWidgetService } from './widget/chatWidgetService.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';
import { ChatWindowNotifier } from './chatWindowNotifier.js';
import { ChatRepoInfoContribution } from './chatRepoInfo.js';
import { VALID_PROMPT_FOLDER_PATTERN } from '../common/promptSyntax/utils/promptFilesLocator.js';
import { ChatTipService, IChatTipService } from './chatTipService.js';
import { ChatQueuePickerRendering } from './widget/input/chatQueuePickerActionItem.js';
import { ExploreAgentDefaultModel } from './exploreAgentDefaultModel.js';
import { PlanAgentDefaultModel } from './planAgentDefaultModel.js';
import { ChatImageCarouselService, IChatImageCarouselService } from './chatImageCarouselService.js';
const toolReferenceNameEnumValues = [];
const toolReferenceNameEnumDescriptions = [];
// Register JSON schema for hook files
const jsonContributionRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonContributionRegistry.registerSchema(HOOK_SCHEMA_URI, hookFileSchema);
// Register configuration
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'chatSidebar',
    title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
    type: 'object',
    properties: {
        'chat.experimentalSessionsWindowOverride': {
            type: 'boolean',
            description: nls.localize('chat.experimentalSessionsWindowOverride', "When true, enables sessions-window-specific behavior for extensions."),
            default: false,
            tags: ['experimental'],
        },
        'chat.fontSize': {
            type: 'number',
            description: nls.localize('chat.fontSize', "Controls the font size in pixels in chat messages."),
            default: 13,
            minimum: 6,
            maximum: 100
        },
        'chat.fontFamily': {
            type: 'string',
            description: nls.localize('chat.fontFamily', "Controls the font family in chat messages."),
            default: 'default'
        },
        'chat.editor.fontSize': {
            type: 'number',
            description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in chat codeblocks."),
            default: isMacintosh ? 12 : 14,
        },
        'chat.editor.fontFamily': {
            type: 'string',
            description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in chat codeblocks."),
            default: 'default'
        },
        'chat.editor.fontWeight': {
            type: 'string',
            description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in chat codeblocks."),
            default: 'default'
        },
        'chat.editor.wordWrap': {
            type: 'string',
            description: nls.localize('interactiveSession.editor.wordWrap', "Controls whether lines should wrap in chat codeblocks."),
            default: 'off',
            enum: ['on', 'off']
        },
        'chat.editor.lineHeight': {
            type: 'number',
            description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
            default: 0
        },
        [ChatConfiguration.AgentStatusEnabled]: {
            type: 'string',
            enum: ['hidden', 'badge', 'compact'],
            enumDescriptions: [
                nls.localize('chat.agentsControl.hidden', "The agent status indicator is hidden from the title bar."),
                nls.localize('chat.agentsControl.badge', "Shows the agent status as a badge next to the command center."),
                nls.localize('chat.agentsControl.compact', "Replaces the command center search box with a compact agent status indicator and unified chat widget."),
            ],
            markdownDescription: nls.localize('chat.agentsControl.enabled', "Controls how the 'Agent Status' indicator appears in the title bar command center. When set to `hidden`, the indicator is not shown. Other values show the indicator and automatically enable {0}. The unread and in-progress session indicators require {1} to be enabled.", '`#window.commandCenter#`', '`#chat.viewSessions.enabled#`'),
            default: 'compact',
            tags: ['experimental']
        },
        [ChatConfiguration.UnifiedAgentsBar]: {
            type: 'boolean',
            markdownDescription: nls.localize('chat.unifiedAgentsBar.enabled', "Replaces the command center search box with a unified chat and search widget."),
            default: false,
            tags: ['experimental']
        },
        [ChatConfiguration.AgentSessionProjectionEnabled]: {
            type: 'boolean',
            markdownDescription: nls.localize('chat.agentSessionProjection.enabled', "Controls whether Agent Session Projection mode is enabled for reviewing agent sessions in a focused workspace."),
            default: false,
            tags: ['experimental'],
        },
        'chat.implicitContext.enabled': {
            type: 'object',
            description: nls.localize('chat.implicitContext.enabled.1', "Enables automatically using the active editor as chat context for specified chat locations."),
            additionalProperties: {
                type: 'string',
                enum: ['never', 'first', 'always'],
                description: nls.localize('chat.implicitContext.value', "The value for the implicit context."),
                enumDescriptions: [
                    nls.localize('chat.implicitContext.value.never', "Implicit context is never enabled."),
                    nls.localize('chat.implicitContext.value.first', "Implicit context is enabled for the first interaction."),
                    nls.localize('chat.implicitContext.value.always', "Implicit context is always enabled.")
                ]
            },
            default: {
                'panel': 'always',
            },
            tags: ['experimental'],
            experiment: {
                mode: 'startup'
            }
        },
        'chat.implicitContext.suggestedContext': {
            type: 'boolean',
            markdownDescription: nls.localize('chat.implicitContext.suggestedContext', "Controls whether the new implicit context flow is shown. In Ask and Edit modes, the context will automatically be included. When using an agent, context will be suggested as an attachment. Selections are always included as context."),
            default: true,
        },
        'chat.editing.autoAcceptDelay': {
            type: 'number',
            markdownDescription: nls.localize('chat.editing.autoAcceptDelay', "Delay after which changes made by chat are automatically accepted. Values are in seconds, `0` means disabled and `100` seconds is the maximum."),
            default: 0,
            minimum: 0,
            maximum: 100
        },
        'chat.editing.confirmEditRequestRemoval': {
            type: 'boolean',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            markdownDescription: nls.localize('chat.editing.confirmEditRequestRemoval', "Whether to show a confirmation before removing a request and its associated edits."),
            default: true,
        },
        'chat.editing.confirmEditRequestRetry': {
            type: 'boolean',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            markdownDescription: nls.localize('chat.editing.confirmEditRequestRetry', "Whether to show a confirmation before retrying a request and its associated edits."),
            default: true,
        },
        'chat.editing.explainChanges.enabled': {
            type: 'boolean',
            markdownDescription: nls.localize('chat.editing.explainChanges.enabled', "Controls whether the Explain button in the Chat panel and the Explain Changes context menu in the SCM view are shown. This is an experimental feature."),
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.RevealNextChangeOnResolve]: {
            type: 'boolean',
            markdownDescription: nls.localize('chat.editing.revealNextChangeOnResolve', "Controls whether the editor automatically reveals the next change after keeping or undoing a chat edit."),
            default: true,
        },
        'chat.tips.enabled': {
            type: 'boolean',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: nls.localize('chat.tips.enabled', "Controls whether tips are shown above user messages in chat. New tips are added frequently, so this is a helpful way to stay up to date with the latest features."),
            default: true,
        },
        'chat.upvoteAnimation': {
            type: 'string',
            enum: ['off', 'confetti', 'floatingThumbs', 'pulseWave', 'radiantLines'],
            enumDescriptions: [
                nls.localize('chat.upvoteAnimation.off', "No animation is shown."),
                nls.localize('chat.upvoteAnimation.confetti', "Shows a confetti burst animation around the thumbs up button."),
                nls.localize('chat.upvoteAnimation.floatingThumbs', "Shows floating thumbs up icons rising from the button."),
                nls.localize('chat.upvoteAnimation.pulseWave', "Shows expanding pulse rings from the button."),
                nls.localize('chat.upvoteAnimation.radiantLines', "Shows radiant lines emanating from the button."),
            ],
            description: nls.localize('chat.upvoteAnimation', "Controls whether an animation is shown when clicking the thumbs up button on a chat response."),
            default: 'floatingThumbs',
        },
        'chat.experimental.detectParticipant.enabled': {
            type: 'boolean',
            deprecationMessage: nls.localize('chat.experimental.detectParticipant.enabled.deprecated', "This setting is deprecated. Please use `chat.detectParticipant.enabled` instead."),
            description: nls.localize('chat.experimental.detectParticipant.enabled', "Enables chat participant autodetection for panel chat."),
            default: null
        },
        'chat.detectParticipant.enabled': {
            type: 'boolean',
            description: nls.localize('chat.detectParticipant.enabled', "Enables chat participant autodetection for panel chat."),
            default: true
        },
        [ChatConfiguration.InlineReferencesStyle]: {
            type: 'string',
            enum: ['box', 'link'],
            enumDescriptions: [
                nls.localize('chat.inlineReferences.style.box', "Display file and symbol references as boxed widgets with icons."),
                nls.localize('chat.inlineReferences.style.link', "Display file and symbol references as simple blue links without icons.")
            ],
            description: nls.localize('chat.inlineReferences.style', "Controls how file and symbol references are displayed in chat messages."),
            default: 'box'
        },
        [ChatConfiguration.EditorAssociations]: {
            type: 'object',
            markdownDescription: nls.localize('chat.editorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors for opening files from chat (for example `\"*.md\": \"vscode.markdown.preview.editor\"`)."),
            additionalProperties: {
                type: 'string'
            },
            default: {}
        },
        [ChatConfiguration.NotifyWindowOnConfirmation]: {
            type: 'string',
            enum: ['off', 'windowNotFocused', 'always'],
            enumDescriptions: [
                nls.localize('chat.notifyWindowOnConfirmation.off', "Never show OS notifications for confirmations."),
                nls.localize('chat.notifyWindowOnConfirmation.windowNotFocused', "Show OS notifications for confirmations when the window is not focused."),
                nls.localize('chat.notifyWindowOnConfirmation.always', "Always show OS notifications for confirmations, even when the window is focused."),
            ],
            description: nls.localize('chat.notifyWindowOnConfirmation', "Controls whether a chat session should present the user with an OS notification when a confirmation or question needs input. This includes a window badge as well as notification toast."),
            default: 'windowNotFocused',
        },
        [ChatConfiguration.AutoReply]: {
            default: false,
            markdownDescription: nls.localize('chat.autoReply.description', "Automatically skip question carousels by telling the agent that the user is not available and to use its best judgment. This is an advanced setting and can lead to unintended choices or actions based on incomplete context."),
            type: 'boolean',
            scope: 3 /* ConfigurationScope.APPLICATION_MACHINE */,
            tags: ['experimental', 'advanced'],
        },
        [ChatConfiguration.AutopilotEnabled]: {
            type: 'boolean',
            markdownDescription: nls.localize('chat.autopilot.enabled', "Controls whether the Autopilot mode is available in the permissions picker. When enabled, Autopilot auto-approves all tool calls and continues until the task is done."),
            default: true,
            tags: ['experimental'],
        },
        [ChatConfiguration.GlobalAutoApprove]: {
            default: false,
            markdownDescription: globalAutoApproveDescription.value,
            type: 'boolean',
            scope: 3 /* ConfigurationScope.APPLICATION_MACHINE */,
            tags: ['experimental'],
            policy: {
                name: 'ChatToolsAutoApprove',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.99',
                value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
                localization: {
                    description: {
                        key: 'autoApprove3.description',
                        value: nls.localize('autoApprove3.description', 'Global auto approve also known as "YOLO mode" disables manual approval completely for all tools in all workspaces, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like Codespaces and Dev Containers have user keys forwarded into the container that could be compromised.\n\nThis feature disables critical security protections and makes it much easier for an attacker to compromise the machine.\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the `#chat.autoReply#` setting.')
                    }
                },
            }
        },
        [ChatConfiguration.AutoApproveEdits]: {
            default: {
                '**/*': true,
                '**/.vscode/*.json': false,
                '**/.git/**': false,
                '**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
                '**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
                '**/*.lock': false, // yarn.lock, bun.lock, etc.
                '**/*-lock.{yaml,json}': false, // pnpm-lock.yaml, package-lock.json
            },
            markdownDescription: nls.localize('chat.tools.autoApprove.edits', "Controls whether edits made by the agent are automatically approved. The default is to approve all edits except those made to certain files which have the potential to cause immediate unintended side-effects, such as `**/.vscode/*.json`.\n\nSet to `true` to automatically approve edits to matching files, `false` to always require explicit approval. The last pattern matching a given file will determine whether the edit is automatically approved."),
            type: 'object',
            additionalProperties: {
                type: 'boolean',
            }
        },
        [ChatConfiguration.AutoApprovedUrls]: {
            default: {
                'https://code.visualstudio.com': true,
                'https://github.com/microsoft/vscode/wiki/*': true,
            },
            markdownDescription: nls.localize('chat.tools.fetchPage.approvedUrls', "Controls which URLs are automatically approved when requested by chat tools. Keys are URL patterns and values can be `true` to approve both requests and responses, `false` to deny, or an object with `approveRequest` and `approveResponse` properties for granular control.\n\nExamples:\n- `\"https://example.com\": true` - Approve all requests to example.com\n- `\"https://*.example.com\": true` - Approve all requests to any subdomain of example.com\n- `\"https://example.com/api/*\": { \"approveRequest\": true, \"approveResponse\": false }` - Approve requests but not responses for example.com/api paths"),
            type: 'object',
            additionalProperties: {
                oneOf: [
                    { type: 'boolean' },
                    {
                        type: 'object',
                        properties: {
                            approveRequest: { type: 'boolean' },
                            approveResponse: { type: 'boolean' }
                        }
                    }
                ]
            }
        },
        [ChatConfiguration.EligibleForAutoApproval]: {
            default: {},
            markdownDescription: nls.localize('chat.tools.eligibleForAutoApproval', 'Controls which tools are eligible for automatic approval. Tools set to \'false\' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to \'true\') may result in the tool offering auto-approval options.'),
            type: 'object',
            propertyNames: {
                enum: toolReferenceNameEnumValues,
                enumDescriptions: toolReferenceNameEnumDescriptions,
            },
            additionalProperties: {
                type: 'boolean',
            },
            examples: [
                {
                    'fetch': false,
                    'runTask': false
                }
            ],
            policy: {
                name: 'ChatToolsEligibleForAutoApproval',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.107',
                localization: {
                    description: {
                        key: 'chat.tools.eligibleForAutoApproval',
                        value: nls.localize('chat.tools.eligibleForAutoApproval', 'Controls which tools are eligible for automatic approval. Tools set to \'false\' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to \'true\') may result in the tool offering auto-approval options.')
                    }
                },
            }
        },
        'chat.sendElementsToChat.enabled': {
            default: true,
            description: nls.localize('chat.sendElementsToChat.enabled', "Controls whether elements can be sent to chat from the Simple Browser."),
            type: 'boolean',
            tags: ['preview']
        },
        'chat.sendElementsToChat.attachCSS': {
            default: true,
            markdownDescription: nls.localize('chat.sendElementsToChat.attachCSS', "Controls whether CSS of the selected element will be added to the chat. {0} must be enabled.", '`#chat.sendElementsToChat.enabled#`'),
            type: 'boolean',
            tags: ['preview']
        },
        'chat.sendElementsToChat.attachImages': {
            default: true,
            markdownDescription: nls.localize('chat.sendElementsToChat.attachImages', "Controls whether a screenshot of the selected element will be added to the chat. {0} must be enabled.", '`#chat.sendElementsToChat.enabled#`'),
            type: 'boolean',
            tags: ['experimental']
        },
        [ChatConfiguration.ArtifactsEnabled]: {
            default: false,
            description: nls.localize('chat.artifacts.enabled', "Controls whether the artifacts view is available in chat."),
            type: 'boolean',
            tags: ['experimental']
        },
        [ChatConfiguration.ArtifactsMode]: {
            default: 'rules',
            description: nls.localize('chat.artifacts.mode', "Controls how artifacts are populated. 'rules' extracts artifacts deterministically from the conversation. 'tool' lets the model set artifacts via a tool call."),
            type: 'string',
            enum: ['rules', 'tool'],
            tags: ['experimental']
        },
        [ChatConfiguration.ArtifactsRulesByMimeType]: {
            default: {
                'image/*': { groupName: 'Screenshots', onlyShowGroup: true }
            },
            description: nls.localize('chat.artifacts.rules.byMimeType', "Rules for extracting artifacts from tool results by MIME type. Maps MIME type patterns (e.g. 'image/*') to group configuration."),
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    groupName: { type: 'string', description: nls.localize('chat.artifacts.rules.groupName', "Display name for the artifact group.") },
                    onlyShowGroup: { type: 'boolean', description: nls.localize('chat.artifacts.rules.onlyShowGroup', "When true, show only the group header instead of individual items.") }
                },
                required: ['groupName']
            },
            tags: ['experimental']
        },
        [ChatConfiguration.ArtifactsRulesByFilePath]: {
            default: {
                '**/*plan*.md': { groupName: 'Plans' }
            },
            description: nls.localize('chat.artifacts.rules.byFilePath', "Rules for extracting artifacts from written files by file path pattern. Maps glob patterns to group configuration."),
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    groupName: { type: 'string', description: nls.localize('chat.artifacts.rules.byFilePath.groupName', "Display name for the artifact group.") },
                    onlyShowGroup: { type: 'boolean', description: nls.localize('chat.artifacts.rules.byFilePath.onlyShowGroup', "When true, show only the group header instead of individual items.") }
                },
                required: ['groupName']
            },
            tags: ['experimental']
        },
        'chat.undoRequests.restoreInput': {
            default: true,
            markdownDescription: nls.localize('chat.undoRequests.restoreInput', "Controls whether the input of the chat should be restored when an undo request is made. The input will be filled with the text of the request that was restored."),
            type: 'boolean',
        },
        'chat.editRequests': {
            markdownDescription: nls.localize('chat.editRequests', "Enables editing of requests in the chat. This allows you to change the request content and resubmit it to the model."),
            type: 'string',
            enum: ['inline', 'hover', 'input', 'none'],
            default: 'inline',
        },
        [ChatConfiguration.ChatViewSessionsEnabled]: {
            type: 'boolean',
            default: true,
            description: nls.localize('chat.viewSessions.enabled', "Show chat agent sessions when chat is empty or to the side when chat view is wide enough."),
        },
        [ChatConfiguration.ChatViewSessionsOrientation]: {
            type: 'string',
            enum: ['stacked', 'sideBySide'],
            enumDescriptions: [
                nls.localize('chat.viewSessions.orientation.stacked', "Display chat sessions vertically stacked above the chat input unless a chat session is visible."),
                nls.localize('chat.viewSessions.orientation.sideBySide', "Display chat sessions side by side if space is sufficient, otherwise fallback to stacked above the chat input unless a chat session is visible.")
            ],
            default: 'sideBySide',
            description: nls.localize('chat.viewSessions.orientation', "Controls the orientation of the chat agent sessions view when it is shown alongside the chat."),
        },
        [ChatConfiguration.ChatViewProgressBadgeEnabled]: {
            type: 'boolean',
            default: false,
            description: nls.localize('chat.viewProgressBadge.enabled', "Show a progress badge on the chat view when an agent session is in progress that is opened in that view."),
        },
        [ChatConfiguration.ChatContextUsageEnabled]: {
            type: 'boolean',
            default: true,
            description: nls.localize('chat.contextUsage.enabled', "Show the context window usage indicator in the chat input."),
        },
        [ChatConfiguration.NotifyWindowOnResponseReceived]: {
            type: 'string',
            enum: ['off', 'windowNotFocused', 'always'],
            enumDescriptions: [
                nls.localize('chat.notifyWindowOnResponseReceived.off', "Never show OS notifications for responses."),
                nls.localize('chat.notifyWindowOnResponseReceived.windowNotFocused', "Show OS notifications for responses when the window is not focused."),
                nls.localize('chat.notifyWindowOnResponseReceived.always', "Always show OS notifications for responses, even when the window is focused."),
            ],
            default: 'windowNotFocused',
            description: nls.localize('chat.notifyWindowOnResponseReceived', "Controls whether a chat session should present the user with an OS notification when a response is received. This includes a window badge as well as notification toast."),
        },
        'chat.checkpoints.enabled': {
            type: 'boolean',
            default: true,
            description: nls.localize('chat.checkpoints.enabled', "Enables checkpoints in chat. Checkpoints allow you to restore the chat to a previous state."),
        },
        'chat.checkpoints.showFileChanges': {
            type: 'boolean',
            description: nls.localize('chat.checkpoints.showFileChanges', "Controls whether to show chat checkpoint file changes."),
            default: false
        },
        [mcpAccessConfig]: {
            type: 'string',
            description: nls.localize('chat.mcp.access', "Controls access to installed Model Context Protocol servers."),
            enum: [
                "none" /* McpAccessValue.None */,
                "registry" /* McpAccessValue.Registry */,
                "all" /* McpAccessValue.All */
            ],
            enumDescriptions: [
                nls.localize('chat.mcp.access.none', "No access to MCP servers."),
                nls.localize('chat.mcp.access.registry', "Allows access to MCP servers installed from the registry that VS Code is connected to."),
                nls.localize('chat.mcp.access.any', "Allow access to any installed MCP server.")
            ],
            default: "all" /* McpAccessValue.All */,
            policy: {
                name: 'ChatMCP',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.99',
                value: (policyData) => {
                    if (policyData.mcp === false) {
                        return "none" /* McpAccessValue.None */;
                    }
                    if (policyData.mcpAccess === 'registry_only') {
                        return "registry" /* McpAccessValue.Registry */;
                    }
                    return undefined;
                },
                localization: {
                    description: {
                        key: 'chat.mcp.access',
                        value: nls.localize('chat.mcp.access', "Controls access to installed Model Context Protocol servers.")
                    },
                    enumDescriptions: [
                        {
                            key: 'chat.mcp.access.none', value: nls.localize('chat.mcp.access.none', "No access to MCP servers."),
                        },
                        {
                            key: 'chat.mcp.access.registry', value: nls.localize('chat.mcp.access.registry', "Allows access to MCP servers installed from the registry that VS Code is connected to."),
                        },
                        {
                            key: 'chat.mcp.access.any', value: nls.localize('chat.mcp.access.any', "Allow access to any installed MCP server.")
                        }
                    ]
                },
            }
        },
        [mcpAutoStartConfig]: {
            type: 'string',
            description: nls.localize('chat.mcp.autostart', "Controls whether MCP servers should be automatically started when the chat messages are submitted."),
            default: "newAndOutdated" /* McpAutoStartValue.NewAndOutdated */,
            enum: [
                "never" /* McpAutoStartValue.Never */,
                "onlyNew" /* McpAutoStartValue.OnlyNew */,
                "newAndOutdated" /* McpAutoStartValue.NewAndOutdated */
            ],
            enumDescriptions: [
                nls.localize('chat.mcp.autostart.never', "Never automatically start MCP servers."),
                nls.localize('chat.mcp.autostart.onlyNew', "Only automatically start new MCP servers that have never been run."),
                nls.localize('chat.mcp.autostart.newAndOutdated', "Automatically start new and outdated MCP servers that are not yet running.")
            ],
            tags: ['experimental'],
        },
        [mcpAppsEnabledConfig]: {
            type: 'boolean',
            description: nls.localize('chat.mcp.ui.enabled', "Controls whether MCP servers can provide custom UI for tool invocations."),
            default: true,
            tags: ['experimental'],
        },
        [mcpServerSamplingSection]: {
            type: 'object',
            description: nls.localize('chat.mcp.serverSampling', "Configures which models are exposed to MCP servers for sampling (making model requests in the background). This setting can be edited in a graphical way under the `{0}` command.", 'MCP: ' + nls.localize('mcp.list', 'List Servers')),
            scope: 5 /* ConfigurationScope.RESOURCE */,
            additionalProperties: {
                type: 'object',
                properties: {
                    allowedDuringChat: {
                        type: 'boolean',
                        description: nls.localize('chat.mcp.serverSampling.allowedDuringChat', "Whether this server is make sampling requests during its tool calls in a chat session."),
                        default: true,
                    },
                    allowedOutsideChat: {
                        type: 'boolean',
                        description: nls.localize('chat.mcp.serverSampling.allowedOutsideChat', "Whether this server is allowed to make sampling requests outside of a chat session."),
                        default: false,
                    },
                    allowedModels: {
                        type: 'array',
                        items: {
                            type: 'string',
                            description: nls.localize('chat.mcp.serverSampling.model', "A model the MCP server has access to."),
                        },
                    }
                }
            },
        },
        [AssistedTypes[4 /* AddConfigurationType.NuGetPackage */].enabledConfigKey]: {
            type: 'boolean',
            description: nls.localize('chat.mcp.assisted.nuget.enabled.description', "Enables NuGet packages for AI-assisted MCP server installation. Used to install MCP servers by name from the central registry for .NET packages (NuGet.org)."),
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'startup'
            }
        },
        [ChatConfiguration.ExtensionToolsEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.extensionToolsEnabled', "Enable using tools contributed by third-party extensions."),
            default: true,
            policy: {
                name: 'ChatAgentExtensionTools',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.99',
                localization: {
                    description: {
                        key: 'chat.extensionToolsEnabled',
                        value: nls.localize('chat.extensionToolsEnabled', "Enable using tools contributed by third-party extensions.")
                    }
                },
            }
        },
        [ChatConfiguration.PluginsEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.plugins.enabled', "Enable agent plugin integration in chat."),
            default: true,
            tags: ['preview'],
        },
        [ChatConfiguration.PluginLocations]: {
            type: 'object',
            additionalProperties: { type: 'boolean' },
            restricted: true,
            markdownDescription: nls.localize('chat.pluginLocations', "Plugin directories to discover. Each key is a path that points directly to a plugin folder, and the value enables (`true`) or disables (`false`) it. Paths can be absolute, relative to the workspace root, or start with `~/` for the user's home directory."),
            scope: 2 /* ConfigurationScope.MACHINE */,
            tags: ['experimental'],
        },
        [ChatConfiguration.PluginMarketplaces]: {
            type: 'array',
            items: {
                type: 'string',
            },
            markdownDescription: nls.localize('chat.plugins.marketplaces', "Plugin marketplaces to query. Entries may be GitHub shorthand (`owner/repo`), direct Git repository URIs (`https://...git`, `ssh://...git`, or `git@host:path.git`), or local repository URIs (`file:///...`). Equivalent GitHub shorthand and URI entries are deduplicated."),
            default: ['github/copilot-plugins', 'github/awesome-copilot'],
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['experimental'],
        },
        [ChatConfiguration.AgentEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.agent.enabled.description', "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used."),
            default: true,
            order: 1,
            policy: {
                name: 'ChatAgentMode',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.99',
                value: (policyData) => policyData.chat_agent_enabled === false ? false : undefined,
                localization: {
                    description: {
                        key: 'chat.agent.enabled.description',
                        value: nls.localize('chat.agent.enabled.description', "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used."),
                    }
                }
            }
        },
        [ChatConfiguration.DefaultNewSessionMode]: {
            type: 'string',
            description: nls.localize('chat.newSession.defaultMode', "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
            default: '',
        },
        [AgentHostEnabledSettingId]: {
            type: 'boolean',
            description: nls.localize('chat.agentHost.enabled', "When enabled, some agents run in a separate agent host process."),
            default: false,
            tags: ['experimental', 'advanced'],
            included: product.quality !== 'stable',
        },
        [AgentHostIpcLoggingSettingId]: {
            type: 'boolean',
            description: nls.localize('chat.agentHost.ipcLogging', "When enabled, logs all IPC traffic for each agent host to a dedicated output channel."),
            default: false,
            tags: ['experimental', 'advanced'],
            included: product.quality !== 'stable',
        },
        [ChatConfiguration.PlanAgentDefaultModel]: {
            type: 'string',
            description: nls.localize('chat.planAgent.defaultModel.description', "Select the default language model to use for the Plan agent from the available providers."),
            default: '',
            enum: PlanAgentDefaultModel.modelIds,
            enumItemLabels: PlanAgentDefaultModel.modelLabels,
            markdownEnumDescriptions: PlanAgentDefaultModel.modelDescriptions
        },
        [ChatConfiguration.ExploreAgentDefaultModel]: {
            type: 'string',
            description: nls.localize('chat.exploreAgent.defaultModel.description', "Select the default language model to use for the Explore subagent from the available providers."),
            default: '',
            enum: ExploreAgentDefaultModel.modelIds,
            enumItemLabels: ExploreAgentDefaultModel.modelLabels,
            markdownEnumDescriptions: ExploreAgentDefaultModel.modelDescriptions
        },
        [ChatConfiguration.RequestQueueingDefaultAction]: {
            type: 'string',
            enum: ['queue', 'steer'],
            enumDescriptions: [
                nls.localize('chat.requestQueuing.defaultAction.queue', "Queue the message to send after the current request completes."),
                nls.localize('chat.requestQueuing.defaultAction.steer', "Steer the current request by sending the message immediately, signaling the current request to yield."),
            ],
            description: nls.localize('chat.requestQueuing.defaultAction.description', "Controls which action is the default for the queue button when a request is in progress."),
            default: 'steer',
        },
        [ChatConfiguration.EditModeHidden]: {
            type: 'boolean',
            description: nls.localize('chat.editMode.hidden', "When enabled, hides the Edit mode from the chat mode picker."),
            default: true,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            },
            policy: {
                name: 'DeprecatedEditModeHidden',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.112',
                localization: {
                    description: {
                        key: 'chat.editMode.hidden',
                        value: nls.localize('chat.editMode.hidden', "When enabled, hides the Edit mode from the chat mode picker."),
                    }
                }
            }
        },
        [ChatConfiguration.EnableMath]: {
            type: 'boolean',
            description: nls.localize('chat.mathEnabled.description', "Enable math rendering in chat responses using KaTeX."),
            default: true,
        },
        [ChatConfiguration.ShowCodeBlockProgressAnimation]: {
            type: 'boolean',
            description: nls.localize('chat.codeBlock.showProgressAnimation.description', "When applying edits, show a progress animation in the code block pill. If disabled, shows the progress percentage instead."),
            default: true,
            tags: ['experimental'],
        },
        ['chat.statusWidget.anonymous']: {
            type: 'boolean',
            description: nls.localize('chat.statusWidget.anonymous.description', "Controls whether anonymous users see the status widget in new chat sessions when rate limited."),
            default: false,
            tags: ['experimental', 'advanced'],
            experiment: {
                mode: 'auto'
            }
        },
        [mcpDiscoverySection]: {
            type: 'object',
            properties: Object.fromEntries(allDiscoverySources.map(k => [k, { type: 'boolean', description: discoverySourceSettingsLabel[k] }])),
            additionalProperties: false,
            default: Object.fromEntries(allDiscoverySources.map(k => [k, false])),
            markdownDescription: nls.localize('mcp.discovery.enabled', "Configures discovery of Model Context Protocol servers from configuration from various other applications."),
        },
        [mcpGalleryServiceEnablementConfig]: {
            type: 'boolean',
            default: false,
            tags: ['preview'],
            description: nls.localize('chat.mcp.gallery.enabled', "Enables the default Marketplace for Model Context Protocol (MCP) servers."),
            included: product.quality === 'stable'
        },
        [mcpGalleryServiceUrlConfig]: {
            type: 'string',
            description: nls.localize('mcp.gallery.serviceUrl', "Configure the MCP Gallery service URL to connect to"),
            default: '',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: ['usesOnlineServices', 'advanced'],
            included: false,
            policy: {
                name: 'McpGalleryServiceUrl',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.101',
                value: (policyData) => policyData.mcpRegistryUrl,
                localization: {
                    description: {
                        key: 'mcp.gallery.serviceUrl',
                        value: nls.localize('mcp.gallery.serviceUrl', "Configure the MCP Gallery service URL to connect to"),
                    }
                }
            },
        },
        [PromptsConfig.INSTRUCTIONS_LOCATION_KEY]: {
            type: 'object',
            title: nls.localize('chat.instructions.config.locations.title', "Instructions File Locations"),
            markdownDescription: nls.localize('chat.instructions.config.locations.description', "Specify location(s) of instructions files (`*{0}`) that can be attached in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.", INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DOCUMENTATION_URL),
            default: {
                ...DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
            },
            additionalProperties: { type: 'boolean' },
            propertyNames: {
                pattern: VALID_PROMPT_FOLDER_PATTERN,
                patternErrorMessage: nls.localize('chat.instructionsLocations.invalidPath', "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions."),
            },
            restricted: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    [DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS[0].path]: true,
                },
                {
                    [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
                    '/Users/vscode/repos/instructions': true,
                },
            ],
        },
        [PromptsConfig.PROMPT_LOCATIONS_KEY]: {
            type: 'object',
            title: nls.localize('chat.reusablePrompts.config.locations.title', "Prompt File Locations"),
            markdownDescription: nls.localize('chat.reusablePrompts.config.locations.description', "Specify location(s) of reusable prompt files (`*{0}`) that can be run in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.", PROMPT_FILE_EXTENSION, PROMPT_DOCUMENTATION_URL),
            default: {
                [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
            },
            additionalProperties: { type: 'boolean' },
            unevaluatedProperties: { type: 'boolean' },
            propertyNames: {
                pattern: VALID_PROMPT_FOLDER_PATTERN,
                patternErrorMessage: nls.localize('chat.promptFileLocations.invalidPath', "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions."),
            },
            restricted: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
                },
                {
                    [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
                    '/Users/vscode/repos/prompts': true,
                },
            ],
        },
        [PromptsConfig.MODE_LOCATION_KEY]: {
            type: 'object',
            title: nls.localize('chat.mode.config.locations.title', "Mode File Locations"),
            markdownDescription: nls.localize('chat.mode.config.locations.description', "Specify location(s) of custom chat mode files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.", LEGACY_MODE_FILE_EXTENSION, AGENT_DOCUMENTATION_URL),
            default: {
                [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true,
            },
            deprecationMessage: nls.localize('chat.mode.config.locations.deprecated', "This setting is deprecated and will be removed in future releases. Chat modes are now called custom agents and are located in `.github/agents`"),
            additionalProperties: { type: 'boolean' },
            unevaluatedProperties: { type: 'boolean' },
            restricted: true,
            tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true,
                },
                {
                    [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true,
                    '/Users/vscode/repos/chatmodes': true,
                },
            ],
        },
        [PromptsConfig.AGENTS_LOCATION_KEY]: {
            type: 'object',
            title: nls.localize('chat.agents.config.locations.title', "Agent File Locations"),
            markdownDescription: nls.localize('chat.agents.config.locations.description', "Specify location(s) of custom agent files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.", AGENT_FILE_EXTENSION, AGENT_DOCUMENTATION_URL),
            default: {
                [AGENTS_SOURCE_FOLDER]: true,
                [CLAUDE_AGENTS_SOURCE_FOLDER]: true,
                [COPILOT_USER_AGENTS_SOURCE_FOLDER]: true,
            },
            additionalProperties: { type: 'boolean' },
            propertyNames: {
                pattern: VALID_PROMPT_FOLDER_PATTERN,
                patternErrorMessage: nls.localize('chat.agentLocations.invalidPath', "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported."),
            },
            restricted: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    [AGENTS_SOURCE_FOLDER]: true,
                },
                {
                    [AGENTS_SOURCE_FOLDER]: true,
                    'my-agents': true,
                    '../shared-agents': true,
                    '~/.copilot/agents': true,
                },
            ],
        },
        [PromptsConfig.USE_AGENT_MD]: {
            type: 'boolean',
            title: nls.localize('chat.useAgentMd.title', "Use AGENTS.md file"),
            markdownDescription: nls.localize('chat.useAgentMd.description', "Controls whether instructions from `AGENTS.md` file found in a workspace roots are attached to all chat requests."),
            default: true,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.USE_NESTED_AGENT_MD]: {
            type: 'boolean',
            title: nls.localize('chat.useNestedAgentMd.title', "Use nested AGENTS.md files"),
            markdownDescription: nls.localize('chat.useNestedAgentMd.description', "Controls whether instructions from nested `AGENTS.md` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.USE_CLAUDE_MD]: {
            type: 'boolean',
            title: nls.localize('chat.useClaudeMd.title', "Use CLAUDE.md file"),
            markdownDescription: nls.localize('chat.useClaudeMd.description', "Controls whether instructions from `CLAUDE.md` file found in workspace roots, .claude and ~/.claude folder are attached to all chat requests."),
            default: true,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.USE_AGENT_SKILLS]: {
            type: 'boolean',
            title: nls.localize('chat.useAgentSkills.title', "Use Agent skills"),
            markdownDescription: nls.localize('chat.useAgentSkills.description', "Controls whether skills are provided as specialized capabilities to the chat requests. Skills are loaded from the folders configured in `#chat.agentSkillsLocations#`. The language model can load these skills on-demand if the `read` tool is available. Learn more about [Agent Skills](https://aka.ms/vscode-agent-skills)."),
            default: true,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.USE_SKILL_ADHERENCE_PROMPT]: {
            type: 'boolean',
            title: nls.localize('chat.useSkillAdherencePrompt.title', "Use Skill Adherence Prompt"),
            markdownDescription: nls.localize('chat.useSkillAdherencePrompt.description', "Controls whether a stronger skill adherence prompt is used that encourages the model to immediately invoke skills when relevant rather than just announcing them."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            experiment: {
                mode: 'auto'
            }
        },
        [PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS]: {
            type: 'boolean',
            title: nls.localize('chat.includeApplyingInstructions.title', "Include Applying Instructions"),
            markdownDescription: nls.localize('chat.includeApplyingInstructions.description', "Controls whether instructions with a matching 'applyTo' attribute are automatically included in chat requests."),
            default: true,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS]: {
            type: 'boolean',
            title: nls.localize('chat.includeReferencedInstructions.title', "Include Referenced Instructions"),
            markdownDescription: nls.localize('chat.includeReferencedInstructions.description', "Controls whether referenced instructions are automatically included in chat requests."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: {
            type: 'boolean',
            title: nls.localize('chat.useCustomizationsInParentRepos.title', "Use Customizations in Parent Repositories"),
            markdownDescription: nls.localize('chat.useCustomizationsInParentRepos.description', "Controls whether to use chat customization files in parent repositories."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
        },
        [PromptsConfig.SKILLS_LOCATION_KEY]: {
            type: 'object',
            title: nls.localize('chat.agentSkillsLocations.title', "Agent Skills Locations"),
            markdownDescription: nls.localize('chat.agentSkillsLocations.description', "Specify location(s) of agent skills (`{0}`) that can be used in Chat Sessions. [Learn More]({1}).\n\nEach path should contain skill subfolders with SKILL.md files (e.g., add `my-skills` if you have `my-skills/skillA/SKILL.md`). Relative paths are resolved from the root folder(s) of your workspace.", SKILL_FILENAME, SKILL_DOCUMENTATION_URL),
            default: {
                ...DEFAULT_SKILL_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
            },
            additionalProperties: { type: 'boolean' },
            propertyNames: {
                pattern: VALID_PROMPT_FOLDER_PATTERN,
                patternErrorMessage: nls.localize('chat.agentSkillsLocations.invalidPath', "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported."),
            },
            restricted: true,
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true,
                },
                {
                    [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true,
                    'my-skills': true,
                    '../shared-skills': true,
                    '~/.custom/skills': true,
                },
            ],
        },
        [PromptsConfig.HOOKS_LOCATION_KEY]: {
            type: 'object',
            title: nls.localize('chat.hookFilesLocations.title', "Hook File Locations"),
            markdownDescription: nls.localize('chat.hookFilesLocations.description', "Specify paths to hook configuration files that define custom shell commands to execute at strategic points in an agent's workflow. [Learn More]({0}).\n\nRelative paths are resolved from the root folder(s) of your workspace. Supports Copilot hooks (`*.json`) and Claude Code hooks (`settings.json`, `settings.local.json`).", HOOK_DOCUMENTATION_URL),
            default: {
                ...DEFAULT_HOOK_FILE_PATHS.map((f) => ({ [f.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
            },
            additionalProperties: { type: 'boolean' },
            propertyNames: {
                pattern: VALID_PROMPT_FOLDER_PATTERN,
                patternErrorMessage: nls.localize('chat.hookFilesLocations.invalidPath', "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported."),
            },
            restricted: true,
            tags: ['preview', 'prompts', 'hooks', 'agent'],
            examples: [
                {
                    [DEFAULT_HOOK_FILE_PATHS[0].path]: true,
                },
                {
                    [DEFAULT_HOOK_FILE_PATHS[0].path]: true,
                    'custom-hooks/hooks.json': true,
                },
            ],
        },
        [PromptsConfig.USE_CHAT_HOOKS]: {
            type: 'boolean',
            title: nls.localize('chat.useHooks.title', "Use Chat Hooks"),
            markdownDescription: nls.localize('chat.useHooks.description', "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`."),
            default: true,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['preview', 'prompts', 'hooks', 'agent'],
            policy: {
                name: 'ChatHooks',
                category: PolicyCategory.InteractiveSession,
                minimumVersion: '1.109',
                value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
                localization: {
                    description: {
                        key: 'chat.useHooks.description',
                        value: nls.localize('chat.useHooks.description', "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`.")
                    }
                },
            }
        },
        [PromptsConfig.USE_CLAUDE_HOOKS]: {
            type: 'boolean',
            title: nls.localize('chat.useClaudeHooks.title', "Use Claude Hooks"),
            markdownDescription: nls.localize('chat.useClaudeHooks.description', "Controls whether hooks from Claude configuration files can execute. When disabled, only Copilot-format hooks are used. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['preview', 'prompts', 'hooks', 'agent']
        },
        [PromptsConfig.USE_CUSTOM_AGENT_HOOKS]: {
            type: 'boolean',
            title: nls.localize('chat.useCustomAgentHooks.title', "Use Custom Agent Hooks"),
            markdownDescription: nls.localize('chat.useCustomAgentHooks.description', "Controls whether hooks defined in custom agent frontmatter are parsed and executed. When disabled, hooks from agent files are ignored."),
            default: false,
            restricted: true,
            disallowConfigurationDefault: true,
            tags: ['preview', 'prompts', 'hooks', 'agent']
        },
        [PromptsConfig.PROMPT_FILES_SUGGEST_KEY]: {
            type: 'object',
            scope: 5 /* ConfigurationScope.RESOURCE */,
            title: nls.localize('chat.promptFilesRecommendations.title', "Prompt File Recommendations"),
            markdownDescription: nls.localize('chat.promptFilesRecommendations.description', "Configure which prompt files to recommend in the chat welcome view. Each key is a prompt file name, and the value can be `true` to always recommend, `false` to never recommend, or a [when clause](https://aka.ms/vscode-when-clause) expression like `resourceExtname == .js` or `resourceLangId == markdown`."),
            default: {},
            additionalProperties: {
                oneOf: [
                    { type: 'boolean' },
                    { type: 'string' }
                ]
            },
            tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
            examples: [
                {
                    'plan': true,
                    'a11y-audit': 'resourceExtname == .html',
                    'document': 'resourceLangId == markdown'
                }
            ],
        },
        [ChatConfiguration.TodosShowWidget]: {
            type: 'boolean',
            default: true,
            description: nls.localize('chat.tools.todos.showWidget', "Controls whether to show the todo list widget above the chat input. When enabled, the widget displays todo items created by the agent and updates as progress is made."),
        },
        [ChatConfiguration.ThinkingStyle]: {
            type: 'string',
            default: 'fixedScrolling',
            enum: ['collapsed', 'collapsedPreview', 'fixedScrolling'],
            enumDescriptions: [
                nls.localize('chat.agent.thinkingMode.collapsed', "Thinking parts will be collapsed by default."),
                nls.localize('chat.agent.thinkingMode.collapsedPreview', "Thinking parts will be expanded first, then collapse once we reach a part that is not thinking."),
                nls.localize('chat.agent.thinkingMode.fixedScrolling', "Show thinking in a fixed-height streaming panel that auto-scrolls; click header to expand to full height."),
            ],
            description: nls.localize('chat.agent.thinkingStyle', "Controls how thinking is rendered."),
            tags: ['experimental'],
        },
        [ChatConfiguration.ThinkingGenerateTitles]: {
            type: 'boolean',
            default: true,
            description: nls.localize('chat.agent.thinking.generateTitles', "Controls whether to use an LLM to generate summary titles for thinking sections."),
            tags: ['experimental'],
        },
        'chat.agent.thinking.collapsedTools': {
            type: 'string',
            default: 'always',
            enum: ['off', 'withThinking', 'always'],
            enumDescriptions: [
                nls.localize('chat.agent.thinking.collapsedTools.off', "Tool calls are shown separately, not collapsed into thinking."),
                nls.localize('chat.agent.thinking.collapsedTools.withThinking', "Tool calls are collapsed into thinking sections when thinking is present."),
                nls.localize('chat.agent.thinking.collapsedTools.always', "Tool calls are always collapsed, even without thinking."),
            ],
            markdownDescription: nls.localize('chat.agent.thinking.collapsedTools', "Controls how tool calls are displayed in relation to thinking sections."),
            tags: ['experimental'],
        },
        [ChatConfiguration.TerminalToolsInThinking]: {
            type: 'boolean',
            default: true,
            markdownDescription: nls.localize('chat.agent.thinking.terminalTools', "When enabled, terminal tool calls are displayed inside the thinking dropdown with a simplified view."),
            tags: ['experimental'],
        },
        [ChatConfiguration.SimpleTerminalCollapsible]: {
            type: 'boolean',
            default: true,
            markdownDescription: nls.localize('chat.tools.terminal.simpleCollapsible', "When enabled, terminal tool calls are always displayed in a collapsible container with a simplified view."),
            tags: ['experimental'],
        },
        'chat.tools.usagesTool.enabled': {
            type: 'boolean',
            default: true,
            markdownDescription: nls.localize('chat.tools.usagesTool.enabled', "Controls whether the usages tool is available for finding references, definitions, and implementations of code symbols."),
            tags: ['preview'],
            experiment: {
                mode: 'auto'
            }
        },
        'chat.tools.renameTool.enabled': {
            type: 'boolean',
            default: true,
            markdownDescription: nls.localize('chat.tools.renameTool.enabled', "Controls whether the rename tool is available for renaming code symbols across the workspace."),
            tags: ['preview'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.ThinkingPhrases]: {
            type: 'object',
            default: {
                mode: 'append',
                phrases: []
            },
            properties: {
                mode: {
                    type: 'string',
                    enum: ['replace', 'append'],
                    default: 'append',
                    description: nls.localize('chat.agent.thinking.phrases.mode', "'replace' replaces all default phrases entirely; 'append' adds your phrases to all default categories.")
                },
                phrases: {
                    type: 'array',
                    items: { type: 'string' },
                    default: [],
                    description: nls.localize('chat.agent.thinking.phrases.phrases', "Custom loading messages to show during thinking, working progress, terminal, and tool operations.")
                }
            },
            additionalProperties: false,
            markdownDescription: nls.localize('chat.agent.thinking.phrases', "Customize the loading messages shown during agent thinking and progress indicators. Use `\"mode\": \"replace\"` to use only your phrases, or `\"mode\": \"append\"` to add them to the defaults."),
            tags: ['experimental'],
        },
        [ChatConfiguration.AutoExpandToolFailures]: {
            type: 'boolean',
            default: true,
            markdownDescription: nls.localize('chat.tools.autoExpandFailures', "When enabled, tool failures are automatically expanded in the chat UI to show error details."),
        },
        [ChatConfiguration.AIDisabled]: {
            type: 'boolean',
            description: nls.localize('chat.disableAIFeatures', "Disable and hide built-in AI features provided by GitHub Copilot, including chat and inline suggestions."),
            default: false,
            scope: 4 /* ConfigurationScope.WINDOW */
        },
        'chat.allowAnonymousAccess': {
            type: 'boolean',
            description: nls.localize('chat.allowAnonymousAccess', "Controls whether anonymous access is allowed in chat."),
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.GrowthNotificationEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.growthNotification', "Controls whether to show a growth notification in the agent sessions view to encourage new users to try Copilot."),
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.SignInTitleBarEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.signInTitleBar', "Controls whether to show a sign-in button in the title bar for users who are not signed in."),
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.RestoreLastPanelSession]: {
            type: 'boolean',
            description: nls.localize('chat.restoreLastPanelSession', "Controls whether the last session is restored in panel after restart."),
            default: false
        },
        [ChatConfiguration.ExitAfterDelegation]: {
            type: 'boolean',
            description: nls.localize('chat.exitAfterDelegation', "Controls whether the chat panel automatically exits after delegating a request to another session."),
            default: false,
            tags: ['preview'],
        },
        'chat.extensionUnification.enabled': {
            type: 'boolean',
            description: nls.localize('chat.extensionUnification.enabled', "Enables the unification of GitHub Copilot extensions. When enabled, all GitHub Copilot functionality is served from the GitHub Copilot Chat extension. When disabled, the GitHub Copilot and GitHub Copilot Chat extensions operate independently."),
            default: true,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.SubagentToolCustomAgents]: {
            type: 'boolean',
            description: nls.localize('chat.subagentTool.customAgents', "Whether the runSubagent tool is able to use custom agents. When enabled, the tool can take the name of a custom agent, but it must be given the exact name of the agent."),
            default: true,
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.GeneralPurposeAgentEnabled]: {
            type: 'boolean',
            description: nls.localize('chat.generalPurposeAgent.enabled', "Controls whether the built-in General Purpose agent is available as a subagent."),
            default: false,
            tags: ['experimental', 'advanced'],
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: {
            type: 'boolean',
            description: nls.localize('chat.subagents.allowInvocationsFromSubagents', "Allow subagents to invoke subagents."),
            markdownDescription: nls.localize('chat.subagents.allowInvocationsFromSubagents.md', "Controls whether subagents can invoke other subagents. When enabled, nesting is limited to a maximum depth of 5."),
            default: false,
            experiment: {
                mode: 'auto'
            }
        },
        [ChatConfiguration.ChatCustomizationMenuEnabled]: {
            type: 'boolean',
            tags: ['preview'],
            description: nls.localize('chat.aiCustomizationMenu.enabled', "Controls whether the Chat Customizations editor is enabled. When enabled, the gear icon in the Chat view opens the Customizations editor directly and additional actions are moved to the overflow menu. When disabled, the gear icon shows the legacy configuration dropdown."),
            default: true,
        },
        [ChatConfiguration.ChatCustomizationHarnessSelectorEnabled]: {
            type: 'boolean',
            tags: ['preview'],
            description: nls.localize('chat.customizations.harnessSelector.enabled', "Controls whether the harness selector (Local, Copilot CLI, Claude) is shown in the Chat Customizations editor sidebar. When disabled, the editor always shows all customizations without filtering."),
            default: true,
        },
        [ChatConfiguration.CustomizationsProviderApi]: {
            type: 'boolean',
            description: nls.localize('chat.customizations.providerApi.enabled', "When enabled, the Customizations management UI reads items from the session type's customizations provider instead of built-in discovery."),
            default: false,
            tags: ['experimental'],
        },
    }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ChatEditor, ChatEditorInput.EditorID, nls.localize('chat', "Chat")), [
    new SyncDescriptor(ChatEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ChatDebugEditor, ChatDebugEditorInput.ID, nls.localize('chatDebug', "Debug View")), [
    new SyncDescriptor(ChatDebugEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(AgentPluginEditor, AgentPluginEditor.ID, nls.localize('agentPlugin', "Agent Plugin")), [
    new SyncDescriptor(AgentPluginEditorInput)
]);
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([
    {
        key: 'chat.experimental.detectParticipant.enabled',
        migrateFn: (value, _accessor) => ([
            ['chat.experimental.detectParticipant.enabled', { value: undefined }],
            ['chat.detectParticipant.enabled', { value: value !== false }]
        ])
    },
    {
        key: 'chat.useClaudeSkills',
        migrateFn: (value, _accessor) => ([
            ['chat.useClaudeSkills', { value: undefined }],
            ['chat.useAgentSkills', { value }]
        ])
    },
    {
        key: mcpDiscoverySection,
        migrateFn: (value) => {
            if (typeof value === 'boolean') {
                return { value: Object.fromEntries(allDiscoverySources.map(k => [k, value])) };
            }
            return { value };
        }
    },
    {
        key: ChatConfiguration.NotifyWindowOnConfirmation,
        migrateFn: (value) => {
            if (value === true) {
                return { value: ChatNotificationMode.WindowNotFocused };
            }
            else if (value === false) {
                return { value: ChatNotificationMode.Off };
            }
            return [];
        }
    },
    {
        key: ChatConfiguration.NotifyWindowOnResponseReceived,
        migrateFn: (value) => {
            if (value === true) {
                return { value: ChatNotificationMode.WindowNotFocused };
            }
            else if (value === false) {
                return { value: ChatNotificationMode.Off };
            }
            return [];
        }
    },
    {
        key: 'chat.plugins.paths',
        migrateFn: (value, _accessor) => ([
            ['chat.plugins.paths', { value: undefined }],
            [ChatConfiguration.PluginLocations, { value }]
        ])
    },
]);
let ChatResolverContribution = class ChatResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatResolver'; }
    constructor(chatSessionsService, editorResolverService, instantiationService) {
        super();
        this.editorResolverService = editorResolverService;
        this.instantiationService = instantiationService;
        this._editorRegistrations = this._register(new DisposableMap());
        this._registerEditor(Schemas.vscodeChatEditor);
        this._registerEditor(Schemas.vscodeLocalChatSession);
        this._register(chatSessionsService.onDidChangeContentProviderSchemes((e) => {
            for (const scheme of e.added) {
                this._registerEditor(scheme);
            }
            for (const scheme of e.removed) {
                this._editorRegistrations.deleteAndDispose(scheme);
            }
        }));
        for (const scheme of chatSessionsService.getContentProviderSchemes()) {
            this._registerEditor(scheme);
        }
    }
    _registerEditor(scheme) {
        this._editorRegistrations.set(scheme, this.editorResolverService.registerEditor(`${scheme}:**/**`, {
            id: ChatEditorInput.EditorID,
            label: nls.localize('chat', "Chat"),
            priority: RegisteredEditorPriority.builtin
        }, {
            singlePerResource: true,
            canSupportResource: resource => resource.scheme === scheme,
        }, {
            createEditorInput: ({ resource, options }) => {
                return {
                    editor: this.instantiationService.createInstance(ChatEditorInput, resource, options),
                    options
                };
            }
        }));
    }
};
ChatResolverContribution = __decorate([
    __param(0, IChatSessionsService),
    __param(1, IEditorResolverService),
    __param(2, IInstantiationService)
], ChatResolverContribution);
let CopilotTelemetryContribution = class CopilotTelemetryContribution extends Disposable {
    static { this.ID = 'workbench.contrib.copilotTelemetry'; }
    constructor(telemetryService, chatEntitlementService) {
        super();
        this.telemetryService = telemetryService;
        this.chatEntitlementService = chatEntitlementService;
        this.updateCopilotTrackingId();
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
            this.updateCopilotTrackingId();
        }));
    }
    updateCopilotTrackingId() {
        const copilotTrackingId = this.chatEntitlementService.copilotTrackingId;
        if (copilotTrackingId) {
            // __GDPR__COMMON__ "common.copilotTrackingId" : { "endPoint": "GoogleAnalyticsID", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "The anonymized Copilot analytics tracking ID from the entitlement API." }
            this.telemetryService.setCommonProperty('common.copilotTrackingId', copilotTrackingId);
        }
    }
};
CopilotTelemetryContribution = __decorate([
    __param(0, ITelemetryService),
    __param(1, IChatEntitlementService)
], CopilotTelemetryContribution);
let ChatDebugResolverContribution = class ChatDebugResolverContribution {
    static { this.ID = 'workbench.contrib.chatDebugResolver'; }
    constructor(editorResolverService) {
        editorResolverService.registerEditor(`${ChatDebugEditorInput.RESOURCE.scheme}:**/**`, {
            id: ChatDebugEditorInput.ID,
            label: nls.localize('chatDebug', "Debug View"),
            priority: RegisteredEditorPriority.exclusive
        }, {
            singlePerResource: true,
            canSupportResource: resource => resource.scheme === ChatDebugEditorInput.RESOURCE.scheme
        }, {
            createEditorInput: () => {
                return {
                    editor: ChatDebugEditorInput.instance,
                    options: { pinned: true }
                };
            }
        });
    }
};
ChatDebugResolverContribution = __decorate([
    __param(0, IEditorResolverService)
], ChatDebugResolverContribution);
let ChatAgentSettingContribution = class ChatAgentSettingContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatAgentSetting'; }
    constructor(experimentService, entitlementService, contextKeyService) {
        super();
        this.experimentService = experimentService;
        this.entitlementService = entitlementService;
        this.contextKeyService = contextKeyService;
        this.newChatButtonExperimentIcon = ChatContextKeys.newChatButtonExperimentIcon.bindTo(this.contextKeyService);
        this.registerMaxRequestsSetting();
        this.registerNewChatButtonIcon();
        this.registerDefaultModeSetting();
    }
    registerMaxRequestsSetting() {
        let lastNode;
        const registerMaxRequestsSetting = () => {
            const treatmentId = this.entitlementService.entitlement === ChatEntitlement.Free ?
                'chatAgentMaxRequestsFree' :
                'chatAgentMaxRequestsPro';
            this.experimentService.getTreatment(treatmentId).then((value) => {
                const node = {
                    id: 'chatSidebar',
                    title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
                    type: 'object',
                    properties: {
                        'chat.agent.maxRequests': {
                            type: 'number',
                            markdownDescription: nls.localize('chat.agent.maxRequests', "The maximum number of requests to allow per-turn when using an agent. When the limit is reached, will ask to confirm to continue."),
                            default: value ?? 50,
                            order: 2,
                        },
                    }
                };
                configurationRegistry.updateConfigurations({ remove: lastNode ? [lastNode] : [], add: [node] });
                lastNode = node;
            });
        };
        this._register(Event.runAndSubscribe(Event.debounce(this.entitlementService.onDidChangeEntitlement, () => { }, 1000), () => registerMaxRequestsSetting()));
    }
    registerNewChatButtonIcon() {
        this.experimentService.getTreatment('chatNewButtonIcon').then((value) => {
            const supportedValues = ['copilot', 'new-session', 'comment'];
            if (typeof value === 'string' && supportedValues.includes(value)) {
                this.newChatButtonExperimentIcon.set(value);
            }
            else {
                this.newChatButtonExperimentIcon.reset();
            }
        });
    }
    registerDefaultModeSetting() {
        this.experimentService.getTreatment('chatDefaultNewSessionMode').then(value => {
            const node = {
                id: 'chatSidebar',
                title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
                type: 'object',
                properties: {
                    [ChatConfiguration.DefaultNewSessionMode]: {
                        type: 'string',
                        description: nls.localize('chat.newSession.defaultMode', "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
                        default: typeof value === 'string' ? value : '',
                    }
                }
            };
            configurationRegistry.updateConfigurations({ add: [node], remove: [] });
        });
    }
};
ChatAgentSettingContribution = __decorate([
    __param(0, IWorkbenchAssignmentService),
    __param(1, IChatEntitlementService),
    __param(2, IContextKeyService)
], ChatAgentSettingContribution);
let ChatForegroundSessionCountContribution = class ChatForegroundSessionCountContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatForegroundSessionCount'; }
    constructor(contextKeyService, chatWidgetService, viewsService, editorService) {
        super();
        this.contextKeyService = contextKeyService;
        this.chatWidgetService = chatWidgetService;
        this.viewsService = viewsService;
        this.editorService = editorService;
        this.foregroundSessionCountContextKey = ChatContextKeys.foregroundSessionCount.bindTo(this.contextKeyService);
        this._register(this.chatWidgetService.onDidAddWidget(() => {
            this.updateForegroundSessionCount();
        }));
        this._register(this.editorService.onDidVisibleEditorsChange(() => {
            this.updateForegroundSessionCount();
        }));
        this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, e => e.id === ChatViewId)(() => {
            this.updateForegroundSessionCount();
        }));
        this.updateForegroundSessionCount();
    }
    updateForegroundSessionCount() {
        let count = this.viewsService.isViewVisible(ChatViewId) ? 1 : 0;
        for (const widget of this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)) {
            if (widget.domNode.offsetParent === null) {
                continue;
            }
            if (isIChatViewViewContext(widget.viewContext)) {
                continue;
            }
            if (isIChatResourceViewContext(widget.viewContext) && widget.viewContext.isQuickChat) {
                continue;
            }
            count++;
        }
        this.foregroundSessionCountContextKey.set(count);
    }
};
ChatForegroundSessionCountContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, IChatWidgetService),
    __param(2, IViewsService),
    __param(3, IEditorService)
], ChatForegroundSessionCountContribution);
/**
 * Given builtin and custom modes, returns only the custom mode IDs that should have actions registered.
 * Custom modes whose names conflict with builtin modes are excluded.
 * If there are name collisions among custom modes, the later mode in the list wins.
 */
function getCustomModesWithUniqueNames(builtinModes, customModes) {
    const customModeIds = new Set();
    const builtinNames = new Set(builtinModes.map(mode => mode.name.get()));
    const customNameToId = new Map();
    for (const mode of customModes) {
        const modeName = mode.name.get();
        // Skip custom modes that conflict with builtin mode names
        if (builtinNames.has(modeName)) {
            continue;
        }
        // If there is a name collision among custom modes, the later one in the list wins
        const existingId = customNameToId.get(modeName);
        if (existingId) {
            customModeIds.delete(existingId);
        }
        customNameToId.set(modeName, mode.id);
        customModeIds.add(mode.id);
    }
    return customModeIds;
}
/**
 * Workbench contribution to register actions for custom chat modes via events
 */
let ChatAgentActionsContribution = class ChatAgentActionsContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatAgentActions'; }
    constructor(chatModeService) {
        super();
        this.chatModeService = chatModeService;
        this._modeActionDisposables = new DisposableMap();
        this._store.add(this._modeActionDisposables);
        // Register actions for existing custom modes (avoiding name collisions)
        const { builtin, custom } = this.chatModeService.getModes();
        const currentModeIds = getCustomModesWithUniqueNames(builtin, custom);
        for (const mode of custom) {
            if (currentModeIds.has(mode.id)) {
                this._registerModeAction(mode);
            }
        }
        // Listen for custom mode changes by tracking snapshots
        this._register(this.chatModeService.onDidChangeChatModes(() => {
            const { builtin, custom } = this.chatModeService.getModes();
            const currentModeIds = getCustomModesWithUniqueNames(builtin, custom);
            // Remove modes that no longer exist and those replaced by modes later in the list with same name
            for (const modeId of this._modeActionDisposables.keys()) {
                if (!currentModeIds.has(modeId)) {
                    this._modeActionDisposables.deleteAndDispose(modeId);
                }
            }
            // Register new modes
            for (const mode of custom) {
                if (currentModeIds.has(mode.id) && !this._modeActionDisposables.has(mode.id)) {
                    this._registerModeAction(mode);
                }
            }
        }));
    }
    _registerModeAction(mode) {
        const actionClass = class extends ModeOpenChatGlobalAction {
            constructor() {
                super(mode);
            }
        };
        this._modeActionDisposables.set(mode.id, registerAction2(actionClass));
    }
};
ChatAgentActionsContribution = __decorate([
    __param(0, IChatModeService)
], ChatAgentActionsContribution);
let HookSchemaAssociationContribution = class HookSchemaAssociationContribution extends Disposable {
    static { this.ID = 'workbench.contrib.hookSchemaAssociation'; }
    constructor(_configurationService, _pathService) {
        super();
        this._configurationService = _configurationService;
        this._pathService = _pathService;
        this._registrations = this._register(new DisposableStore());
        this._updateAssociations();
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(PromptsConfig.HOOKS_LOCATION_KEY)) {
                this._updateAssociations();
            }
        }));
    }
    async _updateAssociations() {
        this._registrations.clear();
        const folders = PromptsConfig.promptSourceFolders(this._configurationService, PromptsType.hook);
        const userHomeUri = await this._pathService.userHome();
        const userHome = userHomeUri.fsPath ?? userHomeUri.path;
        for (const folder of folders) {
            // Skip Claude settings files — they use a different schema format
            if (folder.source === PromptFileSource.ClaudeWorkspace || folder.source === PromptFileSource.ClaudeWorkspaceLocal || folder.source === PromptFileSource.ClaudePersonal) {
                continue;
            }
            // Expand tilde paths to absolute paths so the JSON language service can match them
            const resolvedPath = isTildePath(folder.path)
                ? userHome + folder.path.substring(1)
                : folder.path;
            // If it's a specific .json file, use it directly; otherwise treat as directory
            const glob = resolvedPath.toLowerCase().endsWith('.json')
                ? resolvedPath
                : `${resolvedPath}/*.json`;
            this._registrations.add(jsonContributionRegistry.registerSchemaAssociation(HOOK_SCHEMA_URI, glob));
        }
    }
};
HookSchemaAssociationContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IPathService)
], HookSchemaAssociationContribution);
let ToolReferenceNamesContribution = class ToolReferenceNamesContribution extends Disposable {
    static { this.ID = 'workbench.contrib.toolReferenceNames'; }
    constructor(_languageModelToolsService) {
        super();
        this._languageModelToolsService = _languageModelToolsService;
        this._updateToolReferenceNames();
        this._register(this._languageModelToolsService.onDidChangeTools(() => this._updateToolReferenceNames()));
    }
    _updateToolReferenceNames() {
        const tools = Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled())
            .filter((tool) => typeof tool.toolReferenceName === 'string')
            .sort((a, b) => a.toolReferenceName.localeCompare(b.toolReferenceName));
        toolReferenceNameEnumValues.length = 0;
        toolReferenceNameEnumDescriptions.length = 0;
        for (const tool of tools) {
            toolReferenceNameEnumValues.push(tool.toolReferenceName);
            toolReferenceNameEnumDescriptions.push(nls.localize('chat.toolReferenceName.description', "{0} - {1}", tool.toolReferenceName, tool.userDescription || tool.displayName));
        }
        configurationRegistry.notifyConfigurationSchemaUpdated({
            id: 'chatSidebar',
            properties: {
                [ChatConfiguration.EligibleForAutoApproval]: {}
            }
        });
    }
};
ToolReferenceNamesContribution = __decorate([
    __param(0, ILanguageModelToolsService)
], ToolReferenceNamesContribution);
AccessibleViewRegistry.register(new ChatTerminalOutputAccessibleView());
AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new PanelChatAccessibilityHelp());
AccessibleViewRegistry.register(new QuickChatAccessibilityHelp());
AccessibleViewRegistry.register(new EditsChatAccessibilityHelp());
AccessibleViewRegistry.register(new AgentChatAccessibilityHelp());
registerEditorFeature(ChatInputBoxContentProvider);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatDebugEditorInput.ID, ChatDebugEditorInputSerializer);
registerWorkbenchContribution2(CopilotTelemetryContribution.ID, CopilotTelemetryContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(ChatDebugResolverContribution.ID, ChatDebugResolverContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(PromptsDebugContribution.ID, PromptsDebugContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatLanguageModelsDataContribution.ID, ChatLanguageModelsDataContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatSlashCommandsContribution.ID, ChatSlashCommandsContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatPromptFilesExtensionPointHandler.ID, ChatPromptFilesExtensionPointHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(CodeBlockActionRendering.ID, CodeBlockActionRendering, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatImplicitContextContribution.ID, ChatImplicitContextContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(ChatViewsWelcomeHandler.ID, ChatViewsWelcomeHandler, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(ChatGettingStartedContribution.ID, ChatGettingStartedContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(ChatSetupContribution.ID, ChatSetupContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatTeardownContribution.ID, ChatTeardownContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatStatusBarEntry.ID, ChatStatusBarEntry, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(BuiltinToolsContribution.ID, BuiltinToolsContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(UsagesToolContribution.ID, UsagesToolContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(RenameToolContribution.ID, RenameToolContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatAgentSettingContribution.ID, ChatAgentSettingContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatForegroundSessionCountContribution.ID, ChatForegroundSessionCountContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatAgentActionsContribution.ID, ChatAgentActionsContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(HookSchemaAssociationContribution.ID, HookSchemaAssociationContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ToolReferenceNamesContribution.ID, ToolReferenceNamesContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatAgentRecommendation.ID, ChatAgentRecommendation, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(ChatEditingEditorAccessibility.ID, ChatEditingEditorAccessibility, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatQueuePickerRendering.ID, ChatQueuePickerRendering, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatEditingEditorOverlay.ID, ChatEditingEditorOverlay, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(SimpleBrowserOverlay.ID, SimpleBrowserOverlay, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatEditingEditorContextKeys.ID, ChatEditingEditorContextKeys, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatTransferContribution.ID, ChatTransferContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatContextContributions.ID, ChatContextContributions, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(PromptUrlHandler.ID, PromptUrlHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(PluginUrlHandler.ID, PluginUrlHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(ChatResponseResourceWorkbenchContribution.ID, ChatResponseResourceWorkbenchContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(UserToolSetsContributions.ID, UserToolSetsContributions, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(PromptLanguageFeaturesProvider.ID, PromptLanguageFeaturesProvider, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(ChatWindowNotifier.ID, ChatWindowNotifier, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatRepoInfoContribution.ID, ChatRepoInfoContribution, 4 /* WorkbenchPhase.Eventually */);
registerWorkbenchContribution2(AgentPluginsViewsContribution.ID, AgentPluginsViewsContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AgentPluginRecommendations.ID, AgentPluginRecommendations, 4 /* WorkbenchPhase.Eventually */);
registerChatActions();
registerChatAccessibilityActions();
registerChatCopyActions();
registerChatOpenAgentDebugPanelAction();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatPromptNavigationActions();
registerChatTitleActions();
registerChatExecuteActions();
registerChatQueueActions();
registerQuickChatActions();
registerChatExportActions();
registerChatForkActions();
registerMoveActions();
registerNewChatActions();
registerChatContextActions();
registerChatDeveloperActions();
registerChatEditorActions();
registerChatElicitationActions();
registerChatToolActions();
registerLanguageModelActions();
registerChatPluginActions();
registerAction2(ConfigureToolSets);
registerEditorFeature(ChatPasteProvidersFeature);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ConfiguredAgentPluginDiscovery));
agentPluginDiscoveryRegistry.register(new SyncDescriptor(MarketplaceAgentPluginDiscovery));
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ExtensionAgentPluginDiscovery));
registerSingleton(IChatResponseResourceFileSystemProvider, ChatResponseResourceFileSystemProvider, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatTransferService, ChatTransferService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatService, ChatService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatWidgetService, ChatWidgetService, 1 /* InstantiationType.Delayed */);
registerSingleton(IQuickChatService, QuickChatService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelsConfigurationService, LanguageModelsConfigurationService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelsService, LanguageModelsService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatAgentService, ChatAgentService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatAgentNameService, ChatAgentNameService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatVariablesService, ChatVariablesService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAgentPluginService, AgentPluginService, 1 /* InstantiationType.Delayed */);
registerSingleton(IPluginMarketplaceService, PluginMarketplaceService, 1 /* InstantiationType.Delayed */);
registerSingleton(IWorkspacePluginSettingsService, WorkspacePluginSettingsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAgentPluginRepositoryService, AgentPluginRepositoryService, 1 /* InstantiationType.Delayed */);
registerSingleton(IPluginInstallService, PluginInstallService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, 1 /* InstantiationType.Delayed */);
registerSingleton(IVoiceChatService, VoiceChatService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, 1 /* InstantiationType.Delayed */);
registerSingleton(ICodeMapperService, CodeMapperService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatEditingService, ChatEditingService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatMarkdownAnchorService, ChatMarkdownAnchorService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, 1 /* InstantiationType.Delayed */);
registerSingleton(IPromptsService, PromptsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatContextPickService, ChatContextPickService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatModeService, ChatModeService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatAttachmentResolveService, ChatAttachmentResolveService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatAttachmentWidgetRegistry, ChatAttachmentWidgetRegistry, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatTodoListService, ChatTodoListService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatArtifactsService, ChatArtifactsService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatLayoutService, ChatLayoutService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatTipService, ChatTipService, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatDebugService, ChatDebugServiceImpl, 1 /* InstantiationType.Delayed */);
registerSingleton(IChatImageCarouselService, ChatImageCarouselService, 1 /* InstantiationType.Delayed */);
ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQWtFLE1BQU0sb0VBQW9FLENBQUM7QUFDM0wsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxz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