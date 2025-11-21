/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { registerEditorFeature } from '../../../../editor/common/editorFeatures.js';
import * as nls from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { McpAccessValue, McpAutoStartValue, mcpAccessConfig, mcpAutoStartConfig, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { AddConfigurationType, AssistedTypes } from '../../mcp/browser/mcpCommandsAddConfiguration.js';
import { allDiscoverySources, discoverySourceSettingsLabel, mcpDiscoverySection, mcpServerSamplingSection } from '../../mcp/common/mcpConfiguration.js';
import { ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from '../common/chatAgents.js';
import { CodeMapperService, ICodeMapperService } from '../common/chatCodeMapperService.js';
import '../common/chatColors.js';
import { IChatEditingService } from '../common/chatEditingService.js';
import { IChatLayoutService } from '../common/chatLayoutService.js';
import { ChatModeService, IChatModeService } from '../common/chatModes.js';
import { ChatResponseResourceFileSystemProvider } from '../common/chatResponseResourceFileSystemProvider.js';
import { IChatService } from '../common/chatService.js';
import { ChatService } from '../common/chatServiceImpl.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../common/chatSlashCommands.js';
import { ChatTodoListService, IChatTodoListService } from '../common/chatTodoListService.js';
import { ChatTransferService, IChatTransferService } from '../common/chatTransferService.js';
import { IChatVariablesService } from '../common/chatVariables.js';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from '../common/chatWidgetHistoryService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService } from '../common/ignoredFiles.js';
import { ILanguageModelsService, LanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelStatsService, LanguageModelStatsService } from '../common/languageModelStats.js';
import { ILanguageModelToolsConfirmationService } from '../common/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../common/languageModelToolsService.js';
import { ChatPromptFilesExtensionPointHandler } from '../common/promptSyntax/chatPromptFilesContribution.js';
import { PromptsConfig } from '../common/promptSyntax/config/config.js';
import { INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../common/promptSyntax/config/promptFileLocations.js';
import { PromptLanguageFeaturesProvider } from '../common/promptSyntax/promptFileContributions.js';
import { AGENT_DOCUMENTATION_URL, INSTRUCTIONS_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL } from '../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../common/promptSyntax/service/promptsServiceImpl.js';
import { LanguageModelToolsExtensionPointHandler } from '../common/tools/languageModelToolsContribution.js';
import { BuiltinToolsContribution } from '../common/tools/tools.js';
import { IVoiceChatService, VoiceChatService } from '../common/voiceChatService.js';
import { registerChatAccessibilityActions } from './actions/chatAccessibilityActions.js';
import { AgentChatAccessibilityHelp, EditsChatAccessibilityHelp, PanelChatAccessibilityHelp, QuickChatAccessibilityHelp } from './actions/chatAccessibilityHelp.js';
import { ACTION_ID_NEW_CHAT, CopilotTitleBarMenuRendering, registerChatActions } from './actions/chatActions.js';
import { CodeBlockActionRendering, registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from './actions/chatCodeblockActions.js';
import { ChatContextContributions } from './actions/chatContext.js';
import { registerChatContextActions } from './actions/chatContextActions.js';
import { registerChatCopyActions } from './actions/chatCopyActions.js';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions.js';
import { ChatSubmitAction, registerChatExecuteActions } from './actions/chatExecuteActions.js';
import { registerChatFileTreeActions } from './actions/chatFileTreeActions.js';
import { ChatGettingStartedContribution } from './actions/chatGettingStarted.js';
import { registerChatExportActions } from './actions/chatImportExport.js';
import { registerLanguageModelActions } from './actions/chatLanguageModelActions.js';
import { registerMoveActions } from './actions/chatMoveActions.js';
import { registerNewChatActions } from './actions/chatNewActions.js';
import { registerChatPromptNavigationActions } from './actions/chatPromptNavigationActions.js';
import { registerQuickChatActions } from './actions/chatQuickInputActions.js';
import { ChatSessionsGettingStartedAction, DeleteChatSessionAction, OpenChatSessionInNewEditorGroupAction, OpenChatSessionInNewWindowAction, OpenChatSessionInSidebarAction, RenameChatSessionAction, ToggleAgentSessionsViewLocationAction, ToggleChatSessionsDescriptionDisplayAction } from './actions/chatSessionActions.js';
import { registerChatTitleActions } from './actions/chatTitleActions.js';
import { registerChatElicitationActions } from './actions/chatElicitationActions.js';
import { registerChatToolActions } from './actions/chatToolActions.js';
import { ChatTransferContribution } from './actions/chatTransfer.js';
import './agentSessions/agentSessionsView.js';
import { IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatWidgetService, IQuickChatService } from './chat.js';
import { ChatAccessibilityService } from './chatAccessibilityService.js';
import './chatAttachmentModel.js';
import { ChatAttachmentResolveService, IChatAttachmentResolveService } from './chatAttachmentResolveService.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from './chatContentParts/chatMarkdownAnchorService.js';
import { ChatContextPickService, IChatContextPickService } from './chatContextPickService.js';
import { ChatInputBoxContentProvider } from './chatEdinputInputContentProvider.js';
import { ChatEditingEditorAccessibility } from './chatEditing/chatEditingEditorAccessibility.js';
import { registerChatEditorActions } from './chatEditing/chatEditingEditorActions.js';
import { ChatEditingEditorContextKeys } from './chatEditing/chatEditingEditorContextKeys.js';
import { ChatEditingEditorOverlay } from './chatEditing/chatEditingEditorOverlay.js';
import { ChatEditingService } from './chatEditing/chatEditingServiceImpl.js';
import { ChatEditingNotebookFileSystemProviderContrib } from './chatEditing/notebook/chatEditingNotebookFileSystemProvider.js';
import { SimpleBrowserOverlay } from './chatEditing/simpleBrowserEditorOverlay.js';
import { ChatEditor, IChatEditorOptions } from './chatEditor.js';
import { ChatEditorInput, ChatEditorInputSerializer } from './chatEditorInput.js';
import { ChatLayoutService } from './chatLayoutService.js';
import './chatManagement/chatManagement.contribution.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './chatMarkdownDecorationsRenderer.js';
import { ChatOutputRendererService, IChatOutputRendererService } from './chatOutputItemRenderer.js';
import { ChatCompatibilityNotifier, ChatExtensionPointHandler } from './chatParticipant.contribution.js';
import { ChatPasteProvidersFeature } from './chatPasteProviders.js';
import { QuickChatService } from './chatQuick.js';
import { ChatResponseAccessibleView } from './chatResponseAccessibleView.js';
import { ChatTerminalOutputAccessibleView } from './chatTerminalOutputAccessibleView.js';
import { LocalChatSessionsProvider } from './chatSessions/localChatSessionsProvider.js';
import { ChatSessionsView, ChatSessionsViewContrib } from './chatSessions/view/chatSessionsView.js';
import { ChatSetupContribution, ChatTeardownContribution } from './chatSetup.js';
import { ChatStatusBarEntry } from './chatStatus.js';
import { ChatVariablesService } from './chatVariables.js';
import { ChatWidget } from './chatWidget.js';
import { ChatCodeBlockContextProviderService } from './codeBlockContextProviderService.js';
import { ChatDynamicVariableModel } from './contrib/chatDynamicVariables.js';
import { ChatImplicitContextContribution } from './contrib/chatImplicitContext.js';
import './contrib/chatInputCompletions.js';
import './contrib/chatInputEditorContrib.js';
import './contrib/chatInputEditorHover.js';
import { ChatRelatedFilesContribution } from './contrib/chatInputRelatedFilesContrib.js';
import { LanguageModelToolsConfirmationService } from './languageModelToolsConfirmationService.js';
import { LanguageModelToolsService, globalAutoApproveDescription } from './languageModelToolsService.js';
import './promptSyntax/promptCodingAgentActionContribution.js';
import './promptSyntax/promptToolsCodeLensProvider.js';
import { PromptUrlHandler } from './promptSyntax/promptUrlHandler.js';
import { ConfigureToolSets, UserToolSetsContributions } from './tools/toolSetsContribution.js';
import { ChatViewsWelcomeHandler } from './viewsWelcome/chatViewsWelcomeHandler.js';
import { ChatWidgetService } from './chatWidgetService.js';

const toolReferenceNameEnumValues: string[] = [];
const toolReferenceNameEnumDescriptions: string[] = [];

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
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
		'chat.commandCenter.enabled': {
			type: 'boolean',
			markdownDescription: nls.localize('chat.commandCenter.enabled', "Controls whether the command center shows a menu for actions to control chat (requires {0}).", '`#window.commandCenter#`'),
			default: true
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
		'chat.renderRelatedFiles': {
			type: 'boolean',
			description: nls.localize('chat.renderRelatedFiles', "Controls whether related files should be rendered in the chat input."),
			default: false
		},
		'chat.notifyWindowOnConfirmation': {
			type: 'boolean',
			description: nls.localize('chat.notifyWindowOnConfirmation', "Controls whether a chat session should present the user with an OS notification when a confirmation is needed while the window is not in focus. This includes a window badge as well as notification toast."),
			default: true,
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
				value: (account) => account.chat_preview_features_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'autoApprove2.description',
						value: nls.localize('autoApprove2.description', 'Global auto approve also known as "YOLO mode" disables manual approval completely for all tools in all workspaces, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like Codespaces and Dev Containers have user keys forwarded into the container that could be compromised.\n\nThis feature disables critical security protections and makes it much easier for an attacker to compromise the machine.')
					}
				},
			}
		},
		[ChatConfiguration.AutoApproveEdits]: {
			default: {
				'**/*': true,
				'**/.vscode/*.json': false,
				'**/.git/**': false,
				'**/{package.json,package-lock.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
				'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
			},
			markdownDescription: nls.localize('chat.tools.autoApprove.edits', "Controls whether edits made by chat are automatically approved. The default is to approve all edits except those made to certain files which have the potential to cause immediate unintended side-effects, such as `**/.vscode/*.json`.\n\nSet to `true` to automatically approve edits to matching files, `false` to always require explicit approval. The last pattern matching a given file will determine whether the edit is automatically approved."),
			type: 'object',
			additionalProperties: {
				type: 'boolean',
			}
		},
		[ChatConfiguration.AutoApprovedUrls]: {
			default: {},
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
			tags: ['experimental'],
			examples: [
				{
					'fetch': false,
					'runTests': false
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
		[ChatConfiguration.EmptyStateHistoryEnabled]: {
			type: 'boolean',
			default: product.quality === 'insiders',
			description: nls.localize('chat.emptyState.history.enabled', "Show recent chat history on the empty chat state."),
			tags: ['preview']
		},
		[ChatConfiguration.NotifyWindowOnResponseReceived]: {
			type: 'boolean',
			default: true,
			description: nls.localize('chat.notifyWindowOnResponseReceived', "Controls whether a chat session should present the user with an OS notification when a response is received while the window is not in focus. This includes a window badge as well as notification toast."),
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
				value: (account) => {
					if (account.mcp === false) {
						return McpAccessValue.None;
					}
					if (account.mcpAccess === 'registry_only') {
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
		[ChatConfiguration.Edits2Enabled]: {
			type: 'boolean',
			description: nls.localize('chat.edits2Enabled', "Enable the new Edits mode that is based on tool-calling. When this is enabled, models that don't support tool-calling are unavailable for Edits mode."),
			default: false,
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
		[ChatConfiguration.AgentEnabled]: {
			type: 'boolean',
			description: nls.localize('chat.agent.enabled.description', "Enable agent mode for chat. When this is enabled, agent mode can be activated via the dropdown in the view."),
			default: true,
			policy: {
				name: 'ChatAgentMode',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.99',
				value: (account) => account.chat_agent_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'chat.agent.enabled.description',
						value: nls.localize('chat.agent.enabled.description', "Enable agent mode for chat. When this is enabled, agent mode can be activated via the dropdown in the view."),
					}
				}
			}
		},
		[ChatConfiguration.EnableMath]: {
			type: 'boolean',
			description: nls.localize('chat.mathEnabled.description', "Enable math rendering in chat responses using KaTeX."),
			default: true,
			tags: ['preview'],
		},
		[ChatConfiguration.ShowCodeBlockProgressAnimation]: {
			type: 'boolean',
			description: nls.localize('chat.codeBlock.showProgressAnimation.description', "When applying edits, show a progress animation in the code block pill. If disabled, shows the progress percentage instead."),
			default: true,
			tags: ['experimental'],
		},
		[ChatConfiguration.AgentSessionsViewLocation]: {
			type: 'string',
			enum: ['disabled', 'view', 'single-view'],
			description: nls.localize('chat.sessionsViewLocation.description', "Controls where to show the agent sessions menu."),
			default: product.quality === 'stable' ? 'view' : 'single-view',
			tags: ['experimental'],
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
			scope: ConfigurationScope.APPLICATION,
			tags: ['usesOnlineServices', 'advanced'],
			included: false,
			policy: {
				name: 'McpGalleryServiceUrl',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.101',
				value: (account) => account.mcpRegistryUrl,
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
				[INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
			},
			additionalProperties: { type: 'boolean' },
			restricted: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions'],
			examples: [
				{
					[INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
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
		[PromptsConfig.USE_AGENT_MD]: {
			type: 'boolean',
			title: nls.localize('chat.useAgentMd.title', "Use AGENTS.MD file",),
			markdownDescription: nls.localize('chat.useAgentMd.description', "Controls whether instructions from `AGENTS.MD` file found in a workspace roots are attached to all chat requests.",),
			default: true,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_NESTED_AGENT_MD]: {
			type: 'boolean',
			title: nls.localize('chat.useNestedAgentMd.title', "Use nested AGENTS.MD files",),
			markdownDescription: nls.localize('chat.useNestedAgentMd.description', "Controls whether instructions from nested `AGENTS.MD` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions']
		},
		[PromptsConfig.USE_CLAUDE_SKILLS]: {
			type: 'boolean',
			title: nls.localize('chat.useClaudeSkills.title', "Use Claude skills",),
			markdownDescription: nls.localize('chat.useClaudeSkills.description', "Controls whether Claude skills found in the workspace and user home directories under `.claude/skills` are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available.",),
			default: false,
			restricted: true,
			disallowConfigurationDefault: true,
			tags: ['experimental', 'prompts', 'reusable prompts', 'prompt snippets', 'instructions']
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
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'chat.todoListTool.writeOnly': {
			type: 'boolean',
			default: false,
			description: nls.localize('chat.todoListTool.writeOnly', "When enabled, the todo tool operates in write-only mode, requiring the agent to remember todos in context."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'chat.todoListTool.descriptionField': {
			type: 'boolean',
			default: true,
			description: nls.localize('chat.todoListTool.descriptionField', "When enabled, todo items include detailed descriptions for implementation context. This provides more information but uses additional tokens and may slow down responses."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
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
		'chat.agent.thinking.collapsedTools': {
			type: 'string',
			default: 'readOnly',
			enum: ['none', 'all', 'readOnly'],
			enumDescriptions: [
				nls.localize('chat.agent.thinking.collapsedTools.none', "No tool calls are added into the collapsible thinking section."),
				nls.localize('chat.agent.thinking.collapsedTools.all', "All tool calls are added into the collapsible thinking section."),
				nls.localize('chat.agent.thinking.collapsedTools.readOnly', "Only read-only tool calls are added into the collapsible thinking section."),
			],
			markdownDescription: nls.localize('chat.agent.thinking.collapsedTools', "When enabled, tool calls are added into the collapsible thinking section according to the selected mode."),
			tags: ['experimental'],
		},
		'chat.disableAIFeatures': {
			type: 'boolean',
			description: nls.localize('chat.disableAIFeatures', "Disable and hide built-in AI features provided by GitHub Copilot, including chat and inline suggestions."),
			default: false,
			scope: ConfigurationScope.WINDOW
		},
		[ChatConfiguration.ShowAgentSessionsViewDescription]: {
			type: 'boolean',
			description: nls.localize('chat.showAgentSessionsViewDescription', "Controls whether session descriptions are displayed on a second row in the Chat Sessions view."),
			default: true,
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
		'chat.hideNewButtonInAgentSessionsView': { // TODO@bpasero remove me eventually
			type: 'boolean',
			description: nls.localize('chat.hideNewButtonInAgentSessionsView', "Controls whether the new session button is hidden in the Agent Sessions view."),
			default: false,
			tags: ['preview']
		},
		'chat.signInWithAlternateScopes': { // TODO@bpasero remove me eventually
			type: 'boolean',
			description: nls.localize('chat.signInWithAlternateScopes', "Controls whether sign-in with alternate scopes is used."),
			default: false,
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
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
			default: false,
			tags: ['experimental'],
		}
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
Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([
	{
		key: 'chat.experimental.detectParticipant.enabled',
		migrateFn: (value, _accessor) => ([
			['chat.experimental.detectParticipant.enabled', { value: undefined }],
			['chat.detectParticipant.enabled', { value: value !== false }]
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

class ChatAgentSettingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatAgentSetting';

	constructor(
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
	) {
		super();
		this.registerMaxRequestsSetting();
	}


	private registerMaxRequestsSetting(): void {
		let lastNode: IConfigurationNode | undefined;
		const registerMaxRequestsSetting = () => {
			const treatmentId = this.entitlementService.entitlement === ChatEntitlement.Free ?
				'chatAgentMaxRequestsFree' :
				'chatAgentMaxRequestsPro';
			this.experimentService.getTreatment<number>(treatmentId).then(value => {
				const defaultValue = value ?? (this.entitlementService.entitlement === ChatEntitlement.Free ? 25 : 25);
				const node: IConfigurationNode = {
					id: 'chatSidebar',
					title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
					type: 'object',
					properties: {
						'chat.agent.maxRequests': {
							type: 'number',
							markdownDescription: nls.localize('chat.agent.maxRequests', "The maximum number of requests to allow per-turn when using an agent. When the limit is reached, will ask to confirm to continue."),
							default: defaultValue,
						},
					}
				};
				configurationRegistry.updateConfigurations({ remove: lastNode ? [lastNode] : [], add: [node] });
				lastNode = node;
			});
		};
		this._register(Event.runAndSubscribe(Event.debounce(this.entitlementService.onDidChangeEntitlement, () => { }, 1000), () => registerMaxRequestsSetting()));
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
			Array.from(this._languageModelToolsService.getTools())
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

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatSlashStaticSlashCommands';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Start a new chat"),
			sortText: 'z2_clear',
			executeImmediately: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true,
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Ask]
		}, async (prompt, progress) => {
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const agents = chatAgentService.getAgents();

			// Report prefix
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: 'markdownContent' });
				}
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
			}

			// Report agent list
			const agentText = (await Promise.all(agents
				.filter(a => !a.isDefault && !a.isCore)
				.filter(a => a.locations.includes(ChatAgentLocation.Chat))
				.map(async a => {
					const description = a.description ? `- ${a.description}` : '';
					const agentMarkdown = instantiationService.invokeFunction(accessor => agentToMarkdown(a, true, accessor));
					const agentLine = `- ${agentMarkdown} ${description}`;
					const commandText = a.slashCommands.map(c => {
						const description = c.description ? `- ${c.description}` : '';
						return `\t* ${agentSlashCommandToMarkdown(a, c)} ${description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [ChatSubmitAction.ID] } }), kind: 'markdownContent' });

			// Report help text ending
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: 'markdownContent' });
				}
			}

			// Without this, the response will be done before it renders and so it will not stream. This ensures that if the response starts
			// rendering during the next 200ms, then it will be streamed. Once it starts streaming, the whole response streams even after
			// it has received all response data has been received.
			await timeout(200);
		}));
	}
}
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);

registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatSlashStaticSlashCommandsContribution.ID, ChatSlashStaticSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatPromptFilesExtensionPointHandler.ID, ChatPromptFilesExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(CopilotTitleBarMenuRendering.ID, CopilotTitleBarMenuRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(CodeBlockActionRendering.ID, CodeBlockActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatImplicitContextContribution.ID, ChatImplicitContextContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatRelatedFilesContribution.ID, ChatRelatedFilesContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatViewsWelcomeHandler.ID, ChatViewsWelcomeHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatGettingStartedContribution.ID, ChatGettingStartedContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSetupContribution.ID, ChatSetupContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatTeardownContribution.ID, ChatTeardownContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatStatusBarEntry.ID, ChatStatusBarEntry, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(BuiltinToolsContribution.ID, BuiltinToolsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatAgentSettingContribution.ID, ChatAgentSettingContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ToolReferenceNamesContribution.ID, ToolReferenceNamesContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorAccessibility.ID, ChatEditingEditorAccessibility, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorOverlay.ID, ChatEditingEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SimpleBrowserOverlay.ID, SimpleBrowserOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorContextKeys.ID, ChatEditingEditorContextKeys, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatTransferContribution.ID, ChatTransferContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatContextContributions.ID, ChatContextContributions, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatResponseResourceFileSystemProvider.ID, ChatResponseResourceFileSystemProvider, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PromptUrlHandler.ID, PromptUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(LocalChatSessionsProvider.ID, LocalChatSessionsProvider, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatSessionsViewContrib.ID, ChatSessionsViewContrib, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatSessionsView.ID, ChatSessionsView, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(UserToolSetsContributions.ID, UserToolSetsContributions, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(PromptLanguageFeaturesProvider.ID, PromptLanguageFeaturesProvider, WorkbenchPhase.Eventually);

registerChatActions();
registerChatAccessibilityActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatPromptNavigationActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();
registerChatContextActions();
registerChatDeveloperActions();
registerChatEditorActions();
registerChatElicitationActions();
registerChatToolActions();
registerLanguageModelActions();

registerEditorFeature(ChatPasteProvidersFeature);


registerSingleton(IChatTransferService, ChatTransferService, InstantiationType.Delayed);
registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
registerSingleton(ICodeMapperService, CodeMapperService, InstantiationType.Delayed);
registerSingleton(IChatEditingService, ChatEditingService, InstantiationType.Delayed);
registerSingleton(IChatMarkdownAnchorService, ChatMarkdownAnchorService, InstantiationType.Delayed);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, InstantiationType.Delayed);
registerSingleton(IPromptsService, PromptsService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, ChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatModeService, ChatModeService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentResolveService, ChatAttachmentResolveService, InstantiationType.Delayed);
registerSingleton(IChatTodoListService, ChatTodoListService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, InstantiationType.Delayed);
registerSingleton(IChatLayoutService, ChatLayoutService, InstantiationType.Delayed);

registerAction2(ConfigureToolSets);
registerAction2(RenameChatSessionAction);
registerAction2(DeleteChatSessionAction);
registerAction2(OpenChatSessionInNewWindowAction);
registerAction2(OpenChatSessionInNewEditorGroupAction);
registerAction2(OpenChatSessionInSidebarAction);
registerAction2(ToggleChatSessionsDescriptionDisplayAction);
registerAction2(ChatSessionsGettingStartedAction);
registerAction2(ToggleAgentSessionsViewLocationAction);

ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);
