/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentSessionMetadata } from '../common/agent.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, changesetSession, ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { ChangesetFileMonitorCoordinator } from './agentHostChangesetFileMonitorCoordinator.js';
import { AgentHostStateManager, ChatRemovalReason, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { isAnyAgentMergeEnabled } from '../common/agentMerge.js';
import { getWorkingDirectoryKey } from '../common/agentHostWorkingDirectories.js';
import { ChatOriginKind, isAhpChatChannel, parseSubagentSessionUri, type SessionConfigState } from '../common/state/sessionState.js';
import { ActionType } from '../common/state/sessionActions.js';
import { getSummaryChangesetKind } from './agentHostChangesetSummary.js';
import { resolveBranchChangesetScopeForOwner, resolveBranchChangesetScopeForSource } from './agentHostBranchChangesetScope.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

/**
 * Raw metadata blob values for the session DB, batch-read by the caller.
 * Keys are the changeset-specific metadata keys (the durable changes summary); values are
 * the raw `string | undefined` payloads as returned by `ISessionDatabase.getMetadataObject`.
 */
export type IChangesetSessionMetadata = Record<string, string | undefined>;

/** Restores the session containing a changeset owner and returns it, or `undefined` when its owner is unknown. */
export type ChangesetOwnerRestorer = (ownerUri: string, sessionUri: string | undefined) => Promise<string | undefined>;

/**
 * Coordinator that encapsulates all `AgentService`-side orchestration of
 * the changeset feature. Sits between `AgentService` (which owns session
 * lifecycle / subscription refcounting / batched DB reads) and
 * {@link IAgentHostChangesetService} (which owns compute / publish /
 * persist primitives).
 *
 * Owns only URI routing and forwards lifecycle signals. Subscription state is
 * recorded in the shared changeset subscription service. All computation,
 * working-directory gating, and materialization refreshes live in
 * {@link IAgentHostChangesetService}.
 *
 * No per-session controllers — the cross-cutting concerns (listSessions
 * overlay, subscribe URI routing) inherently span sessions, so a single
 * coordinator with internal maps is simpler than per-session RAII.
 */
export class AgentHostChangesetCoordinator extends Disposable {
	private readonly _changesetFileMonitor: ChangesetFileMonitorCoordinator;
	private readonly _branchSummaryResources = new Map<string, Map<string, { resource: string; owner: string }>>();
	/** Cold changeset subscriptions awaiting their session's restore, with the containing session known so far. */
	private readonly _pendingChangesetSubscriptions = new Map<string, string | undefined>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetOperationService private readonly _changesetOperationService: IAgentHostChangesetOperationService,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();

		this._changesetFileMonitor = this._register(instantiationService.createInstance(ChangesetFileMonitorCoordinator));
		this._register(this._gitStateService.onDidRefreshSessionGitState(sessionStr => this.onDidRunSessionGitStateRefresh(sessionStr)));
		this._register(this._gitStateService.onDidChangeSessionGitHubState(sessionStr => this._changesetOperationService.scheduleRelatedOperationsUpdate(sessionStr)));
		this._register(this._stateManager.onDidChangeSessionWorkingDirectories(({ session }) => this.onDidChangeSessionWorkingDirectories(session)));
		this._register(this._stateManager.onDidChangeSessionConfig(event => this.onDidChangeSessionConfig(event.session, event.previous, event.current)));
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionChatRemoved) {
				this._onChatRemoved(envelope.channel, envelope.action.chat);
			}
		}));
	}

	// ---- Lifecycle hooks ----------------------------------------------------

	/**
	 * Seeds the default chat's create-time catalogue and registers its backing
	 * changeset state before `SessionReady` is dispatched.
	 */
	onSessionCreated(sessionStr: string): void {
		this._changesets.refreshChangesetCatalog(sessionStr);
		this._changesets.registerStaticChangesets(sessionStr);
		this._onDefaultChatAvailable(sessionStr);
	}

	/** Seeds the catalogue and static repository changesets for an available chat state. */
	onChatAvailable(chat: string): void {
		if (!this._stateManager.getChatState(chat)) {
			return;
		}
		this._changesets.refreshChangesetCatalog(chat);
		this._changesets.registerStaticChangesets(chat);
		this._changesets.ensureChatChangesSummary(chat);
		if (!this._isSubagentChat(chat)) {
			void this._gitStateService.refreshSessionGitState(chat);
		}
		const session = this._chatOwnership.getChatOwner(chat);
		if (session
			&& this._changesetSubscriptions.getSessionSubscriptions(session).has(session)
			&& getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values) === ChangesetKind.Branch) {
			this._reconcileBranchSummaryResources(session);
		}
	}

	/**
	 * Called at session restore time. Registers the static changeset URIs;
	 * their contents are computed live, never reseeded from persisted state.
	 */
	onSessionRestored(sessionStr: string): void {
		this._changesets.refreshChangesetCatalog(sessionStr);
		this._changesets.registerStaticChangesets(sessionStr);
		this._onDefaultChatAvailable(sessionStr);
		// Recompute the current subscriptions now that the restored working
		// directory is available.
		this._changesets.onWorkingDirectoryAvailable(sessionStr);
		this._changesetFileMonitor.onSessionRestored(sessionStr);
	}

	/** Refreshes the catalogue and summary interest after replacing the previous config during restore. */
	onSessionConfigRestored(sessionStr: string, previous: SessionConfigState | undefined): void {
		this._refreshChangesetCatalogs(sessionStr);
		this._refreshSummarySource(sessionStr, previous);
	}

	/**
	 * Called when a provisional session is materialized (working directory
	 * becomes known). Recomputes every current changeset subscription.
	 */
	onSessionMaterialized(sessionStr: string): void {
		this._refreshChangesetCatalogs(sessionStr);
		this._changesets.onWorkingDirectoryAvailable(sessionStr);

		this._changesetFileMonitor.onSessionMaterialized(sessionStr);
	}

	/** Refreshes the chat catalogues after the session becomes ready. */
	onSessionReady(sessionStr: string): void {
		this._refreshChangesetCatalogs(sessionStr);
	}

	onSessionDisposed(sessionStr: string): void {
		for (const [resource, session] of this._pendingChangesetSubscriptions) {
			const parsed = parseChangesetUri(resource);
			if ((session ?? (parsed && this._containingSession(parsed))) === sessionStr) {
				this._pendingChangesetSubscriptions.delete(resource);
			}
		}
		this._changesets.onChangesetOwnerRemoved?.(sessionStr);
		for (const owner of new Set([...this._branchSummaryResources.get(sessionStr)?.values() ?? []].map(resource => resource.owner))) {
			this._changesets.onChangesetOwnerRemoved?.(owner);
		}
		this._clearBranchSummaryResources(sessionStr, false);
		this._changesetFileMonitor.onSessionDisposed(sessionStr);
		this._changesetSubscriptions.clearSessionSubscriptions(sessionStr);
		for (const chat of this._stateManager.getSessionState(sessionStr)?.chats ?? []) {
			this._changesets.onChangesetOwnerRemoved?.(chat.resource);
			this._changesetFileMonitor.onSessionDisposed(chat.resource);
			this._changesetSubscriptions.clearSessionSubscriptions(chat.resource);
		}
	}

	onSessionTurnActiveChanged(sessionStr: string, active: boolean): void {
		this._changesetFileMonitor.onSessionTurnActiveChanged(sessionStr, active);

		// Advertised operations are disabled while a turn is active so the
		// working tree / branch state can't be mutated mid-request; recompute
		// them whenever the active-turn state flips.
		this._changesetOperationService.updateOperations(sessionStr);
		for (const chat of this._stateManager.getSessionState(sessionStr)?.chats ?? []) {
			this._changesetFileMonitor.onSessionTurnActiveChanged(chat.resource, active);
		}
	}

	private onDidChangeSessionConfig(session: string, previous: SessionConfigState | undefined, current: SessionConfigState | undefined): void {
		this._refreshSummarySource(session, previous);
		const sessionFolder = this._stateManager.getSessionSummary(session)?.workingDirectories?.[0];
		const sessionFolderKey = sessionFolder ? getWorkingDirectoryKey(sessionFolder) : undefined;
		const wasEnabled = isAnyAgentMergeEnabled(previous?.values, sessionFolderKey);
		const isEnabled = isAnyAgentMergeEnabled(current?.values, sessionFolderKey);
		if (wasEnabled !== isEnabled) {
			this._refreshChangesetCatalogs(session);
		}
	}

	private _refreshChangesetCatalogs(session: string): void {
		this._changesets.refreshChangesetCatalog(session);
		for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
			this._changesets.refreshChangesetCatalog(chat.resource);
		}
	}

	private _refreshSummarySource(session: string, previous: SessionConfigState | undefined): void {
		const kind = getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values);
		if (kind !== getSummaryChangesetKind(previous?.values)) {
			for (const { resource } of this._branchSummaryResources.get(session)?.values() ?? []) {
				this._changesetOperationService.updateOperations(session, resource);
			}
			this._changesetOperationService.updateOperations(session, buildSessionChangesetUri(session));
			if (kind === ChangesetKind.Branch) {
				this._reconcileBranchSummaryResources(session);
			} else {
				this._clearBranchSummaryResources(session);
				this._changesets.recomputeSubscribedChangesets(session);
			}
		}
	}

	// ---- Subscription hooks -------------------------------------------------

	/**
	 * Called on every `addSubscriber` 0→1 transition. When `resource` is a
	 * static changeset URI, triggers the first git-diff refresh (the
	 * changeset service skips it when the working directory is not yet
	 * known).
	 *
	 * Both {@link AgentService.subscribe} and the handshake fast-path
	 * (`ProtocolServerHandler.initialSubscriptions`) call into
	 * `addSubscriber`, so this single hook covers both paths.
	 */
	onFirstSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		const containingSession = parsed && this._containingSession(parsed);
		const sessionLoaded = containingSession !== undefined && !!this._stateManager.getSessionState(containingSession);
		if (parsed && parsed.ownerUri !== containingSession && !sessionLoaded
			&& (parsed.kind === ChangesetKind.Branch || parsed.kind === ChangesetKind.Uncommitted || parsed.kind === ChangesetKind.Turn || parsed.kind === ChangesetKind.Session || parsed.kind === ChangesetKind.WorkingSet)) {
			this._pendingChangesetSubscriptions.set(resourceStr, containingSession);
		}

		if (!parsed && isAhpChatChannel(resourceStr)) {
			this.onChatAvailable(resourceStr);
			return;
		}

		if (!parsed && this._stateManager.getSessionState(resourceStr)) {
			this.ensureSessionSubscription(resourceStr);
			return;
		}

		if (parsed?.kind === ChangesetKind.Branch) {
			this._addSubscription(parsed.ownerUri, resourceStr);
			this._changesets.refreshBranchChangeset(parsed.ownerUri);
			this._trackBranchChangeset(resourceStr, parsed.ownerUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._addSubscription(parsed.ownerUri, resourceStr);
			if (sessionLoaded) {
				void this._changesets.computeUncommittedChangeset(parsed.ownerUri);
			}
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.ownerUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Session) {
			this._addSubscription(parsed.ownerUri, resourceStr);
			this._changesets.refreshSessionChangeset(parsed.ownerUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.WorkingSet) {
			this._addSubscription(parsed.ownerUri, resourceStr);
			this._changesets.refreshWorkingSetChangeset(parsed.ownerUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			this._addSubscription(parsed.ownerUri, resourceStr);
			if (sessionLoaded) {
				void this._changesets.computeTurnChangeset(parsed.ownerUri, parsed.turnId, 'fileEditTracker');
			}
			return;
		}
	}

	/** Installs implicit summary interest once state exists, including after a concurrent cold restore. */
	ensureSessionSubscription(session: string): void {
		if (
			!this._stateManager.getSessionState(session) ||
			this._changesetSubscriptions.getSessionSubscriptions(session).has(session)
		) {
			return;
		}

		this._addSubscription(session, session);
		const kind = getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values);
		if (kind === ChangesetKind.Branch) {
			this._reconcileBranchSummaryResources(session);
		} else {
			this._changesets.refreshSessionChangeset(session);
		}
	}

	private _ensureBranchSummarySubscription(owner: string): string | undefined {
		const changesets = isAhpChatChannel(owner)
			? this._stateManager.getChatState(owner)?.changesets
			: this._stateManager.getSessionState(owner)?.changesets;
		const entry = changesets?.find(candidate => parseChangesetUri(candidate.uriTemplate)?.kind === ChangesetKind.Branch);
		const resource = entry?.uriTemplate ?? buildBranchChangesetUri(resolveBranchChangesetScopeForSource(this._stateManager, owner).ownerUri);
		const parsed = resource ? parseChangesetUri(resource) : undefined;
		if (!resource || !parsed) {
			return undefined;
		}

		const session = (isAhpChatChannel(owner) ? this._chatOwnership.getChatOwner(owner) : undefined) ?? owner;
		let resourcesBySource = this._branchSummaryResources.get(session);
		if (!resourcesBySource) {
			resourcesBySource = new Map();
			this._branchSummaryResources.set(session, resourcesBySource);
		}
		const previous = resourcesBySource.get(owner);
		resourcesBySource.set(owner, { resource, owner: parsed.ownerUri });
		if (previous && previous.resource !== resource) {
			this._releaseBranchSummaryResource(previous);
		}
		this._changesetOperationService.updateOperations(session, resource);
		this._changesets.refreshBranchChangeset(parsed.ownerUri);
		this._trackBranchChangeset(resource, parsed.ownerUri);
		return resource;
	}

	private _trackBranchChangeset(resource: string, owner: string): void {
		const source = resolveBranchChangesetScopeForOwner(this._stateManager, owner)?.sourceUri;
		if (source) {
			this._changesetFileMonitor.trackSessionChanges(resource, owner, source);
		}
	}

	/** Makes the session's default chat available once the session is in state. */
	private _onDefaultChatAvailable(session: string): void {
		const defaultChat = this._chatOwnership.getDefaultChat(session);
		if (defaultChat !== undefined) {
			this.onChatAvailable(defaultChat);
		}
	}

	private _reconcileBranchSummaryResources(session: string): void {
		const defaultChat = this._chatOwnership.getDefaultChat(session);
		const desiredSources = new Set([
			...(defaultChat !== undefined ? [defaultChat] : []),
			...this._stateManager.getSessionState(session)?.chats
				.map(chat => chat.resource)
				.filter(candidate => candidate !== defaultChat) ?? [],
		]);
		for (const source of desiredSources) {
			this._ensureBranchSummarySubscription(source);
		}

		const resourcesBySource = this._branchSummaryResources.get(session);
		if (!resourcesBySource) {
			return;
		}
		for (const [source, resource] of [...resourcesBySource]) {
			if (desiredSources.has(source)) {
				continue;
			}
			resourcesBySource.delete(source);
			this._releaseBranchSummaryResource(resource);
		}
		if (resourcesBySource.size === 0) {
			this._branchSummaryResources.delete(session);
		}
	}

	private _releaseBranchSummaryResource({ resource, owner }: { resource: string; owner: string }, cancelPending = true): void {
		if (this._hasBranchSummaryResource(resource)) {
			return;
		}
		if (!this._changesetSubscriptions.getSessionSubscriptions(owner).has(resource)) {
			if (cancelPending) {
				this._changesets.onChangesetOwnerRemoved?.(owner);
			}
			this._changesetFileMonitor.untrackSessionChanges(resource);
		}
	}

	private _hasBranchSummaryResource(resource: string): boolean {
		return [...this._branchSummaryResources.values()].some(resources =>
			[...resources.values()].some(candidate => candidate.resource === resource)
		);
	}

	private _containingSession(parsed: { readonly ownerUri: string; readonly sessionUri: string | undefined }): string | undefined {
		return changesetSession(parsed, chat => this._chatOwnership.getChatOwner(chat));
	}

	private _onChatRemoved(session: string, chat: string): void {
		// A moved chat keeps its own changesets.
		if (this._stateManager.chatRemovalReason(session, chat) === ChatRemovalReason.Moved) {
			this._reconcileRemovedChatBranchSummary(session);
			return;
		}
		for (const resource of this._pendingChangesetSubscriptions.keys()) {
			if (parseChangesetUri(resource)?.ownerUri === chat) {
				this._pendingChangesetSubscriptions.delete(resource);
			}
		}
		this._changesetFileMonitor.onSessionDisposed(chat);
		this._changesetSubscriptions.clearSessionSubscriptions(chat);
		this._changesets.onChangesetOwnerRemoved?.(chat);
		this._reconcileRemovedChatBranchSummary(session);
	}

	private _reconcileRemovedChatBranchSummary(session: string): void {
		if (this._changesetSubscriptions.getSessionSubscriptions(session).has(session)
			&& getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values) === ChangesetKind.Branch) {
			this._reconcileBranchSummaryResources(session);
		}
	}

	private _clearBranchSummaryResources(session: string, cancelPending = true): void {
		const resources = this._branchSummaryResources.get(session);
		if (!resources) {
			return;
		}
		this._branchSummaryResources.delete(session);
		for (const resource of resources.values()) {
			this._releaseBranchSummaryResource(resource, cancelPending);
		}
	}

	/**
	 * Called when a resource's last subscriber drops. Removes the
	 * changeset from the session's subscription set so a later
	 * materialization / git-state recompute (driven by
	 * {@link IAgentHostChangesetService.recomputeSubscribedChangesets})
	 * naturally skips it — no explicit cancellation needed.
	 */
	onLastSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		this._pendingChangesetSubscriptions.delete(resourceStr);
		if (parsed?.kind === ChangesetKind.Branch) {
			this._removeSubscription(parsed.ownerUri, resourceStr);
			if (!this._hasBranchSummaryResource(resourceStr)) {
				this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			}
			return;
		}
		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._removeSubscription(parsed.ownerUri, resourceStr);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Session || parsed?.kind === ChangesetKind.WorkingSet) {
			this._removeSubscription(parsed.ownerUri, resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			this._removeSubscription(parsed.ownerUri, resourceStr);
			return;
		}
		if (!parsed) {
			this._removeSubscription(resourceStr, resourceStr);
			this._clearBranchSummaryResources(resourceStr);
		}
	}

	/**
	 * Restores the containing session when `resource` is a changeset URI and
	 * that session is not already live. Non-changeset URIs are ignored.
	 * `restoreOwner` resolves the containing session of the changeset's owner
	 * (a chat owner through its recorded owner), restores it, and returns it.
	 *
	 * Also starts deferred first-subscriber changeset refreshes after cold restore.
	 * It exists for the AgentService subscribe path where
	 * `addSubscriber` may have already created a placeholder changeset snapshot
	 * before the parent session restore had a chance to apply persisted diffs.
	 */
	async restoreSessionIfChangesetSubscription(resource: URI, restoreOwner: ChangesetOwnerRestorer): Promise<void> {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (!parsed) {
			return;
		}
		if (parsed.kind === ChangesetKind.Unknown) {
			throw new Error(`Cannot subscribe to unknown changeset resource: ${resourceStr}`);
		}
		let session = this._containingSession(parsed);
		if (session === undefined || !this._stateManager.getSessionState(session)) {
			session = await restoreOwner(parsed.ownerUri, parsed.sessionUri);
		}
		if (session === undefined) {
			return;
		}
		if (this._pendingChangesetSubscriptions.delete(resourceStr)
			&& this._changesetSubscriptions.getSessionSubscriptions(parsed.ownerUri).has(resourceStr)) {
			switch (parsed.kind) {
				case ChangesetKind.Branch:
					this._changesets.refreshBranchChangeset(parsed.ownerUri);
					this._trackBranchChangeset(resourceStr, parsed.ownerUri);
					break;
				case ChangesetKind.Session:
					this._changesets.refreshSessionChangeset(parsed.ownerUri);
					break;
				case ChangesetKind.WorkingSet:
					this._changesets.refreshWorkingSetChangeset(parsed.ownerUri);
					break;
				case ChangesetKind.Uncommitted:
					void this._changesets.computeUncommittedChangeset(parsed.ownerUri);
					this._changesetFileMonitor.onSessionRestored(parsed.ownerUri);
					break;
				case ChangesetKind.Turn:
					if (parsed.turnId !== undefined) {
						void this._changesets.computeTurnChangeset(parsed.ownerUri, parsed.turnId, 'fileEditTracker');
					}
					break;
			}
		}
	}

	/**
	 * If `resource` is a known changeset URI (uncommitted / session /
	 * working set / turn), seeds its state on the state manager and returns `true`.
	 * Returns `false` for non-changeset URIs so callers fall through to
	 * their default routing (session / subagent / terminal).
	 *
	 * The parent session is restored via the provided `restoreSession`
	 * callback when no live state exists yet — this matches the previous
	 * inline behaviour in `AgentService.subscribe`.
	 *
	 * Throws when the URI matches the changeset shape but the id is not
	 * a well-known kind ({@link ChangesetKind.Unknown}). The unknown-id
	 * rejection MUST fire before any parent-session restore so subscribing
	 * to a bogus child URI cannot materialize the parent as a side effect.
	 */
	async tryHandleSubscribe(resource: URI, restoreOwner: ChangesetOwnerRestorer): Promise<boolean> {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (!parsed) {
			return false;
		}
		if (parsed.kind === ChangesetKind.Unknown) {
			throw new Error(`Cannot subscribe to unknown changeset resource: ${resourceStr}`);
		}
		await this.restoreSessionIfChangesetSubscription(resource, restoreOwner);
		if (parsed.kind === ChangesetKind.Turn && parsed.turnId) {
			if (!this._stateManager.getChangesetState(resourceStr)) {
				void this._changesets.computeTurnChangeset(parsed.ownerUri, parsed.turnId, 'fileEditTracker');
			}
		} else if (parsed.kind === ChangesetKind.Compare && parsed.originalTurnId && parsed.modifiedTurnId) {
			// Compare-turns is computed once on subscribe. Both turns are
			// typically historical so the snapshot doesn't need to track
			// live edits; `onFirstSubscriber` / `onLastSubscriber` do not
			// need to participate.
			await this._changesets.computeCompareTurnsChangeset(parsed.ownerUri, parsed.originalTurnId, parsed.modifiedTurnId);
		} else if ((parsed.kind === ChangesetKind.Session && isAhpChatChannel(parsed.ownerUri)) || parsed.kind === ChangesetKind.WorkingSet) {
			// Chat-scoped Session Changes and Working Sets are not part of the
			// static changesets; register the subscribed resource so it can be
			// served before its first computation publishes files.
			this._stateManager.registerChangeset(resourceStr);
		} else {
			// Static changesets are seeded by `onSessionRestored` /
			// `onSessionCreated`. Re-register defensively in case the
			// session was created in this process before the coordinator
			// existed. The uncommitted refresh itself is fired from
			// {@link onFirstSubscriber} on the 0→1 path.
			this._changesets.registerStaticChangesets(parsed.ownerUri);
		}
		return true;
	}

	private _addSubscription(sessionStr: string, changesetStr: string) {
		this._changesetSubscriptions.addSubscription(sessionStr, changesetStr);
	}

	private _removeSubscription(sessionStr: string, changesetStr: string) {
		this._changesetSubscriptions.removeSubscription(sessionStr, changesetStr);
	}

	// ---- listSessions overlay ----------------------------------------------

	/**
	 * Returns the session-DB metadata keys to merge into a batched read
	 * for `sessionStr`, OR `undefined` when live state already answers
	 * the aggregate-counts question. Delegates to the changeset service,
	 * which owns the live-vs-persisted decision.
	 */
	getListMetadataKeys(sessionStr: string): Record<string, true> | undefined {
		return this._changesets.getListMetadataKeys(sessionStr);
	}

	/**
	 * Decorates a single listSessions entry with the `changes` aggregate
	 * (additions / deletions / files for the session-wide changeset). The
	 * aggregate computation lives in the changeset service; the coordinator
	 * only projects the result onto the entry.
	 */
	decorateListEntry(entry: IAgentSessionMetadata, metadata: IChangesetSessionMetadata, persistMigration: boolean): IAgentSessionMetadata {
		const changes = this._changesets.computeListEntryChanges(entry.session.toString(), metadata, persistMigration);
		return changes ? { ...entry, changes } : entry;
	}

	// ---- Git state  events -------------------------------------------------

	/**
	 * Called when a session's Git state is refreshed.
	 */
	private onDidRunSessionGitStateRefresh(sessionStr: string): void {
		const branchOwners = new Set<string>();
		// Session Git refreshes can complete after SessionReady, so refresh the
		// chat catalogues that own the selectable changesets.
		if (isAhpChatChannel(sessionStr)) {
			this._changesets.refreshChangesetCatalog(sessionStr);
			const branchResource = this._stateManager.getChatState(sessionStr)?.changesets
				?.find(changeset => parseChangesetUri(changeset.uriTemplate)?.kind === ChangesetKind.Branch)?.uriTemplate;
			branchOwners.add(parseChangesetUri(branchResource ?? '')?.ownerUri ?? resolveBranchChangesetScopeForSource(this._stateManager, sessionStr).ownerUri);
			const session = this._chatOwnership.getChatOwner(sessionStr);
			if (session
				&& this._changesetSubscriptions.getSessionSubscriptions(session).has(session)
				&& getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values) === ChangesetKind.Branch) {
				this._reconcileBranchSummaryResources(session);
			}
		} else {
			this._refreshChangesetCatalogs(sessionStr);
			const defaultChat = this._chatOwnership.getDefaultChat(sessionStr);
			for (const source of [
				...(defaultChat !== undefined ? [defaultChat] : []),
				...this._stateManager.getSessionState(sessionStr)?.chats.map(chat => chat.resource) ?? [],
			]) {
				branchOwners.add(resolveBranchChangesetScopeForSource(this._stateManager, source).ownerUri);
			}
			if (this._changesetSubscriptions.getSessionSubscriptions(sessionStr).has(sessionStr)
				&& getSummaryChangesetKind(this._stateManager.getSessionState(sessionStr)?.config?.values) === ChangesetKind.Branch) {
				this._reconcileBranchSummaryResources(sessionStr);
			}
		}
		for (const owner of branchOwners) {
			if (this._changesetSubscriptions.getSessionSubscriptions(owner).size > 0) {
				this._changesets.recomputeSubscribedChangesets(owner);
			}
		}

		// Git state has been refreshed so we need to recompute every
		// changeset currently subscribed for the session (the service
		// reads the exposed subscription list).
		this._changesets.recomputeSubscribedChangesets(sessionStr);
	}

	/**
	 * Called when a session's effective working-directory set changes (a root
	 * was added or removed, e.g. in the Editor Window). Multi-root suppression
	 * of `turn` / `compare-turns` operations depends on this set, so recompute
	 * operations for every subscribed changeset: `getOperations` re-applies the
	 * guard, so those changesets drop to empty when the session becomes
	 * multi-root and regain their operations when it returns to single-root.
	 *
	 * Subagent sessions inherit the parent's working directories
	 * (`getEffectiveWorkingDirectories`), so a parent change flips their
	 * multi-root state too. Refresh their operations as well, keeping the
	 * advertised operations consistent with the invoke-time suppression (which
	 * already uses the inherited set). `updateOperations` only dispatches for
	 * subscribed changesets, so refreshing subagents without subscriptions is a
	 * no-op.
	 *
	 * The changed set also determines which repository roots are watched for
	 * external edits, so re-attach the file monitor for the session (and its
	 * inheriting subagents) — otherwise a folder added or removed mid-session
	 * would not start/stop being watched until an unrelated lifecycle event.
	 */
	private onDidChangeSessionWorkingDirectories(sessionStr: string): void {
		this._changesetFileMonitor.onSessionWorkingDirectoriesChanged(sessionStr);
		if (isAhpChatChannel(sessionStr)) {
			this._changesetOperationService.scheduleRelatedOperationsUpdate(sessionStr);
			this._changesets.refreshChangesetCatalog(sessionStr);
			this._changesets.recomputeSubscribedChangesets(sessionStr);
			this._changesets.refreshChatChangesSummary(sessionStr);
			void this._gitStateService.refreshSessionGitState(sessionStr);
			const session = this._chatOwnership.getChatOwner(sessionStr);
			if (session && this._changesetSubscriptions.getSessionSubscriptions(session).has(session)) {
				if (getSummaryChangesetKind(this._stateManager.getSessionState(session)?.config?.values) === ChangesetKind.Branch) {
					this._reconcileBranchSummaryResources(session);
				} else {
					this._changesets.refreshSessionChangeset(session);
				}
			}
			return;
		}
		this._changesetOperationService.scheduleRelatedOperationsUpdate(sessionStr);
		if (this._changesetSubscriptions.getSessionSubscriptions(sessionStr).has(sessionStr)
			&& getSummaryChangesetKind(this._stateManager.getSessionState(sessionStr)?.config?.values) === ChangesetKind.Branch) {
			for (const chat of this._getChatsAffectedBySessionWorkingDirectoryChange(sessionStr)) {
				this._ensureBranchSummarySubscription(chat.resource);
			}
		} else {
			this._changesets.recomputeSubscribedChangesets(sessionStr);
		}
		for (const chat of this._getChatsAffectedBySessionWorkingDirectoryChange(sessionStr)) {
			this._changesetOperationService.scheduleRelatedOperationsUpdate(chat.resource);
			this._changesetFileMonitor.onSessionWorkingDirectoriesChanged(chat.resource);
			this._changesets.recomputeSubscribedChangesets(chat.resource);
			this._changesets.refreshChatChangesSummary(chat.resource);
			if (!this._isSubagentChat(chat.resource)) {
				void this._gitStateService.refreshSessionGitState(chat.resource);
			}
		}
		for (const candidate of this._stateManager.getSessionUris()) {
			if (parseSubagentSessionUri(candidate)?.parentSession.toString() === sessionStr) {
				this._changesetOperationService.scheduleRelatedOperationsUpdate(candidate);
				this._changesetFileMonitor.onSessionWorkingDirectoriesChanged(candidate);
			}
		}
	}

	private _getChatsAffectedBySessionWorkingDirectoryChange(session: string) {
		return this._stateManager.getSessionState(session)?.chats
			.filter(chat => this._stateManager.getChatState(chat.resource)?.workingDirectories === undefined) ?? [];
	}

	/**
	 * A subagent works in the folders of the chat that spawned it, whose Git
	 * state its scope shares, so it computes none of its own.
	 */
	private _isSubagentChat(chat: string): boolean {
		return this._stateManager.getChatOrigin(chat)?.kind === ChatOriginKind.Tool;
	}
}
