/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable } from '../../../../../base/common/observable.js';
import { basename, dirname, isEqualOrParent, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { type AgentHostUriMapper, LOCAL_AGENT_HOST_AUTHORITY, toAgentHostContentUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { affectsAgentHostProviderPreference, IAgentConnection, IAgentHostService, shouldSurfaceLocalAgentHostProvider } from '../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostDetachedWorktrees } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { withAgentDevContainerWorktreeMetadata } from '../../../../../platform/agentHost/common/meta/agentDevContainerWorktreeMeta.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { workspacelessScratchDir } from '../../../../../platform/agentHost/common/workspacelessScratchDir.js';
import { type AgentCustomization, type ISessionGitState, readSessionEhcliAdoptable } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { AutomationStore } from '../../../automations/browser/automationService.js';
import { providerAutomationStorageKey } from '../../../automations/common/automationStorageService.js';
import { IPreparedNewSession, ISessionsProviderAutomations, type ISessionsProviderCreateSessionOptions, type SessionResourceResolveReason } from '../../../../services/sessions/common/sessionsProvider.js';
import { WorkspaceNotTrustedError } from '../../../../services/sessions/common/sessionsManagement.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { buildLocalSessionStateUri, getCopilotCliSessionRawId, migratedCopilotCliResource } from '../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { adoptLegacyCopilotCliResource, isLegacyMigrationEnabledAtStartup, LEGACY_MIGRATION_RESTORE_TIMEOUT_MS, LEGACY_MIGRATION_TIMEOUT_MS } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLegacyMigration.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, type IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from '../../../../common/agentHostSessionWorkspace.js';
import { IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { ChatModelSource, IGitHubInfo, ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { AgentHostSessionAdapter, BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';
import { ReconnectableAgentHostAutomationStore } from './reconnectableAgentHostAutomationStore.js';

const LOCAL_RESOURCE_SCHEME_PREFIX = 'agent-host-';

function isSameLogicalModel(source: ILanguageModelChatMetadata, target: ILanguageModelChatMetadata): boolean {
	if (source.byokModelIdentifier || target.byokModelIdentifier) {
		return source.byokModelIdentifier !== undefined && source.byokModelIdentifier === target.byokModelIdentifier;
	}
	return source.id === target.id && source.family === target.family && source.version === target.version;
}

function findEquivalentAgent(
	selectedAgentUri: string,
	sourceWorkspace: URI,
	targetWorkspace: URI,
	targetAgents: readonly AgentCustomization[],
): AgentCustomization | undefined {
	const exact = targetAgents.find(agent => agent.uri === selectedAgentUri);
	if (exact) {
		return exact;
	}

	const sourceAgentUri = URI.parse(selectedAgentUri);
	if (!isEqualOrParent(sourceAgentUri, sourceWorkspace)) {
		return undefined;
	}
	const relativeAgentPath = relativePath(sourceWorkspace, sourceAgentUri);
	if (!relativeAgentPath) {
		return undefined;
	}

	return targetAgents.find(agent => {
		const candidate = URI.parse(agent.uri);
		const targetRoot = candidate.with({ path: targetWorkspace.path, query: null, fragment: null });
		return relativePath(targetRoot, candidate) === relativeAgentPath;
	});
}

/**
 * Storage key for the local agent host's cached session summaries. There is a
 * single machine-wide local agent host, so a fixed key (no per-authority
 * suffix) is used; the base provider persists under `StorageScope.APPLICATION`.
 */
const LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY = 'localAgentHost.cachedSessions.v2';
// TODO@sandy081 Remove this legacy cache-key cleanup after 2026-10-14.
const LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY_LEGACY = 'localAgentHost.cachedSessions';

/**
 * Local-window sessions provider backed by the in-process
 * {@link IAgentHostService}. A thin subclass of
 * {@link BaseAgentHostSessionsProvider} that supplies the local-only
 * variation: a built-in connection that is always present, session-type
 * synchronization from the local agent host's `rootState`, and a local
 * file-picker browse action.
 */
export class LocalAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {

	readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
	readonly label: string;
	readonly automations: ISessionsProviderAutomations;
	readonly icon: ThemeIcon = Codicon.vm;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly supportsLocalWorkspaces = true;
	readonly supportsQuickChats = true;

	/** `true` when running in the dedicated Agents window vs. a regular editor window. */
	private readonly _isSessionsWindow: boolean;
	private _automationSessionResources = new ResourceSet();
	private readonly _devContainerAvailableDrafts = new Set<string>();
	private readonly _devContainerDrafts = new Set<string>();
	override get order(): number {
		return -1;
	}

	/**
	 * Redirects a legacy extension-host Copilot CLI resource to its agent-host
	 * twin, adopting it on the way.
	 *
	 * Subscribing to the twin is what performs adoption: the host restores the
	 * session, which runs its own provenance and working-directory checks. A
	 * session that is not ours to adopt fails that subscribe, and the caller falls
	 * back to the legacy resource, so an external session is never worse off.
	 *
	 * Local-only by definition: `copilotcli:` and `agent-host-copilotcli:` name
	 * sessions on this machine, so a remote host must never claim or probe them.
	 */
	async resolveSessionResource(resource: URI, reason?: SessionResourceResolveReason): Promise<URI | undefined> {
		// Frozen at startup: enabling the setting only takes effect after a restart,
		// so a live toggle never probes a host whose gate is still off.
		if (!isLegacyMigrationEnabledAtStartup(this._configurationService)) {
			return undefined;
		}
		const twin = migratedCopilotCliResource(resource);
		const rawId = getCopilotCliSessionRawId(twin);
		// An un-adopted legacy chat still carries the adoptable marker and must take
		// the migration probe; only a surfaced external / already-adopted session
		// short-circuits, since opening its twin is a plain (non-migrating) open.
		const adoptable = rawId ? readSessionEhcliAdoptable(this._getSessionMetadataByRawId(rawId)) : false;
		if (rawId && this._sessionCache.has(rawId) && !adoptable) {
			return twin; // already surfaced and not an un-adopted legacy chat; no round-trip
		}
		// Startup restore reopens persisted slots against a cold host, where the
		// first catalog pass is far slower than an interactive open.
		const timeoutMs = reason === 'restore' ? LEGACY_MIGRATION_RESTORE_TIMEOUT_MS : LEGACY_MIGRATION_TIMEOUT_MS;
		const adopted = await adoptLegacyCopilotCliResource(this.connection, resource, this._logService, this._configurationService, this._telemetryService, reason ?? 'open', timeoutMs);
		// On decline or timeout, redirect only a non-adoptable (external /
		// already-adopted) session to its surfaced twin so it opens as-is instead
		// of the extension-host resource. An adoptable session that failed to adopt
		// keeps the original `undefined` behavior and opens unmigrated. Mirrors the
		// chat-editor open path.
		return adopted ?? (adoptable ? undefined : twin);
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IGitHubService gitHubService: IGitHubService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsService sessionsService: ISessionsService,
		@IAgentHostActiveClientService activeClientService: IAgentHostActiveClientService,
		@IStorageService storageService: IStorageService,
		@IDialogService dialogService: IDialogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IDevContainerAgentHostService private readonly _devContainerAgentHostService: IDevContainerAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IPathService pathService: IPathService,
	) {
		super(chatSessionsService, chatService, chatWidgetService, languageModelsService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, storageService, dialogService, workspaceTrustManagementService);
		const legacyAutomations = this._register(instantiationService.createInstance(AutomationStore, providerAutomationStorageKey(this.id)));
		const automations = this._register(instantiationService.createInstance(ReconnectableAgentHostAutomationStore, this.id, legacyAutomations, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => this.resourceSchemeForProvider(provider),
			providerForResourceScheme: scheme => scheme.startsWith(LOCAL_RESOURCE_SCHEME_PREFIX) ? scheme.slice(LOCAL_RESOURCE_SCHEME_PREFIX.length) : undefined,
		}));
		this.automations = automations;

		this._isSessionsWindow = environmentService.isSessionsWindow;

		this.label = localize('localAgentHostLabel', "Local Agent Host");

		this.browseActions = [];

		// Hydrate previously-persisted session summaries so the sidebar shows
		// local sessions immediately at startup, before the agent host has
		// started and the first `listSessions()` round-trip (gated on
		// authentication settling below) reconciles them.
		this._enableSessionCachePersistence(LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY, LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY_LEGACY);

		const onDidChangeResourceLabelHomes = Event.any(this._onDidChangeSessionsImmediately, this._onDidChangeDraftSessions.event);
		const updateResourceLabelHomes = () => {
			const homes = this.getResourceLabelHomes();
			const userHome = pathService.userHome({ preferLocal: true });
			const sessionStateRoot = buildLocalSessionStateUri(userHome);
			for (const session of this.getKnownSessions()) {
				const rawId = AgentSession.id(session.resource);
				const label = this.getResourceLabelHomeLabel(session);
				if (session.isQuickChat?.get() && (session.sessionType === 'copilotcli' || session.sessionType === 'claude')) {
					homes.push({ uri: workspacelessScratchDir(userHome, rawId), label });
				}
				if (session.sessionType === 'copilotcli') {
					homes.push({ uri: joinPath(sessionStateRoot, rawId), label });
					for (const artifact of session.artifacts?.get() ?? []) {
						if (!artifact.uri || !isEqualOrParent(artifact.uri, sessionStateRoot)) {
							continue;
						}
						const artifactSessionId = relativePath(sessionStateRoot, artifact.uri)?.split('/')[0];
						if (artifactSessionId) {
							homes.push({ uri: joinPath(sessionStateRoot, artifactSessionId), label });
						}
					}
				}
			}

			this.updateResourceLabelHomeFormatters(homes, this._labelService);
		};
		this._register(onDidChangeResourceLabelHomes(updateResourceLabelHomes));
		updateResourceLabelHomes();
		this._register(autorun(reader => {
			this._automationSessionResources = new ResourceSet(this.automations.runs.read(reader).flatMap(run => run.sessionResource ? [run.sessionResource] : []));
			const changed = this.syncAutomationSessionMarkers(this._sessionCache.values());
			if (changed.length > 0) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed });
			}
		}));

		const connectionListeners = this._register(new DisposableStore());
		const bindConnection = () => {
			connectionListeners.clear();
			automations.setConnection(this._agentHostService);
			this._attachConnectionListeners(this._agentHostService, connectionListeners);

			const rootState = this._agentHostService.rootState;
			this._syncRootState(rootState.value);
			connectionListeners.add(rootState.onDidChange(() => this._syncRootState(rootState.value)));
			if (rootState.onDidError) {
				connectionListeners.add(rootState.onDidError(error => this._syncRootState(error)));
			}
		};
		bindConnection();
		this._register(this._agentHostService.onAgentHostStart(bindConnection));

		// Eagerly populate the session cache once authentication has settled.
		// Without this, the sidebar would only call `getSessions()` after some
		// other event (e.g. a `notify/sessionAdded` after the user sends a
		// message) forced a refresh. We wait for `authenticationPending` to
		// settle because the underlying agent (e.g. CopilotAgent) throws
		// `AHP_AUTH_REQUIRED` from `listSessions()` until its auth token is
		// resolved. The `authenticationPending` observable is sticky (once
		// it goes false it stays false), so this autorun fires
		// `_refreshSessions()` at most once for the eager-load case.
		this._register(autorun(reader => {
			if (this._agentHostService.authenticationPending.read(reader)) {
				return;
			}
			this._refreshSessions();
			this._resumeNewSessionAfterAuthenticationSettles();
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.branchProtection')) {
				this._refreshSessionWorkspaces();
			}
			if (affectsAgentHostProviderPreference(e, this._isSessionsWindow)) {
				this._syncRootState(this._agentHostService.rootState.value);
				// `getSessions()` filters by the same gate, so the set of visible
				// sessions just changed too. Fire an empty-payload change so the
				// open list re-queries and re-filters. The payload is deliberately
				// empty: these sessions are hidden, not removed, and signalling
				// them as `removed` would be misread as a remote deletion (e.g. by
				// the sessions telemetry contribution).
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
			}
		}));
	}

	override createNewSession(workspaceUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
		const session = super.createNewSession(workspaceUri, sessionTypeId, options);
		void this._resolveDevContainerAvailability(session.sessionId, workspaceUri);
		return session;
	}

	private async _resolveDevContainerAvailability(sessionId: string, workspaceUri: URI): Promise<void> {
		try {
			const available = await this._devContainerAgentHostService.isAvailable(workspaceUri);
			if (!available || !this._getNewSession(sessionId)) {
				return;
			}
			this._devContainerAvailableDrafts.add(sessionId);
			this._onDidChangeSessionConfig.fire(sessionId);
		} catch (error) {
			this._logService.warn(`[${this.id}] Failed to resolve Dev Container availability for ${workspaceUri.toString()}`, error);
		}
	}

	isDevContainerAvailable(sessionId: string): boolean {
		return this._devContainerAvailableDrafts.has(sessionId);
	}

	isDevContainerEnabled(sessionId: string): boolean {
		return this._devContainerDrafts.has(sessionId);
	}

	setDevContainerEnabled(sessionId: string, enabled: boolean): void {
		if (!this._getNewSession(sessionId)) {
			throw new Error(`Cannot configure unknown new session '${sessionId}'.`);
		}
		if (enabled && !this._devContainerAvailableDrafts.has(sessionId)) {
			throw new Error(`Cannot enable Dev Container execution for unavailable session '${sessionId}'.`);
		}
		if (enabled) {
			this._devContainerDrafts.add(sessionId);
		} else {
			this._devContainerDrafts.delete(sessionId);
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	override startNewSessionRequest(sessionId: string, activity?: string): IDisposable {
		return super.startNewSessionRequest(
			sessionId,
			activity ?? (this._devContainerDrafts.has(sessionId)
				? localize('devContainerAgentHost.starting', "Starting Dev Container...")
				: undefined),
		);
	}

	async prepareNewSession(sessionId: string, token: CancellationToken, query: string): Promise<IPreparedNewSession> {
		const draft = this._getNewSession(sessionId);
		if (!draft) {
			throw new Error(`Cannot prepare unknown new session '${sessionId}'.`);
		}
		if (!this._devContainerDrafts.has(sessionId)) {
			return { session: draft.session };
		}

		const sourceWorkspace = draft.session.workspace.get()?.folders[0]?.root;
		if (!sourceWorkspace) {
			throw new Error(localize('devContainerAgentHost.workspaceRequired', "Dev Container sessions require a workspace."));
		}
		const trusted = await this._workspaceTrustRequestService.requestResourcesTrust({
			uri: sourceWorkspace,
			message: localize('devContainerAgentHost.trustFolder', "Starting the Dev Container can run lifecycle commands from this workspace."),
		});
		if (!trusted) {
			throw new WorkspaceNotTrustedError();
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		await this._waitForSessionConfigResolution(this, sessionId, token);
		const sourceConfig = this.getSessionConfig(sessionId);
		let devContainerWorkspace = sourceWorkspace;
		let detachedWorktree: { readonly handle: string; readonly worktree: URI } | undefined;
		if (sourceConfig?.values[SessionConfigKey.Isolation] === 'worktree') {
			await draft.waitForEagerCreate();
			const connection = this.connection;
			if (!supportsAgentHostDetachedWorktrees(connection.initializeResult.get()) || !connection.createDetachedWorktree || !connection.claimDetachedWorktree || !connection.deleteDetachedWorktree) {
				throw new Error(localize('devContainerAgentHost.worktreePreparationUnsupported', "The local Agent Host does not support preparing a worktree for a Dev Container."));
			}
			detachedWorktree = await connection.createDetachedWorktree(draft.backendUri, query);
			try {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				devContainerWorkspace = detachedWorktree.worktree;
				await this._workspaceTrustManagementService.setUrisTrust([detachedWorktree.worktree], true);
			} catch (error) {
				await this._deleteDetachedWorktreeOnRollback(detachedWorktree.handle);
				throw error;
			}
		}

		let target: Awaited<ReturnType<IDevContainerAgentHostService['connect']>>;
		try {
			target = await this._devContainerAgentHostService.connect(devContainerWorkspace, token);
		} catch (error) {
			if (detachedWorktree) {
				await this._deleteDetachedWorktreeOnRollback(detachedWorktree.handle);
			}
			throw error;
		}
		let deleteReplacement: (() => void) | undefined;
		try {
			await this._workspaceTrustManagementService.setUrisTrust([target.workspaceUri], true);
			const targetProvider = this._sessionsProvidersService.getProvider(target.providerId);
			if (!targetProvider || !isAgentHostProvider(targetProvider)) {
				throw new Error(localize('devContainerAgentHost.providerUnavailable', "Dev Container sessions provider '{0}' is not available.", target.providerId));
			}
			const targetSessionType = targetProvider.getSessionTypes(target.workspaceUri)
				.find(sessionType => sessionType.id === draft.session.sessionType)
				?? targetProvider.getSessionTypes(target.workspaceUri)[0];
			if (!targetSessionType) {
				throw new Error(localize('devContainerAgentHost.noAgents', "The Dev Container Agent Host did not advertise any agents."));
			}

			const replacement = targetProvider.createNewSession(target.workspaceUri, targetSessionType.id, {
				metadata: detachedWorktree
					? withAgentDevContainerWorktreeMetadata(undefined, detachedWorktree.handle)
					: undefined,
			});
			const discardReplacement = () => targetProvider.deleteNewSession(replacement.sessionId);
			deleteReplacement = discardReplacement;
			if (detachedWorktree) {
				if (!this.connection.claimDetachedWorktree) {
					throw new Error(localize('devContainerAgentHost.worktreeClaimUnsupported', "The local Agent Host does not support claiming a prepared Dev Container worktree."));
				}
				await this.connection.claimDetachedWorktree(detachedWorktree.handle);
			}
			await this._waitForSessionConfigResolution(targetProvider, replacement.sessionId, token);
			if (detachedWorktree) {
				await targetProvider.setSessionConfigValue(replacement.sessionId, SessionConfigKey.Isolation, 'folder');
				await this._waitForSessionConfigResolution(targetProvider, replacement.sessionId, token);
			}
			const targetConfig = targetProvider.getSessionConfig(replacement.sessionId);
			if (sourceConfig) {
				for (const [property, value] of Object.entries(sourceConfig.values)) {
					if (detachedWorktree && property === SessionConfigKey.Isolation) {
						continue;
					}
					const targetProperty = targetConfig?.schema.properties[property];
					if (!targetProperty || targetProperty.readOnly) {
						continue;
					}
					await targetProvider.setSessionConfigValue(replacement.sessionId, property, value);
				}
			}

			const sourceChat = draft.session.mainChat.get();
			const replacementChat = replacement.mainChat.get();
			const modelId = sourceChat.modelId.get();
			const sourceModelSnapshot = this.getModelsSnapshot(sessionId, modelId);
			const sourceModel = sourceModelSnapshot.models.find(model => model.identifier === modelId)
				?? (sourceModelSnapshot.desiredModelResolution.kind === 'available' ? sourceModelSnapshot.desiredModelResolution.model : undefined);
			const targetModel = sourceModel
				? targetProvider.getModelsSnapshot(replacement.sessionId).models.find(model => isSameLogicalModel(sourceModel.metadata, model.metadata))
				: undefined;
			if (targetModel) {
				targetProvider.setModel(
					replacement.sessionId,
					replacementChat.resource,
					targetModel.identifier,
					sourceChat.modelSource.get() ?? ChatModelSource.CarriedOver,
				);
			}
			const selectedAgentUri = sourceChat.mode.get()?.id;
			const targetAgent = selectedAgentUri
				? findEquivalentAgent(selectedAgentUri, sourceWorkspace, target.workspaceUri, targetProvider.getCustomAgents(replacement.sessionId))
				: undefined;
			if (targetAgent) {
				targetProvider.setAgent?.(replacement.sessionId, { uri: targetAgent.uri, name: targetAgent.name });
			}
			return {
				session: replacement,
				discard: async () => {
					try {
						discardReplacement();
						if (detachedWorktree) {
							await this._deleteDetachedWorktreeOnRollback(detachedWorktree.handle);
						}
					} finally {
						await target.release();
					}
				},
			};
		} catch (error) {
			try {
				if (deleteReplacement) {
					deleteReplacement();
					if (detachedWorktree) {
						await this._deleteDetachedWorktreeOnRollback(detachedWorktree.handle);
					}
				} else if (detachedWorktree) {
					await this._deleteDetachedWorktreeOnRollback(detachedWorktree.handle);
				}
			} finally {
				await target.release();
			}
			throw error;
		}
	}

	private async _deleteDetachedWorktreeOnRollback(handle: string): Promise<void> {
		try {
			await this.connection.deleteDetachedWorktree?.(handle);
		} catch (error) {
			this._logService.error(`[${this.id}] Failed to delete detached Dev Container worktree '${handle}' during rollback.`, error);
		}
	}

	private async _waitForSessionConfigResolution(provider: IAgentHostSessionsProvider, sessionId: string, token: CancellationToken): Promise<void> {
		while (provider.isSessionConfigResolving(sessionId).get()) {
			await raceCancellationError(
				Event.toPromise(Event.filter(provider.onDidChangeSessionConfig, changedSessionId => changedSessionId === sessionId)),
				token,
			);
		}
	}

	override deleteNewSession(sessionId: string): void {
		this._devContainerAvailableDrafts.delete(sessionId);
		this._devContainerDrafts.delete(sessionId);
		super.deleteNewSession(sessionId);
	}

	protected override _disposeAllNewSessions(): void {
		this._devContainerAvailableDrafts.clear();
		this._devContainerDrafts.clear();
		super._disposeAllNewSessions();
	}

	override getSessions(): ISession[] {
		const sessions = super.getSessions();
		this.syncAutomationSessionMarkers(sessions);
		return sessions;
	}

	private syncAutomationSessionMarkers(sessions: Iterable<ISession>): ISession[] {
		const changed: ISession[] = [];
		for (const session of sessions) {
			if (!(session instanceof AgentHostSessionAdapter)) {
				continue;
			}
			const isAutomation = this._automationSessionResources.has(session.resource);
			if (session.isAutomation.get() !== isAutomation) {
				session.setIsAutomation(isAutomation);
				changed.push(session);
			}
		}
		return changed;
	}

	// -- BaseAgentHostSessionsProvider hooks ---------------------------------

	protected get connection(): IAgentConnection { return this._agentHostService; }

	protected get authenticationPending(): IObservable<boolean> { return this._agentHostService.authenticationPending; }

	protected override _shouldAdvertiseAgent(provider: string): boolean {
		return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
	}

	/**
	 * Local resource scheme: `agent-host-${provider}`. Must match the type
	 * string registered by AgentHostContribution. Distinct from the logical
	 * {@link ISession.sessionType}, which is the agent provider name itself
	 * (e.g. `copilotcli`) so the same agent shares one session type across
	 * local and remote hosts.
	 */
	protected resourceSchemeForProvider(provider: string): string {
		return `${LOCAL_RESOURCE_SCHEME_PREFIX}${provider}`;
	}

	protected _adapterOptions() {
		return {
			buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => {
				const primary = workingDirectories?.[0];
				const uriForDescription = project?.uri ?? primary;
				const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : undefined;
				const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, primary ?? project?.uri);
				return LocalAgentHostSessionsProvider.buildWorkspace(project, workingDirectories, gitHubInfo, gitState, description, branchProtectionPatterns);
			},
		};
	}

	protected _formatSessionTypeLabel(agentLabel: string): string {
		return agentLabel;
	}

	protected override _diffUriMapper(): AgentHostUriMapper {
		return (uri, options) => options?.contentRef
			? toAgentHostContentUri(uri, LOCAL_AGENT_HOST_AUTHORITY)
			: toAgentHostUri(uri, LOCAL_AGENT_HOST_AUTHORITY);
	}

	// -- Workspaces ----------------------------------------------------------

	static buildWorkspace(project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined, description?: string, branchProtectionPatterns?: readonly string[]): ISessionWorkspace | undefined {
		// Intentionally pass `undefined` for `providerLabel` so the workspace
		// label matches the one produced by `resolveWorkspace` (and by other
		// providers serving the same folder). Sessions list grouping uses
		// `workspace.label` as the group key — divergent labels would surface
		// the same folder as multiple groups.
		return buildAgentHostSessionWorkspace(project, workingDirectories, { providerLabel: undefined, fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_LOCAL }, gitHubInfo, gitState);
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined {
		if (repositoryUri.scheme !== Schemas.file) {
			return undefined;
		}
		const folderName = basename(repositoryUri) || repositoryUri.path;
		return {
			uri: repositoryUri,
			label: folderName,
			description: this._labelService.getUriLabel(dirname(repositoryUri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			icon: Codicon.folder,
			folders: [{
				root: repositoryUri,
				workingDirectory: repositoryUri,
				name: folderName,
				description: undefined,
				gitRepository: { uri: repositoryUri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
			}],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};
	}
}
