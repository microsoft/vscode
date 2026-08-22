/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../base/common/event.js';
import { DisposableStore, type IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IInstantiationService, ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import type { IAgent } from '../common/agent.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService, supportsCustomizationEnablementWorktreeBinding } from './agentHostCustomizationEnablementService.js';
import { AgentHostDebugLogsCollector } from './agentHostDebugLogs.js';
import { AgentHostDatabase } from './agentHostDatabase.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentMergeController } from './agentMergeController.js';
import { AgentMergeTools } from './agentMergeTools.js';
import { AgentService, type IAgentServiceCollaborators, type IAgentServiceCore, type IAgentServiceOptions } from './agentService.js';
import { AgentSessionRegistry } from './agentSessionRegistry.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { SessionCoordinationService } from './sessionCoordination.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { type IAgentServiceFoundation } from './agentServiceFoundation.js';
import { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { ICopilotApiService } from './shared/copilotApiService.js';

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
	setContributions(contributions: IDisposable): void;
}

/**
 * Constructs and registers the shared, synchronous session-orchestration graph.
 *
 * A service belongs here when every Agent Host entry point uses the same
 * implementation, its dependencies are already registered, and construction
 * does not start process-level behavior. Services requiring runtime options,
 * async initialization, or an entry-point-selected implementation belong in
 * `agentHostBootstrap.ts`; transports, providers, schedulers, and process
 * listeners belong in the activating entry point.
 */
export function createAgentServiceComposition(
	options: IAgentServiceOptions,
	accessor: ServicesAccessor,
	instantiationService: IInstantiationService,
	logService: ILogService,
	sessionDataService: ISessionDataService,
	foundation: IAgentServiceFoundation,
	additionalDisposables: readonly IDisposable[] = [],
): IAgentServiceComposition {
	const owned = new DisposableStore();
	const contributions = owned.add(new MutableDisposable<IDisposable>());
	let agentService: AgentService | undefined;
	try {
		const databasePath = options.rootConfigResource
			? joinPath(dirname(options.rootConfigResource), 'agent-host.db').fsPath
			: ':memory:';
		const orchestratorDatabase = owned.add(options.orchestratorDatabase ?? new AgentHostDatabase(databasePath));
		const debugLogsCollector = options.debugLogsEnvironment
			? owned.add(new AgentHostDebugLogsCollector(options.debugLogsEnvironment, logService))
			: undefined;
		const { callbackAdapter, agents, stateManager, configurationService, authenticationService, gitHubEndpointService } = foundation;
		const sessionRegistry = owned.add(new AgentSessionRegistry(orchestratorDatabase));
		const core: IAgentServiceCore = {
			disposables: owned,
			authenticationService,
			orchestratorDatabase,
			debugLogsCollector,
			sessionRegistry,
			stateManager,
			configurationService,
			agents,
			callbackBinder: callbackAdapter,
		};
		// AgentService subscribes after this graph is complete, so collaborator constructors must not emit state-manager events.
		const octoKitService = accessor.get(IAgentHostOctoKitService);
		const copilotApiService = accessor.get(ICopilotApiService);
		const customizationEnablementService = accessor.get(IAgentHostCustomizationEnablementService);
		if (!supportsCustomizationEnablementWorktreeBinding(customizationEnablementService)) {
			throw new Error('AgentService requires customization enablement worktree binding support');
		}
		const gitStateService = accessor.get(IAgentHostGitStateService);
		const agentMergeController = owned.add(instantiationService.createInstance(AgentMergeController, {
			startTurn: (session, turnId, prompt) => callbackAdapter.value.startAgentMergeTurn(session, turnId, prompt),
			cancelTurn: (session, turnId) => callbackAdapter.value.cancelAgentMergeTurn(session, turnId),
			getAutonomousSessionConfig: (session, config) => callbackAdapter.value.getAutonomousSessionConfig(session, config),
		}));
		const checkpointService = accessor.get(IAgentHostCheckpointService);
		const changesetOperationService = accessor.get(IAgentHostChangesetOperationService);
		const reviewService = accessor.get(IAgentHostReviewService);
		const changesets = accessor.get(IAgentHostChangesetService);
		const changesetCoordinator = owned.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
		owned.add(stateManager.onDidChangeSessionActiveTurn(event => changesetCoordinator.onSessionTurnActiveChanged(event.session, event.active)));

		const completions = accessor.get(IAgentHostCompletions);

		const terminalManager = accessor.get(IAgentHostTerminalManager);
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
		for (const disposable of additionalDisposables) {
			owned.add(disposable);
		}
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
			setContributions: value => {
				if (contributions.value) {
					throw new Error('Agent Host contributions have already been set');
				}
				contributions.value = value;
			},
		};
	} catch (error) {
		if (agentService) {
			agentService.dispose();
		} else {
			owned.dispose();
			for (const disposable of additionalDisposables) {
				disposable.dispose();
			}
		}
		throw error;
	}
}
