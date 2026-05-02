/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { ExtensionContext, ExtensionMode, env, workspace } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { StaticGitHubAuthenticationService } from '../../../platform/authentication/common/staticGitHubAuthenticationService';
import { createStaticGitHubTokenProvider, getOrCreateTestingCopilotTokenManager } from '../../../platform/authentication/node/copilotTokenManager';
import { AuthenticationService } from '../../../platform/authentication/vscode-node/authenticationService';
import { VSCodeCopilotTokenManager } from '../../../platform/authentication/vscode-node/copilotTokenManager';
import { IChatAgentService } from '../../../platform/chat/common/chatAgents';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { IChatHookService } from '../../../platform/chat/common/chatHookService';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { IHookExecutor } from '../../../platform/chat/common/hookExecutor';
import { IHooksOutputChannel } from '../../../platform/chat/common/hooksOutputChannel';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { NodeHookExecutor } from '../../../platform/chat/node/hookExecutor';
import { ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { SessionStore } from '../../../platform/chronicle/node/sessionStore';
import { IChunkingEndpointClient } from '../../../platform/chunking/common/chunkingEndpointClient';
import { ChunkingEndpointClientImpl } from '../../../platform/chunking/common/chunkingEndpointClientImpl';
import { INaiveChunkingService, NaiveChunkingService } from '../../../platform/chunking/node/naiveChunkerService';
import { IDevContainerConfigurationService } from '../../../platform/devcontainer/common/devContainerConfigurationService';
import { IDiffService } from '../../../platform/diff/common/diffService';
import { DiffServiceImpl } from '../../../platform/diff/node/diffServiceImpl';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { AutomodeService, IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { CAPIClientImpl } from '../../../platform/endpoint/node/capiClientImpl';
import { DomainService } from '../../../platform/endpoint/node/domainServiceImpl';
import { INativeEnvService, isScenarioAutomation } from '../../../platform/env/common/envService';
import { NativeEnvServiceImpl } from '../../../platform/env/vscode-node/nativeEnvServiceImpl';
import { IGitCommitMessageService } from '../../../platform/git/common/gitCommitMessageService';
import { IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitService } from '../../../platform/git/common/gitService';
import { GitServiceImpl } from '../../../platform/git/vscode-node/gitServiceImpl';
import { GithubApiFetcherService, IGithubApiFetcherService } from '../../../platform/github/common/githubApiFetcherService';
import { IGithubRepositoryService } from '../../../platform/github/common/githubService';
import { GithubRepositoryService } from '../../../platform/github/node/githubRepositoryService';
import { IIgnoreService, NullIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { VsCodeIgnoreService } from '../../../platform/ignore/vscode-node/ignoreService';
import { IImageService } from '../../../platform/image/common/imageService';
import { VSCodeImageServiceImpl } from '../../../platform/image/vscode-node/imageServiceImpl';
import { IInlineEditsModelService, IUndesiredModelsManager } from '../../../platform/inlineEdits/common/inlineEditsModelService';
import { InlineEditsModelService, UndesiredModels } from '../../../platform/inlineEdits/node/inlineEditsModelService';
import { ILanguageContextProviderService } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILanguageContextService } from '../../../platform/languageServer/common/languageContextService';
import { ICompletionsFetchService } from '../../../platform/nesFetch/common/completionsFetchService';
import { CompletionsFetchService } from '../../../platform/nesFetch/node/completionsFetchServiceImpl';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { ChatWebSocketManager, IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { FetcherService } from '../../../platform/networking/vscode-node/fetcherServiceImpl';
import { resolveOTelConfig } from '../../../platform/otel/common/otelConfig';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { InMemoryOTelService } from '../../../platform/otel/node/inMemoryOTelService';
import { IOTelSqliteStore, OTelSqliteStore } from '../../../platform/otel/node/sqlite/otelSqliteStore';
import { IParserService } from '../../../platform/parser/node/parserService';
import { ParserServiceImpl } from '../../../platform/parser/node/parserServiceImpl';
import { IProxyModelsService } from '../../../platform/proxyModels/common/proxyModelsService';
import { ProxyModelsService } from '../../../platform/proxyModels/node/proxyModelsService';
import { AdoCodeSearchService, IAdoCodeSearchService } from '../../../platform/remoteCodeSearch/common/adoCodeSearchService';
import { GithubCodeSearchService, IGithubCodeSearchService } from '../../../platform/remoteCodeSearch/common/githubCodeSearchService';
import { ICodeSearchAuthenticationService } from '../../../platform/remoteCodeSearch/node/codeSearchRepoAuth';
import { VsCodeCodeSearchAuthenticationService } from '../../../platform/remoteCodeSearch/vscode-node/codeSearchRepoAuth';
import { IDocsSearchClient } from '../../../platform/remoteSearch/common/codeOrDocsSearchClient';
import { DocsSearchClient } from '../../../platform/remoteSearch/node/codeOrDocsSearchClientImpl';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { ScopeSelectorImpl } from '../../../platform/scopeSelection/vscode-node/scopeSelectionImpl';
import { ISearchService } from '../../../platform/search/common/searchService';
import { SearchServiceImpl } from '../../../platform/search/vscode-node/searchServiceImpl';
import { ISettingsEditorSearchService } from '../../../platform/settingsEditor/common/settingsEditorSearchService';
import { IExperimentationService, NullExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, ITelemetryUserConfig, TelemetryUserConfigImpl } from '../../../platform/telemetry/common/telemetry';
import { APP_INSIGHTS_KEY_ENHANCED, APP_INSIGHTS_KEY_STANDARD } from '../../../platform/telemetry/node/azureInsights';
import { MicrosoftExperimentationService } from '../../../platform/telemetry/vscode-node/microsoftExperimentationService';
import { TelemetryService } from '../../../platform/telemetry/vscode-node/telemetryServiceImpl';
import { IWorkspaceMutationManager } from '../../../platform/testing/common/workspaceMutationManager';
import { ISetupTestsDetector, SetupTestsDetector } from '../../../platform/testing/node/setupTestDetector';
import { ITestDepsResolver, TestDepsResolver } from '../../../platform/testing/node/testDepsResolver';
import { ITokenizerProvider, TokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { GithubAvailableEmbeddingTypesService, IGithubAvailableEmbeddingTypesService } from '../../../platform/workspaceChunkSearch/common/githubAvailableEmbeddingTypes';
import { IRerankerService, RerankerService } from '../../../platform/workspaceChunkSearch/common/rerankerService';
import { ScenarioAutomationWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/scenarioAutomationWorkspaceChunkSearchService';
import { IWorkspaceChunkSearchService, WorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { IWorkspaceFileIndex, WorkspaceFileIndex } from '../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { IInstantiationServiceBuilder } from '../../../util/common/services';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IToolResultContentRenderer } from '../../agentDebug/common/toolResultRenderer';
import { ToolResultContentRenderer } from '../../agentDebug/vscode-node/toolResultContentRenderer';
import { GitHubOrgChatResourcesService, IGitHubOrgChatResourcesService } from '../../agents/vscode-node/githubOrgChatResourcesService';
import { ChatDebugFileLoggerService } from '../../chat/vscode-node/chatDebugFileLoggerService';
import { ChatHookService } from '../../chat/vscode-node/chatHookService';
import { HooksOutputChannel } from '../../chat/vscode-node/hooksOutputChannel';
import { SessionTranscriptService } from '../../chat/vscode-node/sessionTranscriptService';
import { CommandServiceImpl, ICommandService } from '../../commands/node/commandService';
import { ICopilotInlineCompletionItemProviderService } from '../../completions/common/copilotInlineCompletionItemProviderService';
import { CopilotInlineCompletionItemProviderService } from '../../completions/vscode-node/copilotInlineCompletionItemProviderService';
import { ApiEmbeddingsIndex, IApiEmbeddingsIndex } from '../../context/node/resolvers/extensionApi';
import { IPromptWorkspaceLabels, PromptWorkspaceLabels } from '../../context/node/resolvers/promptWorkspaceLabels';
import { ChatAgentService } from '../../conversation/vscode-node/chatParticipants';
import { FeedbackReporter } from '../../conversation/vscode-node/feedbackReporter';
import { IUserFeedbackService, UserFeedbackService } from '../../conversation/vscode-node/userActions';
import { ConversationStore, IConversationStore } from '../../conversationStore/node/conversationStore';
import { SimilarFilesContextService } from '../../inlineEdits/vscode-node/similarFilesContext';
import { IIntentService, IntentService } from '../../intents/node/intentService';
import { INewWorkspacePreviewContentManager, NewWorkspacePreviewContentManagerImpl } from '../../intents/node/newIntent';
import { ITestGenInfoStorage, TestGenInfoStorage } from '../../intents/node/testIntent/testInfoStorage';
import { LanguageContextProviderService } from '../../languageContextProvider/vscode-node/languageContextProviderService';
import { ILinkifyService, LinkifyService } from '../../linkify/common/linkifyService';
import { DebugCommandToConfigConverter, IDebugCommandToConfigConverter } from '../../onboardDebug/node/commandToConfigConverter';
import { DebuggableCommandIdentifier, IDebuggableCommandIdentifier } from '../../onboardDebug/node/debuggableCommandIdentifier';
import { ILanguageToolsProvider, LanguageToolsProvider } from '../../onboardDebug/node/languageToolsProvider';
import { IPowerService } from '../../power/common/powerService';
import { PowerService } from '../../power/vscode-node/powerService';
import { ChatMLFetcherImpl } from '../../prompt/node/chatMLFetcher';
import { IFeedbackReporter } from '../../prompt/node/feedbackReporter';
import { IPromptCategorizerService, PromptCategorizerService } from '../../prompt/node/promptCategorizer';
import { IPromptVariablesService } from '../../prompt/node/promptVariablesService';
import { ITodoListContextProvider, TodoListContextProvider } from '../../prompt/node/todoListContextProvider';
import { DevContainerConfigurationServiceImpl } from '../../prompt/vscode-node/devContainerConfigurationServiceImpl';
import { ProductionEndpointProvider } from '../../prompt/vscode-node/endpointProviderImpl';
import { GitCommitMessageServiceImpl } from '../../prompt/vscode-node/gitCommitMessageServiceImpl';
import { GitDiffService } from '../../prompt/vscode-node/gitDiffService';
import { PromptVariablesServiceImpl } from '../../prompt/vscode-node/promptVariablesService';
import { RequestLogger } from '../../prompt/vscode-node/requestLoggerImpl';
import { ScenarioAutomationEndpointProviderImpl } from '../../prompt/vscode-node/scenarioAutomationEndpointProviderImpl';
import { SettingsEditorSearchServiceImpl } from '../../prompt/vscode-node/settingsEditorSearchServiceImpl';
import { IChatDiskSessionResources } from '../../prompts/common/chatDiskSessionResources';
import { ChatDiskSessionResources } from '../../prompts/node/chatDiskSessionResourcesImpl';
import { CodeMapperService, ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { FixCookbookService, IFixCookbookService } from '../../prompts/node/inline/fixCookbookService';
import { WorkspaceMutationManager } from '../../testing/node/setupTestsFileManager';
import { AgentMemoryService, IAgentMemoryService } from '../../tools/common/agentMemoryService';
import { IMemoryCleanupService, MemoryCleanupService } from '../../tools/common/memoryCleanupService';
import { ToolDeferralService } from '../../tools/common/toolDeferralService';
import { IToolsService } from '../../tools/common/toolsService';
import { ToolsService } from '../../tools/vscode-node/toolsService';
import { LanguageContextServiceImpl } from '../../typescriptContext/vscode-node/languageContextService';
import { IWorkspaceListenerService } from '../../workspaceRecorder/common/workspaceListenerService';
import { WorkspacListenerService } from '../../workspaceRecorder/vscode-node/workspaceListenerService';
import { ISimilarFilesContextService } from '../../xtab/common/similarFilesContextService';
import { registerServices as registerCommonServices } from '../vscode/services';

// ###########################################################################################
// ###                                                                                     ###
// ###               Node services that run ONLY in node.js extension host.                ###
// ###                                                                                     ###
// ###  !!! Prefer to list services in ../vscode/services.ts to support them anywhere !!!  ###
// ###                                                                                     ###
// ###########################################################################################

export function registerServices(builder: IInstantiationServiceBuilder, extensionContext: ExtensionContext): void {
	const isTestMode = extensionContext.extensionMode === ExtensionMode.Test;

	registerCommonServices(builder, extensionContext);

	builder.define(IAutomodeService, new SyncDescriptor(AutomodeService));
	builder.define(IConversationStore, new SyncDescriptor(ConversationStore));
	builder.define(IDiffService, new DiffServiceImpl());
	builder.define(ITokenizerProvider, new SyncDescriptor(TokenizerProvider, [true]));
	builder.define(IToolsService, new SyncDescriptor(ToolsService));
	builder.define(IToolDeferralService, new ToolDeferralService());
	builder.define(IAgentMemoryService, new SyncDescriptor(AgentMemoryService));
	builder.define(IMemoryCleanupService, new SyncDescriptor(MemoryCleanupService));
	builder.define(IChatDiskSessionResources, new SyncDescriptor(ChatDiskSessionResources));
	builder.define(IRequestLogger, new SyncDescriptor(RequestLogger));
	builder.define(INativeEnvService, new SyncDescriptor(NativeEnvServiceImpl));

	builder.define(IFetcherService, new SyncDescriptor(FetcherService, [undefined]));
	builder.define(IDomainService, new SyncDescriptor(DomainService));
	builder.define(ICAPIClientService, new SyncDescriptor(CAPIClientImpl));
	builder.define(IImageService, new SyncDescriptor(VSCodeImageServiceImpl));

	builder.define(ITelemetryUserConfig, new SyncDescriptor(TelemetryUserConfigImpl, [undefined, undefined]));
	const internalAIKey = extensionContext.extension.packageJSON.internalAIKey ?? '';
	const internalLargeEventAIKey = extensionContext.extension.packageJSON.internalLargeStorageAriaKey ?? '';
	const ariaKey = extensionContext.extension.packageJSON.ariaKey ?? '';
	if (isTestMode || isScenarioAutomation) {
		setupTelemetry(builder, extensionContext, internalAIKey, internalLargeEventAIKey, ariaKey);
		// If we're in testing mode, then most code will be called from an actual test,
		// and not from here. However, some objects will capture the `accessor` we pass
		// here and then re-use it later. This is particularly the case for those objects
		// which implement VSCode interfaces so can't be changed to take `accessor` in their
		// method parameters.
		builder.define(ICopilotTokenManager, getOrCreateTestingCopilotTokenManager(env.devDeviceId));
	} else {
		setupTelemetry(builder, extensionContext, internalAIKey, internalLargeEventAIKey, ariaKey);
		builder.define(ICopilotTokenManager, new SyncDescriptor(VSCodeCopilotTokenManager));
	}

	if (isScenarioAutomation) {
		builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
		builder.define(IEndpointProvider, new SyncDescriptor(ScenarioAutomationEndpointProviderImpl));
		builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
		builder.define(IWorkspaceChunkSearchService, new SyncDescriptor(ScenarioAutomationWorkspaceChunkSearchService));
	} else {
		builder.define(IAuthenticationService, new SyncDescriptor(AuthenticationService));
		builder.define(IEndpointProvider, new SyncDescriptor(ProductionEndpointProvider));
		builder.define(IIgnoreService, new SyncDescriptor(VsCodeIgnoreService));
		builder.define(IWorkspaceChunkSearchService, new SyncDescriptor(WorkspaceChunkSearchService));
	}

	builder.define(IGithubCodeSearchService, new SyncDescriptor(GithubCodeSearchService));
	builder.define(IGithubAvailableEmbeddingTypesService, new SyncDescriptor(GithubAvailableEmbeddingTypesService));

	builder.define(ITestGenInfoStorage, new SyncDescriptor(TestGenInfoStorage)); // Used for test generation (/tests intent)
	builder.define(IParserService, new SyncDescriptor(ParserServiceImpl, [/*useWorker*/ true]));
	builder.define(IIntentService, new SyncDescriptor(IntentService));
	builder.define(INaiveChunkingService, new SyncDescriptor(NaiveChunkingService));
	builder.define(IWorkspaceFileIndex, new SyncDescriptor(WorkspaceFileIndex));
	builder.define(IChunkingEndpointClient, new SyncDescriptor(ChunkingEndpointClientImpl));
	builder.define(ICommandService, new SyncDescriptor(CommandServiceImpl));
	builder.define(IDocsSearchClient, new SyncDescriptor(DocsSearchClient));
	builder.define(ISearchService, new SyncDescriptor(SearchServiceImpl));
	builder.define(ITestDepsResolver, new SyncDescriptor(TestDepsResolver));
	builder.define(ISetupTestsDetector, new SyncDescriptor(SetupTestsDetector));
	builder.define(IWorkspaceMutationManager, new SyncDescriptor(WorkspaceMutationManager));
	builder.define(IScopeSelector, new SyncDescriptor(ScopeSelectorImpl));
	builder.define(IGitService, new SyncDescriptor(GitServiceImpl));
	builder.define(IGitDiffService, new SyncDescriptor(GitDiffService));
	builder.define(IGitCommitMessageService, new SyncDescriptor(GitCommitMessageServiceImpl));
	builder.define(IGithubRepositoryService, new SyncDescriptor(GithubRepositoryService));
	builder.define(IDevContainerConfigurationService, new SyncDescriptor(DevContainerConfigurationServiceImpl));
	builder.define(IChatAgentService, new SyncDescriptor(ChatAgentService));
	builder.define(IPromptCategorizerService, new SyncDescriptor(PromptCategorizerService));
	builder.define(IChatHookService, new SyncDescriptor(ChatHookService));
	builder.define(IHookExecutor, new SyncDescriptor(NodeHookExecutor));
	builder.define(IHooksOutputChannel, new SyncDescriptor(HooksOutputChannel));
	builder.define(ISessionTranscriptService, new SyncDescriptor(SessionTranscriptService));
	builder.define(IChatDebugFileLoggerService, new SyncDescriptor(ChatDebugFileLoggerService));
	builder.define(ILinkifyService, new SyncDescriptor(LinkifyService));
	builder.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
	builder.define(IChatWebSocketManager, new SyncDescriptor(ChatWebSocketManager));
	builder.define(IFeedbackReporter, new SyncDescriptor(FeedbackReporter));
	builder.define(IApiEmbeddingsIndex, new SyncDescriptor(ApiEmbeddingsIndex, [/*useRemoteCache*/ true]));
	builder.define(IGithubApiFetcherService, new SyncDescriptor(GithubApiFetcherService));
	builder.define(IAdoCodeSearchService, new SyncDescriptor(AdoCodeSearchService));
	builder.define(ISettingsEditorSearchService, new SyncDescriptor(SettingsEditorSearchServiceImpl));
	builder.define(INewWorkspacePreviewContentManager, new SyncDescriptor(NewWorkspacePreviewContentManagerImpl));
	builder.define(IPromptVariablesService, new SyncDescriptor(PromptVariablesServiceImpl));
	builder.define(IPromptWorkspaceLabels, new SyncDescriptor(PromptWorkspaceLabels));
	builder.define(IUserFeedbackService, new SyncDescriptor(UserFeedbackService));
	builder.define(IDebugCommandToConfigConverter, new SyncDescriptor(DebugCommandToConfigConverter));
	builder.define(IDebuggableCommandIdentifier, new SyncDescriptor(DebuggableCommandIdentifier));
	builder.define(ILanguageToolsProvider, new SyncDescriptor(LanguageToolsProvider));
	builder.define(ICodeMapperService, new SyncDescriptor(CodeMapperService));
	builder.define(ICompletionsFetchService, new SyncDescriptor(CompletionsFetchService));
	builder.define(IFixCookbookService, new SyncDescriptor(FixCookbookService));
	builder.define(ILanguageContextService, new SyncDescriptor(LanguageContextServiceImpl));
	builder.define(ILanguageContextProviderService, new SyncDescriptor(LanguageContextProviderService));
	builder.define(IWorkspaceListenerService, new SyncDescriptor(WorkspacListenerService));
	builder.define(ICodeSearchAuthenticationService, new SyncDescriptor(VsCodeCodeSearchAuthenticationService));
	builder.define(ITodoListContextProvider, new SyncDescriptor(TodoListContextProvider));
	builder.define(IRerankerService, new SyncDescriptor(RerankerService));
	builder.define(IProxyModelsService, new SyncDescriptor(ProxyModelsService));
	builder.define(IPowerService, new SyncDescriptor(PowerService));
	builder.define(IInlineEditsModelService, new SyncDescriptor(InlineEditsModelService));
	builder.define(IUndesiredModelsManager, new SyncDescriptor(UndesiredModels.Manager));
	builder.define(ICopilotInlineCompletionItemProviderService, new SyncDescriptor(CopilotInlineCompletionItemProviderService));
	builder.define(ISimilarFilesContextService, new SyncDescriptor(SimilarFilesContextService));
	builder.define(IGitHubOrgChatResourcesService, new SyncDescriptor(GitHubOrgChatResourcesService));
	builder.define(IToolResultContentRenderer, new SyncDescriptor(ToolResultContentRenderer));

	// Chronicle session store — tracks sessions, turns, files, and refs for /standup
	const sessionStoreDbPath = extensionContext.globalStorageUri
		? path.join(extensionContext.globalStorageUri.fsPath, 'session-store.db')
		: path.join(os.tmpdir(), 'copilot-session-store.db');
	const sessionStore = new SessionStore(sessionStoreDbPath);
	builder.define(ISessionStore, sessionStore);

	// OTel SQLite store — created lazily, DB file only appears when dbSpanExporter.enabled is true
	const otelDbPath = extensionContext.globalStorageUri
		? path.join(extensionContext.globalStorageUri.fsPath, 'agent-traces.db')
		: path.join(os.tmpdir(), 'copilot-agent-traces.db');
	const otelSqliteStore = new OTelSqliteStore(otelDbPath);
	builder.define(IOTelSqliteStore, otelSqliteStore);

	// OTel service — resolve config from env + settings, create appropriate impl
	const otelSettings = workspace.getConfiguration('github.copilot.chat.otel');
	const otelConfig = resolveOTelConfig({
		env: process.env,
		settingEnabled: otelSettings.get<boolean>('enabled'),
		settingExporterType: otelSettings.get<'otlp-grpc' | 'otlp-http' | 'console' | 'file'>('exporterType'),
		settingOtlpEndpoint: otelSettings.get<string>('otlpEndpoint'),
		settingCaptureContent: otelSettings.get<boolean>('captureContent'),
		settingMaxAttributeSizeChars: otelSettings.get<number>('maxAttributeSizeChars'),
		settingOutfile: otelSettings.get<string>('outfile') || undefined,
		settingDbSpanExporter: otelSettings.get<boolean>('dbSpanExporter.enabled'),
		extensionVersion: extensionContext.extension.packageJSON.version ?? '0.0.0',
		sessionId: env.sessionId,
	});
	if (otelConfig.enabled) {
		// Dynamic import to avoid loading OTel SDK when disabled
		const { NodeOTelService } = require('../../../platform/otel/node/otelServiceImpl') as typeof import('../../../platform/otel/node/otelServiceImpl');
		// Log callback routes OTel messages to the extension output channel (via ILogService wired in OTelContrib)
		// During early init before ILogService is available, messages go to console as fallback
		const logFn: import('../../../platform/otel/node/otelServiceImpl').OTelLogFn = (level, msg) => {
			if (level === 'error') { console.error(msg); }
			else if (level === 'warn') { console.warn(msg); }
			else { console.info(msg); }
		};
		builder.define(IOTelService, new NodeOTelService(otelConfig, logFn, otelConfig.dbSpanExporter ? otelSqliteStore : undefined));
	} else {
		builder.define(IOTelService, new InMemoryOTelService(otelConfig));
	}
}

function setupMSFTExperimentationService(builder: IInstantiationServiceBuilder, extensionContext: ExtensionContext) {
	const experimentsEnabled = workspace.getConfiguration('workbench').get<boolean>('enableExperiments', true);
	if (ExtensionMode.Production === extensionContext.extensionMode && !isScenarioAutomation && experimentsEnabled) {
		// Intitiate the experimentation service
		builder.define(IExperimentationService, new SyncDescriptor(MicrosoftExperimentationService));
	} else {
		builder.define(IExperimentationService, new NullExperimentationService());
	}
}

function setupTelemetry(builder: IInstantiationServiceBuilder, extensionContext: ExtensionContext, internalAIKey: string, internalLargeEventAIKey: string, externalAIKey: string) {

	if (ExtensionMode.Production === extensionContext.extensionMode && !isScenarioAutomation) {
		builder.define(ITelemetryService, new SyncDescriptor(TelemetryService, [
			extensionContext.extension.packageJSON.name,
			internalAIKey,
			internalLargeEventAIKey,
			externalAIKey,
			APP_INSIGHTS_KEY_STANDARD,
			APP_INSIGHTS_KEY_ENHANCED,
		]));
	} else {
		// If we're developing or testing we don't want telemetry to be sent, so we turn it off
		builder.define(ITelemetryService, new NullTelemetryService());
	}

	setupMSFTExperimentationService(builder, extensionContext);
}
