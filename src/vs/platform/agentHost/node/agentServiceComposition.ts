/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { GitHubService, IGitHubService } from '../../github/common/githubService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { IAgentService } from '../common/agentService.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { AgentHostChangesetOperationService } from './agentHostChangesetOperationService.js';
import { AgentHostChangesetService } from './agentHostChangesetService.js';
import { AgentHostChangesetSubscriptionService } from './agentHostChangesetSubscriptionService.js';
import { AgentHostChatContributions } from './agentHostChatContributionsService.js';
import { AgentHostChatCompletionProvider } from './agentHostChatCompletionProvider.js';
import { AgentHostCheckpointService } from './agentHostCheckpointService.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostDiscardChangesOperationContribution } from './agentHostDiscardChangesOperationProvider.js';
import { AgentHostDebugLogsCollector } from './agentHostDebugLogs.js';
import { AgentHostDatabase } from './agentHostDatabase.js';
import { AgentHostFileCompletionProvider } from './agentHostFileCompletionProvider.js';
import { AgentHostGitStateService } from './agentHostGitStateService.js';
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostMergeOperationContribution } from './agentHostMergeOperationProvider.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from './agentHostPromptCache.js';
import { AgentHostProviderLocator, IAgentHostProviderLocator } from './agentHostProviderLocator.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostReviewService } from './agentHostReviewService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from './agentHostSessionTitleSignal.js';
import { AgentHostSessionTitleController, IAgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostStorageService, IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from './agentHostTurnTracker.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { AgentMergeController } from './agentMergeController.js';
import { AgentMergeTools } from './agentMergeTools.js';
import { AgentService, type IAgentServiceCore, type IAgentServiceOptions } from './agentService.js';
import { AgentSessionRegistry } from './agentSessionRegistry.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { registerBuiltInChatContributions } from './chatContributions/builtInChatContributions.js';
import { CodexCompactCompletionProvider } from './codexCompactCommand.js';
import { SessionCoordinationService } from './sessionCoordination.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from './localCommands/localChatCommand.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from './shared/worktreeIsolation.js';
import { hostBuildInfoFromProduct } from '../common/state/sessionState.js';

/** Constructs, registers, and initializes the complete {@link AgentService} collaborator graph. */
export function createAgentService(
	options: IAgentServiceOptions,
	services: ServiceCollection,
	instantiationService: IInstantiationService,
	fetchFn: typeof globalThis.fetch,
	logService: ILogService,
	productService: IProductService,
	additionalDisposables: readonly IDisposable[] = [],
	bindWorktreeIsolation = true,
): AgentService {
	const owned = new DisposableStore();
	let agentService: AgentService | undefined;
	try {
		for (const disposable of additionalDisposables) {
			owned.add(disposable);
		}
		const databasePath = options.rootConfigResource
			? joinPath(dirname(options.rootConfigResource), 'agent-host.db').fsPath
			: ':memory:';
		const orchestratorDatabase = owned.add(options.orchestratorDatabase ?? new AgentHostDatabase(databasePath));
		const debugLogsCollector = options.debugLogsEnvironment
			? owned.add(new AgentHostDebugLogsCollector(options.debugLogsEnvironment, logService))
			: undefined;
		const sessionRegistry = owned.add(new AgentSessionRegistry(orchestratorDatabase));
		const stateManager = owned.add(new AgentHostStateManager(logService, {
			hostBuildInfo: hostBuildInfoFromProduct(productService),
			changesetStateRetention: {
				canEvict: changeset => agentService?.canEvictChangeset(changeset) ?? false,
			},
		}));
		const configurationService = owned.add(new AgentConfigurationService(
			stateManager,
			logService,
			options.rootConfigResource,
			options.providerConfigurations ?? [],
		));
		const storageService = owned.add(new AgentHostStorageService(options.storageResource, logService));
		const managedSettingsService = owned.add(new AgentHostManagedSettingsService());
		const core: IAgentServiceCore = {
			disposables: owned,
			authenticationService: owned.add(new AgentHostAuthenticationService(logService)),
			orchestratorDatabase,
			debugLogsCollector,
			sessionRegistry,
			stateManager,
			configurationService,
			storageService,
			managedSettingsService,
			hostLaunchKind: options.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
			copilotApiServiceOverride: options.copilotApiService,
		};
		const chatContributions = owned.add(instantiationService.createInstance(AgentHostChatContributions));
		services.set(IAgentHostChatContributions, chatContributions);
		agentService = instantiationService.createInstance(AgentService, core);
		const context = agentService.getCompositionContext();
		services.set(IAgentService, agentService);
		services.set(IAgentHostAuthenticationService, core.authenticationService);
		services.set(IAgentConfigurationService, context.configurationService);
		services.set(IAgentHostStateManager, context.stateManager);
		services.set(IAgentHostStorageService, context.storageService);
		services.set(IAgentHostManagedSettingsService, context.managedSettingsService);

		const gitHubEndpointService = owned.add(instantiationService.createInstance(AgentHostGitHubEndpointService));
		services.set(IAgentHostGitHubEndpointService, gitHubEndpointService);
		const octoKitService = instantiationService.createInstance(AgentHostOctoKitService, fetchFn);
		services.set(IAgentHostOctoKitService, octoKitService);
		const gitHubService = owned.add(instantiationService.createInstance(GitHubService, {
			endpoint: gitHubEndpointService,
			tokenProvider: {
				getToken: () => {
					const resource = gitHubEndpointService.getRepoResource();
					return context.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
				},
			},
			fetch: fetchFn,
		}));
		services.set(IGitHubService, gitHubService);
		const copilotApiService = context.copilotApiServiceOverride ?? instantiationService.createInstance(CopilotApiService, fetchFn);
		services.set(ICopilotApiService, copilotApiService);
		const worktreeIsolation = owned.add(instantiationService.createInstance(WorktreeIsolation, undefined));
		services.set(IAgentHostWorktreeIsolation, worktreeIsolation);
		const sessionTitleController = owned.add(instantiationService.createInstance(AgentHostSessionTitleController, context.stateManager, {
			sessionDataService: context.sessionDataService,
			getGitHubCopilotToken: () => {
				const resource = gitHubEndpointService.getCopilotResource();
				return context.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
			},
			getGitHubToken: () => {
				const resource = gitHubEndpointService.getRepoResource();
				return context.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
			},
			getGitHubHost: () => gitHubEndpointService.getEnterpriseHost() ?? 'github.com',
			octoKitService,
			copilotApiService,
			isActiveAgentTitleGenerationEnabled: () => context.configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true,
		}));
		services.set(IAgentHostSessionTitleController, sessionTitleController);
		services.set(IAgentHostProviderLocator, new AgentHostProviderLocator(context.getAgentForSession));
		const telemetryReporter = instantiationService.createInstance(AgentHostTelemetryReporter);
		services.set(IAgentHostTelemetryReporter, telemetryReporter);
		const turnTracker = owned.add(instantiationService.createInstance(AgentHostTurnTracker));
		services.set(IAgentHostTurnTracker, turnTracker);
		const customizationEnablementService = owned.add(instantiationService.createInstance(AgentHostCustomizationEnablementService));
		services.set(IAgentHostCustomizationEnablementService, customizationEnablementService);
		const gitStateService = owned.add(instantiationService.createInstance(AgentHostGitStateService));
		services.set(IAgentHostGitStateService, gitStateService);
		const agentMergeController = owned.add(instantiationService.createInstance(AgentMergeController, context.createAgentMergeControllerOptions()));
		const checkpointService = owned.add(instantiationService.createInstance(AgentHostCheckpointService));
		services.set(IAgentHostCheckpointService, checkpointService);
		const promptCache = instantiationService.createInstance(AgentHostPromptCache);
		services.set(IAgentHostPromptCache, promptCache);
		const sessionTitleSignal = owned.add(instantiationService.createInstance(AgentHostSessionTitleSignal));
		services.set(IAgentHostSessionTitleSignal, sessionTitleSignal);
		const changesetSubscriptions = instantiationService.createInstance(AgentHostChangesetSubscriptionService);
		services.set(IAgentHostChangesetSubscriptionService, changesetSubscriptions);
		const changesetOperationService = owned.add(instantiationService.createInstance(AgentHostChangesetOperationService));
		services.set(IAgentHostChangesetOperationService, changesetOperationService);
		const reviewService = owned.add(instantiationService.createInstance(AgentHostReviewService));
		services.set(IAgentHostReviewService, reviewService);
		const changesets = owned.add(instantiationService.createInstance(AgentHostChangesetService));
		services.set(IAgentHostChangesetService, changesets);
		const changesetCoordinator = owned.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
		owned.add(context.stateManager.onDidChangeSessionActiveTurn(event => changesetCoordinator.onSessionTurnActiveChanged(event.session, event.active)));
		const terminalManager = owned.add(instantiationService.createInstance(AgentHostTerminalManager));
		services.set(IAgentHostTerminalManager, terminalManager);
		const localTurns = new AgentHostLocalTurns(context.sessionDataService, logService);
		const localCommands = owned.add(instantiationService.createInstance(AgentHostLocalCommands, localTurns));
		services.set(IAgentHostLocalCommands, localCommands);
		owned.add(registerBuiltInChatContributions(chatContributions));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostMergeOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));

		const completions = owned.add(instantiationService.createInstance(AgentHostCompletions));
		services.set(IAgentHostCompletions, completions);
		const workspaceFiles = owned.add(instantiationService.createInstance(AgentHostWorkspaceFiles));
		owned.add(completions.registerProvider(new AgentHostFileCompletionProvider(context.stateManager, workspaceFiles, logService)));
		owned.add(completions.registerProvider(new AgentHostChatCompletionProvider(context.stateManager)));
		owned.add(completions.registerProvider(new AgentHostRenameCompletionProvider(
			session => (context.stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));
		owned.add(completions.registerProvider(new CodexCompactCompletionProvider(
			session => (context.stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));

		const sideEffects = owned.add(instantiationService.createInstance(
			AgentSideEffects,
			context.stateManager,
			customizationEnablementService,
			context.createSideEffectsOptions({ localTurns }),
		));
		const sessionCoordination = owned.add(new SessionCoordinationService(
			context.stateManager,
			context.sessionDataService,
			logService,
			{
				getSessionMetadata: context.getSessionMetadata,
				restoreSession: context.restoreSession,
				handleAction: (chat, action) => sideEffects.handleAction(chat, action),
			},
		));
		const agentMergeTools = instantiationService.createInstance(
			AgentMergeTools,
			() => agentMergeController.isEnabled(),
			session => agentMergeController.getTurnContext(session),
		);
		const serverToolHost = new AgentServerToolHost(
			context.stateManager,
			buildServerToolGroups(context.createSessionServerToolAccessor(), agentMergeTools, context.createArtifactServerToolAccessor()),
		);

		agentService.initialize({
			gitHubEndpointService,
			customizationEnablementService,
			gitStateService,
			agentMergeController,
			checkpointService,
			promptCache,
			sessionTitleSignal,
			changesetOperationService,
			reviewService,
			changesets,
			changesetCoordinator,
			completions,
			terminalManager,
			localTurns,
			sideEffects,
			sessionCoordination,
			serverToolHost,
		});
		if (bindWorktreeIsolation) {
			agentService.setWorktreeIsolation(worktreeIsolation);
		}
		return agentService;
	} catch (error) {
		if (agentService) {
			agentService.dispose();
		} else {
			owned.dispose();
		}
		throw error;
	}
}
