/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../base/common/event.js';
import { DisposableStore, type IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
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
import { AgentHostAutomationService } from './agentHostAutomationService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
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
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { type IAgentServiceFoundation } from './agentServiceFoundation.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';

export interface IAgentServiceComposition {
	readonly agentService: AgentService;
	readonly authenticationService: IAgentHostAuthenticationService;
	readonly configurationService: IAgentConfigurationService;
	readonly stateManager: AgentHostStateManager;
	readonly customizationEnablementService: IAgentHostCustomizationEnablementService;
	readonly checkpointService: IAgentHostCheckpointService;
	readonly completions: IAgentHostCompletions;
	readonly providerService: IAgentHostProviderService;
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
	localTurns: AgentHostLocalTurns,
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
		const { callbackAdapter, stateManager, configurationService, authenticationService, gitHubEndpointService } = foundation;
		const providerService = accessor.get(IAgentHostProviderService);
		const sessionRegistry = owned.add(new AgentSessionRegistry(orchestratorDatabase));
		const core: IAgentServiceCore = {
			disposables: owned,
			authenticationService,
			orchestratorDatabase,
			debugLogsCollector,
			sessionRegistry,
			stateManager,
			configurationService,
			callbackBinder: callbackAdapter,
		};
		// AgentService subscribes after this graph is complete, so collaborator constructors must not emit state-manager events.
		const customizationEnablementService = accessor.get(IAgentHostCustomizationEnablementService);
		const gitStateService = accessor.get(IAgentHostGitStateService);
		const agentMergeController = owned.add(instantiationService.createInstance(AgentMergeController, {
			startTurn: (session, turnId, prompt) => callbackAdapter.value.startAgentMergeTurn(session, turnId, prompt),
			cancelTurn: (session, turnId) => callbackAdapter.value.cancelAgentMergeTurn(session, turnId),
			postNotice: (session, kind, content) => callbackAdapter.value.postAgentMergeNotice(session, kind, content),
			getAutonomousSessionConfig: (session, config) => callbackAdapter.value.getAutonomousSessionConfig(session, config),
		}));
		// Resolve this even before first use so its session-data deletion listener
		// always removes checkpoint refs before the database disappears.
		const checkpointService = accessor.get(IAgentHostCheckpointService);
		const changesetOperationService = accessor.get(IAgentHostChangesetOperationService);
		// Resolve this even before first use so its session-data deletion listener
		// always removes reviewed refs before the database disappears.
		const reviewService = accessor.get(IAgentHostReviewService);
		const changesets = accessor.get(IAgentHostChangesetService);
		const changesetCoordinator = owned.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
		owned.add(stateManager.onDidChangeSessionActiveTurn(event => changesetCoordinator.onSessionTurnActiveChanged(event.session, event.active)));

		const completions = accessor.get(IAgentHostCompletions);

		const terminalManager = accessor.get(IAgentHostTerminalManager);
		const sideEffects = owned.add(instantiationService.createInstance(
			AgentSideEffects,
			stateManager,
			customizationEnablementService,
			{
				getAgent: session => providerService.getProviderForSession(session),
				sessionDataService,
				localTurns,
				agents: providerService.agents,
				hostLaunchKind: options.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
				resolveWorkingDirectoryBeforeSend: params => callbackAdapter.value.resolveWorkingDirectoryBeforeSend(params),
				resolveChatAttachmentTurns: resource => callbackAdapter.value.resolveChatAttachmentTurns(resource),
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

		const automationService = owned.add(instantiationService.createInstance(AgentHostAutomationService, callbackAdapter.automationExecution));
		const collaborators: IAgentServiceCollaborators = {
			gitHubEndpointService,
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
			serverToolHost,
			automationService,
		};
		agentService = instantiationService.createInstance(AgentService, core, collaborators, options);
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
			providerService,
			agents: providerService.agents,
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
