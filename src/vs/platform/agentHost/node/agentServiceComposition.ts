/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../base/common/event.js';
import { DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
import { observableValue, type IObservable } from '../../../base/common/observable.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { GitHubService, IGitHubService } from '../../github/common/githubService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import type { IAgent } from '../common/agent.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostAutomationService, IAgentHostAutomationService, type IAgentHostAutomationExecution } from './agentHostAutomationService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { AgentHostChangesetOperationService } from './agentHostChangesetOperationService.js';
import { AgentHostChangesetService } from './agentHostChangesetService.js';
import { AgentHostChangesetSubscriptionService } from './agentHostChangesetSubscriptionService.js';
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
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostReviewService } from './agentHostReviewService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from './agentHostSessionTitleSignal.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostStorageService, IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { AgentMergeController } from './agentMergeController.js';
import { AgentMergeTools } from './agentMergeTools.js';
import { AgentService, type IAgentServiceCallbacks, type IAgentServiceCollaborators, type IAgentServiceCore, type IAgentServiceOptions } from './agentService.js';
import { AgentSessionRegistry } from './agentSessionRegistry.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { CodexCompactCompletionProvider } from './codexCompactCommand.js';
import { SessionCoordinationService } from './sessionCoordination.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import type { ISessionServerToolAccessor } from './shared/sessionServerTools.js';
import type { IArtifactServerToolAccessor } from './shared/artifactServerTools.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { hostBuildInfoFromProduct } from '../common/state/sessionState.js';

export interface IAgentServiceComposition {
	readonly agentService: AgentService;
	readonly authenticationService: IAgentHostAuthenticationService;
	readonly configurationService: IAgentConfigurationService;
	readonly stateManager: AgentHostStateManager;
	readonly customizationEnablementService: IAgentHostCustomizationEnablementService;
	readonly checkpointService: IAgentHostCheckpointService;
	readonly completions: IAgentHostCompletions;
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidStartTurn: Event<string>;
}

class AgentServiceCallbackAdapter {
	private callbacks: IAgentServiceCallbacks | undefined;

	readonly automationExecution: IAgentHostAutomationExecution = {
		isSessionTemplateAvailable: template => this.value.automationExecution.isSessionTemplateAvailable(template),
		createSession: (template, run) => this.value.automationExecution.createSession(template, run),
		startSession: (session, message) => this.value.automationExecution.startSession(session, message),
		cancelSession: session => this.value.automationExecution.cancelSession(session),
	};

	readonly sessionServerToolAccessor: ISessionServerToolAccessor = {
		isActiveAgentTitleGenerationEnabled: () => this.value.sessionServerToolAccessor.isActiveAgentTitleGenerationEnabled(),
		listSessions: () => this.value.sessionServerToolAccessor.listSessions(),
		getSession: session => this.value.sessionServerToolAccessor.getSession(session),
		createSession: config => this.value.sessionServerToolAccessor.createSession(config),
		getModels: () => this.value.sessionServerToolAccessor.getModels(),
		getCreationDefaults: source => this.value.sessionServerToolAccessor.getCreationDefaults(source),
		startPrompt: (session, chat, prompt) => this.value.sessionServerToolAccessor.startPrompt(session, chat, prompt),
		createChat: (session, chat, options) => this.value.sessionServerToolAccessor.createChat(session, chat, options),
		renameChat: (session, chat, title) => this.value.sessionServerToolAccessor.renameChat(session, chat, title),
		reportToolError: (toolName, error) => this.value.sessionServerToolAccessor.reportToolError(toolName, error),
		deleteSession: session => this.value.sessionServerToolAccessor.deleteSession(session),
		getChatContext: (session, chatId) => this.value.sessionServerToolAccessor.getChatContext(session, chatId),
		getSessionSpawnDepth: session => this.value.sessionServerToolAccessor.getSessionSpawnDepth(session),
		setSessionSpawnDepth: (session, depth) => this.value.sessionServerToolAccessor.setSessionSpawnDepth(session, depth),
		setSessionOrchestration: (session, orchestration) => this.value.sessionServerToolAccessor.setSessionOrchestration(session, orchestration),
	};

	readonly artifactServerToolAccessor: IArtifactServerToolAccessor = {
		isEnabled: () => this.value.artifactServerToolAccessor.isEnabled(),
		persist: (session, artifacts) => this.value.artifactServerToolAccessor.persist(session, artifacts),
	};

	bind(callbacks: IAgentServiceCallbacks): void {
		if (this.callbacks) {
			throw new Error('AgentService callbacks have already been bound');
		}
		this.callbacks = callbacks;
	}

	canEvictChangeset(changeset: string): boolean {
		return this.callbacks?.canEvictChangeset(changeset) ?? false;
	}

	get value(): IAgentServiceCallbacks {
		if (!this.callbacks) {
			throw new Error('AgentService callbacks have not been bound');
		}
		return this.callbacks;
	}
}

/** Constructs and registers the complete {@link AgentService} collaborator graph. */
export function createAgentServiceComposition(
	options: IAgentServiceOptions,
	services: ServiceCollection,
	instantiationService: IInstantiationService,
	fetchFn: typeof globalThis.fetch,
	logService: ILogService,
	productService: IProductService,
	sessionDataService: ISessionDataService,
	additionalDisposables: readonly IDisposable[] = [],
): IAgentServiceComposition {
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
		const callbackAdapter = new AgentServiceCallbackAdapter();
		const agents = observableValue<readonly IAgent[]>(callbackAdapter, []);
		const sessionRegistry = owned.add(new AgentSessionRegistry(orchestratorDatabase));
		const stateManager = owned.add(new AgentHostStateManager(logService, {
			hostBuildInfo: hostBuildInfoFromProduct(productService),
			changesetStateRetention: {
				canEvict: changeset => callbackAdapter.canEvictChangeset(changeset),
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
			agents,
			callbackBinder: callbackAdapter,
		};
		services.set(IAgentHostAuthenticationService, core.authenticationService);
		services.set(IAgentConfigurationService, configurationService);
		services.set(IAgentHostStateManager, stateManager);
		services.set(IAgentHostStorageService, storageService);
		services.set(IAgentHostManagedSettingsService, managedSettingsService);

		// AgentService subscribes after this graph is complete, so collaborator constructors must not emit state-manager events.
		const gitHubEndpointService = owned.add(instantiationService.createInstance(AgentHostGitHubEndpointService));
		services.set(IAgentHostGitHubEndpointService, gitHubEndpointService);
		const octoKitService = instantiationService.createInstance(AgentHostOctoKitService, fetchFn);
		services.set(IAgentHostOctoKitService, octoKitService);
		const gitHubService = owned.add(instantiationService.createInstance(GitHubService, {
			endpoint: gitHubEndpointService,
			tokenProvider: {
				getToken: () => {
					const resource = gitHubEndpointService.getRepoResource();
					return core.authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
				},
			},
			fetch: fetchFn,
		}));
		services.set(IGitHubService, gitHubService);
		const copilotApiService = options.copilotApiService ?? instantiationService.createInstance(CopilotApiService, fetchFn);
		services.set(ICopilotApiService, copilotApiService);
		const customizationEnablementService = owned.add(instantiationService.createInstance(AgentHostCustomizationEnablementService));
		services.set(IAgentHostCustomizationEnablementService, customizationEnablementService);
		const gitStateService = owned.add(instantiationService.createInstance(AgentHostGitStateService));
		services.set(IAgentHostGitStateService, gitStateService);
		const agentMergeController = owned.add(instantiationService.createInstance(AgentMergeController, {
			startTurn: (session, turnId, prompt) => callbackAdapter.value.startAgentMergeTurn(session, turnId, prompt),
			cancelTurn: (session, turnId) => callbackAdapter.value.cancelAgentMergeTurn(session, turnId),
			getAutonomousSessionConfig: (session, config) => callbackAdapter.value.getAutonomousSessionConfig(session, config),
		}));
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
		owned.add(stateManager.onDidChangeSessionActiveTurn(event => changesetCoordinator.onSessionTurnActiveChanged(event.session, event.active)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostMergeOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
		owned.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));

		const completions = owned.add(instantiationService.createInstance(AgentHostCompletions));
		services.set(IAgentHostCompletions, completions);
		const workspaceFiles = owned.add(instantiationService.createInstance(AgentHostWorkspaceFiles));
		owned.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles, logService)));
		owned.add(completions.registerProvider(new AgentHostChatCompletionProvider(stateManager)));
		owned.add(completions.registerProvider(new AgentHostRenameCompletionProvider(
			session => (stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));
		owned.add(completions.registerProvider(new CodexCompactCompletionProvider(
			session => (stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));

		const terminalManager = owned.add(instantiationService.createInstance(AgentHostTerminalManager));
		services.set(IAgentHostTerminalManager, terminalManager);
		const localTurns = new AgentHostLocalTurns(sessionDataService, logService);
		const sideEffects = owned.add(instantiationService.createInstance(
			AgentSideEffects,
			stateManager,
			customizationEnablementService,
			{
				getAgent: session => callbackAdapter.value.getAgent(session),
				sessionDataService,
				localTurns,
				agents,
				hostLaunchKind: options.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
				copilotApiService,
				getGitHubCopilotToken: () => {
					const resource = gitHubEndpointService.getCopilotResource();
					return core.authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
				},
				getGitHubToken: () => {
					const resource = gitHubEndpointService.getRepoResource();
					return core.authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
				},
				getGitHubHost: () => gitHubEndpointService.getEnterpriseHost() ?? 'github.com',
				octoKitService,
				resolveWorkingDirectoryBeforeSend: params => callbackAdapter.value.resolveWorkingDirectoryBeforeSend(params),
				resolveChatAttachmentTurns: resource => callbackAdapter.value.resolveChatAttachmentTurns(resource),
				onTurnComplete: session => {
					const workingDirStr = stateManager.getSessionState(session)?.workingDirectories?.[0];
					void gitStateService.attachSessionGitHubPullRequest(session, workingDirStr ? URI.parse(workingDirStr) : undefined);
				},
				onUserMessage: (session, text) => {
					void gitStateService.attachSessionGitHubReferences(session.toString(), text);
				},
			},
		));
		const sessionCoordination = owned.add(new SessionCoordinationService(
			stateManager,
			sessionDataService,
			logService,
			{
				getSessionMetadata: session => callbackAdapter.value.getSessionMetadata(session),
				restoreSession: session => callbackAdapter.value.restoreSession(session),
				handleAction: (chat, action) => sideEffects.handleAction(chat, action),
			},
		));
		const agentMergeTools = instantiationService.createInstance(
			AgentMergeTools,
			() => agentMergeController.isEnabled(),
			session => agentMergeController.getTurnContext(session),
		);
		const serverToolHost = new AgentServerToolHost(
			stateManager,
			buildServerToolGroups(callbackAdapter.sessionServerToolAccessor, agentMergeTools, callbackAdapter.artifactServerToolAccessor),
		);

		const collaborators: IAgentServiceCollaborators = {
			gitHubEndpointService,
			customizationEnablementService,
			gitStateService,
			agentMergeController,
			checkpointService,
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
		};
		agentService = instantiationService.createInstance(AgentService, core, collaborators);
		const automationService = owned.add(instantiationService.createInstance(AgentHostAutomationService, callbackAdapter.automationExecution));
		services.set(IAgentHostAutomationService, automationService);
		agentService.setAutomationService(automationService);
		return {
			agentService,
			authenticationService: core.authenticationService,
			configurationService,
			stateManager,
			customizationEnablementService,
			checkpointService,
			completions,
			agents,
			onDidStartTurn: sideEffects.onDidStartTurn,
		};
	} catch (error) {
		if (agentService) {
			agentService.dispose();
		} else {
			owned.dispose();
		}
		throw error;
	}
}
