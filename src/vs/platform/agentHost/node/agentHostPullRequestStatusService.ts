/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../base/common/equals.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { PullRequestRef, PullRequestSnapshot, PullRequestSubscription } from '../../github/common/githubPullRequestService.js';
import type { GitHubCredentialInvalidation } from '../../github/common/githubCredentialService.js';
import type { GitHubAccountHandle } from '../../github/common/githubTypes.js';
import { IGitHubService } from '../../github/common/githubService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { getSessionRelatedPullRequestUrls, hasSessionPullRequestForBranch, isSessionStatusArchived, readSessionGitHubState, readSessionGitState } from '../common/state/sessionState.js';
import { ActionType } from '../common/state/sessionActions.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { parsePullRequestUrl } from './agentMergeController.js';

/**
 * Merge states GitHub reports for a pull request that can still be merged
 * directly. `UNSTABLE` means only non-required checks are failing, which does
 * not block a merge.
 */
const MERGEABLE_STATES = new Set(['CLEAN', 'HAS_HOOKS', 'UNSTABLE']);

/**
 * Live GitHub state of a session's pull request, reduced to what the changeset
 * operation provider needs to decide which pull request operations to
 * advertise.
 */
export interface IAgentHostPullRequestStatus {
	/** GraphQL node id, required by the node-scoped mutations. */
	readonly pullRequestId?: string;
	readonly number: number;
	readonly url: string;
	readonly headSha?: string;
	readonly state: 'open' | 'closed' | 'merged';
	readonly draft: boolean;
	/** True once the pull request is open and can be merged as-is. */
	readonly mergeReady: boolean;
	readonly viewerCanEnableAutoMerge: boolean;
	readonly autoMergeEnabled: boolean;
	readonly allowedMergeMethods: readonly ('MERGE' | 'SQUASH' | 'REBASE')[];
}

export const IAgentHostPullRequestStatusService = createDecorator<IAgentHostPullRequestStatusService>('agentHostPullRequestStatusService');

/**
 * Tracks the live GitHub state of the pull request belonging to each session a
 * client is currently watching.
 *
 * A pull request subscription costs GitHub API budget, so the watcher is scoped
 * to sessions that have at least one changeset subscriber — in practice the
 * session whose changes the user has open. It also deliberately subscribes to
 * the `core` and `mergeability` fragments only: everything the pull request
 * button bar needs is in those two, and the expensive conversation and check
 * fragments stay reserved for Agent Merge.
 */
export interface IAgentHostPullRequestStatusService extends IDisposable {
	readonly _serviceBrand: undefined;

	/** Fires with the session key whose pull request status changed. */
	readonly onDidChangePullRequestStatus: Event<string>;

	/**
	 * The last observed pull request status for `sessionKey`, or `undefined`
	 * while the session has no watched pull request or its first snapshot has
	 * not resolved yet. Callers MUST treat `undefined` as "unknown" rather than
	 * "no pull request".
	 */
	getPullRequestStatus(sessionKey: string): IAgentHostPullRequestStatus | undefined;

	/**
	 * Re-reads the pull request from GitHub, bypassing cached fragments. Used
	 * after a mutation so the advertised operations reflect the new state
	 * without waiting for the next poll.
	 */
	refresh(sessionKey: string): Promise<void>;
}

interface IWatch extends IDisposable {
	readonly ref: PullRequestRef;
	readonly subscription: PullRequestSubscription;
	status?: IAgentHostPullRequestStatus;
}

/** Whether a session should be watched, or why it should not be. */
type IWatchTarget =
	| { readonly kind: 'watch'; readonly pullRequestUrl: string }
	| { readonly kind: 'skip'; readonly reason: string };

export class AgentHostPullRequestStatusService extends Disposable implements IAgentHostPullRequestStatusService {

	declare readonly _serviceBrand: undefined;

	private readonly _watches = new Map<string, IWatch>();
	private readonly _pendingSyncs = new Map<string, Promise<void>>();
	private readonly _staleSyncs = new Set<string>();
	private readonly _abortController = new AbortController();

	private readonly _onDidChangePullRequestStatus = this._register(new Emitter<string>());
	readonly onDidChangePullRequestStatus = this._onDidChangePullRequestStatus.event;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._changesetSubscriptions.onDidChangeSessionSubscriptions(session => this._sync(session)));
		this._register(this._gitStateService.onDidRefreshSessionGitState(session => this._sync(session)));
		this._register(this._gitStateService.onDidChangeSessionGitHubState(session => this._sync(session)));
		this._register(this._stateManager.onDidRemoveSession(session => this._stopWatch(session)));
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionIsArchivedChanged) {
				this._sync(envelope.channel);
			}
		}));
		this._register(this._gitHubService.credentials.onDidInvalidate(event => this._handleCredentialInvalidation(event)));
	}

	/**
	 * Rebuilds watches whose backing pull request resource the resource service
	 * has thrown away.
	 *
	 * An account or endpoint change disposes the resource outright, leaving a
	 * subscription whose snapshot can never update — the button bar would then
	 * advertise stale operations until some unrelated git or subscription event
	 * happened to trigger a resync. A replaced or re-authenticated credential
	 * keeps the resource and refreshes it in place, so those need nothing here.
	 */
	private _handleCredentialInvalidation(event: GitHubCredentialInvalidation): void {
		if (event.reason === 'replacement' || event.reason === 'authentication') {
			return;
		}
		for (const [sessionKey, watch] of [...this._watches]) {
			if (event.credential && !sameAccount(event.credential.account, watch.ref)) {
				continue;
			}
			this._stopWatch(sessionKey, `the GitHub credential was invalidated (${event.reason})`);
			if (event.reason !== 'shutdown') {
				this._sync(sessionKey);
			}
		}
	}

	getPullRequestStatus(sessionKey: string): IAgentHostPullRequestStatus | undefined {
		return this._watches.get(sessionKey)?.status;
	}

	async refresh(sessionKey: string): Promise<void> {
		const watch = this._watches.get(sessionKey);
		if (!watch) {
			this._logService.trace(`[AgentHostPullRequestStatusService] Refresh skipped because no pull request is being watched: session=${sessionKey}`);
			return;
		}
		try {
			this._logService.trace(`[AgentHostPullRequestStatusService] Refreshing pull request: session=${sessionKey}, pr=${describeRef(watch.ref)}`);
			await watch.subscription.refresh(undefined, undefined, { authoritative: true });
		} catch (error) {
			this._logService.warn(`[AgentHostPullRequestStatusService] Refresh failed: session=${sessionKey}, pr=${describeRef(watch.ref)}, error=${error}`);
		}
	}

	override dispose(): void {
		this._abortController.abort();
		this._staleSyncs.clear();
		for (const watch of this._watches.values()) {
			watch.dispose();
		}
		this._watches.clear();
		super.dispose();
	}

	/**
	 * Starts, replaces, or stops the watch for `sessionKey` so it matches the
	 * session's current eligibility. Serialized per session because resolving
	 * the pull request ref needs a credential, and two overlapping syncs would
	 * otherwise race to install different subscriptions. Changes observed while
	 * a sync is in flight are coalesced into one follow-up run so the watch
	 * never settles on state that was already stale when it was read.
	 */
	private _sync(sessionKey: string): void {
		if (this._pendingSyncs.has(sessionKey)) {
			this._staleSyncs.add(sessionKey);
			return;
		}
		this._runSync(sessionKey);
	}

	private _runSync(sessionKey: string): void {
		this._staleSyncs.delete(sessionKey);
		const run = this._doSync(sessionKey).catch(error => {
			this._logService.debug(`[AgentHostPullRequestStatusService] Sync failed: session=${sessionKey}, error=${error}`);
		}).finally(() => {
			if (this._pendingSyncs.get(sessionKey) !== run) {
				return;
			}
			this._pendingSyncs.delete(sessionKey);
			if (this._staleSyncs.delete(sessionKey) && !this._abortController.signal.aborted) {
				this._runSync(sessionKey);
			}
		});
		this._pendingSyncs.set(sessionKey, run);
	}

	private async _doSync(sessionKey: string): Promise<void> {
		if (this._abortController.signal.aborted) {
			return;
		}

		const target = this._getWatchTarget(sessionKey);
		if (target.kind === 'skip') {
			this._stopWatch(sessionKey, target.reason);
			return;
		}

		const parsed = parsePullRequestUrl(target.pullRequestUrl);
		if (!parsed) {
			this._stopWatch(sessionKey, `pull request URL could not be parsed: ${target.pullRequestUrl}`);
			return;
		}

		const existing = this._watches.get(sessionKey);
		if (existing && sameRef(existing.ref, parsed)) {
			return;
		}

		const credential = await this._gitHubService.credentials.getCredential(this._abortController.signal);
		if (this._abortController.signal.aborted) {
			return;
		}
		// The pull request URL carries its own host: after a restore or an
		// endpoint switch the same owner/repo/number can name a different GitHub
		// instance, which must never be read with this account's credential.
		if (credential.account.host.toLowerCase() !== parsed.apiHost.toLowerCase()) {
			const reason = `the signed in account (${credential.account.host}) does not host ${parsed.owner}/${parsed.repo}#${parsed.number} (${parsed.apiHost})`;
			this._stopWatch(sessionKey, reason);
			this._logService.debug(`[AgentHostPullRequestStatusService] Not watching pull request: session=${sessionKey}, reason=${reason}`);
			return;
		}
		const ref: PullRequestRef = { ...credential.account, owner: parsed.owner, repo: parsed.repo, number: parsed.number };

		// Eligibility can have changed while the credential was in flight; the
		// follow-up run installs the watch the session actually needs.
		const current = this._getWatchTarget(sessionKey);
		if (current.kind === 'skip' || current.pullRequestUrl !== target.pullRequestUrl) {
			this._logService.trace(`[AgentHostPullRequestStatusService] Retrying sync because the session changed while resolving credentials: session=${sessionKey}`);
			this._staleSyncs.add(sessionKey);
			return;
		}

		this._stopWatch(sessionKey, `replaced by ${describeRef(ref)}`);
		const store = new DisposableStore();
		const subscription = store.add(this._gitHubService.pullRequests.subscribePullRequest(ref, {
			priority: 'visible',
			core: true,
			mergeability: true,
		}));
		const watch: IWatch = {
			ref,
			subscription,
			dispose: () => store.dispose(),
		};
		this._watches.set(sessionKey, watch);
		store.add(autorun(reader => {
			const snapshot = subscription.resource.snapshot.read(reader);
			this._updateStatus(sessionKey, watch, snapshot);
		}));
		this._logService.debug(`[AgentHostPullRequestStatusService] Watching pull request: session=${sessionKey}, pr=${describeRef(ref)}`);
	}

	/**
	 * The pull request this session should be watching, or the reason it is not
	 * eligible. The reason is carried rather than collapsed into `undefined` so
	 * a missing button bar can be explained from the logs alone.
	 */
	private _getWatchTarget(sessionKey: string): IWatchTarget {
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			return { kind: 'skip', reason: 'session is unknown' };
		}
		if (isSessionStatusArchived(state.status)) {
			return { kind: 'skip', reason: 'session is archived' };
		}
		if (this._changesetSubscriptions.getSessionSubscriptions(sessionKey).size === 0) {
			return { kind: 'skip', reason: 'no client is subscribed to the session changes' };
		}
		const gitHubState = readSessionGitHubState(state._meta);
		const gitState = readSessionGitState(state._meta);
		if (!hasSessionPullRequestForBranch(gitHubState, gitState?.branchName)) {
			return { kind: 'skip', reason: `no pull request is known for branch '${gitState?.branchName ?? 'unknown'}'` };
		}
		const pullRequestUrl = getSessionRelatedPullRequestUrls(gitHubState)[0] ?? gitHubState?.pullRequestUrls?.[0];
		return pullRequestUrl
			? { kind: 'watch', pullRequestUrl }
			: { kind: 'skip', reason: 'the session has no pull request URL' };
	}

	private _updateStatus(sessionKey: string, watch: IWatch, snapshot: PullRequestSnapshot): void {
		const status = toPullRequestStatus(snapshot);
		if (structuralEquals(watch.status, status)) {
			return;
		}
		const previous = watch.status;
		watch.status = status;
		if (this._watches.get(sessionKey) !== watch) {
			return;
		}
		// The single most useful line when a button bar shows the "wrong"
		// action: it names every flag the operation provider branches on.
		this._logService.debug(`[AgentHostPullRequestStatusService] Status changed: session=${sessionKey}, pr=${describeRef(watch.ref)}, from=[${describeStatus(previous)}], to=[${describeStatus(status)}]`);
		this._onDidChangePullRequestStatus.fire(sessionKey);
	}

	private _stopWatch(sessionKey: string, reason?: string): void {
		const watch = this._watches.get(sessionKey);
		if (!watch) {
			return;
		}
		this._watches.delete(sessionKey);
		watch.dispose();
		this._logService.debug(`[AgentHostPullRequestStatusService] Stopped watching pull request: session=${sessionKey}, pr=${describeRef(watch.ref)}, reason=${reason ?? 'session removed'}`);
		this._onDidChangePullRequestStatus.fire(sessionKey);
	}
}

/** Compact `owner/repo#number` form used in every log line. */
function describeRef(ref: PullRequestRef): string {
	return `${ref.owner}/${ref.repo}#${ref.number}`;
}

/** Renders the flags the operation provider branches on, for log lines. */
function describeStatus(status: IAgentHostPullRequestStatus | undefined): string {
	if (!status) {
		return 'unresolved';
	}
	return [
		`state=${status.state}`,
		`draft=${status.draft}`,
		`mergeReady=${status.mergeReady}`,
		`autoMergeEnabled=${status.autoMergeEnabled}`,
		`canEnableAutoMerge=${status.viewerCanEnableAutoMerge}`,
		`allowedMergeMethods=${status.allowedMergeMethods.join('|') || 'none'}`,
	].join(', ');
}

/**
 * Reduces a snapshot to {@link IAgentHostPullRequestStatus}, or `undefined`
 * while either fragment the button bar depends on is still unresolved. Holding
 * back on partial data keeps the client from flashing a wrong primary button.
 */
function toPullRequestStatus(snapshot: PullRequestSnapshot): IAgentHostPullRequestStatus | undefined {
	const core = snapshot.core.value;
	if (!core) {
		return undefined;
	}

	// A merged or closed pull request has nothing left to act on, so it is
	// reported without waiting for mergeability — which GitHub stops updating.
	if (core.state !== 'open') {
		return {
			...(core.id ? { pullRequestId: core.id } : {}),
			number: core.number,
			url: core.url,
			headSha: core.headSha,
			state: core.state,
			draft: core.draft,
			mergeReady: false,
			viewerCanEnableAutoMerge: false,
			autoMergeEnabled: false,
			allowedMergeMethods: [],
		};
	}

	const mergeability = snapshot.mergeability.value;
	if (!mergeability || snapshot.mergeability.headSha !== core.headSha) {
		return undefined;
	}

	return {
		...(core.id ? { pullRequestId: core.id } : {}),
		number: core.number,
		url: core.url,
		headSha: core.headSha,
		state: core.state,
		draft: core.draft,
		mergeReady: !core.draft
			&& mergeability.mergeable === 'MERGEABLE'
			&& mergeability.viewerCanMerge
			&& MERGEABLE_STATES.has(mergeability.mergeStateStatus?.toUpperCase() ?? 'CLEAN'),
		viewerCanEnableAutoMerge: mergeability.viewerCanEnableAutoMerge,
		autoMergeEnabled: mergeability.autoMergeEnabled,
		allowedMergeMethods: mergeability.allowedMergeMethods,
	};
}

function sameRef(left: PullRequestRef, right: { readonly owner: string; readonly repo: string; readonly number: number }): boolean {
	return left.owner.toLowerCase() === right.owner.toLowerCase()
		&& left.repo.toLowerCase() === right.repo.toLowerCase()
		&& left.number === right.number;
}

function sameAccount(left: GitHubAccountHandle, right: GitHubAccountHandle): boolean {
	return left.host.toLowerCase() === right.host.toLowerCase() && left.accountId === right.accountId;
}
