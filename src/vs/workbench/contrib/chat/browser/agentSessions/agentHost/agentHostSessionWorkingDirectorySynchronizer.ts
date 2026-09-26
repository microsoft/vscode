/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Keeps an Editor Window agent-host session's working directories in sync with
 * the multi-root workspace folders it was created against.
 *
 * ## Why
 *
 * A session's working directories are the folders its agent may read and write.
 * They are chosen when the session is created. Without this service, adding a
 * folder to the workspace would leave existing sessions unable to see it, and
 * removing one would leave them with access the user revoked.
 *
 * ## What "reconcile" means
 *
 * There is no "set the whole list" operation in the protocol, only add/remove
 * deltas. So this service compares two lists and emits the difference:
 *
 * - **current** — the directories the session has, from its authoritative state.
 * - **desired** — what it should have, derived from today's workspace folders
 *   (see `computeDesiredWorkingDirectories`).
 *
 * Folders in *desired* but not *current* are dispatched as
 * `session/workingDirectorySet`; folders in *current* but not *desired* as
 * `session/workingDirectoryRemoved`. When the two lists already agree, nothing
 * is dispatched. That comparison is the whole job — hence "reconcile".
 *
 * The primary directory (index 0) is deliberately excluded from removals: it is
 * the agent's fixed process root, so a session keeps it even after the user
 * drops it from the workspace.
 *
 * ## When it runs
 *
 * `reconcile` runs automatically on any signal that could change either list —
 * workspace folders, workspace trust, session state, or completion of the
 * protocol handshake — and can also be awaited explicitly before sending a
 * prompt, so the agent sees the current set. Runs are serialized per session,
 * and overlapping triggers collapse into one follow-up pass.
 *
 * That pre-send pass is also the backstop for eligibility inputs that are not
 * themselves triggers, such as provider capabilities arriving after a session
 * registers.
 *
 * ## Ownership
 *
 * Dispatch is ordinary optimistic AHP traffic: no acknowledgement is awaited.
 * The agent host stays authoritative — it validates every action, may reject
 * it, and the client then rolls back. Untrusted folders are never added, though
 * removals still proceed since they only reduce access.
 *
 * Only sessions that can safely follow the workspace are eligible; see
 * {@link AgentHostSessionWorkingDirectorySynchronizer._isEligible}.
 */

import { SequencerByKey } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ACTION_INTRODUCED_IN, compareProtocolVersions } from '../../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { readSessionMultiRootMetadata, readSessionWorkspaceless, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { computeDesiredWorkingDirectories, hasImmutablePrimaryWorkingDirectory } from './agentHostNewSessionFolderService.js';

export const IAgentHostSessionWorkingDirectorySynchronizer = createDecorator<IAgentHostSessionWorkingDirectorySynchronizer>('agentHostSessionWorkingDirectorySynchronizer');

/** A live session the synchronizer should keep aligned with the workspace. */
export interface IAgentHostWorkingDirectoryRegistration {
	readonly session: URI;
	/** Agent-host provider id, used to read the provider's advertised capabilities. */
	readonly provider: string;
	readonly connection: IAgentConnection;
	/** Authoritative session state, including its current working directories. */
	readonly subscription: IAgentSubscription<SessionState>;
}

export interface IAgentHostSessionWorkingDirectorySynchronizer {
	readonly _serviceBrand: undefined;

	/**
	 * Starts following `registration` until the returned disposable is disposed.
	 * Reconciliation then runs whenever the workspace, trust, session state, or
	 * protocol handshake changes.
	 */
	register(registration: IAgentHostWorkingDirectoryRegistration): IDisposable;

	/**
	 * Compares the session's current working directories against the folders it
	 * should have for today's workspace and dispatches the difference as add /
	 * remove actions. A no-op when they already match.
	 *
	 * Callers can await this before sending a prompt so the agent sees the
	 * latest set. Rejects when a folder that needs adding is untrusted — safe
	 * removals are still dispatched first.
	 */
	reconcile(session: URI, token: CancellationToken): Promise<void>;
}

interface IAgentHostWorkingDirectoryRegistrationEntry extends IAgentHostWorkingDirectoryRegistration {
	readonly store: DisposableStore;
	/**
	 * True while the subscription rolls back an action the host rejected. That
	 * rollback changes state, and reconciling on it would immediately redispatch
	 * the rejected action.
	 */
	applyingRejectedAction: boolean;
	/** A change arrived mid-run, so reconcile once more after it completes. */
	automaticReconcileAgain: boolean;
	/** An automatic reconcile is already in flight for this session. */
	automaticReconcileScheduled: boolean;
	/**
	 * True while this synchronizer dispatches its own actions. Their optimistic
	 * state updates would otherwise re-enter reconciliation.
	 */
	dispatching: boolean;
}

export class AgentHostSessionWorkingDirectorySynchronizer extends Disposable implements IAgentHostSessionWorkingDirectorySynchronizer {
	declare readonly _serviceBrand: undefined;

	/** Sessions currently being followed, keyed by session URI. */
	private readonly _registrations = new Map<string, IAgentHostWorkingDirectoryRegistrationEntry>();
	/** Serializes reconciliation per session so concurrent runs cannot interleave dispatches. */
	private readonly _reconciler = new SequencerByKey<string>();

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._scheduleAll('workspace folder change')));
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._scheduleAll('workspace trust change')));
		this._register(this._workspaceTrustManagementService.onDidChangeTrustedFolders(() => this._scheduleAll('trusted folders change')));
	}

	/**
	 * Starts following a session until the returned disposable is disposed.
	 *
	 * Builds the mutable bookkeeping entry for the session and wires the four
	 * triggers that can invalidate its working directories, each of which
	 * schedules a reconcile:
	 *
	 * - **session state changed** — its directory set moved, so re-diff it.
	 *   Skipped while this synchronizer is dispatching its own actions, and
	 *   while the subscription rolls back a host-rejected action, since either
	 *   would immediately redispatch what just happened.
	 * - **protocol handshake settled** — the working-directory actions only
	 *   exist from AHP 0.7, so a session registered before the negotiated
	 *   version is known must be re-evaluated once it arrives.
	 *
	 * Workspace-folder and trust changes are the other two triggers; they affect
	 * every session and are subscribed once in the constructor.
	 *
	 * The returned disposable removes the entry, so a session registered twice
	 * (re-subscribe after a state error) replaces the previous registration.
	 */
	register(registration: IAgentHostWorkingDirectoryRegistration): IDisposable {
		// The Agents window has no workspace folders to follow.
		if (this._environmentService.isSessionsWindow) {
			return Disposable.None;
		}
		const key = registration.session.toString();
		this._registrations.get(key)?.store.dispose();

		const store = new DisposableStore();
		const entry: IAgentHostWorkingDirectoryRegistrationEntry = {
			...registration,
			store,
			applyingRejectedAction: false,
			automaticReconcileAgain: false,
			automaticReconcileScheduled: false,
			dispatching: false,
		};
		// A rejected envelope is announced before the rollback lands, and cleared
		// once it has been applied, so `onDidChange` in between can be ignored.
		store.add(registration.subscription.onWillApplyAction(envelope => {
			entry.applyingRejectedAction = !!envelope.rejectionReason;
		}));
		store.add(registration.subscription.onDidApplyAction(() => {
			entry.applyingRejectedAction = false;
		}));
		store.add(registration.subscription.onDidChange(() => {
			if (!entry.applyingRejectedAction && !entry.dispatching) {
				this._scheduleReconcile(entry, 'subscription change');
			}
		}));
		store.add(autorun(reader => {
			// Re-runs once the handshake completes, since eligibility depends on
			// the negotiated protocol version. Also runs immediately, which is
			// what performs the initial reconcile for an already-connected host.
			registration.connection.initializeResult.read(reader);
			this._scheduleReconcile(entry, 'protocol initialization');
		}));
		// Guarded so disposing a stale registration cannot evict the entry that
		// replaced it under the same session URI.
		store.add(toDisposable(() => {
			if (this._registrations.get(key) === entry) {
				this._registrations.delete(key);
			}
		}));
		this._registrations.set(key, entry);
		return store;
	}

	/** Reconciles every followed session, e.g. after a workspace-wide change. */
	private _scheduleAll(reason: string): void {
		for (const registration of this._registrations.values()) {
			this._scheduleReconcile(registration, reason);
		}
	}

	/**
	 * Compares the session's current working directories against the folders it
	 * should have for today's workspace and dispatches the difference. Runs are
	 * serialized per session so two callers cannot interleave their dispatches.
	 *
	 * See {@link IAgentHostSessionWorkingDirectorySynchronizer.reconcile}.
	 */
	reconcile(session: URI, token: CancellationToken): Promise<void> {
		return this._reconciler.queue(session.toString(), () => this._reconcile(session, token));
	}

	/**
	 * Runs an automatic reconcile, coalescing bursts: triggers arriving while a
	 * run is in flight collapse into a single follow-up pass, so a rapid series
	 * of folder changes converges on the final workspace state. Failures are
	 * logged rather than surfaced — these runs have no caller to reject to.
	 */
	private _scheduleReconcile(registration: IAgentHostWorkingDirectoryRegistrationEntry, reason: string): void {
		if (registration.automaticReconcileScheduled) {
			registration.automaticReconcileAgain = true;
			return;
		}
		registration.automaticReconcileScheduled = true;
		const run = () => {
			registration.automaticReconcileAgain = false;
			void this.reconcile(registration.session, CancellationToken.None).then(
				() => finish(),
				error => {
					this._logService.warn(`[AgentHostWorkingDirectories] Failed to reconcile ${reason}`, error);
					finish();
				},
			);
		};
		const finish = () => {
			if (this._registrations.get(registration.session.toString()) !== registration) {
				return;
			}
			if (registration.automaticReconcileAgain) {
				run();
			} else {
				registration.automaticReconcileScheduled = false;
			}
		};
		run();
	}

	private async _reconcile(session: URI, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const registration = this._registrations.get(session.toString());
		const value = registration?.subscription.value;
		// Read the optimistic value so directories dispatched but not yet
		// confirmed by the host are not dispatched a second time.
		const state = value && !(value instanceof Error) ? value : undefined;
		if (!registration || !state || !this._isEligible(registration, state)) {
			return;
		}

		const current = state.workingDirectories?.map(directory => URI.parse(directory)) ?? [];
		if (current.length === 0) {
			return;
		}
		// The session's own primary stays the primary; only its peers follow the workspace.
		const desired = computeDesiredWorkingDirectories(
			current[0],
			current,
			this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri),
			this._uriIdentityService.extUri,
		);
		// `slice(1)` on both sides keeps the immutable primary out of the diff.
		const additions = desired.slice(1).filter(directory => !current.some(existing => this._uriIdentityService.extUri.isEqual(existing, directory)));
		const removals = current.slice(1).filter(directory => !desired.some(expected => this._uriIdentityService.extUri.isEqual(expected, directory)));
		if (additions.length === 0 && removals.length === 0) {
			return;
		}

		const trustError = await this._getAdditionTrustError(additions, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		// The registration may have been replaced or disposed while trust resolved.
		if (this._registrations.get(session.toString()) !== registration) {
			return;
		}

		registration.dispatching = true;
		try {
			// An untrusted addition blocks only the additions; removals are always
			// safe because they can only reduce the agent's access.
			if (!trustError) {
				for (const directory of additions) {
					registration.connection.dispatch(session.toString(), {
						type: ActionType.SessionWorkingDirectorySet,
						directory: directory.toString(),
					});
				}
			}
			for (const directory of removals) {
				registration.connection.dispatch(session.toString(), {
					type: ActionType.SessionWorkingDirectoryRemoved,
					directory: directory.toString(),
				});
			}
		} finally {
			registration.dispatching = false;
		}

		if (trustError) {
			throw trustError;
		}
	}

	/**
	 * Whether this session may follow the workspace. Requires a host that speaks
	 * the working-directory actions, a provider that supports multiple roots
	 * with a pinned primary, and a plain multi-root session still bound to the
	 * open workspace file. Excludes workspace-less, worktree-isolated, and
	 * multi-chat sessions, whose directories are not the workspace's to manage.
	 *
	 * Deliberately not a reconcile trigger: this reads `connection.rootState`,
	 * but a session registered before provider capabilities hydrate is not
	 * re-reconciled when they land. The pre-send `reconcile` re-evaluates
	 * eligibility before every prompt, so an agent never runs with stale roots —
	 * only the session's own state lags until the next trigger.
	 */
	private _isEligible(registration: IAgentHostWorkingDirectoryRegistration, state: SessionState): boolean {
		const protocolVersion = registration.connection.initializeResult.get()?.protocolVersion;
		if (state.lifecycle !== SessionLifecycle.Ready
			|| !protocolVersion
			|| compareProtocolVersions(protocolVersion, ACTION_INTRODUCED_IN[ActionType.SessionWorkingDirectorySet]) < 0
			|| readSessionWorkspaceless(state._meta)
			|| state.config?.values[SessionConfigKey.Isolation] === 'worktree'
			|| state.chats.length !== 1
			|| state.defaultChat !== state.chats[0].resource
			|| !state.workingDirectories?.length) {
			return false;
		}
		const workspace = this._workspaceContextService.getWorkspace();
		const multiRoot = readSessionMultiRootMetadata(state._meta);
		if (!multiRoot || !URI.isUri(workspace.configuration) || !this._uriIdentityService.extUri.isEqual(URI.parse(multiRoot.workspaceFile), workspace.configuration)) {
			return false;
		}
		return hasImmutablePrimaryWorkingDirectory(registration.connection.rootState.value, registration.provider);
	}

	/** Returns an error for the first untrusted folder, or `undefined` if all are trusted. */
	private async _getAdditionTrustError(additions: readonly URI[], token: CancellationToken): Promise<Error | undefined> {
		for (const directory of additions) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(directory);
			if (!trusted) {
				return new Error(localize('agentHostWorkingDirectories.untrusted', "The workspace folder '{0}' is not trusted.", directory.path));
			}
		}
		return undefined;
	}
}

registerSingleton(IAgentHostSessionWorkingDirectorySynchronizer, AgentHostSessionWorkingDirectorySynchronizer, InstantiationType.Delayed);
