/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, SequencerByKey } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import {
	buildBranchChangesetUri,
	buildCompareTurnsChangesetUri,
	buildSessionChangesetUri,
	buildTurnChangesetUri,
	buildUncommittedChangesetUri,
} from '../common/changesetUri.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { ChangesetState, ChangesSummary } from '../common/state/protocol/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import {
	ChangesetStatus,
	type ChangesetFile,
	type ISessionFileDiff,
	type URI as ProtocolURI,
	readSessionGitState,
} from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from './agentHostGitService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { computeSessionDiffs, computeTurnDiffs, type IIncrementalDiffOptions } from './sessionDiffAggregator.js';
import { META_CHECKPOINT_WORKING_DIR } from './agentHostCheckpointService.js';
import { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, META_CHANGES_SUMMARY, META_CHANGESET_BRANCH, META_CHANGESET_SESSION, META_LEGACY_DIFFS, StaticChangesetKind } from '../common/agentHostChangesetService.js';

function staticChangesetUri(session: ProtocolURI, kind: StaticChangesetKind): ProtocolURI {
	return kind === 'branch'
		? buildBranchChangesetUri(session)
		: buildSessionChangesetUri(session);
}

function persistKeyFor(kind: StaticChangesetKind): string {
	return kind === 'branch'
		? META_CHANGESET_BRANCH
		: META_CHANGESET_SESSION;
}

/**
 * Sums the per-file diff counts into the {@link ChangesSummary} shape
 * that lives on `summary.changes`. Returns `undefined` for an undefined
 * input so callers can distinguish "no data yet" from "data, zero changes".
 */
function summariseDiffs(diffs: readonly ISessionFileDiff[] | undefined): ChangesSummary | undefined {
	if (!diffs) {
		return undefined;
	}
	let additions = 0;
	let deletions = 0;
	for (const d of diffs) {
		additions += d.diff?.added ?? 0;
		deletions += d.diff?.removed ?? 0;
	}
	return { additions, deletions, files: diffs.length };
}

/**
 * Derives the `summary.changes` aggregate for an unopened session from
 * the ready live {@link ChangesetState} of the catalogue entry whose
 * `changeKind === 'session'` — typically because a previous
 * `restoreStaticChangeset` warmed the cache before the session itself
 * was attached.
 *
 * Returns `undefined` when no live session-wide state is ready, so
 * `listSessions` leaves the `changes` field unset for sessions without
 * usable counts — preserving the long-standing contract that unopened
 * sessions without live or persisted data advertise no aggregate.
 *
 * Only the `changeKind: 'session'` entry feeds the summary; other kinds
 * (`'uncommitted'`, `'turn'`, `'compare-turns'`) describe slices, not
 * the session-level footprint. The static catalogue itself (built by
 * {@link buildDefaultChangesetCatalogue}) is independent of counts and
 * is seeded once at session creation.
 */
export function computeChangesSummaryFromLiveState(
	session: ChangesetState | undefined,
): ChangesSummary | undefined {
	const sessionDiffs = session?.status === ChangesetStatus.Ready ? session.files.map(f => f.edit) : undefined;
	return summariseDiffs(sessionDiffs);
}

/**
 * Derives the `summary.changes` aggregate for an unopened session from
 * parsed persisted diffs for the `changeKind: 'session'` catalogue
 * entry. Returns `undefined` when the session-wide blob is absent so
 * malformed metadata leaves `summary.changes` unset.
 */
export function computeChangesSummaryFromPersistedDiffs(
	sessionDiffs: readonly ISessionFileDiff[] | undefined,
): ChangesSummary | undefined {
	return summariseDiffs(sessionDiffs);
}

/**
 * Parses a JSON-serialised {@link ISessionFileDiff}[] blob from session
 * metadata. Returns `undefined` for missing or malformed input, logging a
 * warning that names `sessionUri` and `kind` so operators can correlate the
 * failure with a specific session/changeset slot. Never throws.
 */
function tryParsePersistedDiffs(raw: string | undefined, sessionUri: string, kind: string, log: ILogService): ISessionFileDiff[] | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		return JSON.parse(raw) as ISessionFileDiff[];
	} catch (err) {
		log.warn(`[AgentHostChangesetService] Failed to parse persisted ${kind} diffs for ${sessionUri}: ${toErrorMessage(err)}`);
		return undefined;
	}
}

export class AgentHostChangesetService extends Disposable implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;

	/** Shared diff compute service for calculating line-level diffs in a worker thread. */
	private readonly _diffComputeService: IDiffComputeService;
	/** Serializes per-session diff computations to avoid races with stale previousDiffs. */
	private readonly _diffComputationSequencer = new SequencerByKey<string>();
	/** Per-session debounce timers for mid-turn diff computation. */
	private readonly _debouncedDiffTimers = this._register(new DisposableMap<string>());
	/** Per-`(session, turnId)` debounce timers for mid-turn per-turn changeset recomputation. */
	private readonly _perTurnDebouncedDiffTimers = this._register(new DisposableMap<string>());
	private readonly _activeStaticComputes = new Set<ProtocolURI>();
	private static readonly _DIFF_DEBOUNCE_MS = 5000;

	/**
	 * Subscriber probe set by {@link ChangesetSessionCoordinator}. Returns
	 * `true` when at least one client is subscribed to
	 * `<session>/changeset/turn/<turnId>`. Per-turn URIs carry no catalogue
	 * chip aggregates, so recomputing for an unobserved turn is pure waste
	 * — the service consults this probe in {@link onToolCallEditsApplied}
	 * and {@link onTurnComplete} before scheduling a per-turn recompute.
	 *
	 * Defaults to `() => false` so unwired test instances don't accidentally
	 * fire per-turn computes; the coordinator overrides this in its
	 * constructor.
	 */
	private _hasTurnSubscribers: (session: ProtocolURI, turnId: string) => boolean = () => false;

	/**
	 * Subscriber probe set by {@link ChangesetSessionCoordinator}. Returns
	 * `true` when at least one client is subscribed to
	 * `<session>/changeset/uncommitted`. Uncommitted computes hit git on
	 * every recompute and produce no catalogue-chip aggregate, so the
	 * service consults this probe in {@link onTurnComplete} before
	 * triggering one — the next subscriber will get a fresh snapshot from
	 * the coordinator's `_triggerUncommittedRefresh`.
	 *
	 * Defaults to `() => false` so unwired test instances don't accidentally
	 * fire uncommitted computes; the coordinator overrides this in its
	 * constructor.
	 */
	private _hasUncommittedSubscribers: (session: ProtocolURI) => boolean = () => false;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
	) {
		super();
		this._diffComputeService = this._register(new NodeWorkerDiffComputeService(this._logService));
	}

	setTurnSubscriberProbe(probe: (session: ProtocolURI, turnId: string) => boolean): void {
		this._hasTurnSubscribers = probe;
	}

	setUncommittedSubscriberProbe(probe: (session: ProtocolURI) => boolean): void {
		this._hasUncommittedSubscribers = probe;
	}

	registerStaticChangesets(session: ProtocolURI): void {
		this._stateManager.registerChangeset(buildBranchChangesetUri(session));
		this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
		this._stateManager.registerChangeset(buildSessionChangesetUri(session));
	}

	restoreStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, diffs: readonly ISessionFileDiff[]): void {
		const changesetUri = this._stateManager.registerChangeset(staticChangesetUri(session, kind));
		this._publishChangesetDiffs(session, changesetUri, diffs);
	}

	parsePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs {
		const persistedBranch = tryParsePersistedDiffs(metadata.branchRaw, sessionUri, 'branch', this._logService);

		// Legacy `diffs` is the migration fallback for the session-wide
		// changeset only — it never carried uncommitted state.
		const persistedSession = tryParsePersistedDiffs(metadata.sessionRaw, sessionUri, 'session', this._logService)
			?? tryParsePersistedDiffs(metadata.legacyRaw, sessionUri, 'session (legacy)', this._logService);

		return { branch: persistedBranch, session: persistedSession };
	}

	applyPersistedStaticChangesets(sessionUri: ProtocolURI, diffs: IRestoredChangesetDiffs): void {
		// `seedIfEmpty`: only reseed persisted diffs when the matching live
		// changeset state is absent or empty. Live state (e.g. from a prior
		// refresh in this lifetime) is always more authoritative than a
		// potentially-stale persisted blob; without this guard a fresh
		// `restorePersistedStaticChangesets` call would clobber it.
		this._seedIfEmpty(sessionUri, 'branch', diffs.branch);
		this._seedIfEmpty(sessionUri, 'session', diffs.session);
	}

	restorePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs {
		const parsed = this.parsePersistedStaticChangesets(sessionUri, metadata);
		this.applyPersistedStaticChangesets(sessionUri, parsed);
		return parsed;
	}

	persistChangesSummary(sessionUri: ProtocolURI, summary: ChangesSummary): void {
		this._persistSessionFlag(sessionUri, META_CHANGES_SUMMARY, JSON.stringify(summary));
	}

	isStaticChangesetComputeActive(changesetUri: ProtocolURI): boolean {
		return this._activeStaticComputes.has(changesetUri);
	}

	private _seedIfEmpty(session: ProtocolURI, kind: StaticChangesetKind, diffs: readonly ISessionFileDiff[] | undefined): void {
		if (!diffs) {
			return;
		}
		const existing = this._stateManager.getChangesetState(staticChangesetUri(session, kind));
		if (existing && existing.files.length > 0) {
			return;
		}
		this.restoreStaticChangeset(session, kind, diffs);
	}

	refreshBranchChangeset(session: ProtocolURI): void {
		this._scheduleStaticRecompute(session, 'branch', undefined, this._markStaticChangesetComputing(session, 'branch'));
	}

	refreshSessionChangeset(session: ProtocolURI): void {
		this._scheduleStaticRecompute(session, 'session', undefined, this._markStaticChangesetComputing(session, 'session'));
	}

	async computeTurnChangeset(session: ProtocolURI, turnId: string): Promise<ProtocolURI> {
		const turnUri = this._stateManager.registerChangeset(buildTurnChangesetUri(session, turnId));
		let ref: ReturnType<ISessionDataService['openDatabase']>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to open session database for turn diff: ${session}`, err);
			this._stateManager.dispatchServerAction(turnUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
			return turnUri;
		}
		try {
			// Prefer the checkpoint-ref git diff when available — that path
			// captures terminal-tool edits the FileEditTracker pipeline
			// (`file_edits` rows) misses. Falls back to the SDK-tracked
			// aggregator when checkpoints aren't set up (non-git folder
			// isolation, baseline never captured, or capture failure).
			const diffs = await this._computeTurnDiffsPreferCheckpoint(session, ref.object, turnId);
			this._publishChangesetDiffs(session, turnUri, diffs);
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute turn diffs for ${session}/${turnId}`, err);
			this._stateManager.dispatchServerAction(turnUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
		} finally {
			ref.dispose();
		}
		return turnUri;
	}

	async computeCompareTurnsChangeset(session: ProtocolURI, originalTurnId: string, modifiedTurnId: string): Promise<ProtocolURI> {
		const compareUri = this._stateManager.registerChangeset(buildCompareTurnsChangesetUri(session, originalTurnId, modifiedTurnId));
		let ref: ReturnType<ISessionDataService['openDatabase']>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to open session database for compare-turns diff: ${session}`, err);
			this._stateManager.dispatchServerAction(compareUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
			return compareUri;
		}
		try {
			const sessionUri = URI.parse(session);
			const [originalCurrentRef, modifiedPair] = await Promise.all([
				this._checkpointService.getTurnCheckpointPair(sessionUri, originalTurnId).then(p => p?.current),
				this._checkpointService.getTurnCheckpointPair(sessionUri, modifiedTurnId),
			]);
			if (!originalCurrentRef || !modifiedPair) {
				// One of the turns has no checkpoint — either it's an
				// unknown id, the session isn't git-backed, or the
				// baseline / capture failed. No edit-tracker fallback
				// exists for between-two-turns comparisons.
				const missing = !originalCurrentRef && !modifiedPair
					? 'both turns'
					: !originalCurrentRef
						? 'original turn'
						: 'modified turn';
				this._stateManager.dispatchServerAction(compareUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: `No checkpoint available for ${missing}; compare requires git-backed sessions.` },
				});
				return compareUri;
			}
			if (originalCurrentRef === modifiedPair.current) {
				// Same endpoint on both sides — diff is empty by
				// construction (covers compare(turn, turn) and the no-op
				// turn case where two adjacent turns share a ref).
				this._publishChangesetDiffs(session, compareUri, []);
				return compareUri;
			}
			const workingDir = await this._resolveWorkingDirectory(ref.object);
			if (!workingDir) {
				this._stateManager.dispatchServerAction(compareUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: 'No working directory recorded for session; compare requires git-backed sessions.' },
				});
				return compareUri;
			}
			const diffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
				sessionUri: session,
				fromRef: originalCurrentRef,
				toRef: modifiedPair.current,
			});
			if (diffs === undefined) {
				// `computeFileDiffsBetweenRefs` returns undefined to signal a
				// git failure (not a git work tree, bad ref, transport error,
				// etc.) and an empty array to signal "no changes". Collapsing
				// both into [] would mask real failures as an empty Ready
				// snapshot — surface the failure explicitly instead.
				this._stateManager.dispatchServerAction(compareUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: `Failed to compute compare-turns diff from git (${originalCurrentRef}..${modifiedPair.current}).` },
				});
				return compareUri;
			}
			this._publishChangesetDiffs(session, compareUri, diffs);
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute compare-turns diffs for ${session}/${originalTurnId}/${modifiedTurnId}`, err);
			this._stateManager.dispatchServerAction(compareUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
		} finally {
			ref.dispose();
		}
		return compareUri;
	}

	async computeUncommittedChangeset(session: ProtocolURI): Promise<ProtocolURI> {
		const uncommittedUri = this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
		if (!this._hasUncommittedSubscribers(session)) {
			return uncommittedUri;
		}

		const statusBeforeCompute = this._stateManager.getChangesetState(uncommittedUri)?.status;
		if (statusBeforeCompute !== ChangesetStatus.Computing) {
			this._stateManager.dispatchServerAction(uncommittedUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Computing,
			});
		}

		try {
			const diffs = await this._computeUncommittedDiffs(session);
			if (diffs === undefined) {
				// Git unavailable (no working directory, not a git work
				// tree, or the git command returned nothing). Surface as
				// Error rather than preserving cached state — no SDK
				// edit-tracker fallback exists for the uncommitted slot.
				this._stateManager.dispatchServerAction(uncommittedUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: 'Failed to compute uncommitted diff from git.' },
				});
				return uncommittedUri;
			}

			this._publishChangesetDiffs(session, uncommittedUri, diffs);
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute uncommitted diffs for ${session}`, err);
			this._stateManager.dispatchServerAction(uncommittedUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
		}

		return uncommittedUri;
	}

	private async _computeUncommittedDiffs(session: ProtocolURI): Promise<readonly ISessionFileDiff[] | undefined> {
		const workingDirectory = this._stateManager.getSessionState(session)?.summary.workingDirectory;
		if (!workingDirectory) {
			return undefined;
		}

		let workingDirectoryUri: URI;
		try {
			workingDirectoryUri = URI.parse(workingDirectory);
		} catch {
			return undefined;
		}

		return this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
			sessionUri: session,
		});
	}

	private async _computeTurnDiffsPreferCheckpoint(session: ProtocolURI, db: ISessionDatabase, turnId: string): Promise<readonly ISessionFileDiff[]> {
		const pair = await this._checkpointService.getTurnCheckpointPair(URI.parse(session), turnId);
		if (pair && pair.parent !== pair.current) {
			const workingDir = await this._resolveWorkingDirectory(db);
			if (workingDir) {
				const fromRefDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
					sessionUri: session,
					fromRef: pair.parent,
					toRef: pair.current,
				});
				if (fromRefDiffs) {
					return fromRefDiffs;
				}
			}
		} else if (pair && pair.parent === pair.current) {
			// A no-op turn checkpoint reuses the parent ref (so per-turn
			// diff is empty by construction) — short-circuit to an empty
			// list instead of asking git for the (empty) diff.
			return [];
		}
		// Fallback: SDK-tracked file_edits aggregator.
		return computeTurnDiffs(session, db, this._diffComputeService, turnId);
	}

	private async _resolveWorkingDirectory(db: ISessionDatabase): Promise<URI | undefined> {
		// Checkpoint baseline writes `checkpoint.workingDir` alongside
		// `checkpoint.baseRef`. We use that as the canonical working
		// directory for checkpoint diff computation; reading it here keeps
		// the changeset service out of agent-specific metadata keys.
		const raw = await db.getMetadata(META_CHECKPOINT_WORKING_DIR);
		return raw ? URI.parse(raw) : undefined;
	}

	// ---- Lifecycle hooks invoked by AgentSideEffects -----------------------

	onToolCallEditsApplied(session: ProtocolURI, turnId: string): void {
		this._scheduleDebouncedDiffComputation(session, turnId);
		// Per-turn URIs have no catalogue chip aggregates, so skip the
		// recompute entirely when no client is observing this turn. The
		// next subscriber will get a fresh snapshot from
		// `tryHandleSubscribe → computeTurnChangeset`.
		if (this._hasTurnSubscribers(session, turnId)) {
			this._scheduleDebouncedTurnDiffComputation(session, turnId);
		}
	}

	onTurnComplete(session: ProtocolURI, turnId: string | undefined): void {
		// Ordering matters for cancellation: cancel any pending mid-turn
		// debounces first so the final turn-complete computes supersede
		// them. After that, schedule the final recomputes for the turn
		// (when observed), the session-wide changeset with the changed
		// turn id, and the uncommitted changeset when it is observed.
		this._cancelDebouncedDiffComputation(session);
		if (turnId !== undefined) {
			this._cancelDebouncedTurnDiffComputation(session, turnId);
			if (this._hasTurnSubscribers(session, turnId)) {
				this._scheduleTurnRecompute(session, turnId);
			}
		}

		if (this._hasUncommittedSubscribers(session)) {
			this._scheduleUncommittedRecompute(session);
		}

		this._scheduleStaticRecompute(session, 'branch', turnId);
		this._scheduleStaticRecompute(session, 'session', turnId);
	}

	onSessionTruncated(session: ProtocolURI): void {
		// Turns were removed — recompute from scratch (no changedTurnId).
		this._scheduleStaticRecompute(session, 'branch');
		this._scheduleStaticRecompute(session, 'session');
	}

	// ---- Internal compute pipeline -----------------------------------------

	/**
	 * Schedules a debounced session-changeset recomputation. Uncommitted
	 * recomputes ride the same turn-complete path; mid-turn debounce only
	 * makes sense for the SDK-tracked session-wide diff (which sees fresh
	 * `tool_complete` events between turn boundaries).
	 */
	private _scheduleDebouncedDiffComputation(session: ProtocolURI, turnId: string): void {
		this._debouncedDiffTimers.set(session, disposableTimeout(() => {
			this._debouncedDiffTimers.deleteAndDispose(session);
			this._scheduleStaticRecompute(session, 'branch', turnId);
			this._scheduleStaticRecompute(session, 'session', turnId);
		}, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
	}

	/**
	 * Cancels any pending debounced diff computation for a session.
	 * Called at turn end before the final (non-debounced) computation.
	 */
	private _cancelDebouncedDiffComputation(session: ProtocolURI): void {
		this._debouncedDiffTimers.deleteAndDispose(session);
	}

	/**
	 * Schedules a debounced per-turn changeset recomputation. Mirrors
	 * {@link _scheduleDebouncedDiffComputation} but uses a per-
	 * `(session, turnId)` map key so a long-running per-turn compute
	 * doesn't block the static session recompute path (and vice versa).
	 */
	private _scheduleDebouncedTurnDiffComputation(session: ProtocolURI, turnId: string): void {
		const key = `${session}\u0000${turnId}`;
		this._perTurnDebouncedDiffTimers.set(key, disposableTimeout(() => {
			this._perTurnDebouncedDiffTimers.deleteAndDispose(key);
			this._scheduleTurnRecompute(session, turnId);
		}, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
	}

	/**
	 * Cancels any pending debounced per-turn diff computation for a
	 * `(session, turnId)`. Called at turn end before the final
	 * (non-debounced) per-turn computation.
	 */
	private _cancelDebouncedTurnDiffComputation(session: ProtocolURI, turnId: string): void {
		this._perTurnDebouncedDiffTimers.deleteAndDispose(`${session}\u0000${turnId}`);
	}

	/**
	 * Queues a per-turn recompute on a per-`(session, turnId)` sequencer
	 * key so back-to-back recomputes for the same turn serialise, but
	 * recomputes for different turns (or for the static `session` /
	 * `uncommitted` slots) run independently. Fire-and-forget — failures
	 * are logged inside `computeTurnChangeset` and do not fail the turn.
	 */
	private _scheduleTurnRecompute(session: ProtocolURI, turnId: string): void {
		this._diffComputationSequencer.queue(`${session}\u0000turn\u0000${turnId}`, () => this.computeTurnChangeset(session, turnId).then(() => undefined));
	}

	private _scheduleUncommittedRecompute(session: ProtocolURI): void {
		this._diffComputationSequencer.queue(`${session}\u0000uncommitted`, () => this.computeUncommittedChangeset(session).then(() => undefined));
	}

	/**
	 * Schedules a static changeset (`uncommitted` or `session`) recompute,
	 * serialised per-session so back-to-back triggers don't race against
	 * stale `previousDiffs` reads. Fire-and-forget — failures are logged
	 * but do not fail the turn.
	 */
	private _scheduleStaticRecompute(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string, statusBeforeRefresh?: ChangesetStatus): void {
		this._diffComputationSequencer.queue(`${session}\u0000${kind}`, () => this._doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh));
	}

	private _markStaticChangesetComputing(session: ProtocolURI, kind: StaticChangesetKind): ChangesetStatus | undefined {
		const changesetUri = staticChangesetUri(session, kind);
		this._stateManager.registerChangeset(changesetUri);
		const status = this._stateManager.getChangesetState(changesetUri)?.status;
		if (status !== ChangesetStatus.Computing) {
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Computing,
			});
		}
		return status;
	}

	private async _doComputeStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string, statusBeforeRefresh?: ChangesetStatus): Promise<void> {
		const changesetUri = staticChangesetUri(session, kind);
		this._activeStaticComputes.add(changesetUri);
		const statusBeforeCompute = statusBeforeRefresh ?? this._stateManager.getChangesetState(changesetUri)?.status;
		let ref: ReturnType<ISessionDataService['openDatabase']>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to open session database for ${kind} diff computation: ${session}`, err);
			this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
			this._activeStaticComputes.delete(changesetUri);
			this._stateManager.onChangesetLivenessChanged();
			return;
		}
		this._stateManager.registerChangeset(changesetUri);
		try {
			let diffs = await this._tryComputeGitDiffs(session, ref.object, kind);
			if (!diffs) {
				if (kind === 'branch') {
					// Branch changeset answers a different question than the
					// edit-tracker aggregator — do not fall back. Preserve
					// whatever cached state is already there.
					this._logService.debug(`[AgentHostChangesetService] Branch git diff unavailable for ${session}; preserving cached changeset. previousStatus=${statusBeforeCompute ?? 'unknown'} cachedFiles=${this._stateManager.getChangesetState(changesetUri)?.files.length ?? 0}`);
					this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
					return;
				}
				// `session` kind: working-tree git is unavailable (no
				// working dir or not a git work tree). Fall back to the
				// edit-tracker aggregator — for the session changeset the
				// SDK-tracked edits are the best available approximation.
				let incremental: IIncrementalDiffOptions | undefined;
				if (changedTurnId) {
					const previousDiffs = this._readPreviousChangesetDiffs(changesetUri);
					if (previousDiffs) {
						incremental = { changedTurnId, previousDiffs: [...previousDiffs] };
					}
				}
				diffs = await computeSessionDiffs(session, ref.object, this._diffComputeService, incremental);
			}

			this._publishChangesetDiffs(session, changesetUri, diffs);
			// Persist the file list so a subsequent `listSessions` /
			// `restoreSession` can reseed the changeset before the first
			// post-restart compute completes.
			this._persistSessionFlag(session, persistKeyFor(kind), JSON.stringify(diffs));
			// Migration: also overwrite the legacy `'diffs'` key with the
			// session-changeset payload so older readers stay correct
			// during the rollout window.
			if (kind === 'session') {
				this._persistSessionFlag(session, META_LEGACY_DIFFS, JSON.stringify(diffs));

				// Persist the changes summary and update the in-memory session summary.
				const changesSummary = summariseDiffs(diffs) ?? { additions: 0, deletions: 0, files: 0 };
				this.persistChangesSummary(session, changesSummary);
				this._stateManager.setSessionSummaryChanges(session, changesSummary);
			}
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute ${kind} diffs`, err);
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
		} finally {
			this._activeStaticComputes.delete(changesetUri);
			this._stateManager.onChangesetLivenessChanged();
			ref.dispose();
		}
	}

	/**
	 * Refresh requests optimistically mark static changesets as Computing
	 * while preserving their current files. Some refresh paths intentionally
	 * do not publish a replacement file list (for example, uncommitted git
	 * diff is temporarily unavailable), so restore the previous non-computing
	 * status instead of leaving a stale cached snapshot stuck as Computing.
	 */
	private _restoreStaticChangesetStatus(changesetUri: ProtocolURI, status: ChangesetStatus | undefined): void {
		if (!status || status === ChangesetStatus.Computing) {
			return;
		}
		this._stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetStatusChanged,
			status,
		});
	}

	/**
	 * Reads the previous diff list back out of the changeset state so the
	 * incremental aggregator can avoid recomputing files that haven't
	 * changed.
	 */
	private _readPreviousChangesetDiffs(changesetUri: ProtocolURI): readonly ISessionFileDiff[] | undefined {
		const state = this._stateManager.getChangesetState(changesetUri);
		if (!state || state.files.length === 0) {
			return undefined;
		}
		return state.files.map(f => f.edit);
	}

	/**
	 * Translates the new file list into a sequence of changeset/* actions
	 * (fileSet, fileRemoved) and moves the changeset to `ready` once the
	 * fresh file list has been applied.
	 */
	private _publishChangesetDiffs(session: ProtocolURI, changesetUri: ProtocolURI, diffs: readonly ISessionFileDiff[]): void {
		const previous = this._stateManager.getChangesetState(changesetUri);
		const previousIds = new Set<string>(previous?.files.map(f => f.id) ?? []);

		// Emit file upserts. Use `after.uri` as the stable id when available
		// (covers creates and edits) and fall back to `before.uri` for
		// deletions; this matches the spec's recommendation and avoids id
		// collisions for renames (which carry distinct before/after URIs).
		const nextFilesById = new Map<string, ISessionFileDiff>();
		for (const edit of diffs) {
			const id = edit.after?.uri ?? edit.before?.uri;
			if (!id) {
				continue;
			}
			nextFilesById.set(id, edit);
			const file: ChangesetFile = { id, edit };
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetFileSet,
				file,
			});
		}

		// Emit removals for any file that disappeared in this pass.
		for (const id of previousIds) {
			if (!nextFilesById.has(id)) {
				this._stateManager.dispatchServerAction(changesetUri, {
					type: ActionType.ChangesetFileRemoved,
					fileId: id,
				});
			}
		}

		// Move the changeset out of `computing` (or out of an earlier error)
		// now that we have a fresh, complete file list.
		const status = this._stateManager.getChangesetState(changesetUri)?.status;
		if (status !== ChangesetStatus.Ready) {
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Ready,
			});
		}
	}

	/**
	 * Computes diffs for a static changeset by shelling out to git.
	 * Returns the diff list when the session has a working directory and
	 * that directory is a git work tree; returns `undefined` otherwise so
	 * the caller can fall back to the edit-tracker aggregator (for
	 * `kind: 'session'`) or preserve cached state (for `kind: 'branch'`).
	 *
	 * For `kind: 'session'` the diff is computed between the baseline
	 * checkpoint ref and the latest turn checkpoint ref.
	 * For `kind: 'branch'` the diff is computed against the merge-base
	 * with {@link META_DIFF_BASE_BRANCH} when one is set; without a base
	 * branch git falls back to `HEAD`.
	 */
	private async _tryComputeGitDiffs(session: ProtocolURI, db: ISessionDatabase, kind: StaticChangesetKind): Promise<readonly ISessionFileDiff[] | undefined> {
		const workingDirectory = this._stateManager.getSessionState(session)?.summary.workingDirectory;
		if (!workingDirectory) {
			return undefined;
		}

		let workingDirectoryUri: URI;
		try {
			workingDirectoryUri = URI.parse(workingDirectory);
		} catch {
			return undefined;
		}

		// Session
		if (kind === 'session') {
			// Get session checkpoints
			const latestTurnId = this._stateManager.getSessionState(session)?.turns.at(-1)?.id;
			if (!latestTurnId) {
				return undefined;
			}

			const sessionUri = URI.parse(session);
			const [baseline, pair] = await Promise.all([
				this._checkpointService.getBaselineCheckpointRef(sessionUri),
				this._checkpointService.getTurnCheckpointPair(sessionUri, latestTurnId),
			]);
			if (!baseline || !pair) {
				return undefined;
			}

			try {
				return await this._gitService.computeFileDiffsBetweenRefs(workingDirectoryUri, {
					sessionUri: session,
					fromRef: baseline,
					toRef: pair.current
				});
			} catch (err) {
				this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
				return undefined;
			}
		}

		// Branch
		const persistedBaseBranch = await db.getMetadata(META_DIFF_BASE_BRANCH);
		const gitStateBaseBranch = readSessionGitState(this._stateManager.getSessionState(session)?._meta)?.baseBranchName;
		const baseBranch = persistedBaseBranch ?? gitStateBaseBranch;
		if (!persistedBaseBranch && gitStateBaseBranch) {
			this._logService.debug(`[AgentHostChangesetService] Using _meta.git base branch fallback for Branch Changes in ${session}: ${gitStateBaseBranch}`);
		}

		try {
			return await this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
				sessionUri: session,
				baseBranch
			});
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
			return undefined;
		}
	}

	/**
	 * Persists a session metadata key/value pair to the session database.
	 * Counterpart in `agentSideEffects.ts` (`AgentSideEffects._persistSessionFlag`):
	 * keep both copies in sync if the signature changes. Duplicated rather
	 * than lifted because the two consumers persist disjoint metadata
	 * (changeset diffs here vs. customTitle / isRead / isArchived /
	 * configValues there) and a shared util would only have two callers.
	 */
	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		const ref = this._sessionDataService.openDatabase(URI.parse(session));
		ref.object.setMetadata(key, value).catch(err => {
			this._logService.warn(`[AgentHostChangesetService] Failed to persist ${key}`, err);
		}).finally(() => {
			ref.dispose();
		});
	}
}
