/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable } from '../../../../../base/common/observable.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { type AgentHostUriMapper, LOCAL_AGENT_HOST_AUTHORITY, toAgentHostContentUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { affectsAgentHostProviderPreference, IAgentConnection, IAgentHostService, shouldSurfaceLocalAgentHostProvider } from '../../../../../platform/agentHost/common/agentService.js';
import type { ISessionGitState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { AutomationStore } from '../../../automations/browser/automationService.js';
import { providerAutomationStorageKey } from '../../../automations/common/automationStorageService.js';
import { ISessionsProviderAutomations, type SessionResourceResolveReason } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { getCopilotCliSessionRawId, migratedCopilotCliResource } from '../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { adoptLegacyCopilotCliResource, LEGACY_MIGRATION_RESTORE_TIMEOUT_MS, LEGACY_MIGRATION_TIMEOUT_MS } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLegacyMigration.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from '../../../../common/agentHostSessionWorkspace.js';
import { IGitHubInfo, ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { AgentHostSessionAdapter, BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';
import { ReconnectableAgentHostAutomationStore } from './reconnectableAgentHostAutomationStore.js';

const LOCAL_RESOURCE_SCHEME_PREFIX = 'agent-host-';

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
		if (this._configurationService.getValue<boolean>(ChatConfiguration.MigrateLegacyCopilotCliSessions) !== true) {
			return undefined;
		}
		const rawId = getCopilotCliSessionRawId(migratedCopilotCliResource(resource));
		if (rawId && this._sessionCache.has(rawId)) {
			return migratedCopilotCliResource(resource); // already adopted; no round-trip
		}
		// Startup restore reopens persisted slots against a cold host, where the
		// first catalog pass is far slower than an interactive open.
		const timeoutMs = reason === 'restore' ? LEGACY_MIGRATION_RESTORE_TIMEOUT_MS : LEGACY_MIGRATION_TIMEOUT_MS;
		return adoptLegacyCopilotCliResource(this.connection, resource, this._logService, this._configurationService, this._telemetryService, reason ?? 'open', timeoutMs);
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
