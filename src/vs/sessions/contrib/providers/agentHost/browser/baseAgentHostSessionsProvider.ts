/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { arrayEquals, structuralEquals } from '../../../../../base/common/equals.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, ISettableObservable, observableFromEvent, observableFromPromise, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { buildSessionChangesetUri } from '../../../../../platform/agentHost/common/changesetUri.js';
import { getEffectiveAgents } from '../../../../../platform/agentHost/common/customAgents.js';
import { KNOWN_AUTO_APPROVE_VALUES, SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AgentCustomization, AgentSelection, Customization, ModelSelection, SessionStatus as ProtocolSessionStatus, RootConfigState, RootState, SessionActiveClient, SessionState, SessionSummary, type ChangesetSummary } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, isSessionAction, NotificationType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AgentInfo, readSessionGitState, ROOT_STATE_URI, SessionMeta, StateComponents, type ISessionGitState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionFileChange2, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { buildMutableConfigSchema, IAgentHostSessionsProvider, resolvedConfigsEqual } from '../../../../common/agentHostSessionsProvider.js';
import { agentHostSessionWorkspaceKey } from '../../../../common/agentHostSessionWorkspace.js';
import { isSessionConfigComplete } from '../../../../common/sessionConfig.js';
import { IChat, IGitHubInfo, ISession, ISessionAgentRef, ISessionChangeset, ISessionChangesSummary, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, sessionFileChangesEqual, SessionStatus, toSessionId } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computePullRequestIcon } from '../../../github/common/types.js';
import { changesetFilesToChanges, mapProtocolStatus } from './agentHostDiffs.js';
import { AgentHostCatalogChangeset, createChangesets } from './agentHostSessionChangesets.js';

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';
const UNSAFE_SESSION_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeSessionConfigKey(property: string): boolean {
	return !UNSAFE_SESSION_CONFIG_KEYS.has(property);
}

function normalizeAutoApproveValue(value: unknown, policyRestricted: boolean): ChatPermissionLevel | undefined {
	if (typeof value !== 'string' || !KNOWN_AUTO_APPROVE_VALUES.has(value)) {
		return undefined;
	}
	const normalized = value as ChatPermissionLevel;
	if (policyRestricted && (normalized === ChatPermissionLevel.AutoApprove || normalized === ChatPermissionLevel.Autopilot)) {
		return ChatPermissionLevel.Default;
	}
	return normalized;
}

function isAutoApprovePolicyRestricted(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown {
	if (property === SessionConfigKey.AutoApprove && policyRestricted && (value === ChatPermissionLevel.AutoApprove || value === ChatPermissionLevel.Autopilot)) {
		return ChatPermissionLevel.Default;
	}
	return value;
}

// ============================================================================
// AgentHostSessionAdapter — shared adapter for local and remote sessions
// ============================================================================

/** Copilot CLI session type */
export const CopilotCLISessionType: ISessionType = {
	id: 'copilotcli',
	label: localize('copilotCLI', "Copilot CLI"),
	icon: Codicon.copilot,
};

/**
 * Variation points the host provider supplies when building an adapter.
 * Differences between local and remote sessions (icon, description text,
 * workspace builder, optional URI mapping) flow through this options bag so
 * the adapter itself stays a single concrete class.
 */
export interface IAgentHostAdapterOptions {
	readonly icon: ThemeIcon;
	/** Loading observable wired to the provider's authentication-pending state. */
	readonly loading: IObservable<boolean>;
	/** Builds the session workspace from session metadata; provider-specific (icon, providerLabel, requiresWorkspaceTrust). */
	readonly buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => ISessionWorkspace | undefined;
	/** Optional URI mapping for diff entries (remote uses `toAgentHostUri`; local uses identity). */
	readonly mapDiffUri?: (uri: URI) => URI;
	/**
	 * GitHub service used to resolve the pull request that targets the
	 * session's branch and refresh its live state. Optional so tests / hosts
	 * without a workbench GitHub service still construct adapters; PR
	 * affordances simply stay dormant when absent.
	 */
	readonly gitHubService?: IGitHubService;
	/**
	 * Instantiation service used to construct the session's changeset
	 * resolvers. Shared with the Copilot chat sessions provider so all
	 * agent-host sessions surface the same set of changesets.
	 */
	readonly instantiationService: IInstantiationService;
	/**
	 * Returns the agent connection for the session, if it exists.
	 */
	readonly getConnection: () => IAgentConnection | undefined;
}

/**
 * Adapts an {@link IAgentSessionMetadata} into an {@link ISession} for the
 * sessions UI. A single concrete class for both local and remote agent
 * hosts — variation flows through {@link IAgentHostAdapterOptions}.
 */
export class AgentHostSessionAdapter implements ISession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly changes: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	readonly changesets: IObservable<readonly ISessionChangeset[]>;
	readonly modelId: ISettableObservable<string | undefined>;
	modelSelection: ModelSelection | undefined;
	readonly mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;
	readonly isArchived = observableValue('isArchived', false);
	// Agent host sessions defer unread tracking to the workbench view-level
	// state (see SessionsListModelService). The agent host protocol still
	// carries an isRead bit but exposing it here would conflict with the
	// view's own tracking, so we always report `true` from this observable
	// and let the view be the source of truth.
	readonly isRead = constObservable(true);
	readonly description: IObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	readonly mainChat: IObservable<IChat>;
	readonly chats: IObservable<readonly IChat[]>;
	readonly capabilities = { supportsMultipleChats: false };

	readonly agentProvider: string;

	// Retained so we can rebuild `workspace` when only `_meta` changes via
	// a `SessionMetaChanged` action dispatched on session open (without a full
	// list refresh). See `_applySessionMetaFromState` / `setMeta`.
	private _project: IAgentSessionMetadata['project'];
	private _workingDirectory: URI | undefined;
	private _meta: IAgentSessionMetadata['_meta'];
	/**
	 * Observable mirror of {@link _meta}, kept in sync with every write to
	 * `_meta` so reactive derivations (notably {@link gitHubInfo}) re-fire
	 * when git state arrives (or changes).
	 */
	private readonly _metaObs: ISettableObservable<SessionMeta | undefined>;
	private _activity: ISettableObservable<string | undefined>;

	private readonly _changesSummary = observableValueOpts<ISessionChangesSummary | undefined>({ equalsFn: structuralEquals }, undefined);
	readonly changesSummary: IObservable<ISessionChangesSummary | undefined>;
	setChangesSummary(catalogue: readonly ChangesetSummary[] | undefined): boolean {
		const summary = catalogue?.find(c => !c.uriTemplate.includes('{'));
		if (!summary) {
			return false;
		}

		const { additions, deletions, files } = summary;
		const currentChangesSummary = this._changesSummary.get();

		if (
			(currentChangesSummary?.files ?? 0) === files &&
			(currentChangesSummary?.additions ?? 0) === additions &&
			(currentChangesSummary?.deletions ?? 0) === deletions
		) {
			return false;
		}

		this._changesSummary.set({
			additions: additions ?? 0,
			deletions: deletions ?? 0,
			files: files ?? 0
		}, undefined);

		return true;
	}

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
		private readonly _options: IAgentHostAdapterOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService
	) {
		const rawId = AgentSession.id(metadata.session);
		const agentProvider = AgentSession.provider(metadata.session);
		if (!agentProvider) {
			throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
		}
		this.agentProvider = agentProvider;
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this.sessionId = toSessionId(providerId, this.resource);
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this.icon = _options.icon;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary || `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.modelSelection = metadata.model;
		this.status = observableValue<SessionStatus>('status', metadata.status !== undefined ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
		this.modelId = observableValue<string | undefined>('modelId', metadata.model ? `${resourceScheme}:${metadata.model.id}` : undefined);
		this.mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', metadata.agent ? { id: metadata.agent.uri, kind: AGENT_MODE_KIND } : undefined);
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this._activity = observableValue('activity', metadata.activity);
		this._project = metadata.project;
		this._workingDirectory = metadata.workingDirectory;
		this._meta = metadata._meta;
		this._metaObs = observableValue<SessionMeta | undefined>('agentHostSessionMeta', this._meta);

		// gitHubInfo is reactively derived from `_meta.git`. Owner/repo come
		// from the agent host's git state; the PR number is resolved by the
		// workbench-side GitHub service and the PR's live state (open/closed/
		// merged/draft) is observed so the icon stays current.
		const gitHubService = _options.gitHubService;
		const gitHubCoords = derivedOpts<{ readonly owner: string; readonly repo: string; readonly branch: string } | undefined>(
			{ owner: this, equalsFn: structuralEquals },
			reader => {
				const git = readSessionGitState(this._metaObs.read(reader));
				if (git?.githubOwner && git?.githubRepo && git?.branchName) {
					return { owner: git.githubOwner, repo: git.githubRepo, branch: git.branchName };
				}
				return undefined;
			});
		const pullRequestNumberObs = derived<IObservable<{ readonly value?: number | undefined }> | undefined>(
			this,
			reader => {
				const coords = gitHubCoords.read(reader);
				if (!coords || !gitHubService) {
					return undefined;
				}
				return observableFromPromise(
					gitHubService.findPullRequestNumberByHeadBranch(coords.owner, coords.repo, coords.branch)
				);
			});
		this.gitHubInfo = derived<IGitHubInfo | undefined>(this, reader => {
			const coords = gitHubCoords.read(reader);
			if (!coords) {
				return undefined;
			}
			const innerObs = pullRequestNumberObs.read(reader);
			const prNumber = innerObs?.read(reader)?.value;
			if (prNumber === undefined) {
				return { owner: coords.owner, repo: coords.repo };
			}
			const uri = URI.parse(`https://github.com/${coords.owner}/${coords.repo}/pull/${prNumber}`);
			let icon: ThemeIcon | undefined;
			if (gitHubService) {
				const ref = reader.store.add(gitHubService.createPullRequestModelReference(coords.owner, coords.repo, prNumber));
				const livePR = ref.object.pullRequest.read(reader);
				if (livePR) {
					icon = computePullRequestIcon(livePR.isDraft ? 'draft' : livePR.state);
				}
			}
			return {
				owner: coords.owner,
				repo: coords.repo,
				pullRequest: { number: prNumber, uri, icon },
			};
		});

		const initialGitState = readSessionGitState(this._meta);
		const initialWorkspace = _options.buildWorkspace(this._project, this._workingDirectory, this.gitHubInfo, initialGitState);
		this.workspace = observableValue('workspace', initialWorkspace);
		this.loading = _options.loading;
		this.description = derived(reader => {
			const status = this.status.read(reader);
			if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
				const activity = this._activity.read(reader);
				if (activity) {
					return new MarkdownString().appendText(activity);
				}
			}

			return undefined;
		});

		if (metadata.isArchived) {
			this.isArchived.set(true, undefined);
		}

		const isActiveSessionObs = derived(this, reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			return isEqual(activeSession?.resource, this.resource);
		});

		// Set the changes summary from the catalogue. While the session is active,
		// the changes summary will be updated through the session changeset changes.
		// As soon as the session is no longer active, the changes summary will be
		// updated from the catalogue.
		this.setChangesSummary(metadata.changesets);

		const sessionUri = AgentSession.uri(this.sessionType, rawId);
		const { changesSummary, changes } = this._createChangesObs(sessionUri, isActiveSessionObs);
		this.changesSummary = changesSummary;
		this.changes = changes;

		// Set the changesets from the catalogue. When the session is active,
		// the changesets will be updated as some changeset details are being
		// provided async (ex: description).
		this.changesets = constObservable(createChangesets(sessionUri, this._options, isActiveSessionObs, metadata.changesets));

		const mainChat: IChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			checkpoints: observableValue(this, undefined),
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.mainChat = observableValue<IChat>(this, mainChat);
		this.chats = this.mainChat.map(c => [c]);
	}

	private _createChangesObs(sessionUri: URI, isActiveSessionObs: IObservable<boolean>): {
		changesSummary: IObservable<ISessionChangesSummary | undefined>;
		changes: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	} {
		const sessionChangesetStateObs = derived(this, reader => {
			const connection = this._options.getConnection();
			if (!connection) {
				return constObservable(undefined);
			}

			const isActiveSession = isActiveSessionObs.read(reader);
			if (!isActiveSession) {
				return constObservable(undefined);
			}

			const branchChangesUri = URI.parse(buildSessionChangesetUri(sessionUri.toString()));
			const subscriptionRef = connection.getSubscription(StateComponents.Changeset, branchChangesUri, 'BaseAgentHostSessionsProvider.changesets');
			reader.store.add(subscriptionRef);

			return observableFromEvent(subscriptionRef.object.onDidChange, () => subscriptionRef.object.value);
		});

		const changesetChangesObs = derivedObservableWithCache<readonly (IChatSessionFileChange | IChatSessionFileChange2)[] | undefined>(this, (reader, lastValue) => {
			const isActiveSession = isActiveSessionObs.read(reader);
			if (!isActiveSession) {
				return lastValue;
			}

			const branchChangesState = sessionChangesetStateObs.read(reader)?.read(reader);
			if (!branchChangesState || branchChangesState instanceof Error || branchChangesState.status !== 'ready') {
				return lastValue;
			}

			const mapDiffUri = this._options.mapDiffUri;
			const files = changesetFilesToChanges(branchChangesState.files);

			const mapped = mapDiffUri ? files.map(f => ({
				...f,
				uri: mapDiffUri(f.uri),
				originalUri: f.originalUri ? mapDiffUri(f.originalUri) : undefined,
				modifiedUri: f.modifiedUri ? mapDiffUri(f.modifiedUri) : undefined,
			})) : files;

			return mapped;
		});

		const changesetSummaryObs = derivedOpts<ISessionChangesSummary | undefined>({ equalsFn: structuralEquals }, reader => {
			const changesetChanges = changesetChangesObs.read(reader);
			if (!changesetChanges) {
				return undefined;
			}

			let additions = 0, deletions = 0;
			for (const change of changesetChanges) {
				additions += change.insertions;
				deletions += change.deletions;
			}

			return { additions, deletions, files: changesetChanges.length };
		});

		const changesSummaryObs = derivedOpts<ISessionChangesSummary | undefined>({ equalsFn: structuralEquals }, reader => {
			const isActiveSession = isActiveSessionObs.read(reader);
			const changesetSummary = changesetSummaryObs.read(reader);
			const changesSummary = this._changesSummary.read(reader);

			return isActiveSession && changesetSummary ? changesetSummary : changesSummary;
		});

		return {
			changesSummary: changesSummaryObs,
			changes: derivedOpts({ equalsFn: sessionFileChangesEqual },
				reader => changesetChangesObs.read(reader) ?? [])
		};
	}

	/**
	 * Update fields from a refreshed metadata snapshot. Returns `true` iff
	 * any user-visible field changed.
	 */
	update(metadata: IAgentSessionMetadata): boolean {
		let didChange = false;

		transaction(tx => {
			const summary = metadata.summary;
			if (summary !== undefined && summary !== this.title.get()) {
				this.title.set(summary, tx);
				didChange = true;
			}

			if (metadata.status !== undefined) {
				const uiStatus = mapProtocolStatus(metadata.status);
				if (uiStatus !== this.status.get()) {
					this.status.set(uiStatus, tx);
					didChange = true;
				}
			}

			const modifiedTime = metadata.modifiedTime;
			if (this.updatedAt.get().getTime() !== modifiedTime) {
				this.updatedAt.set(new Date(modifiedTime), tx);
				didChange = true;
			}

			const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
			const nextLastTurnEndTime = modifiedTime ? modifiedTime : undefined;
			if (currentLastTurnEndTime !== nextLastTurnEndTime) {
				this.lastTurnEnd.set(nextLastTurnEndTime !== undefined ? new Date(nextLastTurnEndTime) : undefined, tx);
				didChange = true;
			}

			this._project = metadata.project;
			this._workingDirectory = metadata.workingDirectory;
			// Only update `_meta` when the source actually provides one. `update()`
			// is fed from SessionSummary (via `listSessions`/`sessionAdded` paths)
			// which has no `_meta` field, so an undefined value here means "not
			// included" rather than "cleared". `_meta` (e.g. git state) flows in
			// exclusively via `setMeta` from `SessionState` subscription updates.
			if (metadata._meta !== undefined) {
				this._meta = metadata._meta;
				this._metaObs.set(this._meta, tx);
			}
			const workspace = this._options.buildWorkspace(this._project, this._workingDirectory, this.gitHubInfo, readSessionGitState(this._meta));
			if (agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get())) {
				this.workspace.set(workspace, tx);
				didChange = true;
			}

			if (metadata.isArchived !== undefined && metadata.isArchived !== this.isArchived.get()) {
				this.isArchived.set(metadata.isArchived, tx);
				didChange = true;
			}

			this.modelSelection = metadata.model;
			const modelId = metadata.model ? `${this.resource.scheme}:${metadata.model.id}` : undefined;
			if (modelId !== this.modelId.get()) {
				this.modelId.set(modelId, tx);
				didChange = true;
			}

			const nextMode = metadata.agent ? { id: metadata.agent.uri, kind: AGENT_MODE_KIND } : undefined;
			if (!modeEquals(this.mode.get(), nextMode)) {
				this.mode.set(nextMode, tx);
				didChange = true;
			}

			// `metadata.changesets` (catalogue) drives the chip aggregate.
			// The dropdown content is built separately via `createChangesets`.
			if (metadata.changesets !== undefined && this.setChangesSummary(metadata.changesets)) {
				didChange = true;
			}

			if (this._activity.get() !== metadata.activity) {
				this._activity.set(metadata.activity, tx);
				didChange = true;
			}
		});

		return didChange;
	}

	/**
	 * Sets the activity text from a `SessionSummaryChanged` notification.
	 * Returns `true` iff the activity observable changed.
	 */
	setActivity(activity: string | undefined): boolean {
		if (this._activity.get() !== activity) {
			this._activity.set(activity, undefined);
			return true;
		}

		return false;
	}

	/**
	 * Apply a `SessionState._meta` delta (fed from `_applySessionMetaFromState`)
	 * and rebuild the workspace if the git state changed. Returns `true` iff
	 * the workspace actually changed.
	 */
	setMeta(meta: IAgentSessionMetadata['_meta']): boolean {
		this._meta = meta;
		const gitState = readSessionGitState(this._meta);
		const workspace = this._options.buildWorkspace(this._project, this._workingDirectory, this.gitHubInfo, gitState);
		const workspaceChanged = agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get());
		transaction(tx => {
			this._metaObs.set(this._meta, tx);
			if (workspaceChanged) {
				this.workspace.set(workspace, tx);
			}
		});
		return workspaceChanged;
	}

	updateChangesets(changesets: readonly ChangesetSummary[] | undefined) {
		if (!changesets) {
			return;
		}

		const existingChangesets = this.changesets.get();

		for (const changeset of changesets) {
			const existingChangeset = existingChangesets
				.find(c => c.label === changeset.label);

			if (!(existingChangeset instanceof AgentHostCatalogChangeset)) {
				continue;
			}

			// Update the existing changeset with the new descritpion. This
			// is currently a workaround as the changeset does not have the
			// correct descritpion in the initial catalog.
			existingChangeset.update(changeset);
		}
	}
}

/**
 * `kind` literal used on `ISession.mode` when the mode slot carries a
 * custom-agent selection. The `mode.id` is then the agent's URI.
 */
export const AGENT_MODE_KIND = 'agent';

/**
 * Field-equality for `ISession.mode` values used to decide whether to fire
 * an observable update.
 */
function modeEquals(
	a: { readonly id: string; readonly kind: string } | undefined,
	b: { readonly id: string; readonly kind: string } | undefined,
): boolean {
	if (a === b) { return true; }
	if (!a || !b) { return false; }
	return a.id === b.id && a.kind === b.kind;
}

function customizationsChanged(previous: SessionState, state: SessionState): boolean {
	if (previous.customizations !== state.customizations) {
		return true;
	}
	const previousActiveCustomizations = previous.activeClient?.customizations;
	const currentActiveCustomizations = state.activeClient?.customizations;
	if (previousActiveCustomizations === currentActiveCustomizations) {
		return false;
	}
	if (!previousActiveCustomizations || !currentActiveCustomizations) {
		return true;
	}
	return arrayEquals(previousActiveCustomizations, currentActiveCustomizations, (a, b) => {
		if (a.nonce !== undefined && a.nonce === b.nonce) {
			return true;
		}
		return a === b;
	});
}

// ============================================================================
// NewSession — bundles the in-flight new-session state
// ============================================================================

/**
 * Inputs needed to construct a {@link NewSession}.
 */
interface INewSessionConstructionContext {
	readonly workspace: ISessionWorkspace;
	readonly sessionType: ISessionType;
	readonly providerId: string;
	readonly icon: ThemeIcon;
	readonly resourceScheme: string;
	readonly authenticationPending: IObservable<boolean>;
	readonly logService: ILogService;
	/**
	 * Optional initial config values to seed into the new session before its
	 * first {@link NewSession.resolveConfig} round-trip. Used to forward
	 * `chat.permissions.default` into the agent host's `autoApprove` slot so
	 * the picker reflects the user's preference immediately.
	 */
	readonly initialConfigValues?: Record<string, unknown>;
	/**
	 * Instantiation service used to construct the session's changeset
	 * resolvers, so the new-session skeleton surfaces the same changeset
	 * list as the committed session that replaces it.
	 */
	readonly instantiationService: IInstantiationService;
	/**
	 * Forwards `SessionState` snapshots from the eagerly-held wire
	 * subscription back to the provider. `state === undefined` is a
	 * cleanup sentinel emitted by {@link NewSession.dispose} on the
	 * close-without-graduation path so the provider can drop any cached
	 * entry it accumulated for this session. The graduation path skips
	 * this sentinel because the running-session subscription pipeline
	 * takes over ownership of the same `sessionId` key.
	 */
	readonly onSessionState?: (sessionId: string, state: SessionState | undefined) => void;
	/** Initial active-client snapshot for the eager `createSession`. Drift is reconciled by the handler before the first message. */
	readonly activeClient?: SessionActiveClient;
}

/**
 * Bundles the at-most-one in-flight "new session" — the session being
 * composed in the new-chat view before the first message is sent.
 *
 * Encapsulates:
 *  - the `ISession` skeleton + its observables (status, modelId, loading)
 *  - the user's selected model (read by `sendRequest`)
 *  - the resolved session config + a stale-request guard
 *  - the eagerly created backend session (URI + subscription) that lets the
 *    chat handler skip its legacy `createSession`-on-first-message round-trip
 *
 * Lifecycle:
 *  - {@link eagerCreate} fires `connection.createSession` then opens a state
 *    subscription. Wire ordering matters — see the comment in the body.
 *  - {@link graduate} releases the subscription without firing
 *    `disposeSession`; called when the session successfully transitions into
 *    a real running session via `sendRequest`.
 *  - {@link Disposable.dispose}/`dispose` releases the subscription **and**
 *    fires `connection.disposeSession`; called when the user abandons the
 *    new session (workspace switch, send failure, etc.).
 */
class NewSession extends Disposable {

	readonly session: ISession;
	readonly sessionId: string;
	readonly agentProvider: string;
	readonly workspaceUri: URI;

	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _title: ISettableObservable<string>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	private readonly _loading: ISettableObservable<boolean>;
	private readonly _mainChat: ISettableObservable<IChat>;
	private _selectedModelId: string | undefined;
	private _selectedAgent: ISessionAgentRef | undefined;

	/**
	 * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
	 * `undefined` indicates the most recent {@link resolveConfig} failed and no
	 * cached values are usable.
	 */
	private _config: ResolveSessionConfigResult | undefined = { schema: { type: 'object', properties: {} }, values: {} };

	/**
	 * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
	 * increments the counter and only writes its result back if its sequence
	 * is still the latest one. Bumped on dispose so any pending resolve
	 * discards itself.
	 */
	private _configRequestSeq = 0;

	/**
	 * `true` while a `resolveConfig` round-trip is in flight. Distinct from
	 * {@link ISession.loading} which also stays true when required config
	 * values are missing — pickers gate on this so they stay interactive
	 * in that state. Set sync in {@link beginResolveConfigSync} so the
	 * optimistic `onDidChangeSessionConfig` pulse already exposes it.
	 */
	private readonly _isResolvingConfig: ISettableObservable<boolean>;

	/** Backend session URI, set the moment {@link eagerCreate} starts. */
	private _backendUri: URI | undefined;
	/** Connection used to create the backend session, captured for `disposeSession` on tear-down. */
	private _connection: IAgentConnection | undefined;
	/** Held state subscription. Set after the wire `createSession` resolves. */
	private _subscription: IReference<IAgentSubscription<SessionState>> | undefined;
	/**
	 * `onDidChange` listener for {@link _subscription}. Forwards every
	 * `SessionState` snapshot to the provider via {@link _onSessionState}
	 * so the new session's customizations (and any other state) reach
	 * `_lastSessionStates` while the session is still Untitled. Detached
	 * in {@link graduate} (handoff) and {@link dispose} (close-without-send).
	 */
	private readonly _stateListener = this._register(new MutableDisposable());
	private readonly _onSessionState: ((sessionId: string, state: SessionState | undefined) => void) | undefined;

	private readonly _initialActiveClient: SessionActiveClient | undefined;

	private readonly _logService: ILogService;
	private readonly _providerId: string;

	constructor(ctx: INewSessionConstructionContext) {
		super();
		const workspaceUri = ctx.workspace.folders[0]?.root;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}
		this.workspaceUri = workspaceUri;
		this.agentProvider = ctx.sessionType.id;
		this._providerId = ctx.providerId;
		this._logService = ctx.logService;
		this._onSessionState = ctx.onSessionState;
		this._initialActiveClient = ctx.activeClient;

		const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
		this._status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		this._title = observableValue<string>(this, '');
		const title = this._title;
		const updatedAt = observableValue(this, new Date());
		const workspaceObs = observableValue<ISessionWorkspace | undefined>(this, ctx.workspace);
		const changes = observableValueOpts<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
		const checkpoints = observableValue(this, undefined);
		this._modelId = observableValue<string | undefined>(this, undefined);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
		this._mode = mode;
		const isArchived = observableValue(this, false);
		const isRead = observableValue(this, true);
		const description = observableValue<IMarkdownString | undefined>(this, undefined);
		const lastTurnEnd = observableValue<Date | undefined>(this, undefined);
		this._loading = observableValue(this, true);
		this._isResolvingConfig = observableValue(this, false);
		const createdAt = new Date();

		const mainChat: IChat = {
			resource, createdAt, title, updatedAt,
			status: this._status,
			changes,
			checkpoints,
			modelId: this._modelId,
			mode, isArchived, isRead, description, lastTurnEnd,
		};
		this._mainChat = observableValue<IChat>(this, mainChat);
		const authPending = ctx.authenticationPending;
		const loading = this._loading;
		const chats = this._mainChat.map(c => [c]);
		const changesets = constObservable([]);
		this.session = {
			sessionId: `${ctx.providerId}:${resource.toString()}`,
			resource,
			providerId: ctx.providerId,
			sessionType: ctx.sessionType.id,
			icon: ctx.icon,
			createdAt,
			workspace: workspaceObs,
			title,
			updatedAt,
			status: this._status,
			changesets,
			changes,
			modelId: this._modelId,
			mode,
			loading: derived(reader => loading.read(reader) || authPending.read(reader)),
			isArchived,
			isRead,
			description,
			lastTurnEnd,
			mainChat: this._mainChat,
			chats,
			capabilities: { supportsMultipleChats: false },
		};
		this.sessionId = this.session.sessionId;

		if (ctx.initialConfigValues) {
			this._config = { schema: { type: 'object', properties: {} }, values: { ...ctx.initialConfigValues } };
		}
	}

	// -- Picker mutations ----------------------------------------------------

	setSelectedModelId(modelId: string): void {
		this._selectedModelId = modelId;
		this._modelId.set(modelId, undefined);
	}

	getSelectedModelId(): string | undefined { return this._selectedModelId; }
	clearSelectedModelId(): void { this._selectedModelId = undefined; }

	setSelectedAgent(agent: ISessionAgentRef | undefined): void {
		this._selectedAgent = agent;
		this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
	}

	getSelectedAgent(): ISessionAgentRef | undefined { return this._selectedAgent; }
	clearSelectedAgent(): void {
		this._selectedAgent = undefined;
		this._mode.set(undefined, undefined);
	}

	setStatus(status: SessionStatus): void { this._status.set(status, undefined); }
	setLoading(loading: boolean): void { this._loading.set(loading, undefined); }
	setTitle(title: string): void { this._title.set(title, undefined); }

	// -- Config --------------------------------------------------------------

	getConfig(): ResolveSessionConfigResult | undefined { return this._config; }
	getConfigValues(): Record<string, unknown> | undefined { return this._config?.values; }

	/**
	 * Optimistically merges a single property into the cached config.
	 * Preserves the existing schema so schema-driven pickers don't flash
	 * during the async re-resolve. {@link resolveConfig} replaces both
	 * schema and values when its response lands.
	 */
	setConfigValue(property: string, value: unknown): void {
		const current = this._config;
		this._config = {
			schema: current?.schema ?? { type: 'object', properties: {} },
			values: { ...(current?.values ?? {}), [property]: value },
		};
	}

	/**
	 * `true` while a {@link resolveConfig} round-trip is in flight. See
	 * {@link _isResolvingConfig} for why this is distinct from {@link ISession.loading}.
	 */
	get isResolvingConfig(): IObservable<boolean> { return this._isResolvingConfig; }

	/** Mark a resolve as starting before the optimistic event fires. */
	beginResolveConfigSync(): void {
		this._isResolvingConfig.set(true, undefined);
	}

	/**
	 * Clear the in-flight flag for early-return paths that skip
	 * {@link resolveConfig} (e.g. no connection), where the `finally`
	 * cleanup never runs.
	 */
	endResolveConfigSync(): void {
		this._isResolvingConfig.set(false, undefined);
	}

	/**
	 * Re-resolves the session config against the agent host using the
	 * currently cached values. Ignores its own response if a newer call
	 * superseded it. Returns `true` if the config was applied (i.e. this
	 * call was not stale by the time the response arrived). On failure, the
	 * cached config is cleared so {@link getConfig} returns `undefined`.
	 */
	async resolveConfig(connection: IAgentConnection): Promise<boolean> {
		const seq = ++this._configRequestSeq;
		this._isResolvingConfig.set(true, undefined);
		try {
			const result = await connection.resolveSessionConfig({
				provider: this.agentProvider,
				workingDirectory: this.workspaceUri,
				config: this._config?.values,
			});
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = result;
			return true;
		} catch {
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = undefined;
			return true;
		} finally {
			// Only the latest request owns the flag.
			if (seq === this._configRequestSeq) {
				this._isResolvingConfig.set(false, undefined);
			}
		}
	}

	getConfigCompletions(connection: IAgentConnection, property: string, query: string | undefined) {
		return connection.sessionConfigCompletions({
			provider: this.agentProvider,
			workingDirectory: this.workspaceUri,
			config: this._config?.values,
			property,
			query,
		});
	}

	// -- Backend session lifecycle -------------------------------------------

	/**
	 * Eagerly create the session on the agent host so the chat handler can
	 * skip its legacy `createSession`-on-first-message round-trip.
	 *
	 * Wire ordering matters: we must `createSession` *before* opening the
	 * subscription. Subscribing first would race the wire send — the server
	 * receives the `subscribe` before the `createSession` and rejects it as
	 * `AHP_SESSION_NOT_FOUND`, leaving the client subscription in an
	 * unrecoverable error state. The session handler would then fall back
	 * to its legacy create-and-subscribe path on the user's first send,
	 * issuing a duplicate `createSession`.
	 *
	 * If the user switches workspaces or graduates this session before the
	 * `createSession` round-trip completes, this object will have been
	 * disposed (and `_backendUri` cleared) — the bail-out check below skips
	 * opening a stale subscription.
	 *
	 * Failures are non-fatal: the legacy first-message path in
	 * `AgentHostSessionHandler._invokeAgent` re-issues `createSession` if
	 * no session state exists at send time.
	 */
	eagerCreate(connection: IAgentConnection): void {
		const backendUri = AgentSession.uri(this.agentProvider, this.session.resource.path.substring(1));
		if (this._backendUri?.toString() === backendUri.toString() || this._subscription) {
			return;
		}
		this._backendUri = backendUri;
		this._connection = connection;

		void (async () => {
			try {
				await connection.createSession({
					provider: this.agentProvider,
					session: backendUri,
					workingDirectory: this.workspaceUri,
					config: this._config?.values,
					...(this._selectedAgent ? { agent: { uri: this._selectedAgent.uri } } : {}),
					...(this._initialActiveClient ? { activeClient: this._initialActiveClient } : {}),
				});
			} catch (err) {
				this._logService.warn(`[${this._providerId}] Eager createSession failed for ${backendUri.toString()}: ${err}`);
				// Clear backend bookkeeping so a later `dispose()` doesn't
				// fire `disposeSession` for a session the agent host never
				// created. Only do this if we're still the current attempt
				// (the caller may have already overwritten these fields by
				// disposing this NewSession and constructing a new one).
				if (this._backendUri?.toString() === backendUri.toString()) {
					this._backendUri = undefined;
					this._connection = undefined;
				}
				return;
			}

			// Bail if the user switched workspaces, graduated this session,
			// or otherwise disposed it while the round-trip was in flight.
			if (this._backendUri?.toString() !== backendUri.toString()) {
				return;
			}

			// Hold a state subscription for our lifetime so the agent host's
			// empty-session GC sees a non-zero subscriber count. The session
			// handler refcounts the same subscription via `getSubscription`
			// when chat content opens, so when we release this ref on
			// graduation the wire-level refcount stays positive.
			const ref = connection.getSubscription(StateComponents.Session, backendUri, 'BaseAgentHostSessionsProvider.session');
			this._subscription = ref;

			// Forward `SessionState` updates back to the provider so
			// `_lastSessionStates` (and therefore `getCustomAgents`) becomes
			// populated for this still-Untitled session. Seed once from the
			// cached value, then attach a listener for subsequent deltas.
			const onSessionState = this._onSessionState;
			if (onSessionState) {
				const initial = ref.object.value;
				if (initial && !(initial instanceof Error)) {
					onSessionState(this.sessionId, initial);
				}
				this._stateListener.value = ref.object.onDidChange(state => {
					onSessionState(this.sessionId, state);
				});
			}
		})();
	}

	/**
	 * Release the backend subscription without firing `disposeSession`.
	 * Used on the success path in `sendRequest` when the session has
	 * graduated into a real running session.
	 */
	graduate(): void {
		// Detach the new-session listener BEFORE releasing the subscription.
		// Both code paths (this one and the running-session pipeline) write
		// `_lastSessionStates` under the same `sessionId` key, so detaching
		// here hands ownership cleanly to `_ensureSessionStateSubscription`
		// without a transient empty-read window or a duplicate writer.
		this._stateListener.clear();
		this._subscription?.dispose();
		this._subscription = undefined;
		this._backendUri = undefined;
		this._connection = undefined;
		this._configRequestSeq++;
	}

	override dispose(): void {
		// Bump the seq so any in-flight resolveConfig discards itself.
		this._configRequestSeq++;

		// Detach the state listener BEFORE firing the cleanup sentinel so
		// a racing `onDidChange` cannot re-populate `_lastSessionStates`
		// after we have asked the provider to delete the entry. Then fire
		// the sentinel so the provider drops the cached snapshot. Only
		// fires when a listener was actually wired (i.e. `eagerCreate`
		// reached the post-`createSession` branch).
		const hadListener = !!this._stateListener.value;
		this._stateListener.clear();
		if (hadListener) {
			this._onSessionState?.(this.sessionId, undefined);
		}

		this._subscription?.dispose();
		this._subscription = undefined;

		const oldUri = this._backendUri;
		const connection = this._connection;
		this._backendUri = undefined;
		this._connection = undefined;
		if (oldUri && connection) {
			connection.disposeSession(oldUri).catch(err => {
				this._logService.warn(`[${this._providerId}] Failed to dispose eager backend session ${oldUri.toString()}: ${err}`);
			});
		}
		super.dispose();
	}
}

// ============================================================================
// BaseAgentHostSessionsProvider — shared base for local and remote providers
// ============================================================================

/**
 * Shared base class for the local and remote agent host sessions providers.
 *
 * Owns the structures and flows that are identical between the two:
 * the session cache, the new-session/running-session config picker state,
 * the lazy session-state subscriptions, the AHP notification/action
 * handlers, and every connection-routed method (set/get/archive/delete/
 * rename/setModel/sendRequest).
 *
 * Subclasses supply the genuine variation points: the connection
 * accessor, the authentication-pending observable, an adapter factory,
 * URI-scheme mapping for session metadata, the agent-provider lookup, and
 * the browse UI.
 */
export abstract class BaseAgentHostSessionsProvider extends Disposable implements IAgentHostSessionsProvider {

	abstract readonly id: string;
	abstract readonly label: string;
	abstract readonly icon: ThemeIcon;
	abstract readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	get order(): number { return 0; }

	get sessionTypes(): readonly ISessionType[] { return this._sessionTypes; }
	protected _sessionTypes: ISessionType[] = [];

	private _lastAgents: AgentInfo[] | undefined;

	protected readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	protected readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	protected readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	protected readonly _onDidChangeSessionConfig = this._register(new Emitter<string>());
	readonly onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;

	protected readonly _onDidChangeRootConfig = this._register(new Emitter<void>());
	readonly onDidChangeRootConfig = this._onDidChangeRootConfig.event;

	protected readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	protected readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomizations = this._onDidChangeCustomizations.event;

	/** Last-known root config state (schema + values), seeded from `RootState.config`. */
	protected _rootConfig: RootConfigState | undefined;

	/**
	 * Last-known session state per session ID, seeded from
	 * {@link _applySessionStateUpdate}. Holds the snapshot used to extract
	 * `customizations` and `activeClient.customizations` for the picker.
	 */
	protected readonly _lastSessionStates = new Map<string, SessionState>();

	/** Cache of adapted sessions, keyed by raw session ID. */
	protected readonly _sessionCache = new Map<string, AgentHostSessionAdapter>();

	/**
	 * Temporary session that has been sent (first turn dispatched) but not yet
	 * committed by the backend session list. Shown in the session list until the
	 * server reports the backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	protected _pendingSession: ISession | undefined;

	/**
	 * In-flight new sessions — sessions being composed in the new-chat view
	 * before their first message is sent, keyed by `sessionId`. See
	 * {@link NewSession} for the encapsulated state and lifecycle.
	 *
	 * Held as a {@link DisposableMap} so multiple new sessions can be tracked
	 * concurrently (e.g. while one is sending in the background and the composer
	 * re-seeds a fresh one). Entries are disposed individually when sent
	 * ({@link deleteAndDispose}/{@link deleteAndLeak}) or abandoned (via
	 * {@link deleteNewSession}), and all remaining entries are cleaned up when
	 * the provider itself is disposed.
	 */
	private readonly _newSessions = this._register(new DisposableMap<string, NewSession>());

	/** The in-flight new session with the given id, if any. */
	protected _getNewSession(sessionId: string): NewSession | undefined {
		return this._newSessions.get(sessionId);
	}

	/**
	 * Dispose every in-flight new session, firing each one's `disposeSession`
	 * sentinel so the eagerly-created backend records are freed. Used when the
	 * connection drops and the composed-but-unsent drafts can no longer commit.
	 */
	protected _disposeAllNewSessions(): void {
		this._newSessions.clearAndDisposeAll();
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	/** Full resolved config (schema + values) for running sessions, keyed by session ID. */
	protected readonly _runningSessionConfigs = new Map<string, ResolveSessionConfigResult>();
	private readonly _runningSessionConfigResolveSeq = new Map<string, number>();

	/**
	 * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
	 * for sessions that already exist on the agent host (e.g. created in a prior
	 * window). The underlying wire subscription is reference-counted by
	 * {@link IAgentConnection.getSubscription}, so when the session handler is
	 * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
	 * issued. Each entry is released after
	 * {@link SESSION_STATE_SUBSCRIPTION_IDLE_MS} of no calls into the keep-alive
	 * helper, so the server-side refcount can drop and any idle restored session
	 * state can be evicted on the agent host. Keyed by session ID.
	 */
	protected readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, DisposableStore>());

	/**
	 * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
	 * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
	 * when the timer fires, the subscription is disposed and the wire
	 * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
	 * refcount to the agent host.
	 */
	private readonly _sessionStateIdleTimers = this._register(new DisposableMap<string, IDisposable>());

	protected _cacheInitialized = false;

	private static readonly SESSION_REFRESH_RETRY_MIN_MS = 1_000;
	private static readonly SESSION_REFRESH_RETRY_MAX_MS = 30_000;

	/**
	 * Backoff timer that retries {@link _refreshSessions} after a failed
	 * attempt. A failed initial list (e.g. the agent threw
	 * `AHP_AUTH_REQUIRED` because its token wasn't yet effective server-side,
	 * or a transient offline/network error) must not leave the session list
	 * permanently empty. The timer is armed only on failure and cancelled on
	 * the next successful refresh.
	 */
	private readonly _sessionRefreshRetry = this._register(new MutableDisposable());

	/** Current backoff delay (ms) for the session-refresh retry. */
	private _sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;

	/** True while a {@link _refreshSessions} call is awaiting `listSessions()`. */
	private _sessionRefreshInFlight = false;

	constructor(
		@IChatSessionsService protected readonly _chatSessionsService: IChatSessionsService,
		@IChatService protected readonly _chatService: IChatService,
		@IChatWidgetService protected readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService protected readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService protected readonly _baseConfigurationService: IConfigurationService,
		@ILogService protected readonly _logService: ILogService,
		@IGitHubService protected readonly _gitHubService: IGitHubService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@ISessionsManagementService protected readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentHostActiveClientService protected readonly _activeClientService: IAgentHostActiveClientService,
		@IStorageService protected readonly _storageService: IStorageService,
	) {
		super();
	}

	// -- Subclass hooks -------------------------------------------------------

	/** Current connection (always present for local; may be undefined while disconnected for remote). */
	protected abstract get connection(): IAgentConnection | undefined;

	/** Provider-level authentication-pending observable used to derive `loading` for sessions. */
	protected abstract get authenticationPending(): IObservable<boolean>;

	/**
	 * Subclass-specific portion of the adapter options. Base fills in
	 * the bits that are uniform across hosts (`icon`, `loading`,
	 * `mapDiffUri`) from the corresponding hooks.
	 */
	protected abstract _adapterOptions(): Pick<IAgentHostAdapterOptions, 'buildWorkspace'>;

	/** Build an adapter for the given metadata. */
	protected createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		const provider = AgentSession.provider(meta.session);
		if (!provider) {
			throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
		}

		const options = {
			icon: this.iconForAgentProvider(provider) ?? this.icon,
			loading: this.authenticationPending,
			mapDiffUri: this._diffUriMapper(),
			gitHubService: this._gitHubService,
			instantiationService: this._instantiationService,
			getConnection: () => this.connection,
			...this._adapterOptions(),
		} satisfies IAgentHostAdapterOptions;

		return this._instantiationService.createInstance(AgentHostSessionAdapter, meta, this.id, this.resourceSchemeForProvider(provider), provider, options);
	}

	/**
	 * Computes the URI resource scheme used to route session URIs to this
	 * provider's content provider for a given agent provider name. Local
	 * uses `agent-host-${provider}`; remote uses a per-connection scheme.
	 *
	 * The resource scheme is host-specific and exists purely for content
	 * provider routing. The logical {@link ISession.sessionType} is the
	 * agent provider name itself, so the same agent (e.g. `copilotcli`)
	 * appears under one shared session type across hosts.
	 */
	protected abstract resourceSchemeForProvider(provider: string): string;

	/** Format the human-readable label for a session type entry (e.g. `Copilot CLI`). */
	protected abstract _formatSessionTypeLabel(agentLabel: string): string;

	/**
	 * Reconcile {@link _sessionTypes} against the agents advertised by the
	 * host's root state, firing {@link onDidChangeSessionTypes} only if the
	 * id/label set actually changed.
	 */
	protected _syncSessionTypesFromRootState(rootState: RootState): void {
		if (this._lastAgents !== rootState.agents) {
			this._lastAgents = rootState.agents;
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
		const next = rootState.agents.map((agent): ISessionType => ({
			id: agent.provider,
			label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
			icon: this.iconForAgentProvider(agent.provider) ?? this.icon,
		}));

		const prev = this._sessionTypes;
		if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label)) {
			return;
		}
		this._sessionTypes = next;
		this._onDidChangeSessionTypes.fire();
	}

	/**
	 * Returns the {@link ThemeIcon} associated with a known agent provider, or
	 * `undefined` when the provider is not recognised.
	 */
	private iconForAgentProvider(provider: string): ThemeIcon | undefined {
		if (provider === CopilotCLISessionType.id) {
			return CopilotCLISessionType.icon;
		}

		if (provider.includes('claude')) {
			return Codicon.claude;
		}

		if (provider === 'openai' || provider.includes('codex')) {
			return Codicon.openai;
		}

		return undefined;
	}

	/**
	 * Reconcile {@link _rootConfig} against {@link RootState.config}, firing
	 * {@link onDidChangeRootConfig} only when schema or values actually change.
	 */
	protected _syncRootConfigFromRootState(rootState: RootState): void {
		const next = rootState.config;
		const prev = this._rootConfig;
		if (prev === next) {
			return;
		}
		if (!next) {
			this._rootConfig = undefined;
			this._onDidChangeRootConfig.fire();
			return;
		}
		if (prev?.schema === next.schema && equals(prev.values, next.values)) {
			return;
		}
		this._rootConfig = next;
		this._onDidChangeRootConfig.fire();
	}

	abstract resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined;

	/** Optional event fired when the underlying connection is lost; used to short-circuit `_waitForNewSession`. */
	protected get onConnectionLost(): Event<void> { return Event.None; }

	/** Maps a working-directory URI from the session summary to a local URI. Default identity; remote overrides to `toAgentHostUri`. */
	protected mapWorkingDirectoryUri(uri: URI): URI { return uri; }

	/** Maps a project URI from the session summary to a local URI. Default identity; remote overrides for `file:` paths. */
	protected mapProjectUri(uri: URI): URI { return uri; }

	// -- Session listing ------------------------------------------------------

	getSessionTypes(_repositoryUri: URI): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		const sessions: ISession[] = [...this._sessionCache.values()];
		if (this._pendingSession) {
			sessions.push(this._pendingSession);
		}
		return sessions;
	}

	getSessionByResource(resource: URI): ISession | undefined {
		for (const newSession of this._newSessions.values()) {
			if (newSession.session.resource.toString() === resource.toString()) {
				return newSession.session;
			}
		}

		if (this._pendingSession?.resource.toString() === resource.toString()) {
			return this._pendingSession;
		}

		this._ensureSessionCache();
		for (const cached of this._sessionCache.values()) {
			if (cached.resource.toString() === resource.toString()) {
				// Opening a session: subscribe to its AHP state so that
				// `_meta` (e.g. lazy git state computed by the agent host)
				// flows into the cached adapter. The keep-alive helper resets
				// an idle timer so the subscription is dropped once the session
				// is no longer being touched, allowing the agent host to evict
				// idle restored state.
				this._keepSessionStateAlive(cached.sessionId);
				return cached;
			}
		}

		return undefined;
	}

	// -- Session lifecycle ----------------------------------------------------

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}

		// Tear-down of superseded drafts is handled by the management layer
		// (it calls `deleteNewSession` on the previous pending session). Each
		// new session is tracked independently in `_newSessions` so several can
		// be in flight at once (e.g. one sending in the background while the
		// composer re-seeds a fresh draft).
		const connection = this.connection;
		const newSession = new NewSession({
			workspace,
			sessionType,
			providerId: this.id,
			icon: sessionType.icon,
			resourceScheme: this.resourceSchemeForProvider(sessionType.id),
			authenticationPending: this.authenticationPending,
			logService: this._logService,
			initialConfigValues: this._initialNewSessionConfig(),
			instantiationService: this._instantiationService,
			onSessionState: (id, state) => state === undefined
				? this._handleNewSessionStateGone(id)
				: this._handleNewSessionStateUpdate(id, state),
			activeClient: connection
				? this._activeClientService.getActiveClient(this.resourceSchemeForProvider(sessionType.id), connection.clientId)
				: undefined,
		});
		this._newSessions.set(newSession.sessionId, newSession);
		this._onDidChangeSessionConfig.fire(newSession.sessionId);

		// Kick off the initial config resolve and the eager backend session
		// in parallel after authentication settles. While auth is pending,
		// providers such as Codex reject both paths with AuthRequired; the
		// subclass calls _resumeNewSessionAfterAuthenticationSettles when the
		// first auth pass completes.
		if (connection) {
			if (!this.authenticationPending.get()) {
				this._startNewSessionBackend(newSession, connection);
			}
		} else {
			newSession.setLoading(false);
		}
		return newSession.session;
	}

	protected _resumeNewSessionAfterAuthenticationSettles(): void {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		for (const newSession of this._newSessions.values()) {
			this._startNewSessionBackend(newSession, connection);
		}
	}

	private _startNewSessionBackend(newSession: NewSession, connection: IAgentConnection): void {
		void this._refreshNewSessionConfig(newSession);
		newSession.eagerCreate(connection);
	}

	/**
	 * Re-resolve the session config against the agent host and pulse
	 * {@link _onDidChangeSessionConfig}. The {@link NewSession} owns its own
	 * stale-request guard so back-to-back calls are safe.
	 */
	private async _refreshNewSessionConfig(session: NewSession): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			// {@link resolveConfig} (the only other clear path) is skipped
			// on this branch, so clear the flag here to avoid stalling
			// the picker forever.
			session.endResolveConfigSync();
			session.setLoading(false);
			this._onDidChangeSessionConfig.fire(session.sessionId);
			return;
		}
		session.setLoading(true);
		const applied = await session.resolveConfig(connection);
		// Bail if a newer call superseded us — its own pulse will take over.
		if (!applied || this._newSessions.get(session.sessionId) !== session) {
			return;
		}
		const config = session.getConfig();
		session.setLoading(config !== undefined && !isSessionConfigComplete(config));
		this._onDidChangeSessionConfig.fire(session.sessionId);
	}

	/** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
	protected _validateBeforeCreate(_sessionType: ISessionType): void { /* default: no-op */ }

	/** Localized "no agents" error message. Subclasses can override. */
	protected _noAgentsErrorMessage(): string {
		return localize('noAgents', "Agent host has not advertised any agents yet.");
	}

	/**
	 * Initial session-config values applied to a brand-new agent-host session
	 * before its schema is resolved. Values are seeded from the profile-scoped
	 * remembered session-config map (plus legacy isolation fallback) and then
	 * normalized against policy/feature constraints. For `autoApprove`,
	 * `chat.permissions.default` takes precedence over remembered values.
	 *
	 * If enterprise policy disables global auto-approval
	 * (`chat.tools.global.autoApprove` policy value `false`), the seed is
	 * clamped to `default` so the agent host never starts in an elevated
	 * permission level the user is not allowed to pick.
	 */
	protected _initialNewSessionConfig(): Record<string, unknown> | undefined {
		const config = Object.create(null) as Record<string, unknown>;
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);

		// Seed session config values from the last user picks.
		const rememberedValues = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
		for (const [property, value] of Object.entries(rememberedValues)) {
			if (typeof value === 'string' && isSafeSessionConfigKey(property)) {
				config[property] = value;
			}
		}

		const configured = this._baseConfigurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		const normalizedConfiguredAutoApprove = normalizeAutoApproveValue(configured, policyRestricted);
		const normalizedRememberedAutoApprove = normalizeAutoApproveValue(config[SessionConfigKey.AutoApprove], policyRestricted);
		if (normalizedConfiguredAutoApprove) {
			config[SessionConfigKey.AutoApprove] = normalizedConfiguredAutoApprove;
		} else if (normalizedRememberedAutoApprove) {
			config[SessionConfigKey.AutoApprove] = normalizedRememberedAutoApprove;
		} else {
			delete config[SessionConfigKey.AutoApprove];
		}

		return Object.keys(config).length > 0 ? config : undefined;
	}

	// -- Dynamic session config ----------------------------------------------

	getSessionConfig(sessionId: string): ResolveSessionConfigResult | undefined {
		// New-session config wins (during pre-creation flow). Otherwise lazily
		// subscribe to the session's state so the running picker can seed its
		// schema/values from the AHP `SessionState.config` snapshot for sessions
		// that weren't created in this window. Each query bumps the idle timer
		// so the subscription stays alive while the picker (or any other UI
		// surface) is repeatedly reading the running config.
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			return newSession.getConfig();
		}
		this._keepSessionStateAlive(sessionId);
		return this._runningSessionConfigs.get(sessionId);
	}

	/**
	 * Observable: `true` while a `resolveSessionConfig` round-trip is in
	 * flight. Distinct from `session.loading` (which also covers the
	 * required-values-missing state) — pickers gate on this so they stay
	 * interactive when the user has to fill in required values.
	 */
	isSessionConfigResolving(sessionId: string): IObservable<boolean> {
		const newSession = this._getNewSession(sessionId);
		return newSession
			? newSession.isResolvingConfig
			: constObservable(false);
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const normalizedValue = normalizeSessionConfigValue(property, value, policyRestricted);

		// Remember config picks across sessions
		if (typeof normalizedValue === 'string' && isSafeSessionConfigKey(property)) {
			const rememberedValues = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
			const nextRememberedValues = Object.create(null) as Record<string, string>;
			for (const [key, rememberedValue] of Object.entries(rememberedValues)) {
				if (typeof rememberedValue === 'string' && isSafeSessionConfigKey(key)) {
					nextRememberedValues[key] = rememberedValue;
				}
			}
			nextRememberedValues[property] = normalizedValue;
			this._storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify(nextRememberedValues), StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		// New session: re-resolve the full config schema. Flip the
		// resolving flag and `loading` *before* firing the change event
		// so the first picker re-render already observes the in-flight
		// state.
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			// Defense-in-depth: pickers render disabled during a resolve,
			// but keyboard dropdown and mobile sheet paths bypass that.
			// Drop the second pick so it can't race the schema replacement.
			if (newSession.isResolvingConfig.get()) {
				return;
			}
			newSession.beginResolveConfigSync();
			newSession.setLoading(true);
			newSession.setConfigValue(property, normalizedValue);
			this._onDidChangeSessionConfig.fire(sessionId);
			await this._refreshNewSessionConfig(newSession);
			return;
		}

		// Running session: dispatch SessionConfigChanged for sessionMutable properties
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}
		const schema = runningConfig.schema.properties[property];
		if (!schema?.sessionMutable) {
			return;
		}

		// Update local cache optimistically
		const nextValues = { ...runningConfig.values, [property]: normalizedValue };
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
			const action = { type: ActionType.SessionConfigChanged as const, config: { [property]: normalizedValue } };
			connection.dispatch(sessionUri.toString(), action);
			void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
		}
	}

	async replaceSessionConfig(sessionId: string, values: Record<string, unknown>): Promise<void> {
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}

		// Build the outgoing payload: for every known property, prefer the
		// caller-supplied value if the property is user-editable
		// (`sessionMutable: true` and not `readOnly`), otherwise force the
		// current value through. This guarantees replace semantics never
		// alter a non-editable property even if the caller included it.
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const nextValues: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
			const editable = schema.sessionMutable === true && schema.readOnly !== true;
			if (editable) {
				nextValues[key] = normalizeSessionConfigValue(key, values[key], policyRestricted);
			} else if (Object.hasOwn(runningConfig.values, key)) {
				nextValues[key] = runningConfig.values[key];
			}
		}
		// Unknown keys from the caller are ignored (no schema entry).

		// Skip the dispatch entirely when nothing meaningful changes.
		if (equals(nextValues, runningConfig.values)) {
			return;
		}

		// Update local cache optimistically (full replace).
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host with replace semantics.
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
			const action = {
				type: ActionType.SessionConfigChanged as const,
				config: nextValues,
				replace: true,
			};
			connection.dispatch(sessionUri.toString(), action);
			void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
		}
	}

	private async _resolveRunningSessionConfig(sessionId: string, cached: AgentHostSessionAdapter, values: Record<string, unknown>): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const seq = (this._runningSessionConfigResolveSeq.get(sessionId) ?? 0) + 1;
		this._runningSessionConfigResolveSeq.set(sessionId, seq);
		try {
			const resolved = await connection.resolveSessionConfig({
				provider: cached.agentProvider,
				workingDirectory: cached.workspace.get()?.folders[0]?.root,
				config: values,
			});
			if (this._runningSessionConfigResolveSeq.get(sessionId) !== seq) {
				return;
			}
			this._runningSessionConfigs.set(sessionId, resolved);
			this._onDidChangeSessionConfig.fire(sessionId);
		} catch (err) {
			this._logService.warn(`[${this.id}] Failed to re-resolve session config for ${sessionId}: ${err}`);
		}
	}

	async getSessionConfigCompletions(sessionId: string, property: string, query?: string) {
		const newSession = this._getNewSession(sessionId);
		const connection = this.connection;
		if (!newSession || !connection) {
			return [];
		}
		const result = await newSession.getConfigCompletions(connection, property, query);
		return result.items;
	}

	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined {
		return this._getNewSession(sessionId)?.getConfigValues();
	}

	clearSessionConfig(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	// -- Root (agent host) Config --------------------------------------------

	getRootConfig(): RootConfigState | undefined {
		return this._rootConfig;
	}

	async setRootConfigValue(property: string, value: unknown): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}
		if (!current.schema.properties[property]) {
			return;
		}

		// Optimistically update local cache.
		this._rootConfig = {
			...current,
			values: { ...current.values, [property]: value },
		};
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: { [property]: value },
		};
		connection.dispatch(ROOT_STATE_URI, action);
	}

	async replaceRootConfig(values: Record<string, unknown>): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}

		// Filter to known properties so we don't dispatch values for keys the
		// host didn't publish a schema for.
		const nextValues: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			if (current.schema.properties[key]) {
				nextValues[key] = value;
			}
		}

		if (equals(nextValues, current.values)) {
			return;
		}

		this._rootConfig = { ...current, values: nextValues };
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: nextValues,
			replace: true,
		};
		connection.dispatch(ROOT_STATE_URI, action);
	}

	// -- Model selection ------------------------------------------------------

	get onDidChangeModels(): Event<void> {
		return Event.signal(this._languageModelsService.onDidChangeLanguageModels);
	}

	getModels(sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[] {
		// Agent-host models are registered against the session's resource
		// scheme (the per-host/per-agent `targetChatSessionType`). Resolve the
		// scheme from the session and return the matching language models.
		const resourceScheme = this._resolveSessionResourceScheme(sessionId);
		if (!resourceScheme) {
			return [];
		}
		return this._languageModelsService.getLanguageModelIds()
			.map((id): ILanguageModelChatMetadataAndIdentifier | undefined => {
				const metadata = this._languageModelsService.lookupLanguageModel(id);
				return metadata && metadata.targetChatSessionType === resourceScheme ? { identifier: id, metadata } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m);
	}

	getModelPickerOptions(_sessionId: string): ISessionModelPickerOptions {
		return {
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		};
	}

	private _resolveSessionResourceScheme(sessionId: string): string | undefined {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			return newSession.session.resource.scheme;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		return cached?.resource.scheme;
	}

	setModel(sessionId: string, modelId: string): void {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			newSession.setSelectedModelId(modelId);
			return;
		}

		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.modelId.set(modelId, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const resourceScheme = cached.resource.scheme;
			const rawModelId = modelId.startsWith(`${resourceScheme}:`) ? modelId.substring(resourceScheme.length + 1) : modelId;
			const model = cached.modelSelection?.id === rawModelId ? cached.modelSelection : { id: rawModelId };
			const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
			const action = { type: ActionType.SessionModelChanged as const, model };
			connection.dispatch(sessionUri.toString(), action);
		}
	}

	setAgent(sessionId: string, agent: ISessionAgentRef | undefined): void {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			newSession.setSelectedAgent(agent);
			// The selection is forwarded to the host at first-message time
			// via `sendOptions.agentHostSessionAgent` (see `sendRequest`),
			// mirroring how `userSelectedModelId` flows.
			return;
		}

		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
			const action = { type: ActionType.SessionAgentChanged as const, ...(agent ? { agent: { uri: agent.uri } } : {}) };
			connection.dispatch(sessionUri.toString(), action);
		}
	}

	getCustomAgents(sessionId: string): readonly AgentCustomization[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		return getEffectiveAgents(sessionState?.customizations);
	}

	getCustomizations(sessionId: string): Customization[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		return sessionState?.customizations ?? [];
	}

	getWorkingDirectory(sessionId: string): string | undefined {
		const sessionState = this._lastSessionStates.get(sessionId);
		return sessionState?.summary.workingDirectory;
	}

	// -- Session actions ------------------------------------------------------

	async archiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(true, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
				const action = { type: ActionType.SessionIsArchivedChanged as const, isArchived: true };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(false, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
				const action = { type: ActionType.SessionIsArchivedChanged as const, isArchived: false };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			await connection.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
			this._sessionCache.delete(rawId);
			this._runningSessionConfigs.delete(sessionId);
			this._runningSessionConfigResolveSeq.delete(sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	async renameChat(sessionId: string, _chatUri: URI, title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
			const action = { type: ActionType.SessionTitleChanged as const, title };
			connection.dispatch(sessionUri.toString(), action);
		}
	}

	async deleteChat(_sessionId: string, _chatUri: URI): Promise<void> {
		// Agent host sessions don't support deleting individual chats
	}

	async createNewChat(chatId: string): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}

		const newSession = this._getNewSession(chatId);
		if (!newSession) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		// Create the chat session model so the management service can open the widget
		await this._chatSessionsService.getOrCreateChatSession(newSession.session.resource, CancellationToken.None);
		return newSession.session.mainChat.get();
	}

	async sendRequest(chatId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newSession = this._getNewSession(chatId);
		if (!newSession) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}

		newSession.setStatus(SessionStatus.InProgress);
		const selectedModelId = newSession.getSelectedModelId();
		const selectedAgent = newSession.getSelectedAgent();

		const { query, attachedContext } = options;

		const sessionType = chatResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
			modeInfo: selectedAgent ? {
				kind: ChatModeKind.Agent,
				isBuiltin: false,
				modeInstructions: {
					uri: URI.parse(selectedAgent.uri),
					name: '',
					content: '',
					toolReferences: [],
				},
				modeId: 'custom',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			} : {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			agentHostSessionConfig: this.getCreateSessionConfig(chatId),
		};

		// Chat session model was already created by createNewChat and
		// the widget was opened by the management service. Load session
		// model and apply selected model.
		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({ selectedModel: { identifier: selectedModelId, metadata: languageModel } });
				}
			}
			if (selectedAgent) {
				// Seed the chat input's mode with the picked custom agent so the
				// agent picker shows the selection immediately. Without this it
				// would only update once the host echoed `SessionAgentChanged`
				// back after the first turn.
				modelRef.object.inputModel.setState({ mode: { id: selectedAgent.uri, kind: ChatModeKind.Agent } });
			}
			modelRef.dispose();
		}

		// Capture existing session keys before sending so we can detect the new
		// backend session. Must be captured before sendRequest because the
		// backend session may be created during the send and arrive via
		// notification before sendRequest resolves.
		this._ensureSessionCache();
		const existingKeys = new Set(this._sessionCache.keys());
		// The eagerly-created session may already be cached before first send.
		// Treat that raw id as the session we are waiting for, not old state.
		const newSessionRawId = chatResource.path.replace(/^\//, '');
		existingKeys.delete(newSessionRawId);

		const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
		}

		newSession.setStatus(SessionStatus.InProgress);
		newSession.clearSelectedModelId();
		newSession.clearSelectedAgent();
		// Seed the title from the first line of the query so the new-session
		// tab shows something meaningful immediately. This skeleton is replaced
		// by the committed AgentHostSession once it arrives.
		newSession.setTitle(query.split('\n')[0].substring(0, 100) || localize('new session', "New Session"));
		const skeleton = newSession.session;
		this._pendingSession = skeleton;
		this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });

		try {
			const committedSession = await this._waitForNewSession(existingKeys);
			if (committedSession) {
				this._preserveNewSessionConfig(newSession, committedSession.sessionId);
				// Session graduated: release the eager subscription without
				// firing `disposeSession`. The session handler has already
				// acquired its own subscription (chat widget was opened
				// earlier), so the wire-level refcount stays positive.
				newSession.graduate();
				if (this._newSessions.get(newSession.sessionId) === newSession) {
					this._newSessions.deleteAndDispose(newSession.sessionId);
				}
				// Clear the pending session before firing the replace event so
				// that any synchronous listener calling getSessions() sees only
				// the committed session and not both.
				this._pendingSession = undefined;
				this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — fall through to the failure cleanup.
		} finally {
			// Defensive clear: covers the failure path where the try block
			// never reached the explicit clear above.
			this._pendingSession = undefined;
		}

		// On failure: drop the eager subscription without firing
		// `disposeSession`. The server-side empty-session GC will clean up
		// the provisional session if it remains; we lean on the GC rather
		// than risking a double-dispose race on transient failures.
		newSession.graduate();
		if (this._newSessions.get(newSession.sessionId) === newSession) {
			this._newSessions.deleteAndDispose(newSession.sessionId);
		}
		return skeleton;
	}

	/** Localized error message when sendRequest is invoked without a connection. Subclasses can override. */
	protected _notConnectedSendErrorMessage(): string {
		return localize('notConnectedSend', "Cannot send request: not connected to agent host.");
	}

	// -- Session config plumbing ---------------------------------------------

	/**
	 * When a session transitions from untitled (new) to committed (running),
	 * carry over the full resolved config (schema + values) so consumers like
	 * the session-settings JSONC editor can round-trip non-mutable values
	 * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
	 * behavior is still driven off the per-property `sessionMutable` flag.
	 */
	private _preserveNewSessionConfig(newSession: NewSession, committedSessionId: string): void {
		const config = newSession.getConfig();
		if (config && Object.keys(config.schema.properties).length > 0) {
			this._runningSessionConfigs.set(committedSessionId, {
				schema: { type: 'object', properties: { ...config.schema.properties } },
				values: { ...config.values },
			});
		}
	}

	protected _rawIdFromChatId(chatId: string): string | undefined {
		const prefix = `${this.id}:`;
		const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
		try {
			return URI.parse(resourceStr).path.substring(1) || undefined;
		} catch {
			return undefined;
		}
	}

	// -- Lazy session-state subscription seeding -----------------------------

	/**
	 * Idle window before a lazily-created session-state subscription is
	 * released. Each call to {@link _keepSessionStateAlive} resets the timer.
	 * Long enough to absorb the open→config-picker churn while a session view
	 * is active; short enough that closed sessions release within a minute or
	 * so, allowing the agent host to evict their cached restored state.
	 */
	private static readonly SESSION_STATE_SUBSCRIPTION_IDLE_MS = 30_000;

	/**
	 * Bump the idle-release timer for `sessionId` and lazily create the
	 * underlying subscription if needed. Called from query paths
	 * ({@link getSessionByResource}, {@link getSessionConfig}) that depend on
	 * `_runningSessionConfigs` / `_meta` being in sync but cannot themselves
	 * own a subscription handle.
	 */
	private _keepSessionStateAlive(sessionId: string): void {
		this._ensureSessionStateSubscription(sessionId);
		if (!this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		this._sessionStateIdleTimers.set(
			sessionId,
			disposableTimeout(
				() => {
					this._sessionStateIdleTimers.deleteAndDispose(sessionId);
					this._sessionStateSubscriptions.deleteAndDispose(sessionId);
				},
				BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS,
			),
		);
	}

	/**
	 * Lazily acquire a session-state subscription for `sessionId` so that
	 * `_runningSessionConfigs` is seeded from the AHP `SessionState.config`
	 * snapshot. Safe to call repeatedly — no-op once a subscription exists.
	 *
	 * The subscription is reference-counted by {@link IAgentConnection.getSubscription},
	 * so when the session handler is also subscribed (chat content open) this
	 * shares the existing wire subscription rather than opening a new one.
	 */
	private _ensureSessionStateSubscription(sessionId: string): void {
		if (this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
		const ref = connection.getSubscription(StateComponents.Session, sessionUri, 'BaseAgentHostSessionsProvider.summary');
		const store = new DisposableStore();
		store.add(ref);
		store.add(ref.object.onDidChange(state => {
			this._applySessionStateUpdate(sessionId, state);
		}));
		this._sessionStateSubscriptions.set(sessionId, store);

		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._applySessionStateUpdate(sessionId, value);
		}
	}

	/**
	 * Fan-out for AHP `SessionState` snapshots: keeps both the running
	 * session config and the cached adapter's `_meta` (e.g. git state) in
	 * sync.
	 */
	private _applySessionStateUpdate(sessionId: string, state: SessionState): void {
		const previous = this._lastSessionStates.get(sessionId);
		this._lastSessionStates.set(sessionId, state);
		// Only fire when the inputs to `getCustomAgents` actually change.
		// `SessionState` updates fire for every turn-status / activity / meta
		// change too — firing on all of them caused excessive picker
		// recomputes (and a feedback loop with `setAgent`).
		if (!previous || customizationsChanged(previous, state)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
		this._seedRunningConfigFromState(sessionId, state);
		this._applySessionMetaFromState(sessionId, state);
	}

	/**
	 * NewSession variant of {@link _applySessionStateUpdate}: writes the
	 * customizations subset (the only one the agent picker reads) and
	 * fires `_onDidChangeCustomAgents` when it changes. Skips
	 * {@link _seedRunningConfigFromState} (NewSession owns its own config
	 * via `NewSession._config`) and {@link _applySessionMetaFromState}
	 * (which only applies to cached running sessions).
	 */
	private _handleNewSessionStateUpdate(sessionId: string, state: SessionState): void {
		const previous = this._lastSessionStates.get(sessionId);
		this._lastSessionStates.set(sessionId, state);
		if (!previous || customizationsChanged(previous, state)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
	}

	/**
	 * Cleanup sentinel from {@link NewSession.dispose}: drops the cached
	 * `_lastSessionStates` entry the new session contributed. Fires
	 * `_onDidChangeCustomAgents` so any open picker re-reads and falls
	 * back to the empty list rather than rendering stale agents.
	 */
	private _handleNewSessionStateGone(sessionId: string): void {
		if (this._lastSessionStates.delete(sessionId)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
	}

	private _applySessionMetaFromState(sessionId: string, state: SessionState): void {
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		if (cached.setMeta(state._meta)) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	/**
	 * Seed {@link _runningSessionConfigs} from the AHP `SessionState.config`
	 * snapshot. Keeps the full schema + values (including non-mutable ones)
	 * so consumers like the JSONC settings editor can round-trip all values
	 * through a replace dispatch. No-op if structurally equal to avoid spurious
	 * `onDidChangeSessionConfig` fires.
	 */
	private _seedRunningConfigFromState(sessionId: string, state: SessionState): void {
		const stateConfig = state.config;
		if (!stateConfig) {
			return;
		}
		if (Object.keys(stateConfig.schema.properties).length === 0) {
			return;
		}
		const existing = this._runningSessionConfigs.get(sessionId);
		let seeded: ResolveSessionConfigResult;
		if (existing && this._runningSessionConfigResolveSeq.has(sessionId)) {
			const values = { ...existing.values };
			for (const key of Object.keys(existing.schema.properties)) {
				if (Object.hasOwn(stateConfig.values, key)) {
					values[key] = stateConfig.values[key];
				}
			}
			seeded = {
				schema: { type: 'object', properties: { ...existing.schema.properties } },
				values,
			};
		} else {
			seeded = {
				schema: {
					type: 'object',
					properties: {
						...(existing?.schema.properties ?? {}),
						...stateConfig.schema.properties,
					},
				},
				values: {
					...(existing?.values ?? {}),
					...stateConfig.values,
				},
			};
		}
		if (existing && resolvedConfigsEqual(existing, seeded)) {
			return;
		}
		this._runningSessionConfigs.set(sessionId, seeded);
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	// -- Session cache management --------------------------------------------

	protected _ensureSessionCache(): void {
		if (this._cacheInitialized) {
			return;
		}
		// `_refreshSessions` owns `_cacheInitialized` — it flips it to `true`
		// only once `listSessions()` actually returns. A call that races
		// before the connection/auth is ready will fail and arm a retry
		// rather than permanently pinning an empty cache. Don't launch a new
		// refresh while one is already in flight or a backoff retry is already
		// scheduled — otherwise every synchronous `getSessions()` during the
		// failure window would hammer the agent/auth path and bypass the
		// backoff.
		if (this._sessionRefreshInFlight || this._sessionRefreshRetry.value) {
			return;
		}
		this._refreshSessions();
	}

	protected async _refreshSessions(announceExistingAsAdded = false): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		// Cancel any pending retry; this attempt supersedes it.
		this._sessionRefreshRetry.clear();
		this._sessionRefreshInFlight = true;
		try {
			const sessions = await connection.listSessions();
			// A successful return (even an empty list) means the cache is
			// authoritative. Mark it initialized and reset the backoff.
			this._cacheInitialized = true;
			this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
			const currentKeys = new Set<string>();
			const added: ISession[] = [];
			const changed: ISession[] = [];

			for (const meta of sessions) {
				const rawId = AgentSession.id(meta.session);
				currentKeys.add(rawId);

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					if (announceExistingAsAdded) {
						added.push(existing);
					}
					if (existing.update(meta)) {
						changed.push(existing);
					}
				} else {
					const cached = this.createAdapter(meta);
					this._sessionCache.set(rawId, cached);
					added.push(cached);
				}
			}

			const removed: ISession[] = [];
			// Some hosts briefly omit the just-sent eager session from listSessions.
			// Keep the pending session visible until sendRequest graduates it.
			const pendingRawId = this._pendingSession?.resource.path.replace(/^\//, '');
			for (const [key, cached] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					if (key === pendingRawId) {
						continue;
					}
					this._sessionCache.delete(key);
					this._runningSessionConfigs.delete(cached.sessionId);
					this._runningSessionConfigResolveSeq.delete(cached.sessionId);
					removed.push(cached);
				}
			}

			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				this._onDidChangeSessions.fire({ added, removed, changed });
			}
		} catch (err) {
			// The connection / agent may not be ready yet — e.g. the agent
			// throws `AHP_AUTH_REQUIRED` until its token is effective
			// server-side, or there's a transient offline/network error. We
			// must NOT mark the cache initialized (that would conflate a
			// failure with a genuinely-empty success and never recover), and
			// we deliberately do NOT pop a sign-in dialog just to render the
			// list. Instead, retry silently in the background with backoff.
			this._logService.trace(`[AgentHostSessionsProvider] listSessions failed; scheduling retry: ${err}`);
			this._scheduleSessionRefreshRetry(announceExistingAsAdded);
		} finally {
			this._sessionRefreshInFlight = false;
		}
	}

	/**
	 * Arm a backoff retry of {@link _refreshSessions}. Used after a failed
	 * refresh so a transient startup failure self-heals without requiring an
	 * unrelated AHP event (a turn completing, a session being added) to force
	 * a re-fetch. Cancelled on the next successful refresh.
	 */
	private _scheduleSessionRefreshRetry(announceExistingAsAdded: boolean): void {
		const delay = this._sessionRefreshRetryDelay;
		this._sessionRefreshRetryDelay = Math.min(delay * 2, BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS);
		this._sessionRefreshRetry.value = disposableTimeout(() => {
			this._refreshSessions(announceExistingAsAdded);
		}, delay);
	}

	/**
	 * Cancel any pending session-refresh retry and reset the backoff. Called
	 * by subclasses when the connection goes away (the stale timer would
	 * otherwise fire against a dead connection and no-op).
	 */
	protected _cancelSessionRefreshRetry(): void {
		this._sessionRefreshRetry.clear();
		this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
	}


	private async _waitForNewSession(existingKeys: Set<string>): Promise<ISession | undefined> {
		await this._refreshSessions();
		for (const [key, cached] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return cached;
			}
		}

		const waitDisposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<ISession | undefined>((resolve) => {
				waitDisposables.add(this._onDidChangeSessions.event(e => {
					const newSession = e.added.find(s => {
						const rawId = s.resource.path.substring(1);
						return !existingKeys.has(rawId);
					});
					if (newSession) {
						resolve(newSession);
					}
				}));
				waitDisposables.add(this.onConnectionLost(() => resolve(undefined)));
			});
			return await raceTimeout(sessionPromise, 30_000);
		} finally {
			waitDisposables.dispose();
		}
	}

	// -- AHP notification / action handlers ----------------------------------

	/**
	 * Wire AHP notification and action listeners on the given connection.
	 * Subclasses call this from their constructor (local) or `setConnection`
	 * (remote), passing a store that bounds the listeners' lifetime.
	 */
	protected _attachConnectionListeners(connection: IAgentConnection, store: DisposableStore): void {
		store.add(connection.onDidNotification(n => {
			if (n.type === NotificationType.SessionAdded) {
				this._handleSessionAdded(n.summary);
			} else if (n.type === NotificationType.SessionRemoved) {
				this._handleSessionRemoved(n.session);
			} else if (n.type === NotificationType.SessionSummaryChanged) {
				this._handleSessionSummaryChanged(n.session, n.changes);
			}
		}));

		store.add(connection.onDidAction(e => {
			if (e.action.type === ActionType.SessionTurnComplete && isSessionAction(e.action)) {
				this._refreshSessions();
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.channel, e.action.title);
			} else if (e.action.type === ActionType.SessionModelChanged && isSessionAction(e.action)) {
				this._handleModelChanged(e.channel, e.action.model);
			} else if (e.action.type === ActionType.SessionAgentChanged && isSessionAction(e.action)) {
				this._handleAgentChanged(e.channel, e.action.agent);
			} else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
				this._handleIsArchivedChanged(e.channel, e.action.isArchived);
			} else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
				this._handleConfigChanged(e.channel, e.action.config, e.action.replace === true);
			} else if (e.action.type === ActionType.SessionChangesetsChanged && isSessionAction(e.action)) {
				this._handleChangesetsChanged(e.channel, e.action.changesets);
			}
		}));
	}

	private _handleSessionAdded(summary: SessionSummary): void {
		const sessionUri = URI.parse(summary.resource);
		const rawId = AgentSession.id(sessionUri);
		if (this._sessionCache.has(rawId)) {
			return;
		}

		const workingDir = typeof summary.workingDirectory === 'string'
			? this.mapWorkingDirectoryUri(URI.parse(summary.workingDirectory))
			: undefined;
		const meta: IAgentSessionMetadata = {
			session: sessionUri,
			startTime: summary.createdAt,
			modifiedTime: summary.modifiedAt,
			summary: summary.title,
			activity: summary.activity,
			status: summary.status,
			...(summary.project ? {
				project: {
					displayName: summary.project.displayName,
					uri: this.mapProjectUri(URI.parse(summary.project.uri))
				}
			} : {}),
			model: summary.model,
			agent: summary.agent,
			workingDirectory: workingDir,
			changesets: summary.changesets,
			isArchived: !!(summary.status & ProtocolSessionStatus.IsArchived),
		};
		const cached = this.createAdapter(meta);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			this._sessionCache.delete(rawId);
			this._runningSessionConfigs.delete(cached.sessionId);
			this._runningSessionConfigResolveSeq.delete(cached.sessionId);
			this._sessionStateIdleTimers.deleteAndDispose(cached.sessionId);
			this._sessionStateSubscriptions.deleteAndDispose(cached.sessionId);
			this._lastSessionStates.delete(cached.sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleModelChanged(session: string, model: ModelSelection): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.modelSelection = model;
		}
		const modelId = cached ? `${cached.resource.scheme}:${model.id}` : undefined;
		if (cached && cached.modelId.get() !== modelId) {
			cached.modelId.set(modelId, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleAgentChanged(session: string, agent: AgentSelection | undefined): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const nextMode = agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined;
		if (!modeEquals(cached.mode.get(), nextMode)) {
			cached.mode.set(nextMode, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsArchivedChanged(session: string, isArchived: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(isArchived, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleSessionSummaryChanged(session: string, changes: Partial<SessionSummary>): void {
		transaction((tx) => {
			const rawId = AgentSession.id(session);
			const cached = this._sessionCache.get(rawId);
			if (!cached) {
				return;
			}

			let didChange = false;

			if (changes.status !== undefined) {
				const uiStatus = mapProtocolStatus(changes.status);
				if (uiStatus !== cached.status.get()) {
					cached.status.set(uiStatus, tx);
					didChange = true;
				}

				const isArchived = !!(changes.status & ProtocolSessionStatus.IsArchived);
				if (isArchived !== cached.isArchived.get()) {
					cached.isArchived.set(isArchived, tx);
					didChange = true;
				}
			}

			if (changes.title !== undefined && changes.title !== cached.title.get()) {
				cached.title.set(changes.title, tx);
				didChange = true;
			}

			// `changes.changesets` carries the catalogue (counts + URI
			// templates). The chip aggregate is recomputed from those counts
			// here; per-file detail is not part of this notification path.
			if (changes.changesets !== undefined) {
				cached.updateChangesets(changes.changesets);
				if (cached.setChangesSummary(changes.changesets)) {
					didChange = true;
				}
			}

			if (Object.prototype.hasOwnProperty.call(changes, 'activity') && cached.setActivity(changes.activity)) {
				didChange = true;
			}

			if (didChange) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			}
		});
	}

	private _handleConfigChanged(session: string, config: Record<string, unknown>, replace: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionId = cached.sessionId;
		const existing = this._runningSessionConfigs.get(sessionId);
		if (existing) {
			this._runningSessionConfigs.set(sessionId, {
				...existing,
				values: replace ? { ...config } : { ...existing.values, ...config },
			});
		} else {
			// Session was restored (e.g. after reload) — create a minimal
			// config entry from the changed values so the picker can render.
			// `replace` vs merge is moot here (no existing values to merge with).
			this._runningSessionConfigs.set(sessionId, {
				schema: { type: 'object', properties: buildMutableConfigSchema(config) },
				values: config,
			});
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	private _handleChangesetsChanged(session: string, changesets: readonly ChangesetSummary[] | undefined): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.updateChangesets(changesets);
		}
	}

	/**
	 * Optional URI mapper used when applying diff changes. Subclasses
	 * override to translate remote diff URIs into agent-host URIs.
	 */
	protected _diffUriMapper(): ((uri: URI) => URI) | undefined { return undefined; }
}
