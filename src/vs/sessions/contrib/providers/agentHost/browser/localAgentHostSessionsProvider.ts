/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable } from '../../../../../base/common/observable.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection, IAgentHostService, claudePreferAgentHostSettingId, shouldSurfaceLocalAgentHostProvider, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { ISessionGitState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID, LocalAgentHostDefaultProviderSettingId } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AGENT_HOST_LOG_OUTPUT_CHANNEL_ID } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from '../../../../common/agentHostSessionWorkspace.js';
import { IGitHubInfo, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';

const LOCAL_RESOURCE_SCHEME_PREFIX = 'agent-host-';

/**
 * Storage key for the local agent host's cached session summaries. There is a
 * single machine-wide local agent host, so a fixed key (no per-authority
 * suffix) is used; the base provider persists under `StorageScope.APPLICATION`.
 */
const LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY = 'localAgentHost.cachedSessions';

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
	readonly icon: ThemeIcon = Codicon.vm;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly supportsLocalWorkspaces = true;

	/** Quick chats are only offered while the agent host is enabled. */
	get supportsQuickChats(): boolean {
		return this._agentHostEnablementService.enabled;
	}

	/** `true` when running in the dedicated Agents window vs. a regular editor window. */
	private readonly _isSessionsWindow: boolean;

	protected override getLogOutputChannelId(): string | undefined {
		return AGENT_HOST_LOG_OUTPUT_CHANNEL_ID;
	}

	/**
	 * When the experimental {@link LocalAgentHostDefaultProviderSettingId}
	 * setting is enabled, the local agent host becomes the default sessions
	 * provider: its session types sort before every other provider (negative
	 * order). Otherwise it sorts after the default providers so Copilot Chat
	 * keeps precedence.
	 */
	override get order(): number {
		return this._configurationService.getValue<boolean>(LocalAgentHostDefaultProviderSettingId) ? -1 : 1;
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IGitHubService gitHubService: IGitHubService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsService sessionsService: ISessionsService,
		@IAgentHostActiveClientService activeClientService: IAgentHostActiveClientService,
		@IStorageService storageService: IStorageService,
		@IDialogService dialogService: IDialogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IProgressService progressService: IProgressService,
	) {
		super(chatSessionsService, chatService, chatWidgetService, languageModelsService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, storageService, dialogService, workspaceTrustManagementService, progressService);

		this._isSessionsWindow = environmentService.isSessionsWindow;

		this.label = localize('localAgentHostLabel', "Local Agent Host");

		this.browseActions = [];

		// Hydrate previously-persisted session summaries so the sidebar shows
		// local sessions immediately at startup, before the agent host has
		// started and the first `listSessions()` round-trip (gated on
		// authentication settling below) reconciles them.
		this._enableSessionCachePersistence(LOCAL_AGENT_HOST_CACHED_SESSIONS_STORAGE_KEY);

		this._attachConnectionListeners(this._agentHostService, this._store);

		const rootStateValue = this._agentHostService.rootState.value;
		if (rootStateValue && !(rootStateValue instanceof Error)) {
			this._syncSessionTypesFromRootState(rootStateValue);
			this._syncRootConfigFromRootState(rootStateValue);
		}
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._syncSessionTypesFromRootState(rootState);
			this._syncRootConfigFromRootState(rootState);
		}));

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

		// Re-sync session types when a preference that gates which agents this
		// provider advertises changes:
		//  - `LocalAgentHostDefaultProviderSettingId` flips the provider's
		//    `order`, so re-fire `onDidChangeSessionTypes` to re-sort.
		//  - the per-window Claude AH/EH preference flips whether the agent
		//    host's Claude is surfaced here (see `_shouldAdvertiseAgent`), so
		//    re-run the full sync to add/remove the Claude session type live.
		const preferAgentHostClaudeSettingId = claudePreferAgentHostSettingId(this._isSessionsWindow);
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LocalAgentHostDefaultProviderSettingId)) {
				this._onDidChangeSessionTypes.fire();
			}
			if (e.affectsConfiguration(preferAgentHostClaudeSettingId)) {
				const current = this._agentHostService.rootState.value;
				if (current && !(current instanceof Error)) {
					this._syncSessionTypesFromRootState(current);
				}
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

	// -- BaseAgentHostSessionsProvider hooks ---------------------------------

	protected get connection(): IAgentConnection { return this._agentHostService; }

	protected get authenticationPending(): IObservable<boolean> { return this._agentHostService.authenticationPending; }

	/**
	 * Suppress the agent host's Claude when this window prefers the
	 * extension-host Claude (provided by the GitHub Copilot Chat extension),
	 * mirroring the gate {@link AgentHostContribution} applies to the chat
	 * session contribution. Without this, the welcome picker's "Local Agent
	 * Host" group would list Claude even though the running Claude session is
	 * served by the extension host — surfacing it twice.
	 *
	 * TODO: Remove this override (and the gate it applies in `getSessions()`
	 * plus the `preferAgentHost` re-fire in the constructor) once the
	 * extension-host Claude implementation is retired. With the agent host as
	 * the only Claude there is nothing to disambiguate, so the base default
	 * (advertise everything) is correct. See {@link shouldSurfaceLocalAgentHostProvider}.
	 */
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
			buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => {
				const uriForDescription = project?.uri ?? workingDirectory;
				const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : undefined;
				const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, workingDirectory ?? project?.uri);
				return LocalAgentHostSessionsProvider.buildWorkspace(project, workingDirectory, gitHubInfo, gitState, description, branchProtectionPatterns);
			},
		};
	}

	protected _formatSessionTypeLabel(agentLabel: string): string {
		return agentLabel;
	}

	protected override _diffUriMapper(): (uri: URI) => URI {
		return uri => toAgentHostUri(uri, 'local');
	}

	// -- Workspaces ----------------------------------------------------------

	static buildWorkspace(project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined, description?: string, branchProtectionPatterns?: readonly string[]): ISessionWorkspace | undefined {
		// Intentionally pass `undefined` for `providerLabel` so the workspace
		// label matches the one produced by `resolveWorkspace` (and by other
		// providers serving the same folder). Sessions list grouping uses
		// `workspace.label` as the group key — divergent labels would surface
		// the same folder as multiple groups.
		return buildAgentHostSessionWorkspace(project, workingDirectory, { providerLabel: undefined, fallbackIcon: Codicon.folder, requiresWorkspaceTrust: true, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_LOCAL }, gitHubInfo, gitState);
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
