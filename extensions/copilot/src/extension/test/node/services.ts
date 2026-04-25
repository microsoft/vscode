/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolGroupingCache } from '../../../extension/tools/common/virtualTools/virtualToolGroupCache';
import { IToolGroupingCache, IToolGroupingService } from '../../../extension/tools/common/virtualTools/virtualToolTypes';
import { IChatDebugFileLoggerService, NullChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { IChatHookService } from '../../../platform/chat/common/chatHookService';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { ISessionTranscriptService, NullSessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { MockChatMLFetcher } from '../../../platform/chat/test/common/mockChatMLFetcher';
import { IDiffService } from '../../../platform/diff/common/diffService';
import { DiffServiceImpl } from '../../../platform/diff/node/diffServiceImpl';
import { EmbeddingType, IEmbeddingsComputer } from '../../../platform/embeddings/common/embeddingsComputer';
import { RemoteEmbeddingsComputer } from '../../../platform/embeddings/common/remoteEmbeddingsComputer';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { IModelConfig } from '../../../platform/endpoint/test/node/openaiCompatibleEndpoint';
import { TestEndpointProvider } from '../../../platform/endpoint/test/node/testEndpointProvider';
import { IGitCommitMessageService, NoopGitCommitMessageService } from '../../../platform/git/common/gitCommitMessageService';
import { IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { IGitService } from '../../../platform/git/common/gitService';
import { NullGitDiffService } from '../../../platform/git/common/nullGitDiffService';
import { NullGitExtensionService } from '../../../platform/git/common/nullGitExtensionService';
import { GithubApiFetcherService, IGithubApiFetcherService } from '../../../platform/github/common/githubApiFetcherService';
import { IInlineEditsModelService, IUndesiredModelsManager } from '../../../platform/inlineEdits/common/inlineEditsModelService';
import { InlineEditsModelService, UndesiredModels } from '../../../platform/inlineEdits/node/inlineEditsModelService';
import { ILogService } from '../../../platform/log/common/logService';
import { IMcpService, NullMcpService } from '../../../platform/mcp/common/mcpService';
import { EditLogService, IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { IMultiFileEditInternalTelemetryService, MultiFileEditInternalTelemetryService } from '../../../platform/multiFileEdit/common/multiFileEditQualityTelemetry';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { IChatWebSocketManager, NullChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { AlternativeNotebookContentEditGenerator, IAlternativeNotebookContentEditGenerator } from '../../../platform/notebook/common/alternativeContentEditGenerator';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { INotebookSummaryTracker } from '../../../platform/notebook/common/notebookSummaryTracker';
import { IProxyModelsService, NullProxyModelsService } from '../../../platform/proxyModels/common/proxyModelsService';
import { AdoCodeSearchService, IAdoCodeSearchService } from '../../../platform/remoteCodeSearch/common/adoCodeSearchService';
import { GithubCodeSearchService, IGithubCodeSearchService } from '../../../platform/remoteCodeSearch/common/githubCodeSearchService';
import { ISimulationTestContext, NulSimulationTestContext } from '../../../platform/simulationTestContext/common/simulationTestContext';
import { ITerminalService, NullTerminalService } from '../../../platform/terminal/common/terminalService';
import { TestingServiceCollection, createPlatformServices } from '../../../platform/test/node/services';
import { SimulationAlternativeNotebookContentService, SimulationNotebookService, SimulationNotebookSummaryTracker } from '../../../platform/test/node/simulationWorkspaceServices';
import { NullTestProvider } from '../../../platform/testing/common/nullTestProvider';
import { TestLogService } from '../../../platform/testing/common/testLogService';
import { ITestProvider } from '../../../platform/testing/common/testProvider';
import { IGithubAvailableEmbeddingTypesService, MockGithubAvailableEmbeddingTypesService } from '../../../platform/workspaceChunkSearch/common/githubAvailableEmbeddingTypes';
import { IWorkspaceChunkSearchService, NullWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { ILanguageModelServer } from '../../agents/node/langModelServer';
import { MockLanguageModelServer } from '../../agents/node/test/mockLanguageModelServer';
import { IClaudeRuntimeDataService } from '../../chatSessions/claude/common/claudeRuntimeDataService';
import { IClaudeToolPermissionService } from '../../chatSessions/claude/common/claudeToolPermissionService';
import { ClaudeCodeModels, IClaudeCodeModels } from '../../chatSessions/claude/node/claudeCodeModels';
import { IClaudeCodeSdkService } from '../../chatSessions/claude/node/claudeCodeSdkService';
import { ClaudeRuntimeDataService } from '../../chatSessions/claude/node/claudeRuntimeDataService';
import { IClaudePluginService } from '../../chatSessions/claude/node/claudeSkills';
import { IClaudeSessionStateService } from '../../chatSessions/claude/common/claudeSessionStateService';
import { ClaudeSessionStateService } from '../../chatSessions/claude/node/claudeSessionStateService';
import { MockClaudeCodeSdkService } from '../../chatSessions/claude/node/test/mockClaudeCodeSdkService';
import { MockClaudeToolPermissionService } from '../../chatSessions/claude/node/test/mockClaudeToolPermissionService';
import { CommandServiceImpl, ICommandService } from '../../commands/node/commandService';
import { IPromptWorkspaceLabels, PromptWorkspaceLabels } from '../../context/node/resolvers/promptWorkspaceLabels';
import { ILinkifyService, LinkifyService } from '../../linkify/common/linkifyService';
import { IPowerService, NullPowerService } from '../../power/common/powerService';
import { IFeedbackReporter, NullFeedbackReporterImpl } from '../../prompt/node/feedbackReporter';
import { IPromptVariablesService, NullPromptVariablesService } from '../../prompt/node/promptVariablesService';
import { ITodoListContextProvider, TodoListContextProvider } from '../../prompt/node/todoListContextProvider';
import { IChatDiskSessionResources } from '../../prompts/common/chatDiskSessionResources';
import { ChatDiskSessionResources } from '../../prompts/node/chatDiskSessionResourcesImpl';
import { CodeMapperService, ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { FixCookbookService, IFixCookbookService } from '../../prompts/node/inline/fixCookbookService';
import { AgentMemoryService, IAgentMemoryService } from '../../tools/common/agentMemoryService';
import { EditToolLearningService, IEditToolLearningService } from '../../tools/common/editToolLearningService';
import { IMemoryCleanupService, MemoryCleanupService } from '../../tools/common/memoryCleanupService';
import { ToolDeferralService } from '../../tools/common/toolDeferralService';
import { IToolsService } from '../../tools/common/toolsService';
import { IToolEmbeddingsComputer } from '../../tools/common/virtualTools/toolEmbeddingsComputer';
import { ToolGroupingService } from '../../tools/common/virtualTools/toolGroupingService';
import '../../tools/node/allTools';
import { TestToolsService } from '../../tools/node/test/testToolsService';
import { TestToolEmbeddingsComputer } from '../../tools/test/node/virtualTools/testVirtualTools';
import { ISimilarFilesContextService } from '../../xtab/common/similarFilesContextService';
import { ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { SessionStore } from '../../../platform/chronicle/node/sessionStore';

export interface ISimulationModelConfig {
	chatModel?: string;
	smartChatModel?: string;
	fastChatModel?: string;
	readonly embeddingType?: EmbeddingType;
	fastRewriteModel?: string;
	skipModelMetadataCache?: boolean;
	customModelConfigs?: Map<string, IModelConfig>;
}

export function createExtensionUnitTestingServices(disposables: Pick<DisposableStore, 'add'> = new DisposableStore(), currentTestRunInfo?: any, modelConfig?: ISimulationModelConfig): TestingServiceCollection {
	const testingServiceCollection = createPlatformServices(disposables);
	testingServiceCollection.define(
		IEndpointProvider,
		new SyncDescriptor(TestEndpointProvider, [
			modelConfig?.smartChatModel ?? modelConfig?.chatModel,
			modelConfig?.fastChatModel ?? modelConfig?.chatModel,
			modelConfig?.fastRewriteModel,
			currentTestRunInfo,
			!!modelConfig?.skipModelMetadataCache,
			modelConfig?.customModelConfigs,
		])
	);
	testingServiceCollection.define(IGithubApiFetcherService, new SyncDescriptor(GithubApiFetcherService));
	testingServiceCollection.define(IGithubCodeSearchService, new SyncDescriptor(GithubCodeSearchService));
	testingServiceCollection.define(ITestProvider, new NullTestProvider());
	testingServiceCollection.define(ILogService, new SyncDescriptor(TestLogService));
	testingServiceCollection.define(IAdoCodeSearchService, new SyncDescriptor(AdoCodeSearchService));
	testingServiceCollection.define(IWorkspaceChunkSearchService, new SyncDescriptor(NullWorkspaceChunkSearchService));
	testingServiceCollection.define(IPromptVariablesService, new SyncDescriptor(NullPromptVariablesService));
	testingServiceCollection.define(ILinkifyService, new SyncDescriptor(LinkifyService));
	testingServiceCollection.define(ICommandService, new SyncDescriptor(CommandServiceImpl));
	testingServiceCollection.define(IFeedbackReporter, new SyncDescriptor(NullFeedbackReporterImpl));
	testingServiceCollection.define(IChatMLFetcher, new SyncDescriptor(MockChatMLFetcher));
	testingServiceCollection.define(IToolsService, new SyncDescriptor(TestToolsService, [new Set()]));
	testingServiceCollection.define(IToolDeferralService, new ToolDeferralService());
	testingServiceCollection.define(IChatDiskSessionResources, new SyncDescriptor(ChatDiskSessionResources));
	testingServiceCollection.define(IClaudeCodeSdkService, new SyncDescriptor(MockClaudeCodeSdkService));
	testingServiceCollection.define(IClaudeToolPermissionService, new SyncDescriptor(MockClaudeToolPermissionService));
	testingServiceCollection.define(IClaudeCodeModels, new SyncDescriptor(ClaudeCodeModels));
	testingServiceCollection.define(IClaudeSessionStateService, new SyncDescriptor(ClaudeSessionStateService));
	testingServiceCollection.define(IClaudeRuntimeDataService, new SyncDescriptor(ClaudeRuntimeDataService));
	testingServiceCollection.define(IMcpService, new SyncDescriptor(NullMcpService));
	testingServiceCollection.define(IEditLogService, new SyncDescriptor(EditLogService));
	testingServiceCollection.define(IProxyModelsService, new SyncDescriptor(NullProxyModelsService));
	testingServiceCollection.define(IInlineEditsModelService, new SyncDescriptor(InlineEditsModelService));
	testingServiceCollection.define(IUndesiredModelsManager, new SyncDescriptor(UndesiredModels.Manager));
	testingServiceCollection.define(IMultiFileEditInternalTelemetryService, new SyncDescriptor(MultiFileEditInternalTelemetryService));
	testingServiceCollection.define(ICodeMapperService, new SyncDescriptor(CodeMapperService));
	testingServiceCollection.define(IAlternativeNotebookContentService, new SyncDescriptor(SimulationAlternativeNotebookContentService));
	testingServiceCollection.define(IAlternativeNotebookContentEditGenerator, new SyncDescriptor(AlternativeNotebookContentEditGenerator));
	testingServiceCollection.define(IDiffService, new SyncDescriptor(DiffServiceImpl));
	testingServiceCollection.define(IFixCookbookService, new SyncDescriptor(FixCookbookService));
	testingServiceCollection.define(ISimulationTestContext, new SyncDescriptor(NulSimulationTestContext));
	testingServiceCollection.define(INotebookService, new SyncDescriptor(SimulationNotebookService));
	testingServiceCollection.define(INotebookSummaryTracker, new SyncDescriptor(SimulationNotebookSummaryTracker));
	testingServiceCollection.define(ITerminalService, new SyncDescriptor(NullTerminalService));
	testingServiceCollection.define(IToolGroupingCache, new SyncDescriptor(ToolGroupingCache));
	testingServiceCollection.define(IToolGroupingService, new SyncDescriptor(ToolGroupingService));
	testingServiceCollection.define(IToolEmbeddingsComputer, new SyncDescriptor(TestToolEmbeddingsComputer));
	testingServiceCollection.define(IEmbeddingsComputer, new SyncDescriptor(RemoteEmbeddingsComputer));
	testingServiceCollection.define(ITodoListContextProvider, new SyncDescriptor(TodoListContextProvider));
	testingServiceCollection.define(ILanguageModelServer, new SyncDescriptor(MockLanguageModelServer));
	testingServiceCollection.define(IEditToolLearningService, new SyncDescriptor(EditToolLearningService));
	testingServiceCollection.define(IAgentMemoryService, new SyncDescriptor(AgentMemoryService));
	testingServiceCollection.define(IMemoryCleanupService, new SyncDescriptor(MemoryCleanupService));
	testingServiceCollection.define(IGitService, new SyncDescriptor(NullGitExtensionService));
	testingServiceCollection.define(IGitExtensionService, new SyncDescriptor(NullGitExtensionService));
	testingServiceCollection.define(IGitDiffService, new SyncDescriptor(NullGitDiffService));
	testingServiceCollection.define(IGitCommitMessageService, new SyncDescriptor(NoopGitCommitMessageService));
	testingServiceCollection.define(IGithubAvailableEmbeddingTypesService, new SyncDescriptor(MockGithubAvailableEmbeddingTypesService));
	testingServiceCollection.define(IPowerService, new SyncDescriptor(NullPowerService));
	testingServiceCollection.define(IPromptWorkspaceLabels, new SyncDescriptor(PromptWorkspaceLabels));
	testingServiceCollection.define(IChatHookService, new SyncDescriptor(NullChatHookService));
	testingServiceCollection.define(ISessionTranscriptService, new SyncDescriptor(NullSessionTranscriptService));
	testingServiceCollection.define(IChatDebugFileLoggerService, new SyncDescriptor(NullChatDebugFileLoggerService));
	testingServiceCollection.define(IChatWebSocketManager, new SyncDescriptor(NullChatWebSocketManager));
	testingServiceCollection.define(ISimilarFilesContextService, new SyncDescriptor(NullSimilarFilesContextService));
	testingServiceCollection.define(IAutomodeService, new SyncDescriptor(NullAutomodeService));
	testingServiceCollection.define(ISessionStore, new SessionStore(':memory:'));
	testingServiceCollection.define(IClaudePluginService, new NullClaudePluginService());
	return testingServiceCollection;
}

class NullClaudePluginService implements IClaudePluginService {
	declare readonly _serviceBrand: undefined;

	async getPluginLocations(): Promise<never[]> {
		return [];
	}
}

class NullSimilarFilesContextService implements ISimilarFilesContextService {
	declare readonly _serviceBrand: undefined;

	async compute(): Promise<undefined> {
		return undefined;
	}
}

class NullChatHookService implements IChatHookService {
	declare readonly _serviceBrand: undefined;

	logConfiguredHooks(): void { }

	async executeHook(): Promise<never[]> {
		return [];
	}

	async executePreToolUseHook(): Promise<undefined> {
		return undefined;
	}

	async executePostToolUseHook(): Promise<undefined> {
		return undefined;
	}
}

class NullAutomodeService implements IAutomodeService {
	declare readonly _serviceBrand: undefined;

	async resolveAutoModeEndpoint(): Promise<never> {
		throw new Error('Not implemented');
	}

	invalidateRouterCache(): void { }
}
