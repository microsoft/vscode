/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { DisposableMap, DisposableStore, type IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { TimeoutTimer } from '../../../base/common/async.js';
import type { IObservable } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { IInstantiationService, ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { AgentHostAgentOrchestrationLimitsConfigKey, platformRootSchema, AgentHostArtifactIntegrationsConfigKey } from '../common/agentHostSchema.js';
import { AH_META_AUTO_ARCHIVED_AT_DB_KEY, ResponsePartKind } from '../common/state/sessionState.js';
import { CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, type AgentProvider, type IAgent } from '../common/agent.js';
import { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import { toAgentSystemNotificationMeta } from '../common/meta/agentSystemNotificationMeta.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostDebugLogsCollector } from './agentHostDebugLogs.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostSavedChatService, type IAgentHostSavedChatReader } from './agentHostSavedChatService.js';
import { AgentHostWorktreeCoOwnership } from './agentHostWorktreeCoOwnership.js';
import { ClaudeSavedChatReader } from './claude/claudeSavedChatReader.js';
import { CodexSavedChatReader } from './codex/codexSavedChatReader.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from './localCommands/localChatCommand.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { AgentService, type IAgentServiceCollaborators, type IAgentServiceCore, type IAgentServiceOptions } from './agentService.js';
import { IAgentSessionRegistry } from './agentSessionRegistry.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentMergeController } from './agentMergeController.js';
import { URI } from '../../../base/common/uri.js';
import { AgentMergeTools } from './agentMergeTools.js';
import { AgentServerToolHost, IAgentHostServerToolService } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';
import type { ISessionServerToolAccessor } from './shared/sessionServerTools.js';
import { type IAgentServiceFoundation } from './agentServiceFoundation.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { ISessionWorkspaceConversionService, SessionWorkspaceConversionService } from './chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import { AgentHostScheduledChatMoves, IAgentHostScheduledChatMoves } from './chatContributions/scheduledChatMoves/scheduledChatMovesService.js';
import { ChatMoveConfigKey, chatMoveRootConfigSchema } from '../common/agentHostChatMove.js';
import { IAgentHostArchivedChatWorkspaceService } from './chatContributions/chatArchive/archivedChatWorkspaceService.js';
import { IAgentHostTurnTracker } from './agentHostTurnTracker.js';
import { AgentHostSessionLifecycle, type IAgentHostSessionLifecycleAccessor } from './agentHostSessionLifecycle.js';
import { persistSessionMetadataValues } from './shared/persistSessionMetadata.js';
import { IAgentHostPullRequestStatusService } from './agentHostPullRequestStatusService.js';
import { AgentHostPeerChatStore, IAgentHostPeerChatPersistenceService } from './agentHostPeerChatStore.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import { IArtifactIntegrationRegistry } from '../../artifactIntegrations/common/artifactIntegrationRegistry.js';
import type { IArtifactIntegrationAccess } from '../../artifactIntegrations/common/artifactIntegration.js';
import { AgentHostArtifactRuntime, IAgentHostArtifactEventService } from './artifactIntegrations/agentHostArtifactRuntime.js';
import { acquireComposedArtifact, IAgentHostArtifactIntegrationDirectory } from './artifactIntegrations/agentHostArtifactIntegrationDirectory.js';
import { getEnabledArtifactAutomation } from './shared/artifactIntegrationServerTools.js';
import { getArtifactTurnSource } from './shared/artifactTurnProvenance.js';

export interface IAgentServiceComposition {
	readonly artifactRuntime: AgentHostArtifactRuntime;
	readonly agentService: AgentService;
	readonly authenticationService: IAgentHostAuthenticationService;
	readonly configurationService: IAgentConfigurationService;
	readonly stateManager: AgentHostStateManager;
	readonly chatOwnership: IAgentHostChatOwnershipService;
	readonly customizationEnablementService: IAgentHostCustomizationEnablementService;
	readonly checkpointService: IAgentHostCheckpointService;
	readonly completions: IAgentHostCompletions;
	readonly providerService: IAgentHostProviderService;
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidStartTurn: Event<string>;
	setContributions(contributions: IDisposable): void;
}

/**
 * The session lifecycle's view of the agent service and the session state store. It receives services already
 * resolved: the lifecycle calls it long after the composing invocation returned, when a service accessor is invalid.
 */
export function createSessionLifecycleAccessor(
	agentService: () => Pick<AgentService, 'listSessionLifecycleCandidates' | 'restoreSession' | 'archiveSession' | 'canAutomaticallyDeleteArchivedSession' | 'disposeSessionIf'>,
	sessionStateStore: IAgentHostSessionStateStore,
): IAgentHostSessionLifecycleAccessor {
	return {
		listCandidates: (archiveCutoff, deleteCutoff) => agentService().listSessionLifecycleCandidates(archiveCutoff, deleteCutoff),
		restoreSession: session => agentService().restoreSession(session),
		getAutoArchivedAt: async session => {
			// A sweep must not import the sessions it visits.
			const value = (await sessionStateStore.readWithoutImport(session, [AH_META_AUTO_ARCHIVED_AT_DB_KEY])).get(AH_META_AUTO_ARCHIVED_AT_DB_KEY);
			const timestamp = value ? Number(value) : Number.NaN;
			return Number.isFinite(timestamp) ? timestamp : undefined;
		},
		setAutoArchivedAt: (session, timestamp) => persistSessionMetadataValues(sessionStateStore, session.toString(), {
			[AH_META_AUTO_ARCHIVED_AT_DB_KEY]: String(timestamp),
		}),
		archiveSession: session => agentService().archiveSession(session),
		canDeleteSession: session => agentService().canAutomaticallyDeleteArchivedSession(session),
		deleteSession: (session, validate, canCommit) => agentService().disposeSessionIf(session, validate, canCommit),
	};
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
	services: ServiceCollection,
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
		if (options.orchestratorDatabase) {
			owned.add(options.orchestratorDatabase);
		}
		const orchestratorDatabase = accessor.get(IAgentHostDatabase);
		const chatOwnership = accessor.get(IAgentHostChatOwnershipService);
		const sessionStateStore = accessor.get(IAgentHostSessionStateStore);
		const worktreeCoOwnership = new AgentHostWorktreeCoOwnership(orchestratorDatabase, sessionStateStore, accessor.get(IAgentHostWorktreeIsolation), logService);
		const peerChatStore = owned.add(new AgentHostPeerChatStore(orchestratorDatabase, sessionDataService, logService, chatOwnership, sessionStateStore, worktreeCoOwnership));
		services.set(IAgentHostPeerChatPersistenceService, peerChatStore);
		services.set(IAgentHostLocalCommands, owned.add(instantiationService.createInstance(AgentHostLocalCommands)));
		const debugLogsCollector = options.debugLogsEnvironment
			? owned.add(new AgentHostDebugLogsCollector(options.debugLogsEnvironment, logService))
			: undefined;
		const { callbackAdapter, stateManager, configurationService, authenticationService, gitHubEndpointService } = foundation;
		const providerService = accessor.get(IAgentHostProviderService);
		const sessionRegistry = accessor.get(IAgentSessionRegistry);
		const core: IAgentServiceCore = {
			disposables: owned,
			authenticationService,
			orchestratorDatabase,
			savedChats: new AgentHostSavedChatService(new Map<AgentProvider, IAgentHostSavedChatReader>([
				[CLAUDE_AGENT_PROVIDER_ID, instantiationService.createInstance(ClaudeSavedChatReader)],
				[CODEX_AGENT_PROVIDER_ID, instantiationService.createInstance(CodexSavedChatReader)],
			]), orchestratorDatabase, sessionDataService, sessionStateStore, logService),
			peerChatStore,
			worktreeCoOwnership,
			debugLogsCollector,
			sessionRegistry,
			stateManager,
			configurationService,
			callbackBinder: callbackAdapter,
		};
		// Composition-owned collaborators are constructed before AgentService subscribes, so their constructors must not emit state-manager events.
		const customizationEnablementService = accessor.get(IAgentHostCustomizationEnablementService);
		const gitStateService = accessor.get(IAgentHostGitStateService);
		const agentMergeController = owned.add(instantiationService.createInstance(AgentMergeController, {
			startTurn: (session, turnId, prompt, credentials) => callbackAdapter.value.startAgentMergeTurn(session, turnId, prompt, credentials),
			cancelTurn: (session, turnId) => callbackAdapter.value.cancelAgentMergeTurn(session, turnId),
			postNotice: (chat, kind, content) => callbackAdapter.value.postChatNotice(chat, { kind: ResponsePartKind.SystemNotification, content, _meta: toAgentSystemNotificationMeta({ kind }) }),
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
		const agentMergeTools = owned.add(instantiationService.createInstance(
			AgentMergeTools,
			() => agentMergeController.isEnabled(),
			chat => agentMergeController.getTurnContext(chat),
			(chat, enabled, overrides) => agentMergeController.setEnabled(chat, enabled, overrides, callbackAdapter.sessionServerToolAccessor.getCredentialSource(URI.parse(chat))),
		));
		const turnTracker = accessor.get(IAgentHostTurnTracker);
		const artifactIntegrationDirectory = accessor.get(IAgentHostArtifactIntegrationDirectory);
		// The artifact runtime is created after the server-tool host, so its tools bind it late.
		const hostArtifactIntegrations: { value: IArtifactIntegrationAccess | undefined } = { value: undefined };
		const isArtifactIntegrationsEnabled = () => configurationService.getRootValue(platformRootSchema, AgentHostArtifactIntegrationsConfigKey) === true;
		const acquireIntegratedArtifact = (session: string, artifactId: string, chat: string, _turnId: string | undefined) => {
			if (!hostArtifactIntegrations.value || !isArtifactIntegrationsEnabled()) {
				throw new Error('Artifact integrations are unavailable in this host.');
			}
			// Follow delegation to the turn the work acts for, so a delegated turn uses the window that started it.
			const source = getArtifactTurnSource(stateManager, chat);
			const initiator = source.chat && source.turnId ? turnTracker.getInitiatorClientId(source.chat, source.turnId) : undefined;
			const client = artifactIntegrationDirectory.getClient(initiator);
			return acquireComposedArtifact(hostArtifactIntegrations.value, client && { access: client.integrations.access, startedTurn: client.startedTurn }, session, artifactId, logService);
		};
		const workspaceConversionService: { value: ISessionWorkspaceConversionService | undefined } = { value: undefined };
		const scheduledChatMoves = owned.add(instantiationService.createInstance(AgentHostScheduledChatMoves, {
			applyChatMove: move => callbackAdapter.sessionServerToolAccessor.applyChatMove(move),
		}));
		services.set(IAgentHostScheduledChatMoves, scheduledChatMoves);
		const sessionServerToolAccessor: ISessionServerToolAccessor = {
			...callbackAdapter.sessionServerToolAccessor,
			getChatOwner: chat => chatOwnership.getChatOwner(chat),
			getDefaultChat: session => chatOwnership.getDefaultChat(session),
			scheduleChatMove: (chat, turnId, move) => scheduledChatMoves.schedule(chat, turnId, move),
			requestSessionWorkspaceUpdate: (chat, turnId, workspaceFolder, isolation, credentials) => {
				const initiatingClientId = turnTracker.getInitiatorClientId(chat.toString(), turnId);
				if (!workspaceConversionService.value) {
					throw new Error('Session workspace conversion is unavailable.');
				}
				return workspaceConversionService.value.requestSessionWorkspaceUpdate(chat, turnId, workspaceFolder, isolation, initiatingClientId, credentials);
			},
		};
		const serverToolHost = new AgentServerToolHost(
			stateManager,
			buildServerToolGroups(
				sessionServerToolAccessor,
				agentMergeTools,
				{
					...callbackAdapter.artifactServerToolAccessor,
					getEnabledAutomation: async (session, artifactId, chat, turnId) => {
						if (!isArtifactIntegrationsEnabled()) {
							return [];
						}
						const reference = await acquireIntegratedArtifact(session, artifactId, chat, turnId);
						try {
							return getEnabledArtifactAutomation(reference.object.model);
						} finally {
							reference.dispose();
						}
					},
				},
				() => configurationService.getRootValue(platformRootSchema, AgentHostAgentOrchestrationLimitsConfigKey) !== 'off',
				{
					supportsChatIsolation: session => workspaceConversionService.value?.supportsChatIsolation(session) === true,
					requestChatIsolation: (chat, turnId) => {
						const initiatingClientId = turnTracker.getInitiatorClientId(chat.toString(), turnId);
						if (!workspaceConversionService.value) {
							throw new Error(localize('agentHost.chatIsolationClientRequired', "Moving a chat to a worktree with this tool requires a turn initiated by a connected client."));
						}
						workspaceConversionService.value.requestChatIsolation(chat, turnId, initiatingClientId);
					},
				},
				{
					isEnabled: () => isArtifactIntegrationsEnabled() && !!hostArtifactIntegrations.value,
					getIntegrations: () => artifactIntegrationDirectory.integrations.get(),
					acquireArtifact: acquireIntegratedArtifact,
				},
			),
		);
		services.set(IAgentHostServerToolService, serverToolHost);
		let chatMovesEnabled = configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true;
		let artifactIntegrationsEnabled = isArtifactIntegrationsEnabled();
		owned.add(configurationService.onDidRootConfigChange(() => {
			const enabled = configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true;
			const integrationsEnabled = isArtifactIntegrationsEnabled();
			if (enabled !== chatMovesEnabled || integrationsEnabled !== artifactIntegrationsEnabled) {
				chatMovesEnabled = enabled;
				artifactIntegrationsEnabled = integrationsEnabled;
				for (const session of stateManager.getSessionUris()) {
					serverToolHost.advertise(session);
				}
			}
		}));
		workspaceConversionService.value = owned.add(instantiationService.createInstance(SessionWorkspaceConversionService, {
			runWithChatCatalogLock: (session, operation) => agentService!.runWithChatCatalogLock(session, operation),
			prepareChatWorkingDirectory: callbackAdapter.sessionServerToolAccessor.prepareChatWorkingDirectory,
			setChatWorkingDirectory: (session, chat, directory, replaceSessionWorkspace, expectedSessionDirectories) => agentService!.setChatWorkingDirectory(session, chat, directory, replaceSessionWorkspace, expectedSessionDirectories),
		}));
		services.set(ISessionWorkspaceConversionService, workspaceConversionService.value);
		services.set(IAgentHostArchivedChatWorkspaceService, {
			_serviceBrand: undefined,
			setChatWorkspaceAttached: (session, chat, attached) => agentService!.setArchivedChatWorkspaceAttached(session, chat, attached),
		});

		let artifactSequence = 0;
		const artifactDispatches = owned.add(new DisposableMap<number, DisposableStore>());
		const artifactRuntime = owned.add(new AgentHostArtifactRuntime(
			options.rootConfigResource ? joinPath(dirname(options.rootConfigResource), 'artifact-integrations.json') : undefined,
			{
				postNotice: (chat, part, merge) => callbackAdapter.value.postChatNotice(chat, part, merge),
				// Unloading a session is not deletion; only deleting its data removes its artifact bindings.
				onDidDeleteSession: Event.map(sessionDataService.onWillDeleteSessionData, event => event.session.toString()),
				acquire: async (resource, owner) => {
					await agentService!.subscribe(resource, owner);
					return toDisposable(() => agentService!.unsubscribe(resource, owner));
				},
				dispatch: async (chat, action) => {
					const sequence = ++artifactSequence;
					const lifetime = new DisposableStore();
					artifactDispatches.set(sequence, lifetime);
					try {
						await new Promise<void>((resolve, reject) => {
							lifetime.add(toDisposable(() => reject(new Error('Artifact dispatch was closed before acknowledgement'))));
							lifetime.add(new TimeoutTimer(() => reject(new Error('Artifact dispatch acknowledgement timed out')), 30_000));
							lifetime.add(stateManager.onDidEmitEnvelope(envelope => {
								if (envelope.origin?.clientId === 'artifact-integrations' && envelope.origin.clientSeq === sequence) {
									if (envelope.rejectionReason) {
										reject(new Error(envelope.rejectionReason));
									} else {
										resolve();
									}
								}
							}));
							agentService!.dispatchAction(chat, action, 'artifact-integrations', sequence);
						});
					} finally {
						artifactDispatches.deleteAndDispose(sequence);
					}
				},
			},
			accessor.get(IArtifactIntegrationRegistry), accessor.get(IAgentHostArtifactEventService), stateManager, configurationService, logService,
		));
		hostArtifactIntegrations.value = artifactRuntime.integrations;
		const collaborators: IAgentServiceCollaborators = {
			artifactIntegrations: artifactRuntime.integrations,
			artifactIntegrationClients: artifactIntegrationDirectory,
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
		};
		agentService = instantiationService.createInstance(AgentService, core, collaborators, options);
		owned.add(new AgentHostSessionLifecycle(
			createSessionLifecycleAccessor(() => agentService!, sessionStateStore),
			configurationService,
			stateManager,
			accessor.get(IAgentHostPullRequestStatusService),
			providerService,
			logService,
		));
		for (const disposable of additionalDisposables) {
			owned.add(disposable);
		}
		return {
			artifactRuntime,
			agentService,
			authenticationService: core.authenticationService,
			configurationService,
			stateManager,
			chatOwnership,
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
