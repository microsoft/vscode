/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { AgentHostEnabledSettingId, AgentHostIpcLoggingSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { AgentNetworkFilterService, IAgentNetworkFilterService } from '../../../../platform/networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId } from '../../../../platform/sandbox/common/settings.js';
import { registerEditorFeature } from '../../../../editor/common/editorFeatures.js';
import * as nls from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { McpAccessValue, McpAutoStartValue, mcpAccessConfig, mcpAutoStartConfig, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig, mcpAppsEnabledConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { type ConfigurationKeyValuePairs, Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AddConfigurationType, AssistedTypes } from '../../mcp/browser/mcpCommandsAddConfiguration.js';
import { allDiscoverySources, discoverySourceSettingsLabel, mcpDiscoverySection, mcpServerSamplingSection } from '../../mcp/common/mcpConfiguration.js';
import { ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from '../common/participants/chatAgents.js';
import { CodeMapperService, ICodeMapperService } from '../common/editing/chatCodeMapperService.js';
import '../common/widget/chatColors.js';
import { IChatEditingService } from '../common/editing/chatEditingService.js';
import { IChatLayoutService } from '../common/widget/chatLayoutService.js';
import { ChatModeService, IChatMode, IChatModeService } from '../common/chatModes.js';
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
import { ChatAgentLocation, ChatConfiguration, ChatNotificationMode, ChatPermissionLevel } from '../common/constants.js';
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
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../common/promptSyntax/service/promptsServiceImpl.js';
import { LanguageModelToolsExtensionPointHandler } from '../common/tools/languageModelToolsContribution.js';
import './telemetry/chatModelCountTelemetry.js';
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
import { ChatCopyActionRendering, registerChatCopyActions } from './actions/chatCopyActions.js';
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
import { ChatEditor, IChatEditorOptions } from './widgetHosts/editor/chatEditor.js';
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
import { AgentPluginRecommendations } from './claudePluginRecommendations.js';
import { AgentPluginEditor } from './agentPluginEditor/agentPluginEditor.js';
import { AgentPluginEditorInput } from './agentPluginEditor/agentPluginEditorInput.js';
import { AgentPluginRepositoryService } from './agentPluginRepositoryService.js';
import { BrowserPluginGitCommandService } from './pluginGitCommandService.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';
import { PluginInstallService } from './pluginInstallService.js';
import './promptSyntax/promptCodingAgentActionContribution.js';
import './promptSyntax/promptToolsCodeLensProvider.js';
import { ChatSessionOptionSlashCommandsContribution, ChatSlashCommandsContribution } from './chatSlashCommands.js';
import './planReviewFeedback/planReviewFeedbackEditorContribution.js';
import { registerPlanReviewFeedbackEditorActions } from './planReviewFeedback/planReviewFeedbackEditorActions.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from './planReviewFeedback/planReviewFeedbackService.js';
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

const toolReferenceNameEnumValues: string[] = [];
const toolReferenceNameEnumDescriptions: string[] = [];

// Register JSON schema for hook files
const jsonContributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
jsonContributionRegistry.registerSchema(HOOK_SCHEMA_URI, hookFileSchema);

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
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
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: nls.localize('chat.editing.confirmEditRequestRemoval', "Whether to show a confirmation before removing a request and its associated edits."),
			default: true,
		},
		'chat.editing.confirmEditRequestRetry': {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
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
			scope: ConfigurationScope.APPLICATION,
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
		[ChatConfiguration.IncrementalRendering]: {
			type: 'boolean',
			description: nls.localize('chat.experimental.incrementalRendering.enabled', "Enables incremental rendering with optional block-level animation when streaming chat responses."),
			default: false,
			tags: ['experimental'],
		},
		[ChatConfiguration.IncrementalRenderingStyle]: {
			type: 'string',
			enum: ['none', 'fade', 'rise', 'blur', 'scale', 'slide', 'reveal'],
			enumDescriptions: [
				nls.localize('chat.experimental.incrementalRendering.animationStyle.none', "No animation. Content appears instantly."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.fade', "Simple opacity fade from 0 to 1."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.rise', "Content fades in while rising upward."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.blur', "Content fades in from a blurred state."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.scale', "Content scales up from slightly smaller."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.slide', "Content slides in from the left."),
				nls.localize('chat.experimental.incrementalRendering.animationStyle.reveal', "Content reveals top-to-bottom with a soft gradient edge."),
			],
			description: nls.localize('chat.experimental.incrementalRendering.animationStyle', "Controls the animation style for incremental rendering."),
			default: 'fade',
			tags: ['experimental'],
		},
		[ChatConfiguration.IncrementalRenderingBuffering]: {
			type: 'string',
			enum: ['off', 'word', 'paragraph'],
			enumDescriptions: [
				nls.localize('chat.experimental.incrementalRendering.buffering.off', "Renders content immediately as tokens arrive."),
				nls.localize('chat.experimental.incrementalRendering.buffering.word', "Reveals content word by word."),
				nls.localize('chat.experimental.incrementalRendering.buffering.paragraph', "Buffers content until a paragraph break before rendering."),
			],
			description: nls.localize('chat.experimental.incrementalRendering.buffering', "Controls how content is buffered before rendering during incremental rendering. Lower buffering levels render faster but may show incomplete sentences or partially formed markdown."),
			default: 'word',
			tags: ['experimental'],
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
			default: {
			}
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
			scope: ConfigurationScope.APPLICATION_MACHINE,
			tags: ['experimental', 'advanced'],
		},
		[ChatConfiguration.AutopilotEnabled]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.autopilot.enabled', "Controls whether the Autopilot mode is available in the permissions picker. When enabled, Autopilot auto-approves all tool calls and continues until the task is done."),
			default: true,
			tags: ['experimental'],
		},
		[ChatConfiguration.DefaultPermissionLevel]: {
			type: 'string',
			enum: [ChatPermissionLevel.Default, ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot],
			enumItemLabels: [
				nls.localize('chat.permissions.default.default.label', "Default Approvals"),
				nls.localize('chat.permissions.default.autoApprove.label', "Bypass Approvals"),
				nls.localize('chat.permissions.default.autopilot.label', "Autopilot (Preview)"),
			],
			enumDescriptions: [
				nls.localize('chat.permissions.default.default.description', "Start new chat sessions with Default Approvals."),
				nls.localize('chat.permissions.default.autoApprove.description', "Start new chat sessions in Bypass Approvals mode."),
				nls.localize('chat.permissions.default.autopilot.description', "Start new chat sessions in Autopilot mode."),
			],
			description: nls.localize('chat.permissions.default.settingDescription', "Controls the default permissions picker mode for new chat sessions. You can still change the permission mode per session, and each session remembers the permission mode that was used. If enterprise policy disables auto approval, new sessions use Default Approvals."),
			default: ChatPermissionLevel.Default,
			tags: ['experimental'],
		},
		[ChatConfiguration.GlobalAutoApprove]: {
			default: false,
			markdownDescription: globalAutoApproveDescription.value,
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION_MACHINE,
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
		'chat.sendElementsToChat.attachCSS': {
			default: true,
			markdownDescription: nls.localize('chat.sendElementsToChat.attachCSS', "Controls whether CSS of the selected element will be added to the chat."),
			type: 'boolean',
			tags: ['preview']
		},
		'chat.sendElementsToChat.attachImages': {
			default: true,
			markdownDescription: nls.localize('chat.sendElementsToChat.attachImages', "Controls whether a screenshot of the selected element will be added to the chat."),
			type: 'boolean',
			tags: ['experimental']
		},
		[ChatConfiguration.ArtifactsEnabled]: {
			default: false,
			description: nls.localize('chat.artifacts.enabled', "Controls whether the artifacts view is available in chat."),
			type: 'boolean',
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
		[ChatConfiguration.ArtifactsRulesByMemoryFilePath]: {
			default: {
				'**/*plan*.md': { groupName: 'Plans' }
			},
			description: nls.localize('chat.artifacts.rules.byMemoryFilePath', "Rules for extracting artifacts from memory tool calls by memory file path pattern. Maps glob patterns to group configuration."),
			type: 'object',
			additionalProperties: {
				type: 'object',
				properties: {
					groupName: { type: 'string', description: nls.localize('chat.artifacts.rules.byMemoryFilePath.groupName', "Display name for the artifact group.") },
					onlyShowGroup: { type: 'boolean', description: nls.localize('chat.artifacts.rules.byMemoryFilePath.onlyShowGroup', "When true, show only the group header instead of individual items.") }
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
		[ChatConfiguration.ChatPersistentProgressEnabled]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			description: nls.localize('chat.persistentProgress.enabled', "Always show progress in chat."),
		},
		[ChatConfiguration.ProgressBorder]: {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('chat.progressBorder.enabled', "Show an animated gradient border around the chat input while the agent is working or thinking. When enabled, this overrides {0} to be off.", '`#chat.persistentProgress.enabled#`'),
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
				McpAccessValue.None,
				McpAccessValue.Registry,
				McpAccessValue.All
			],
			enumDescriptions: [
				nls.localize('chat.mcp.access.none', "No access to MCP servers."),
				nls.localize('chat.mcp.access.registry', "Allows access to MCP servers installed from the registry that VS Code is connected to."),
				nls.localize('chat.mcp.access.any', "Allow access to any installed MCP server.")
			],
			default: McpAccessValue.All,
			policy: {
				name: 'ChatMCP',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.99',
				value: (policyData) => {
					if (policyData.mcp === false) {
						return McpAccessValue.None;
					}
					if (policyData.mcpAccess === 'registry_only') {
						return McpAccessValue.Registry;
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
			default: McpAutoStartValue.NewAndOutdated,
			enum: [
				McpAutoStartValue.Never,
				McpAutoStartValue.OnlyNew,
				McpAutoStartValue.NewAndOutdated
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
			scope: ConfigurationScope.RESOURCE,
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
		[AssistedTypes[AddConfigurationType.NuGetPackage].enabledConfigKey]: {
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
			policy: {
				name: 'ChatPluginsEnabled',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.116',
				localization: {
					description: {
						key: 'chat.plugins.enabled',
						value: nls.localize('chat.plugins.enabled', "Enable agent plugin integration in chat."),
					}
				},
			},
		},
		[ChatConfiguration.PluginLocations]: {
			type: 'object',
			additionalProperties: { type: 'boolean' },
			restricted: true,
			markdownDescription: nls.localize('chat.pluginLocations', "Plugin directories to discover. Each key is a path that points directly to a plugin folder, and the value enables (`true`) or disables (`false`) it. Paths can be absolute, relative to the workspace root, or start with `~/` for the user's home directory."),
			scope: ConfigurationScope.MACHINE,
			tags: ['experimental'],
		},
		[ChatConfiguration.PluginMarketplaces]: {
			type: 'array',
			items: {
				type: 'string',
			},
			markdownDescription: nls.localize('chat.plugins.marketplaces', "Plugin marketplaces to query. Entries may be GitHub shorthand (`owner/repo`), direct Git repository URIs (`https://...git`, `ssh://...git`, or `git@host:path.git`), or local repository URIs (`file:///...`). Equivalent GitHub shorthand and URI entries are deduplicated."),
			default: ['github/copilot-plugins', 'github/awesome-copilot'],
			scope: ConfigurationScope.APPLICATION,
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
		[AgentNetworkDomainSettingId.NetworkFilter]: {
			markdownDescription: nls.localize('chat.agent.networkFilter', "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
			type: 'boolean',
			default: false,
			restricted: true,
			policy: {
				name: 'ChatAgentNetworkFilter',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.116',
				localization: {
					description: {
						key: 'chat.agent.networkFilter',
						value: nls.localize('chat.agent.networkFilter', "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
					}
				}
			}
		},
		[AgentNetworkDomainSettingId.AllowedNetworkDomains]: {
			markdownDescription: nls.localize('chat.agent.allowedNetworkDomains', "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {1} is enabled, this also configures terminal sandbox networking. Supports wildcards like {2}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {3}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, '`*.example.com`', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
			type: 'array',
			items: { type: 'string' },
			default: [],
			restricted: true,
			policy: {
				name: 'ChatAgentAllowedNetworkDomains',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.116',
				localization: {
					description: {
						key: 'chat.agent.allowedNetworkDomains',
						value: nls.localize('chat.agent.allowedNetworkDomains', "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {1} is enabled, this also configures terminal sandbox networking. Supports wildcards like {2}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {3}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, '`*.example.com`', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
					}
				}
			}
		},
		[AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
			markdownDescription: nls.localize('chat.agent.deniedNetworkDomains', "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {1} is enabled, this also configures terminal sandbox networking. Takes precedence over {2}. Supports wildcards like {3}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, '`*.example.com`'),
			type: 'array',
			items: { type: 'string' },
			default: [],
			restricted: true,
			policy: {
				name: 'ChatAgentDeniedNetworkDomains',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.116',
				localization: {
					description: {
						key: 'chat.agent.deniedNetworkDomains',
						value: nls.localize('chat.agent.deniedNetworkDomains', "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {1} is enabled, this also configures terminal sandbox networking. Takes precedence over {2}. Supports wildcards like {3}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, '`*.example.com`'),
					}
				}
			}
		},
		[AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains]: {
			type: 'array',
			items: { type: 'string' },
			deprecated: true,
			markdownDeprecationMessage: nls.localize('agentSandbox.allowedNetworkDomains.deprecated', 'Use {0} instead', `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``),
		},
		[AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains]: {
			type: 'array',
			items: { type: 'string' },
			deprecated: true,
			markdownDeprecationMessage: nls.localize('agentSandbox.deniedNetworkDomains.deprecated', 'Use {0} instead', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
		},
		[AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains]: {
			type: 'array',
			items: { type: 'string' },
			deprecated: true,
			markdownDeprecationMessage: nls.localize('agentSandbox.allowedNetworkDomains2.deprecated', 'Use {0} instead', `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``),
		},
		[AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains]: {
			type: 'array',
			items: { type: 'string' },
			deprecated: true,
			markdownDeprecationMessage: nls.localize('agentSandbox.deniedNetworkDomains2.deprecated', 'Use {0} instead', `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
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
			default: product.quality !== 'stable',
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[ChatConfiguration.AgentHostClientTools]: {
			type: 'array',
			items: { type: 'string' },
			description: nls.localize('chat.agentHost.clientTools', "Tool reference names to expose as client-provided tools in agent host sessions."),
			default: ['runTask', 'getTaskOutput', 'problems', 'runTests'],
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[ChatConfiguration.ToolConfirmationCarousel]: {
			type: 'boolean',
			description: nls.localize('chat.tools.confirmationCarousel', "When enabled, multiple tool confirmations are batched into a carousel above the input."),
			default: product.quality !== 'stable',
			tags: ['experimental'],
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
			scope: ConfigurationScope.APPLICATION,
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
			title: nls.localize(
				'chat.instructions.config.locations.title',
				"Instructions File Locations",
			),
			markdownDescription: nls.localize(
				'chat.instructions.config.locations.description',
				"Specify location(s) of instructions files (`*{0}`) that can be attached in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.",
				INSTRUCTION_FILE_EXTENSION,
				INSTRUCTIONS_DOCUMENTATION_URL,
			),
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
			title: nls.localize(
				'chat.reusablePrompts.config.locations.title',
				"Prompt File Locations",
			),
			markdownDescription: nls.localize(
				'chat.reusablePrompts.config.locations.description',
				"Specify location(s) of reusable prompt files (`*{0}`) that can be run in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.",
				PROMPT_FILE_EXTENSION,
				PROMPT_DOCUMENTATION_URL,
			),
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
			title: nls.localize(
				'chat.mode.config.locations.title',
				"Mode File Locations",
			),
			markdownDescription: nls.localize(
				'chat.mode.config.locations.description',
				"Specify location(s) of custom chat mode files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.",
				LEGACY_MODE_FILE_EXTENSION,
				AGENT_DOCUMENTATION_URL,
			),
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
			title: nls.localize(
				'chat.agents.config.locations.title',
				"Agent File Locations",
			),
			markdownDescription: nls.localize(
				'chat.agents.config.locations.description',
				"Specify location(s) of custom agent files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.",
				AGENT_FILE_EXTENSION,
				AGENT_DOCUMENTATION_URL,
			),
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
			title: nls.localize('chat.useAgentMd.title', "Use AGENTS.md file",),
			markdownDescription: nls.localize('chat.useAgentMd.description', "Controls whether instructions from `AGENTS.md` file found in a workspace roots are attached to all chat requests.",),
			default: true,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_NESTED_AGENT_MD]: {
			type: 'boolean',
			title: nls.localize('chat.useNestedAgentMd.title', "Use nested AGENTS.md files",),
			markdownDescription: nls.localize('chat.useNestedAgentMd.description', "Controls whether instructions from nested `AGENTS.md` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_CLAUDE_MD]: {
			type: 'boolean',
			title: nls.localize('chat.useClaudeMd.title', "Use CLAUDE.md file",),
			markdownDescription: nls.localize('chat.useClaudeMd.description', "Controls whether instructions from `CLAUDE.md` file found in workspace roots, .claude and ~/.claude folder are attached to all chat requests.",),
			default: true,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_AGENT_SKILLS]: {
			type: 'boolean',
			title: nls.localize('chat.useAgentSkills.title', "Use Agent skills",),
			markdownDescription: nls.localize('chat.useAgentSkills.description', "Controls whether skills are provided as specialized capabilities to the chat requests. Skills are loaded from the folders configured in `#chat.agentSkillsLocations#`. The language model can load these skills on-demand if the `read` tool is available. Learn more about [Agent Skills](https://aka.ms/vscode-agent-skills).",),
			default: true,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_SKILL_ADHERENCE_PROMPT]: {
			type: 'boolean',
			title: nls.localize('chat.useSkillAdherencePrompt.title', "Use Skill Adherence Prompt",),
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
			title: nls.localize('chat.includeApplyingInstructions.title', "Include Applying Instructions",),
			markdownDescription: nls.localize('chat.includeApplyingInstructions.description', "Controls whether instructions with a matching 'applyTo' attribute are automatically included in chat requests.",),
			default: true,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS]: {
			type: 'boolean',
			title: nls.localize('chat.includeReferencedInstructions.title', "Include Referenced Instructions",),
			markdownDescription: nls.localize('chat.includeReferencedInstructions.description', "Controls whether referenced instructions are automatically included in chat requests.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: {
			type: 'boolean',
			title: nls.localize('chat.useCustomizationsInParentRepos.title', "Use Customizations in Parent Repositories",),
			markdownDescription: nls.localize('chat.useCustomizationsInParentRepos.description', "Controls whether to use chat customization files in parent repositories.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.SKILLS_LOCATION_KEY]: {
			type: 'object',
			title: nls.localize('chat.agentSkillsLocations.title', "Agent Skills Locations",),
			markdownDescription: nls.localize(
				'chat.agentSkillsLocations.description',
				"Specify location(s) of agent skills (`{0}`) that can be used in Chat Sessions. [Learn More]({1}).\n\nEach path should contain skill subfolders with SKILL.md files (e.g., add `my-skills` if you have `my-skills/skillA/SKILL.md`). Relative paths are resolved from the root folder(s) of your workspace.",
				SKILL_FILENAME,
				SKILL_DOCUMENTATION_URL,
			),
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
			title: nls.localize('chat.hookFilesLocations.title', "Hook File Locations",),
			markdownDescription: nls.localize(
				'chat.hookFilesLocations.description',
				"Specify paths to hook configuration files that define custom shell commands to execute at strategic points in an agent's workflow. [Learn More]({0}).\n\nRelative paths are resolved from the root folder(s) of your workspace. Supports Copilot hooks (`*.json`) and Claude Code hooks (`settings.json`, `settings.local.json`).",
				HOOK_DOCUMENTATION_URL,
			),
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
			title: nls.localize('chat.useHooks.title', "Use Chat Hooks",),
			markdownDescription: nls.localize('chat.useHooks.description', "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`.",),
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
						value: nls.localize('chat.useHooks.description', "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`.",)
					}
				},
			}
		},
		[PromptsConfig.USE_CLAUDE_HOOKS]: {
			type: 'boolean',
			title: nls.localize('chat.useClaudeHooks.title', "Use Claude Hooks",),
			markdownDescription: nls.localize('chat.useClaudeHooks.description', "Controls whether hooks from Claude configuration files can execute. When disabled, only Copilot-format hooks are used. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['preview', 'prompts', 'hooks', 'agent']
		},
		[PromptsConfig.PROMPT_FILES_SUGGEST_KEY]: {
			type: 'object',
			scope: ConfigurationScope.RESOURCE,
			title: nls.localize(
				'chat.promptFilesRecommendations.title',
				"Prompt File Recommendations",
			),
			markdownDescription: nls.localize(
				'chat.promptFilesRecommendations.description',
				"Configure which prompt files to recommend in the chat welcome view. Each key is a prompt file name, and the value can be `true` to always recommend, `false` to never recommend, or a [when clause](https://aka.ms/vscode-when-clause) expression like `resourceExtname == .js` or `resourceLangId == markdown`.",
			),
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
			scope: ConfigurationScope.WINDOW
		},
		'chat.allowAnonymousAccess': { // TODO@bpasero remove me eventually
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

		[ChatConfiguration.ChatCustomizationHarnessSelectorEnabled]: {
			type: 'boolean',
			tags: ['preview'],
			description: nls.localize('chat.customizations.harnessSelector.enabled', "Controls whether the harness selector is shown in the Chat Customizations editor sidebar. When disabled, the editor always shows all customizations without filtering."),
			default: true,
		},
	}
});
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		ChatEditorInput.EditorID,
		nls.localize('chat', "Chat")
	),
	[
		new SyncDescriptor(ChatEditorInput)
	]
);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatDebugEditor,
		ChatDebugEditorInput.ID,
		nls.localize('chatDebug', "Debug View")
	),
	[
		new SyncDescriptor(ChatDebugEditorInput)
	]
);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AgentPluginEditor,
		AgentPluginEditor.ID,
		nls.localize('agentPlugin', "Agent Plugin")
	),
	[
		new SyncDescriptor(AgentPluginEditorInput)
	]
);
Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([
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
		migrateFn: (value: unknown) => {
			if (typeof value === 'boolean') {
				return { value: Object.fromEntries(allDiscoverySources.map(k => [k, value])) };
			}

			return { value };
		}
	},
	{
		key: ChatConfiguration.NotifyWindowOnConfirmation,
		migrateFn: (value: unknown) => {
			if (value === true) {
				return { value: ChatNotificationMode.WindowNotFocused };
			} else if (value === false) {
				return { value: ChatNotificationMode.Off };
			}
			return [];
		}
	},
	{
		key: ChatConfiguration.NotifyWindowOnResponseReceived,
		migrateFn: (value: unknown) => {
			if (value === true) {
				return { value: ChatNotificationMode.WindowNotFocused };
			} else if (value === false) {
				return { value: ChatNotificationMode.Off };
			}
			return [];
		}
	},
	{
		key: 'chat.plugins.paths',
		migrateFn: (value: unknown, _accessor) => ([
			['chat.plugins.paths', { value: undefined }],
			[ChatConfiguration.PluginLocations, { value }]
		])
	},
	{
		key: AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains,
		migrateFn: (value, accessor) => {
			const pairs: ConfigurationKeyValuePairs = [];
			pairs.push([AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains, { value: undefined }]);
			if (value !== undefined && accessor(AgentNetworkDomainSettingId.AllowedNetworkDomains) === undefined) {
				pairs.push([AgentNetworkDomainSettingId.AllowedNetworkDomains, { value }]);
			}
			return pairs;
		}
	},
	{
		key: AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains,
		migrateFn: (value, accessor) => {
			const pairs: ConfigurationKeyValuePairs = [];
			pairs.push([AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains, { value: undefined }]);
			if (value !== undefined && accessor(AgentNetworkDomainSettingId.DeniedNetworkDomains) === undefined) {
				pairs.push([AgentNetworkDomainSettingId.DeniedNetworkDomains, { value }]);
			}
			return pairs;
		}
	},
	{
		key: AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains,
		migrateFn: (value, accessor) => {
			const pairs: ConfigurationKeyValuePairs = [];
			pairs.push([AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains, { value: undefined }]);
			if (value !== undefined && accessor(AgentNetworkDomainSettingId.AllowedNetworkDomains) === undefined) {
				pairs.push([AgentNetworkDomainSettingId.AllowedNetworkDomains, { value }]);
			}
			return pairs;
		}
	},
	{
		key: AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains,
		migrateFn: (value, accessor) => {
			const pairs: ConfigurationKeyValuePairs = [];
			pairs.push([AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains, { value: undefined }]);
			if (value !== undefined && accessor(AgentNetworkDomainSettingId.DeniedNetworkDomains) === undefined) {
				pairs.push([AgentNetworkDomainSettingId.DeniedNetworkDomains, { value }]);
			}
			return pairs;
		}
	},
]);

class ChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatResolver';

	private readonly _editorRegistrations = this._register(new DisposableMap<string>());

	constructor(
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

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

	private _registerEditor(scheme: string): void {
		this._editorRegistrations.set(scheme, this.editorResolverService.registerEditor(`${scheme}:**/**`,
			{
				id: ChatEditorInput.EditorID,
				label: nls.localize('chat', "Chat"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === scheme,
			},
			{
				createEditorInput: ({ resource, options }) => {
					return {
						editor: this.instantiationService.createInstance(ChatEditorInput, resource, options as IChatEditorOptions),
						options
					};
				}
			}
		));
	}
}

class CopilotTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotTelemetry';

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this.updateCopilotTrackingId();

		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
			this.updateCopilotTrackingId();
		}));
	}

	private updateCopilotTrackingId(): void {
		const copilotTrackingId = this.chatEntitlementService.copilotTrackingId;
		if (copilotTrackingId) {
			// __GDPR__COMMON__ "common.copilotTrackingId" : { "endPoint": "GoogleAnalyticsID", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "The anonymized Copilot analytics tracking ID from the entitlement API." }
			this.telemetryService.setCommonProperty('common.copilotTrackingId', copilotTrackingId);
		}
	}
}

class ChatDebugResolverContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatDebugResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
	) {
		editorResolverService.registerEditor(
			`${ChatDebugEditorInput.RESOURCE.scheme}:**/**`,
			{
				id: ChatDebugEditorInput.ID,
				label: nls.localize('chatDebug', "Debug View"),
				priority: RegisteredEditorPriority.exclusive
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === ChatDebugEditorInput.RESOURCE.scheme
			},
			{
				createEditorInput: () => {
					return {
						editor: ChatDebugEditorInput.instance,
						options: { pinned: true }
					};
				}
			}
		);
	}
}

class ChatAgentSettingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatAgentSetting';
	private readonly newChatButtonExperimentIcon;

	constructor(
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.newChatButtonExperimentIcon = ChatContextKeys.newChatButtonExperimentIcon.bindTo(this.contextKeyService);
		this.registerMaxRequestsSetting();
		this.registerNewChatButtonIcon();
		this.registerDefaultModeSetting();
	}


	private registerMaxRequestsSetting(): void {
		let lastNode: IConfigurationNode | undefined;
		const registerMaxRequestsSetting = () => {
			const treatmentId = this.entitlementService.entitlement === ChatEntitlement.Free ?
				'chatAgentMaxRequestsFree' :
				'chatAgentMaxRequestsPro';
			this.experimentService.getTreatment<number>(treatmentId).then((value) => {
				const node: IConfigurationNode = {
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

	private registerNewChatButtonIcon(): void {
		this.experimentService.getTreatment<string>('chatNewButtonIcon').then((value) => {
			const supportedValues = ['copilot', 'new-session', 'comment'];
			if (typeof value === 'string' && supportedValues.includes(value)) {
				this.newChatButtonExperimentIcon.set(value);
			} else {
				this.newChatButtonExperimentIcon.reset();
			}
		});
	}

	private registerDefaultModeSetting(): void {
		this.experimentService.getTreatment<string>('chatDefaultNewSessionMode').then(value => {
			const node: IConfigurationNode = {
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
}

class ChatForegroundSessionCountContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatForegroundSessionCount';

	private readonly foregroundSessionCountContextKey: IContextKey<number>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
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

	private updateForegroundSessionCount(): void {
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
}


/**
 * Given builtin and custom modes, returns only the custom mode IDs that should have actions registered.
 * Custom modes whose names conflict with builtin modes are excluded.
 * If there are name collisions among custom modes, the later mode in the list wins.
 */
function getCustomModesWithUniqueNames(builtinModes: readonly IChatMode[], customModes: readonly IChatMode[]): Set<string> {
	const customModeIds = new Set<string>();
	const builtinNames = new Set(builtinModes.map(mode => mode.name.get()));
	const customNameToId = new Map<string, string>();

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
class ChatAgentActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatAgentActions';

	private readonly _modeActionDisposables = new DisposableMap<string>();

	constructor(
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();
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

	private _registerModeAction(mode: IChatMode): void {
		const actionClass = class extends ModeOpenChatGlobalAction {
			constructor() {
				super(mode);
			}
		};
		this._modeActionDisposables.set(mode.id, registerAction2(actionClass));
	}
}

class HookSchemaAssociationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.hookSchemaAssociation';

	private readonly _registrations = this._register(new DisposableStore());

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IPathService private readonly _pathService: IPathService,
	) {
		super();
		this._updateAssociations();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PromptsConfig.HOOKS_LOCATION_KEY)) {
				this._updateAssociations();
			}
		}));
	}

	private async _updateAssociations(): Promise<void> {
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

			this._registrations.add(
				jsonContributionRegistry.registerSchemaAssociation(HOOK_SCHEMA_URI, glob)
			);
		}
	}
}

class ToolReferenceNamesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.toolReferenceNames';

	constructor(
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
	) {
		super();
		this._updateToolReferenceNames();
		this._register(this._languageModelToolsService.onDidChangeTools(() => this._updateToolReferenceNames()));
	}

	private _updateToolReferenceNames(): void {
		const tools =
			Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled())
				.filter((tool): tool is typeof tool & { toolReferenceName: string } => typeof tool.toolReferenceName === 'string')
				.sort((a, b) => a.toolReferenceName.localeCompare(b.toolReferenceName));
		toolReferenceNameEnumValues.length = 0;
		toolReferenceNameEnumDescriptions.length = 0;
		for (const tool of tools) {
			toolReferenceNameEnumValues.push(tool.toolReferenceName);
			toolReferenceNameEnumDescriptions.push(nls.localize(
				'chat.toolReferenceName.description',
				"{0} - {1}",
				tool.toolReferenceName,
				tool.userDescription || tool.displayName
			));
		}
		configurationRegistry.notifyConfigurationSchemaUpdated({
			id: 'chatSidebar',
			properties: {
				[ChatConfiguration.EligibleForAutoApproval]: {}
			}
		});
	}
}

AccessibleViewRegistry.register(new ChatTerminalOutputAccessibleView());
AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new PanelChatAccessibilityHelp());
AccessibleViewRegistry.register(new QuickChatAccessibilityHelp());
AccessibleViewRegistry.register(new EditsChatAccessibilityHelp());
AccessibleViewRegistry.register(new AgentChatAccessibilityHelp());

registerEditorFeature(ChatInputBoxContentProvider);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatDebugEditorInput.ID, ChatDebugEditorInputSerializer);

registerWorkbenchContribution2(CopilotTelemetryContribution.ID, CopilotTelemetryContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatDebugResolverContribution.ID, ChatDebugResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(PromptsDebugContribution.ID, PromptsDebugContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatLanguageModelsDataContribution.ID, ChatLanguageModelsDataContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSlashCommandsContribution.ID, ChatSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSessionOptionSlashCommandsContribution.ID, ChatSessionOptionSlashCommandsContribution, WorkbenchPhase.Eventually);

registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatPromptFilesExtensionPointHandler.ID, ChatPromptFilesExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(CodeBlockActionRendering.ID, CodeBlockActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCopyActionRendering.ID, ChatCopyActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatImplicitContextContribution.ID, ChatImplicitContextContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatViewsWelcomeHandler.ID, ChatViewsWelcomeHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatGettingStartedContribution.ID, ChatGettingStartedContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSetupContribution.ID, ChatSetupContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatTeardownContribution.ID, ChatTeardownContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatStatusBarEntry.ID, ChatStatusBarEntry, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(BuiltinToolsContribution.ID, BuiltinToolsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(UsagesToolContribution.ID, UsagesToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(RenameToolContribution.ID, RenameToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatAgentSettingContribution.ID, ChatAgentSettingContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatForegroundSessionCountContribution.ID, ChatForegroundSessionCountContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentActionsContribution.ID, ChatAgentActionsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(HookSchemaAssociationContribution.ID, HookSchemaAssociationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ToolReferenceNamesContribution.ID, ToolReferenceNamesContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentRecommendation.ID, ChatAgentRecommendation, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatEditingEditorAccessibility.ID, ChatEditingEditorAccessibility, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatQueuePickerRendering.ID, ChatQueuePickerRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingEditorOverlay.ID, ChatEditingEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorContextKeys.ID, ChatEditingEditorContextKeys, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatTransferContribution.ID, ChatTransferContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatContextContributions.ID, ChatContextContributions, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PromptUrlHandler.ID, PromptUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(PluginUrlHandler.ID, PluginUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatResponseResourceWorkbenchContribution.ID, ChatResponseResourceWorkbenchContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(UserToolSetsContributions.ID, UserToolSetsContributions, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(PromptLanguageFeaturesProvider.ID, PromptLanguageFeaturesProvider, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatWindowNotifier.ID, ChatWindowNotifier, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatRepoInfoContribution.ID, ChatRepoInfoContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AgentPluginRecommendations.ID, AgentPluginRecommendations, WorkbenchPhase.Eventually);

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
registerPlanReviewFeedbackEditorActions();
registerAction2(ConfigureToolSets);
registerEditorFeature(ChatPasteProvidersFeature);

agentPluginDiscoveryRegistry.register(new SyncDescriptor(ConfiguredAgentPluginDiscovery));
agentPluginDiscoveryRegistry.register(new SyncDescriptor(MarketplaceAgentPluginDiscovery));
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ExtensionAgentPluginDiscovery));

registerSingleton(IChatResponseResourceFileSystemProvider, ChatResponseResourceFileSystemProvider, InstantiationType.Delayed);
registerSingleton(IChatTransferService, ChatTransferService, InstantiationType.Delayed);
registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsConfigurationService, LanguageModelsConfigurationService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(IAgentPluginService, AgentPluginService, InstantiationType.Delayed);
registerSingleton(IPluginMarketplaceService, PluginMarketplaceService, InstantiationType.Delayed);
registerSingleton(IWorkspacePluginSettingsService, WorkspacePluginSettingsService, InstantiationType.Delayed);
registerSingleton(IAgentPluginRepositoryService, AgentPluginRepositoryService, InstantiationType.Delayed);
registerSingleton(IPluginGitService, BrowserPluginGitCommandService, InstantiationType.Delayed);
registerSingleton(IPluginInstallService, PluginInstallService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
registerSingleton(ICodeMapperService, CodeMapperService, InstantiationType.Delayed);
registerSingleton(IChatEditingService, ChatEditingService, InstantiationType.Delayed);
registerSingleton(IChatMarkdownAnchorService, ChatMarkdownAnchorService, InstantiationType.Delayed);
registerSingleton(IAgentNetworkFilterService, AgentNetworkFilterService, InstantiationType.Delayed);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, InstantiationType.Delayed);
registerSingleton(IPromptsService, PromptsService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, ChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatModeService, ChatModeService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentResolveService, ChatAttachmentResolveService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentWidgetRegistry, ChatAttachmentWidgetRegistry, InstantiationType.Delayed);
registerSingleton(IChatTodoListService, ChatTodoListService, InstantiationType.Delayed);
registerSingleton(IChatArtifactsService, ChatArtifactsService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, InstantiationType.Delayed);
registerSingleton(IChatLayoutService, ChatLayoutService, InstantiationType.Delayed);
registerSingleton(IPlanReviewFeedbackService, PlanReviewFeedbackService, InstantiationType.Delayed);
registerSingleton(IChatTipService, ChatTipService, InstantiationType.Delayed);
registerSingleton(IChatDebugService, ChatDebugServiceImpl, InstantiationType.Delayed);
registerSingleton(IChatImageCarouselService, ChatImageCarouselService, InstantiationType.Delayed);

ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);
