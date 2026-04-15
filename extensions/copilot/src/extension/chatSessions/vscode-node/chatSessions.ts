/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService, INativeEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { IGitService } from '../../../platform/git/common/gitService';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { OctoKitService } from '../../../platform/github/common/octoKitServiceImpl';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from '../../../util/vs/platform/instantiation/common/serviceCollection';
import { ILanguageModelServer, LanguageModelServer } from '../../agents/node/langModelServer';
import { IExtensionContribution } from '../../common/contributions';
import { prExtensionInstalledContextKey } from '../../contextKeys/vscode-node/contextKeys.contribution';
import { GitBranchNameGenerator } from '../../prompt/node/gitBranch';
import { ChatSummarizerProvider } from '../../prompt/node/summarizer';
import { IToolsService } from '../../tools/common/toolsService';
import { IClaudeRuntimeDataService } from '../claude/common/claudeRuntimeDataService';
import { ClaudeSessionUri } from '../claude/common/claudeSessionUri';
import { ClaudeToolPermissionService, IClaudeToolPermissionService } from '../claude/common/claudeToolPermissionService';
import { ClaudeAgentManager } from '../claude/node/claudeCodeAgent';
import { ClaudeCodeModels, IClaudeCodeModels } from '../claude/node/claudeCodeModels';
import { ClaudeCodeSdkService, IClaudeCodeSdkService } from '../claude/node/claudeCodeSdkService';
import { ClaudeRuntimeDataService } from '../claude/node/claudeRuntimeDataService';
import { IClaudeSessionStateService } from '../claude/common/claudeSessionStateService';
import { ClaudeSessionStateService } from '../claude/node/claudeSessionStateService';
import { ClaudeCodeSessionService, IClaudeCodeSessionService } from '../claude/node/sessionParser/claudeCodeSessionService';
import { ClaudeSlashCommandService, IClaudeSlashCommandService } from '../claude/vscode-node/claudeSlashCommandService';
import { IAgentSessionsWorkspace } from '../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { IChatFolderMruService, IFolderRepositoryManager } from '../common/folderRepositoryManager';
import { ICustomSessionTitleService } from '../copilotcli/common/customSessionTitleService';
import { ChatDelegationSummaryService, IChatDelegationSummaryService } from '../copilotcli/common/delegationSummaryService';
import { SessionIdForCLI } from '../copilotcli/common/utils';
import { CopilotCLIAgents, CopilotCLIModels, CopilotCLISDK, ICopilotCLIAgents, ICopilotCLIModels, ICopilotCLISDK } from '../copilotcli/node/copilotCli';
import { CopilotCLIImageSupport, ICopilotCLIImageSupport } from '../copilotcli/node/copilotCLIImageSupport';
import { CopilotCLIPromptResolver } from '../copilotcli/node/copilotcliPromptResolver';
import { CopilotCLISessionService, ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';
import { CopilotCLISkills, ICopilotCLISkills } from '../copilotcli/node/copilotCLISkills';
import { CopilotCLIMCPHandler, ICopilotCLIMCPHandler } from '../copilotcli/node/mcpHandler';
import { IUserQuestionHandler } from '../copilotcli/node/userInputHelpers';
import { CopilotCLIContrib, getServices } from '../copilotcli/vscode-node/contribution';
import { CopilotCLIFolderMruService } from '../copilotcli/vscode-node/copilotCLIFolderMru';
import { ICopilotCLISessionTracker } from '../copilotcli/vscode-node/copilotCLISessionTracker';
import { CustomSessionTitleService } from '../copilotcli/vscode-node/customSessionTitleServiceImpl';
import { GHPR_EXTENSION_ID } from '../vscode/chatSessionsUriHandler';
import { AgentSessionsWorkspace } from './agentSessionsWorkspace';
import { UserQuestionHandler } from './askUserQuestionHandler';
import { ChatSessionMetadataStore } from './chatSessionMetadataStoreImpl';
import { ChatSessionRepositoryTracker } from './chatSessionRepositoryTracker';
import { ChatSessionWorkspaceFolderService } from './chatSessionWorkspaceFolderServiceImpl';
import { ChatSessionWorktreeCheckpointService } from './chatSessionWorktreeCheckpointServiceImpl';
import { ChatSessionWorktreeService } from './chatSessionWorktreeServiceImpl';
import { ClaudeChatSessionContentProvider } from './claudeChatSessionContentProvider';
import { ClaudeCustomizationProvider } from './claudeCustomizationProvider';
import { CopilotCLIChatSessionInitializer, ICopilotCLIChatSessionInitializer } from './copilotCLIChatSessionInitializer';
import { CopilotCLIChatSessionContentProvider, CopilotCLIChatSessionParticipant, registerCLIChatCommands } from './copilotCLIChatSessions';
import { CopilotCLIChatSessionContentProvider as CopilotCLIChatSessionContentProviderV1, CopilotCLIChatSessionItemProvider as CopilotCLIChatSessionItemProviderV1, CopilotCLIChatSessionParticipant as CopilotCLIChatSessionParticipantV1, registerCLIChatCommands as registerCLIChatCommandsV1 } from './copilotCLIChatSessionsContribution';
import { CopilotCLICustomizationProvider } from './copilotCLICustomizationProvider';
import { CopilotCLITerminalIntegration, ICopilotCLITerminalIntegration } from './copilotCLITerminalIntegration';
import { CopilotCloudSessionsProvider } from './copilotCloudSessionsProvider';
import { ClaudeFolderRepositoryManager, CopilotCLIFolderRepositoryManager } from './folderRepositoryManagerImpl';
import { PRContentProvider } from './prContentProvider';
import { IPullRequestDetectionService, PullRequestDetectionService } from './pullRequestDetectionService';
import { IPullRequestFileChangesService, PullRequestFileChangesService } from './pullRequestFileChangesService';
import { ISessionOptionGroupBuilder, SessionOptionGroupBuilder } from './sessionOptionGroupBuilder';
import { ISessionRequestLifecycle, SessionRequestLifecycle } from './sessionRequestLifecycle';


// https://github.com/microsoft/vscode-pull-request-github/blob/8a5c9a145cd80ee364a3bed9cf616b2bd8ac74c2/src/github/copilotApi.ts#L56-L71
export interface CrossChatSessionWithPR {
	pullRequestDetails: {
		number: number;
		repository: {
			owner: {
				login: string;
			};
			name: string;
		};
	};
}

const CLOSE_SESSION_PR_CMD = 'github.copilot.cloud.sessions.proxy.closeChatSessionPullRequest';
export class ChatSessionsContrib extends Disposable implements IExtensionContribution {
	readonly id = 'chatSessions';
	readonly copilotcliSessionType = 'copilotcli';

	private copilotCloudRegistrations: DisposableStore | undefined;
	private copilotAgentInstaService: IInstantiationService | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@IEnvService private readonly envService: IEnvService,
	) {
		super();
		// Copilot Cloud Agent - conditionally register based on configuration
		const summarizer = instantiationService.createInstance(ChatSummarizerProvider);
		const delegationSummary = instantiationService.createInstance(ChatDelegationSummaryService, summarizer);
		this._register(vscode.workspace.registerTextDocumentContentProvider(delegationSummary.scheme, {
			provideTextDocumentContent: (uri: vscode.Uri): string | undefined => delegationSummary.provideTextDocumentContent(uri)
		}));
		this.copilotAgentInstaService = instantiationService.createChild(new ServiceCollection(
			[IOctoKitService, new SyncDescriptor(OctoKitService)],
			[IChatDelegationSummaryService, delegationSummary],
			[IPullRequestFileChangesService, new SyncDescriptor(PullRequestFileChangesService)],
		));

		const configKey = vscode.workspace.isAgentSessionsWorkspace
			? ConfigKey.Advanced.CLISessionControllerForSessionsApp
			: ConfigKey.Advanced.CLISessionController;
		const useController = instantiationService.invokeFunction(accessor =>
			accessor.get(IConfigurationService).getConfig(configKey)
		);
		const { sessionMetadata } = useController ? this.registerCopilotCLIServices(instantiationService, delegationSummary, logService) : this.registerCopilotCLIServicesV1(instantiationService, delegationSummary, logService);

		// #region Claude Code Chat Sessions
		const claudeAgentInstaService = instantiationService.createChild(
			new ServiceCollection(
				[IAgentSessionsWorkspace, new SyncDescriptor(AgentSessionsWorkspace)],
				[IClaudeCodeSessionService, new SyncDescriptor(ClaudeCodeSessionService)],
				[IClaudeCodeSdkService, new SyncDescriptor(ClaudeCodeSdkService)],
				[IClaudeCodeModels, new SyncDescriptor(ClaudeCodeModels)],
				[ILanguageModelServer, new SyncDescriptor(LanguageModelServer)],
				[IClaudeToolPermissionService, new SyncDescriptor(ClaudeToolPermissionService)],
				[IClaudeSessionStateService, new SyncDescriptor(ClaudeSessionStateService)],
				[IClaudeSlashCommandService, new SyncDescriptor(ClaudeSlashCommandService)],
				[IChatSessionMetadataStore, sessionMetadata],
				[IChatSessionWorktreeService, new SyncDescriptor(ChatSessionWorktreeService)],
				[IChatSessionWorktreeCheckpointService, new SyncDescriptor(ChatSessionWorktreeCheckpointService)],
				[IChatSessionWorkspaceFolderService, new SyncDescriptor(ChatSessionWorkspaceFolderService)],
				[IFolderRepositoryManager, new SyncDescriptor(ClaudeFolderRepositoryManager)],
				[IClaudeRuntimeDataService, new SyncDescriptor(ClaudeRuntimeDataService)],
			));
		const claudeAgentManager = this._register(claudeAgentInstaService.createInstance(ClaudeAgentManager));
		const claudeModels = claudeAgentInstaService.invokeFunction(accessor => accessor.get(IClaudeCodeModels));
		claudeModels.registerLanguageModelChatProvider(vscode.lm);
		const chatSessionContentProvider = this._register(claudeAgentInstaService.createInstance(ClaudeChatSessionContentProvider, claudeAgentManager));
		const chatParticipant = vscode.chat.createChatParticipant(ClaudeSessionUri.scheme, chatSessionContentProvider.createHandler());
		chatParticipant.iconPath = new vscode.ThemeIcon('claude');
		this._register(vscode.chat.registerChatSessionContentProvider(ClaudeSessionUri.scheme, chatSessionContentProvider, chatParticipant));
		const claudeCustomizationProvider = this._register(claudeAgentInstaService.createInstance(ClaudeCustomizationProvider));
		this._register(vscode.chat.registerChatSessionCustomizationProvider(ClaudeSessionUri.scheme, ClaudeCustomizationProvider.metadata, claudeCustomizationProvider));

		// #endregion

		// #endregion

	}

	private registerCopilotCLIServices(instantiationService: IInstantiationService, delegationSummary: IChatDelegationSummaryService, logService: ILogService) {
		const cloudSessionProvider = this.registerCopilotCloudAgent();
		const copilotcliAgentInstaService = instantiationService.createChild(
			new ServiceCollection(
				[IAgentSessionsWorkspace, new SyncDescriptor(AgentSessionsWorkspace)],
				[ICopilotCLIImageSupport, new SyncDescriptor(CopilotCLIImageSupport)],
				[ICopilotCLISessionService, new SyncDescriptor(CopilotCLISessionService)],
				[IChatDelegationSummaryService, delegationSummary],
				[ICopilotCLIModels, new SyncDescriptor(CopilotCLIModels)],
				[ICopilotCLISDK, new SyncDescriptor(CopilotCLISDK)],
				[ICopilotCLIAgents, new SyncDescriptor(CopilotCLIAgents)],
				[ILanguageModelServer, new SyncDescriptor(LanguageModelServer)],
				[ICopilotCLITerminalIntegration, new SyncDescriptor(CopilotCLITerminalIntegration)],
				[IChatSessionWorktreeService, new SyncDescriptor(ChatSessionWorktreeService)],
				[IChatSessionWorktreeCheckpointService, new SyncDescriptor(ChatSessionWorktreeCheckpointService)],
				[IChatSessionWorkspaceFolderService, new SyncDescriptor(ChatSessionWorkspaceFolderService)],
				[ICopilotCLIMCPHandler, new SyncDescriptor(CopilotCLIMCPHandler)],
				[IFolderRepositoryManager, new SyncDescriptor(CopilotCLIFolderRepositoryManager)],
				[IUserQuestionHandler, new SyncDescriptor(UserQuestionHandler)],
				[ICustomSessionTitleService, new SyncDescriptor(CustomSessionTitleService)],
				[ICopilotCLISkills, new SyncDescriptor(CopilotCLISkills)],
				[IChatSessionMetadataStore, new SyncDescriptor(ChatSessionMetadataStore)],
				[IChatFolderMruService, new SyncDescriptor(CopilotCLIFolderMruService)],
				[IPullRequestDetectionService, new SyncDescriptor(PullRequestDetectionService)],
				[ISessionOptionGroupBuilder, new SyncDescriptor(SessionOptionGroupBuilder)],
				[ISessionRequestLifecycle, new SyncDescriptor(SessionRequestLifecycle)],
				[ICopilotCLIChatSessionInitializer, new SyncDescriptor(CopilotCLIChatSessionInitializer)],
				...getServices()
			));

		const copilotcliChatSessionContentProvider = copilotcliAgentInstaService.createInstance(CopilotCLIChatSessionContentProvider);
		this._register(copilotcliAgentInstaService.createInstance(ChatSessionRepositoryTracker, copilotcliChatSessionContentProvider));
		const promptResolver = copilotcliAgentInstaService.createInstance(CopilotCLIPromptResolver);
		const gitService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IGitService));
		const sessionTracker = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLISessionTracker));
		const terminalIntegration = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLITerminalIntegration));
		const aiGeneratedBranchNames = instantiationService.invokeFunction(accessor =>
			accessor.get(IConfigurationService).getConfig(ConfigKey.Advanced.CLIAIGenerateBranchNames)
		);
		const branchNameGenerator = aiGeneratedBranchNames ? copilotcliAgentInstaService.createInstance(GitBranchNameGenerator) : undefined;

		const copilotcliChatSessionParticipant = this._register(copilotcliAgentInstaService.createInstance(
			CopilotCLIChatSessionParticipant,
			copilotcliChatSessionContentProvider,
			promptResolver,
			cloudSessionProvider,
			branchNameGenerator,
		));
		const copilotCLISessionService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLISessionService));
		const copilotCLIWorktreeManagerService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionWorktreeService));
		const copilotCLIWorkspaceFolderSessions = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionWorkspaceFolderService));
		const folderRepositoryManager = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IFolderRepositoryManager));
		const nativeEnvService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(INativeEnvService));
		const fileSystemService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IFileSystemService));
		const copilotModels = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLIModels));
		const copilotCLIFolderMruService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatFolderMruService));

		this._register(copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLISessionTracker)));
		this._register(copilotcliAgentInstaService.createInstance(CopilotCLIContrib));

		copilotModels.registerLanguageModelChatProvider(vscode.lm);

		const copilotcliParticipant = vscode.chat.createChatParticipant(this.copilotcliSessionType, copilotcliChatSessionParticipant.createHandler());
		this._register(vscode.chat.registerChatSessionContentProvider(this.copilotcliSessionType, copilotcliChatSessionContentProvider, copilotcliParticipant));
		const copilotcliCustomizationProvider = this._register(copilotcliAgentInstaService.createInstance(CopilotCLICustomizationProvider));
		this._register(vscode.chat.registerChatSessionCustomizationProvider(this.copilotcliSessionType, CopilotCLICustomizationProvider.metadata, copilotcliCustomizationProvider));
		this._register(registerCLIChatCommands(copilotCLISessionService, copilotCLIWorktreeManagerService, gitService, copilotCLIWorkspaceFolderSessions, copilotcliChatSessionContentProvider, folderRepositoryManager, copilotCLIFolderMruService, nativeEnvService, fileSystemService, sessionTracker, terminalIntegration, logService));
		// #endregion

		const sessionMetadata = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionMetadataStore));
		return { sessionMetadata };
	}

	private registerCopilotCLIServicesV1(instantiationService: IInstantiationService, delegationSummary: IChatDelegationSummaryService, logService: ILogService) {
		const cloudSessionProvider = this.registerCopilotCloudAgent();
		const copilotcliAgentInstaService = instantiationService.createChild(
			new ServiceCollection(
				[IAgentSessionsWorkspace, new SyncDescriptor(AgentSessionsWorkspace)],
				[ICopilotCLIImageSupport, new SyncDescriptor(CopilotCLIImageSupport)],
				[ICopilotCLISessionService, new SyncDescriptor(CopilotCLISessionService)],
				[IChatDelegationSummaryService, delegationSummary],
				[ICopilotCLIModels, new SyncDescriptor(CopilotCLIModels)],
				[ICopilotCLISDK, new SyncDescriptor(CopilotCLISDK)],
				[ICopilotCLIAgents, new SyncDescriptor(CopilotCLIAgents)],
				[ILanguageModelServer, new SyncDescriptor(LanguageModelServer)],
				[ICopilotCLITerminalIntegration, new SyncDescriptor(CopilotCLITerminalIntegration)],
				[IChatSessionWorktreeService, new SyncDescriptor(ChatSessionWorktreeService)],
				[IChatSessionWorktreeCheckpointService, new SyncDescriptor(ChatSessionWorktreeCheckpointService)],
				[IChatSessionWorkspaceFolderService, new SyncDescriptor(ChatSessionWorkspaceFolderService)],
				[ICopilotCLIMCPHandler, new SyncDescriptor(CopilotCLIMCPHandler)],
				[IFolderRepositoryManager, new SyncDescriptor(CopilotCLIFolderRepositoryManager)],
				[IUserQuestionHandler, new SyncDescriptor(UserQuestionHandler)],
				[ICustomSessionTitleService, new SyncDescriptor(CustomSessionTitleService)],
				[ICopilotCLISkills, new SyncDescriptor(CopilotCLISkills)],
				[IChatSessionMetadataStore, new SyncDescriptor(ChatSessionMetadataStore)],
				[IChatFolderMruService, new SyncDescriptor(CopilotCLIFolderMruService)],
				...getServices()
			));

		const copilotcliSessionItemProvider = this._register(copilotcliAgentInstaService.createInstance(CopilotCLIChatSessionItemProviderV1));
		const providerRegistration = vscode.chat.registerChatSessionItemProvider(this.copilotcliSessionType, copilotcliSessionItemProvider);
		this._register(providerRegistration);
		this._register(copilotcliAgentInstaService.createInstance(ChatSessionRepositoryTracker, copilotcliSessionItemProvider));
		const copilotcliChatSessionContentProvider = copilotcliAgentInstaService.createInstance(CopilotCLIChatSessionContentProviderV1, copilotcliSessionItemProvider);
		const promptResolver = copilotcliAgentInstaService.createInstance(CopilotCLIPromptResolver);
		const gitService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IGitService));
		const gitExtensionService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IGitExtensionService));
		const toolsService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IToolsService));
		const aiGeneratedBranchNamesV1 = instantiationService.invokeFunction(accessor =>
			accessor.get(IConfigurationService).getConfig(ConfigKey.Advanced.CLIAIGenerateBranchNames)
		);
		const branchNameGeneratorV1 = aiGeneratedBranchNamesV1 ? copilotcliAgentInstaService.createInstance(GitBranchNameGenerator) : undefined;

		const copilotcliChatSessionParticipant = this._register(copilotcliAgentInstaService.createInstance(
			CopilotCLIChatSessionParticipantV1,
			copilotcliChatSessionContentProvider,
			promptResolver,
			copilotcliSessionItemProvider,
			cloudSessionProvider,
			branchNameGeneratorV1,
		));
		const copilotCLISessionService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLISessionService));
		const copilotCLIWorktreeManagerService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionWorktreeService));

		// Handle worktree cleanup/recreation when archive state changes
		const onDidChangeChatSessionItemState = (providerRegistration as { onDidChangeChatSessionItemState?: vscode.Event<vscode.ChatSessionItem> }).onDidChangeChatSessionItemState;
		if (onDidChangeChatSessionItemState) {
			this._register(onDidChangeChatSessionItemState(async (item) => {
				const sessionId = SessionIdForCLI.parse(item.resource);
				if (item.archived) {
					try {
						const result = await copilotCLIWorktreeManagerService.cleanupWorktreeOnArchive(sessionId);
						logService.trace(`[CopilotCLI] Worktree cleanup for session ${sessionId}: ${result.cleaned ? 'cleaned' : result.reason}`);
					} catch (error) {
						logService.error(`[CopilotCLI] Failed to cleanup worktree for archived session ${sessionId}:`, error);
					}
				} else {
					try {
						const result = await copilotCLIWorktreeManagerService.recreateWorktreeOnUnarchive(sessionId);
						logService.trace(`[CopilotCLI] Worktree recreation for session ${sessionId}: ${result.recreated ? 'recreated' : result.reason}`);
						if (result.recreated) {
							copilotcliSessionItemProvider.refreshSession({ reason: 'update', sessionId });
						}
					} catch (error) {
						logService.error(`[CopilotCLI] Failed to recreate worktree for unarchived session ${sessionId}:`, error);
					}
				}
			}));
		}

		const copilotCLIWorkspaceFolderSessions = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionWorkspaceFolderService));
		const folderRepositoryManager = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IFolderRepositoryManager));
		const nativeEnvService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(INativeEnvService));
		const fileSystemService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IFileSystemService));
		const copilotModels = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLIModels));
		const copilotFolderMruService = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatFolderMruService));

		this._register(copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(ICopilotCLISessionTracker)));
		this._register(copilotcliAgentInstaService.createInstance(CopilotCLIContrib));

		copilotModels.registerLanguageModelChatProvider(vscode.lm);

		const copilotcliParticipant = vscode.chat.createChatParticipant(this.copilotcliSessionType, copilotcliChatSessionParticipant.createHandler());
		this._register(vscode.chat.registerChatSessionContentProvider(this.copilotcliSessionType, copilotcliChatSessionContentProvider, copilotcliParticipant));
		const copilotcliCustomizationProvider = this._register(copilotcliAgentInstaService.createInstance(CopilotCLICustomizationProvider));
		this._register(vscode.chat.registerChatSessionCustomizationProvider(this.copilotcliSessionType, CopilotCLICustomizationProvider.metadata, copilotcliCustomizationProvider));
		this._register(registerCLIChatCommandsV1(copilotcliSessionItemProvider, copilotCLISessionService, copilotCLIWorktreeManagerService, gitService, gitExtensionService, toolsService, copilotCLIWorkspaceFolderSessions, copilotcliChatSessionContentProvider, folderRepositoryManager, copilotFolderMruService, nativeEnvService, fileSystemService, logService));
		// #endregion

		const sessionMetadata = copilotcliAgentInstaService.invokeFunction(accessor => accessor.get(IChatSessionMetadataStore));
		return { sessionMetadata };
	}

	private registerCopilotCloudAgent() {
		if (!this.copilotAgentInstaService) {
			return;
		}
		if (this.copilotCloudRegistrations) {
			this.copilotCloudRegistrations.dispose();
			this.copilotCloudRegistrations = undefined;
		}
		this.copilotCloudRegistrations = new DisposableStore();
		this.copilotCloudRegistrations.add(
			this.copilotAgentInstaService.createInstance(PRContentProvider)
		);
		const cloudSessionsProvider = this.copilotCloudRegistrations.add(
			this.copilotAgentInstaService.createInstance(CopilotCloudSessionsProvider)
		);
		this.copilotCloudRegistrations.add(
			vscode.chat.registerChatSessionItemProvider(CopilotCloudSessionsProvider.TYPE, cloudSessionsProvider)
		);
		this.copilotCloudRegistrations.add(
			vscode.chat.registerChatSessionContentProvider(
				CopilotCloudSessionsProvider.TYPE,
				cloudSessionsProvider,
				cloudSessionsProvider.chatParticipant,
				{ supportsInterruptions: true }
			)
		);
		this.copilotCloudRegistrations.add(
			vscode.commands.registerCommand('github.copilot.cloud.resetWorkspaceConfirmations', () => {
				cloudSessionsProvider.resetWorkspaceContext();
			})
		);
		this.copilotCloudRegistrations.add(
			vscode.commands.registerCommand('github.copilot.cloud.sessions.openInBrowser', async (chatSessionItem: vscode.ChatSessionItem) => {
				cloudSessionsProvider.openSessionInBrowser(chatSessionItem);
			})
		);
		this.copilotCloudRegistrations.add(
			vscode.commands.registerCommand(CLOSE_SESSION_PR_CMD, async (ctx: CrossChatSessionWithPR) => {
				try {
					const success = await this.octoKitService.closePullRequest(
						ctx.pullRequestDetails.repository.owner.login,
						ctx.pullRequestDetails.repository.name,
						ctx.pullRequestDetails.number,
						{ createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } });
					if (!success) {
						this.logService.error(`${CLOSE_SESSION_PR_CMD}: Failed to close PR #${ctx.pullRequestDetails.number}`);
					}
					cloudSessionsProvider.refresh();
				} catch (e) {
					this.logService.error(`${CLOSE_SESSION_PR_CMD}: Exception ${e}`);
				}
			})
		);
		this.copilotCloudRegistrations.add(
			vscode.commands.registerCommand('github.copilot.cloud.sessions.installPRExtension', async () => {
				await this.installPullRequestExtension();
			})
		);
		return cloudSessionsProvider;
	}

	private isPullRequestExtensionInstalled(): boolean {
		return vscode.extensions.getExtension(GHPR_EXTENSION_ID) !== undefined;
	}

	private async installPullRequestExtension(): Promise<void> {
		if (this.isPullRequestExtensionInstalled()) {
			return;
		}
		try {
			const isInsiders = this.envService.getEditorInfo().version.includes('insider');
			const installOptions = { enable: true, installPreReleaseVersion: isInsiders, justification: vscode.l10n.t('Enable additional pull request features, such as checking out and applying changes.') };
			await vscode.commands.executeCommand('workbench.extensions.installExtension', GHPR_EXTENSION_ID, installOptions);
			const maxWaitTime = 10_000; // 10 seconds
			const pollInterval = 100; // 100ms
			let elapsed = 0;
			while (elapsed < maxWaitTime) {
				if (this.isPullRequestExtensionInstalled()) {
					vscode.window.showInformationMessage(vscode.l10n.t('GitHub Pull Request extension installed successfully.'));
					break;
				}
				await new Promise(resolve => setTimeout(resolve, pollInterval));
				elapsed += pollInterval;
			}
			if (!this.isPullRequestExtensionInstalled()) {
				vscode.window.showWarningMessage(vscode.l10n.t('GitHub Pull Request extension is taking longer than expected to install.'));
			}
			await vscode.commands.executeCommand('setContext', prExtensionInstalledContextKey, true);
		} catch (error) {
			vscode.window.showErrorMessage(vscode.l10n.t('Failed to install GitHub Pull Request extension: {0}', error instanceof Error ? error.message : String(error)));
		}
	}
}
