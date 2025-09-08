/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosAiViewPane } from './erdosAiView.js';
import { ERDOS_AI_VIEW_ID } from '../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewsRegistry, IViewContainersRegistry, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IErdosAiServiceCore } from '../../../services/erdosAi/common/erdosAiServiceCore.js';
import { ErdosAiServiceCore } from '../../../services/erdosAi/browser/erdosAiServiceCore.js';
import { IErdosAiAuthService } from '../../../services/erdosAi/common/erdosAiAuthService.js';
import { ErdosAiAuthService } from '../../../services/erdosAi/browser/erdosAiAuthService.js';
import { IErdosAiAutomationService } from '../../../services/erdosAi/common/erdosAiAutomationService.js';
import { ErdosAiAutomationService } from '../../../services/erdosAi/browser/erdosAiAutomationService.js';
import { IErdosAiRulesService } from '../../../services/erdosAi/common/erdosAiRulesService.js';
import { ErdosAiRulesService } from '../../../services/erdosAi/browser/erdosAiRulesService.js';
import { IErdosAiNameService } from '../../../services/erdosAi/common/erdosAiNameService.js';
import { ErdosAiNameService } from '../../../services/erdosAi/browser/erdosAiNameService.js';

// CSS imports
import './media/erdosAiView.css';
import './media/contextBar.css';
import './media/imageAttachment.css';
import './media/erdosAiWidgets.css';
import './media/settings.css';
import './media/errorMessage.css';
import './media/erdosAiDiffHighlighting.css';

// Backend Services
import { IBackendClient } from '../../../services/erdosAiBackend/common/backendClient.js';
import { BackendClient } from '../../../services/erdosAiBackend/browser/backendClient.js';

// Function Call Services
import { IFunctionCallService } from '../../../services/erdosAiFunctions/common/functionCallService.js';
import { FunctionCallHandler } from '../../../services/erdosAiFunctions/browser/functionCallService.js';

// Document Services
import { IDocumentManager } from '../../../services/erdosAiDocument/common/documentManager.js';
import { DocumentManager } from '../../../services/erdosAiDocument/browser/documentManager.js';

// Conversation Services
import { IConversationManager } from '../../../services/erdosAiConversation/common/conversationManager.js';
import { ConversationManager } from '../../../services/erdosAiConversation/browser/conversationManager.js';
import { IConversationSaveMutex } from '../../../services/erdosAiConversation/common/conversationSaveMutex.js';
import { ConversationSaveMutex } from '../../../services/erdosAiConversation/browser/conversationSaveMutex.js';
import { IConversationUtilities } from '../../../services/erdosAiConversation/common/conversationUtilities.js';
import { ConversationUtilities } from '../../../services/erdosAiConversation/browser/conversationUtilities.js';
import { IConversationVariableManager } from '../../../services/erdosAiConversation/common/conversationVariableManager.js';
import { ConversationVariableManager } from '../../../services/erdosAiConversation/browser/conversationVariableManager.js';

// Auth Services
import { IApiKeyManager } from '../../../services/erdosAiAuth/common/apiKeyManager.js';
import { ApiKeyManager } from '../../../services/erdosAiAuth/browser/apiKeyManager.js';

// Context Services
import { IContextService } from '../../../services/erdosAiContext/common/contextService.js';
import { ContextService } from '../../../services/erdosAiContext/browser/contextService.js';

// Advanced Services
import { IContentProcessor } from '../../../services/erdosAi/common/contentProcessor.js';
import { ContentProcessor } from '../../../services/erdosAi/browser/contentProcessor.js';
import { IAutoAcceptService } from '../../../services/erdosAiAutomation/common/autoAcceptService.js';
import { AutoAcceptService } from '../../../services/erdosAiAutomation/browser/autoAcceptService.js';
import { IFunctionMessageManager } from '../../../services/erdosAiFunctions/common/functionMessageManager.js';
import { FunctionMessageManager } from '../../../services/erdosAiFunctions/browser/functionMessageManager.js';
import { IErdosAiSettingsService } from '../../../services/erdosAiSettings/common/settingsService.js';
import { ErdosAiSettingsService } from '../../../services/erdosAiSettings/browser/settingsService.js';
import { IMessageReversion } from '../../../services/erdosAi/common/messageReversion.js';
import { MessageReversion } from '../../../services/erdosAi/browser/messageReversion.js';
import { IFileChangeTracker } from '../../../services/erdosAi/common/fileChangeTracker.js';
import { FileChangeTracker } from '../../../services/erdosAi/browser/fileChangeTracker.js';

// Session Management Service
import { ISessionManagement } from '../../../services/erdosAiUtils/common/sessionManagement.js';
import { SessionManagement } from '../../../services/erdosAiUtils/browser/sessionManagement.js';

// Command Services
import { IConsoleCommandHandler } from '../../../services/erdosAiCommands/common/consoleCommandHandler.js';
import { ConsoleCommandHandler } from '../../../services/erdosAiCommands/browser/consoleCommandHandler.js';
import { ITerminalCommandHandler } from '../../../services/erdosAiCommands/common/terminalCommandHandler.js';
import { TerminalCommandHandler } from '../../../services/erdosAiCommands/browser/terminalCommandHandler.js';
import { IFileCommandHandler } from '../../../services/erdosAiCommands/common/fileCommandHandler.js';
import { FileCommandHandler } from '../../../services/erdosAiCommands/browser/fileCommandHandler.js';
import { ISearchReplaceCommandHandler } from '../../../services/erdosAiCommands/common/searchReplaceCommandHandler.js';
import { SearchReplaceCommandHandler } from '../../../services/erdosAiCommands/browser/searchReplaceCommandHandler.js';
import { IDeleteFileCommandHandler } from '../../../services/erdosAiCommands/common/deleteFileCommandHandler.js';
import { DeleteFileCommandHandler } from '../../../services/erdosAiCommands/browser/deleteFileCommandHandler.js';

// Additional Advanced Services
import { ISearchAnalyzer } from '../../../services/erdosAiCommands/common/searchAnalyzer.js';
import { SearchAnalyzer } from '../../../services/erdosAiCommands/browser/searchAnalyzer.js';
import { IThinkingProcessor } from '../../../services/erdosAi/common/thinkingProcessor.js';
import { ThinkingProcessor } from '../../../services/erdosAi/browser/thinkingProcessor.js';

// Additional Backend Services
import { ISSEParser } from '../../../services/erdosAiBackend/common/streamingParser.js';
import { SSEParser } from '../../../services/erdosAiBackend/browser/streamingParser.js';

// Additional Conversation Services
import { IConversationSummarization } from '../../../services/erdosAiConversation/common/conversationSummarization.js';
import { ConversationSummarization } from '../../../services/erdosAiConversation/browser/conversationSummarization.js';
import { IMessageIdManager } from '../../../services/erdosAiConversation/common/messageIdManager.js';
import { MessageIdManager } from '../../../services/erdosAiConversation/browser/messageIdManager.js';
import { IMessageStore } from '../../../services/erdosAiConversation/common/messageStore.js';
import { MessageStore } from '../../../services/erdosAiConversation/browser/messageStore.js';

// Additional Document Services
import { IDocumentServiceIntegration } from '../../../services/erdosAiDocument/common/documentServiceIntegration.js';
import { DocumentServiceIntegration } from '../../../services/erdosAiDocument/browser/documentServiceIntegration.js';

// Additional Function Services
import { IInfrastructureRegistry } from '../../../services/erdosAiFunctions/common/infrastructureRegistry.js';
import { InfrastructureRegistry } from '../../../services/erdosAiFunctions/browser/infrastructureRegistry.js';

// Integration Services
import { IJupytextService as IJupytextServiceNew } from '../../../services/erdosAiIntegration/common/jupytextService.js';
import { JupytextService as JupytextServiceNew } from '../../../services/erdosAiIntegration/browser/jupytextService.js';
import { IOAuthCallbackService } from '../../../services/erdosAiIntegration/common/oauthCallbackService.js';
import { OAuthCallbackService } from '../../../services/erdosAiIntegration/browser/oauthCallbackService.js';

// Media Services
import { IImageAttachmentService } from '../../../services/erdosAiMedia/common/imageAttachmentService.js';
import { ImageAttachmentService } from '../../../services/erdosAiMedia/browser/imageAttachmentService.js';
import { IImageProcessingManager } from '../../../services/erdosAiMedia/common/imageProcessingManager.js';
import { ImageProcessingManager } from '../../../services/erdosAiMedia/browser/imageProcessingManager.js';

// Utility Services (that need DI)
import { ICommonUtils } from '../../../services/erdosAiUtils/common/commonUtils.js';
import { CommonUtils } from '../../../services/erdosAiUtils/browser/commonUtils.js';
import { IFileSystemUtils } from '../../../services/erdosAiUtils/common/fileSystemUtils.js';
import { FileSystemUtils } from '../../../services/erdosAiUtils/browser/fileSystemUtils.js';
import { ISettingsUtils } from '../../../services/erdosAiUtils/common/settingsUtils.js';
import { SettingsUtils } from '../../../services/erdosAiUtils/browser/settingsUtils.js';
import { IOutputLimiter } from '../../../services/erdosAiUtils/common/outputLimiter.js';
import { OutputLimiter } from '../../../services/erdosAiUtils/browser/outputLimiter.js';
import { IRMarkdownParser } from '../../../services/erdosAiUtils/common/rMarkdownParser.js';
import { RMarkdownParser } from '../../../services/erdosAiUtils/browser/rMarkdownParser.js';
import { IErdosAiMarkdownRenderer } from '../../../services/erdosAiUtils/common/erdosAiMarkdownRenderer.js';
import { ErdosAiMarkdownRendererService } from '../../../services/erdosAiUtils/browser/erdosAiMarkdownRenderer.js';
import { IFileResolverService } from '../../../services/erdosAiUtils/common/fileResolverService.js';
import { FileResolverService } from '../../../services/erdosAiUtils/browser/fileResolverService.js';
import { IFileContentService } from '../../../services/erdosAiUtils/common/fileContentService.js';
import { FileContentService } from '../../../services/erdosAiUtils/browser/fileContentService.js';
import { IHelpContentService } from '../../../services/erdosAiUtils/common/helpContentService.js';
import { HelpContentService } from '../../../services/erdosAiUtils/browser/helpContentService.js';
import { SecurityAnalyticsContribution } from './securityAnalytics.contribution.js';

// New Parallel Function System
import { IParallelFunctionBranchManager } from '../../../services/erdosAi/browser/parallelFunctionBranchManager.js';
import { ParallelFunctionBranchManager } from '../../../services/erdosAi/browser/parallelFunctionBranchManager.js';
import { IFunctionBranchExecutor } from '../../../services/erdosAiFunctions/common/functionBranchExecutor.js';
import { FunctionBranchExecutor } from '../../../services/erdosAiFunctions/browser/functionBranchExecutor.js';
import { IWidgetManager } from '../../../services/erdosAi/common/widgetManager.js';
import { WidgetManager } from '../../../services/erdosAi/browser/widgetManager.js';
import { ITextStreamHandler } from '../../../services/erdosAi/common/textStreamHandler.js';
import { TextStreamHandler } from '../../../services/erdosAi/browser/textStreamHandler.js';
import { INonInteractiveFunctionExecutor } from '../../../services/erdosAiFunctions/common/nonInteractiveFunctionExecutor.js';
import { NonInteractiveFunctionExecutor } from '../../../services/erdosAiFunctions/browser/nonInteractiveFunctionExecutor.js';
import { IInteractiveFunctionExecutor } from '../../../services/erdosAiFunctions/common/interactiveFunctionExecutor.js';
import { InteractiveFunctionExecutor } from '../../../services/erdosAiFunctions/browser/interactiveFunctionExecutor.js';
import { IWidgetCompletionHandler } from '../../../services/erdosAi/common/widgetCompletionHandler.js';
import { WidgetCompletionHandler } from '../../../services/erdosAi/browser/widgetCompletionHandler.js';
import { IStreamingOrchestrator } from '../../../services/erdosAi/common/streamingOrchestrator.js';
import { StreamingOrchestrator } from '../../../services/erdosAi/browser/streamingOrchestrator.js';

registerSingleton(IErdosAiAuthService, ErdosAiAuthService, InstantiationType.Delayed);
registerSingleton(IErdosAiAutomationService, ErdosAiAutomationService, InstantiationType.Delayed);
registerSingleton(IErdosAiRulesService, ErdosAiRulesService, InstantiationType.Delayed);
registerSingleton(IErdosAiNameService, ErdosAiNameService, InstantiationType.Delayed);
registerSingleton(IBackendClient, BackendClient, InstantiationType.Delayed);
registerSingleton(IFunctionCallService, FunctionCallHandler, InstantiationType.Delayed);
registerSingleton(IDocumentManager, DocumentManager, InstantiationType.Delayed);
registerSingleton(IConversationManager, ConversationManager, InstantiationType.Delayed);
registerSingleton(IConversationSaveMutex, ConversationSaveMutex, InstantiationType.Delayed);
registerSingleton(IApiKeyManager, ApiKeyManager, InstantiationType.Delayed);
registerSingleton(IConsoleCommandHandler, ConsoleCommandHandler, InstantiationType.Delayed);
registerSingleton(ITerminalCommandHandler, TerminalCommandHandler, InstantiationType.Delayed);
registerSingleton(IFileCommandHandler, FileCommandHandler, InstantiationType.Delayed);
registerSingleton(ISearchReplaceCommandHandler, SearchReplaceCommandHandler, InstantiationType.Delayed);
registerSingleton(IDeleteFileCommandHandler, DeleteFileCommandHandler, InstantiationType.Delayed);
registerSingleton(IContentProcessor, ContentProcessor, InstantiationType.Delayed);
registerSingleton(IAutoAcceptService, AutoAcceptService, InstantiationType.Delayed);
registerSingleton(ISessionManagement, SessionManagement, InstantiationType.Delayed);
registerSingleton(IFunctionMessageManager, FunctionMessageManager, InstantiationType.Delayed);
registerSingleton(IErdosAiSettingsService, ErdosAiSettingsService, InstantiationType.Delayed);
registerSingleton(IMessageReversion, MessageReversion, InstantiationType.Delayed);
registerSingleton(IFileChangeTracker, FileChangeTracker, InstantiationType.Delayed);
registerSingleton(IContextService, ContextService, InstantiationType.Delayed);
registerSingleton(IConversationUtilities, ConversationUtilities, InstantiationType.Delayed);
registerSingleton(IConversationVariableManager, ConversationVariableManager, InstantiationType.Delayed);

// Register Additional Services
registerSingleton(ISearchAnalyzer, SearchAnalyzer, InstantiationType.Delayed);
registerSingleton(IThinkingProcessor, ThinkingProcessor, InstantiationType.Delayed);
registerSingleton(ISSEParser, SSEParser, InstantiationType.Delayed);
registerSingleton(IConversationSummarization, ConversationSummarization, InstantiationType.Delayed);
registerSingleton(IMessageIdManager, MessageIdManager, InstantiationType.Delayed);
registerSingleton(IMessageStore, MessageStore, InstantiationType.Delayed);
registerSingleton(IDocumentServiceIntegration, DocumentServiceIntegration, InstantiationType.Delayed);
registerSingleton(IInfrastructureRegistry, InfrastructureRegistry, InstantiationType.Delayed);
registerSingleton(IJupytextServiceNew, JupytextServiceNew, InstantiationType.Delayed);
registerSingleton(IOAuthCallbackService, OAuthCallbackService, InstantiationType.Delayed);
registerSingleton(IImageAttachmentService, ImageAttachmentService, InstantiationType.Delayed);
registerSingleton(IImageProcessingManager, ImageProcessingManager, InstantiationType.Delayed);
registerSingleton(ICommonUtils, CommonUtils, InstantiationType.Delayed);
registerSingleton(IFileSystemUtils, FileSystemUtils, InstantiationType.Delayed);
registerSingleton(ISettingsUtils, SettingsUtils, InstantiationType.Delayed);
registerSingleton(IOutputLimiter, OutputLimiter, InstantiationType.Delayed);
registerSingleton(IRMarkdownParser, RMarkdownParser, InstantiationType.Delayed);
registerSingleton(IErdosAiMarkdownRenderer, ErdosAiMarkdownRendererService, InstantiationType.Delayed);
registerSingleton(IFileResolverService, FileResolverService, InstantiationType.Delayed);
registerSingleton(IFileContentService, FileContentService, InstantiationType.Delayed);
registerSingleton(IHelpContentService, HelpContentService, InstantiationType.Delayed);

// Register New Parallel Function System
registerSingleton(IParallelFunctionBranchManager, ParallelFunctionBranchManager, InstantiationType.Delayed);
registerSingleton(IFunctionBranchExecutor, FunctionBranchExecutor, InstantiationType.Delayed);
registerSingleton(IWidgetCompletionHandler, WidgetCompletionHandler, InstantiationType.Delayed);
registerSingleton(IWidgetManager, new SyncDescriptor(WidgetManager));
registerSingleton(ITextStreamHandler, TextStreamHandler, InstantiationType.Delayed);
registerSingleton(IStreamingOrchestrator, StreamingOrchestrator, InstantiationType.Delayed);
registerSingleton(INonInteractiveFunctionExecutor, NonInteractiveFunctionExecutor, InstantiationType.Delayed);
registerSingleton(IInteractiveFunctionExecutor, InteractiveFunctionExecutor, InstantiationType.Delayed);

// Register ErdosAiServiceCore LAST - it depends on almost everything above
registerSingleton(IErdosAiServiceCore, new SyncDescriptor(ErdosAiServiceCore));

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'erdosAi',
	title: nls.localize('erdosAiConfigurationTitle', "Erdos AI"),
	type: 'object',
	properties: {
		'erdosAi.temperature': {
			type: 'number',
			default: 0.5,
			minimum: 0.0,
			maximum: 1.0,
			description: nls.localize('erdosAi.temperature', "Controls the AI model temperature (creativity vs determinism). 0.0 = deterministic, 1.0 = highly creative."),
			order: 1
		},
		'erdosAi.securityMode': {
			type: 'string',
			default: 'improve',
			enum: ['secure', 'improve'],
			enumDescriptions: [
				nls.localize('erdosAi.securityMode.secure', "Secure mode (recommended) - prioritizes privacy and security"),
				nls.localize('erdosAi.securityMode.improve', "Improve service mode - allows data to be used for service improvement")
			],
			description: nls.localize('erdosAi.securityMode', "Controls the security and data usage mode for AI interactions."),
			order: 2
		},
		'erdosAi.webSearchEnabled': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.webSearchEnabled', "Enable web search capabilities for the AI assistant."),
			order: 3
		},
		'erdosAi.autoAcceptEdits': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoAcceptEdits', "Automatically accept AI-proposed file edits without manual confirmation."),
			order: 4
		},
		'erdosAi.autoAcceptConsole': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoAcceptConsole', "Automatically accept R console commands if all functions are in the allow list."),
			order: 5
		},
		'erdosAi.autoRunFiles': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoRunFiles', "Automatically run AI-proposed files on the allow list."),
			order: 7
		},
		'erdosAi.autoDeleteFiles': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoDeleteFiles', "Automatically delete AI-proposed files on the allow list."),
			order: 8
		},

		'erdosAi.autoRunFilesAllowAnything': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoRunFilesAllowAnything', "Allow automatic running of any file (unsafe)."),
			order: 11
		},
		'erdosAi.autoDeleteFilesAllowAnything': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoDeleteFilesAllowAnything', "Allow automatic deletion of any file (unsafe)."),
			order: 12
		},

		'erdosAi.runFilesAutomationList': {
			type: 'array',
			items: { type: 'string' },
			default: [],
			description: nls.localize('erdosAi.runFilesAutomationList', "List of file paths allowed for automation."),
			order: 15
		},
		'erdosAi.deleteFilesAutomationList': {
			type: 'array',
			items: { type: 'string' },
			default: [],
			description: nls.localize('erdosAi.deleteFilesAutomationList', "List of file paths allowed for deletion automation."),
			order: 16
		},
		'erdosAi.userRules': {
			type: 'array',
			items: {
				type: 'string'
			},
			default: [],
			description: nls.localize('erdosAi.userRules', "Custom rules and instructions for AI behavior."),
			order: 17
		},
		'erdosAi.selectedModel': {
			type: 'string',
			default: 'claude-sonnet-4-20250514',
			enum: [
				'claude-sonnet-4-20250514',
				'gpt-5-mini'
			],
			enumDescriptions: [
				nls.localize('erdosAi.selectedModel.claude', "claude-sonnet-4-20250514 (Superior coding and analysis - recommended)"),
				nls.localize('erdosAi.selectedModel.gpt5', "gpt-5-mini (Reasoning tier)")
			],
			description: nls.localize('erdosAi.selectedModel', "Select the AI model to use for interactions."),
			order: 18
		},
		'erdosAi.workingDirectory': {
			type: 'string',
			default: '',
			description: nls.localize('erdosAi.workingDirectory', "Default working directory for AI operations."),
			order: 19,
			scope: ConfigurationScope.WINDOW
		}
	}
});

const ERDOS_AI_CONTAINER_ID = 'workbench.view.erdos-ai';

const erdosAiViewIcon = registerIcon('erdos-ai-view-icon', Codicon.brain, nls.localize('erdosAiViewIcon', 'View icon of the Erdos AI view.'));

const erdosAiViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: ERDOS_AI_CONTAINER_ID,
	title: nls.localize2('erdos.ai.viewContainer.label', "Erdos AI"),
	icon: erdosAiViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_AI_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: ERDOS_AI_CONTAINER_ID,
	hideIfEmpty: false,
	order: 7,
	openCommandActionDescriptor: {
		id: 'workbench.action.toggleErdosAi',
		mnemonicTitle: nls.localize({ key: 'miToggleErdosAi', comment: ['&& denotes a mnemonic'] }, "&&Erdos AI"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP
		},
		order: 7,
	}
}, ViewContainerLocation.Sidebar, { isDefault: true, doNotRegisterOpenCommand: false });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews(
	[
		{
			id: ERDOS_AI_VIEW_ID,
			name: {
				value: nls.localize('erdos.ai.view.name', "Erdos AI"),
				original: 'Erdos AI'
			},
			ctorDescriptor: new SyncDescriptor(ErdosAiViewPane),
			canToggleVisibility: false,
			canMoveView: true,
			containerIcon: erdosAiViewIcon,
			containerTitle: erdosAiViewContainer.title.value,
		}
	],
	erdosAiViewContainer
);

/**
 * Erdos AI workbench contribution for registering actions and commands
 */
class ErdosAiContribution extends Disposable implements IWorkbenchContribution {
	constructor() {
		super();

		this.registerActions();
	}

	private registerActions(): void {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.newConversation',
					title: nls.localize2('erdos.ai.newConversation', 'New Conversation'),
					category: nls.localize2('erdos.ai.category', 'Erdos AI'),
					f1: true
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const erdosAiService = accessor.get(IErdosAiServiceCore);
				await erdosAiService.newConversation();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.openSettings',
					title: nls.localize2('erdos.ai.openSettings', 'Open Erdos AI Settings'),
					category: nls.localize2('erdos.ai.category', 'Erdos AI'),
					f1: true
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const preferencesService = accessor.get(IPreferencesService);
				await preferencesService.openSettings({ query: 'erdosAi' });
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.newConversation.viewTitle',
					title: nls.localize2('erdos.ai.newConversation.viewTitle', 'New Chat'),
					icon: Codicon.add,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ERDOS_AI_VIEW_ID),
						group: 'navigation',
						order: 1
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const erdosAiServiceCore = accessor.get(IErdosAiServiceCore);
				await erdosAiServiceCore.newConversation();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.showHistory.viewTitle',
					title: nls.localize2('erdos.ai.showHistory.viewTitle', 'Show Chats...'),
					icon: Codicon.history,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ERDOS_AI_VIEW_ID),
						group: 'navigation',
						order: 2
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const erdosAiServiceCore = accessor.get(IErdosAiServiceCore);
				await erdosAiServiceCore.showConversationHistory();
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.openSettings.viewTitle',
					title: nls.localize2('erdos.ai.openSettings.viewTitle', 'Configure Chat...'),
					icon: Codicon.settingsGear,
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ERDOS_AI_VIEW_ID),
						group: 'navigation',
						order: 3
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const erdosAiServiceCore = accessor.get(IErdosAiServiceCore);
				await erdosAiServiceCore.showSettings();
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ErdosAiContribution,
	LifecyclePhase.Restored
);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	SecurityAnalyticsContribution,
	LifecyclePhase.Restored
);