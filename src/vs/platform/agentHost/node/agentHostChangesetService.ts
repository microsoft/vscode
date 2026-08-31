/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, Limiter, SequencerByKey } from '../../../base/common/async.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
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
	parseChangesetUri,
	ChangesetKind,
	buildDefaultChangesetCatalog,
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
	isDefaultChatUri,
	SessionLifecycle,
} from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from '../common/agentHostGitService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs, type IIncrementalDiffOptions, type ISessionDiffSource } from './sessionDiffAggregator.js';
import { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, CHANGESET_DB_METADATA_KEYS, CHANGES_SUMMARY_METADATA_KEYS, META_CHANGES_SUMMARY, META_CHANGESET_BRANCH, META_CHANGESET_SESSION, META_LEGACY_DIFFS, StaticChangesetKind } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { extUriBiasedIgnorePathCase, relativePath } from '../../../base/common/resources.js';
import { isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { dedupeSessionFileDiffs, evaluateMultiRootDiffSources } from './agentHostMultiRootDiff.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { reportAgentHostStaticChangesetComputed, reportAgentHostTurnChangesetComputed, type IMultiRootTurnDiffMetrics, type StaticChangesetOutcome, type TurnChangesetOutcome } from './agentHostChangesetTelemetry.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { AgentSession } from '../common/agent.js';
import { IAgentHostWorktreeIsolation, type IAgentHostWorktreePendingState } from './shared/worktreeIsolation.js';

/**
 * Maximum number of per-repository git diffs a multi-folder fan-out runs at
 * once. Every resolved repository is diffed; this only bounds how many `git`
 * child processes run concurrently — mirroring the built-in git extension's
 * `Limiter(5)` for refreshing many repositories (see
 * `extensions/git/src/model.ts`) — so a many-repository session cannot spawn an
 * unbounded number of git processes at once.
 */
const MAX_TURN_DIFF_REPOSITORY_CONCURRENCY = 5;

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
 * A per-turn diff computation result: the merged file diffs to publish, the
 * compute outcome, and — for multi-root turns only — the fan-out metrics that
 * feed {@link reportAgentHostTurnChangesetComputed}. `multiRoot` is `undefined`
 * for single-root turns and for a resolve failure, so telemetry never fabricates
 * fan-out values.
 */
interface ITurnDiffResult {
	readonly diffs: readonly ISessionFileDiff[];
	readonly outcome: 'computed' | 'resolveFailed';
	readonly multiRoot?: IMultiRootTurnDiffMetrics;
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
 * {@link buildDefaultChangesetCatalog}) is independent of counts and
 * is seeded once at session creation.
 */
function computeChangesSummaryFromLiveState(
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
function computeChangesSummaryFromPersistedDiffs(
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

	private readonly _worktree: IAgentHostWorktreePendingState;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostChangesetOperationService private readonly _changesetOperationService: IAgentHostChangesetOperationService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentHostReviewService private readonly _reviewService: IAgentHostReviewService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostWorktreeIsolation worktree: IAgentHostWorktreeIsolation,
	) {
		super();
		this._worktree = worktree;
		this._diffComputeService = this._createDiffComputeService();
	}

	/** Creates the diff-count service; overridable so tests can supply a synchronous in-process computer. */
	protected _createDiffComputeService(): IDiffComputeService {
		return this._register(new NodeWorkerDiffComputeService(this._logService));
	}

	/**
	 * Returns true when at least one client is subscribed to `changeset`
	 * under `session`.
	 */
	private _hasSubscription(session: ProtocolURI, changeset: ProtocolURI): boolean {
		return this._changesetSubscriptions.getSessionSubscriptions(session).has(changeset);
	}

	private _hasWorkingDirectory(session: ProtocolURI): boolean {
		return !this._worktree.isWorkingDirectoryPending(AgentSession.id(session))
			&& !!this._configurationService.getEffectiveWorkingDirectories(session)?.[0];
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

	getListMetadataKeys(sessionUri: ProtocolURI): Record<string, true> | undefined {
		// A loaded session's live `summary.changes` is authoritative — it already
		// reflects every folder (single-folder: branch-derived; multi-folder:
		// the all-folder aggregate) — so nothing needs to be read from the DB.
		const liveSummaryChanges = this._stateManager.getSessionSummary(sessionUri)?.changes;
		if (liveSummaryChanges) {
			return undefined;
		}
		// Otherwise the persisted `META_CHANGES_SUMMARY` is authoritative for the
		// chip. A ready live `changeKind: 'session'` changeset is NOT sufficient:
		// in a multi-folder session it is PRIMARY-ONLY, so deriving the chip from
		// it would reintroduce the primary-only count (and clobber the persisted
		// all-folder value) after an idle eviction that keeps changesets cached
		// but drops the live summary. Request the small summary key (not the
		// large diff blobs) so the all-folder aggregate is loaded and preferred.
		const liveSession = this._stateManager.getChangesetState(buildSessionChangesetUri(sessionUri));
		if (liveSession?.status === ChangesetStatus.Ready) {
			// This is the "evicted-but-warm" state: to save memory the host drops
			// a session's live `summary.changes` but deliberately keeps its
			// changeset objects cached so a still-visible list row can be drawn.
			// The keys we return here are merged into the single batched DB read
			// in `AgentService.listSessions`, then handed to
			// `computeListEntryChanges`, which prefers `META_CHANGES_SUMMARY` over
			// re-deriving from the primary-only branch changeset.
			//
			// Worked example of the bug this avoids (why we must NOT return
			// `undefined` here for multi-root):
			//   1. Multi-root session: repoA (primary) 5 files +12/-3, repoB 3
			//      files +8/-2.
			//   2. All-folder chip = 8 files, +20/-5, saved to
			//      `META_CHANGES_SUMMARY`; the list shows "8 files +20 -5".
			//   3. Session goes idle -> evicted-but-warm (live summary dropped,
			//      the changeset objects kept cached).
			//   4. List refreshes. If we returned `undefined`, no summary key is
			//      read, so `computeListEntryChanges` rebuilds the chip from the
			//      branch changeset (primary-only) = 5 files +12/-3 and persists
			//      it, OVERWRITING the DB `{8,+20,-5}` with `{5,+12,-3}`.
			//   5. The row now shows the wrong number AND the correct all-folder
			//      value is durably corrupted.
			// Returning the summary key keeps the chip at the all-folder value and
			// never lets the primary-only count be written back.
			return CHANGES_SUMMARY_METADATA_KEYS;
		}
		// Cold session: nothing live to lean on, so read the full set (summary
		// plus the persisted diff blobs, which may be the only remaining source).
		return CHANGESET_DB_METADATA_KEYS;
	}

	computeListEntryChanges(sessionUri: ProtocolURI, metadata: Record<string, string | undefined>): ChangesSummary | undefined {
		// Loaded session: the caller has already projected
		// `state.summary.changes` onto the entry. Nothing to overlay.
		if (this._stateManager.getSessionState(sessionUri)) {
			return undefined;
		}

		// Check if the metadata contains the changes summary. In the past we
		// used to store the changesets in the session database but we have
		// since moved to a more efficient storage mechanism by only storing
		// the changes summary.
		const changesSummary = metadata[META_CHANGES_SUMMARY];
		if (changesSummary !== undefined) {
			try {
				return JSON.parse(changesSummary) as ChangesSummary;
			} catch (error) {
				return undefined;
			}
		}

		// Read live state for an unopened session: synthesise the aggregate
		// from the live `changeKind: 'branch'` changeset state. Counts stay
		// in lockstep with the actual changeset state for the session-list chip.
		const liveSession = this._stateManager.getChangesetState(buildBranchChangesetUri(sessionUri));
		const liveChanges = computeChangesSummaryFromLiveState(liveSession);
		if (liveChanges) {
			// Migrate the changes summary to the new storage mechanism.
			this.persistChangesSummary(sessionUri, liveChanges);
			return liveChanges;
		}

		// No live source — try persisted blobs (if the caller batched them).
		const branchRaw = metadata[META_CHANGESET_BRANCH];
		const legacyRaw = metadata[META_LEGACY_DIFFS];
		if (branchRaw === undefined && legacyRaw === undefined) {
			return undefined;
		}
		const restored = this.parsePersistedStaticChangesets(sessionUri, { branchRaw, legacyRaw });

		// `listSessions` must not seed full changeset state for every row; it
		// only parses persisted blobs enough to render the chip aggregate.
		// Once the session is opened via `restoreSession`, the live overlay in
		// `AgentService.listSessions` replaces this parse-only aggregate.
		const persistedChanges = computeChangesSummaryFromPersistedDiffs(restored.branch);
		if (persistedChanges) {
			// Migrate the changes summary to the new storage mechanism.
			this.persistChangesSummary(sessionUri, persistedChanges);
			return persistedChanges;
		}

		return undefined;
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

	refreshChangesetCatalog(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state || state?.lifecycle === SessionLifecycle.Failed) {
			return;
		}

		const changesets = buildDefaultChangesetCatalog(session, state);
		this._stateManager.setSessionChangesets(session, changesets);
	}

	refreshBranchChangeset(session: ProtocolURI): void {
		if (!this._hasWorkingDirectory(session)) {
			return;
		}
		this._scheduleStaticRecompute(session, 'branch', undefined, this._markStaticChangesetComputing(session, 'branch'));
	}

	refreshSessionChangeset(session: ProtocolURI): void {
		if (!this._hasWorkingDirectory(session)) {
			return;
		}
		this._scheduleStaticRecompute(session, 'session', undefined, this._markStaticChangesetComputing(session, 'session'));
	}

	/**
	 * Recomputes every changeset currently subscribed when a session is
	 * materialized or restored.
	 */
	onWorkingDirectoryAvailable(session: ProtocolURI): void {
		this.recomputeSubscribedChangesets(session);
	}

	/**
	 * Recomputes every changeset currently subscribed for `session`. Each
	 * subscribed changeset is dispatched to its kind-specific recompute; the
	 * recomputes skip while the working directory is still unknown.
	 */
	recomputeSubscribedChangesets(session: ProtocolURI): void {
		const subscriptions = this._changesetSubscriptions.getSessionSubscriptions(session);
		if (subscriptions.size === 0) {
			return;
		}
		for (const changeset of subscriptions) {
			const parsed = parseChangesetUri(changeset);
			switch (parsed?.kind) {
				case ChangesetKind.Branch:
					this.refreshBranchChangeset(session);
					break;
				case ChangesetKind.Session:
					this.refreshSessionChangeset(session);
					break;
				case ChangesetKind.Uncommitted:
					void this.computeUncommittedChangeset(session);
					break;
				case ChangesetKind.Turn:
					if (parsed.turnId !== undefined) {
						void this.computeTurnChangeset(session, parsed.turnId);
					}
					break;
				default:
					// A plain session URI subscription (Agents Window list /
					// detail observing the session) implicitly observes the
					// catalogue's static changesets — refresh both.
					if (changeset === session) {
						this.refreshBranchChangeset(session);
						this.refreshSessionChangeset(session);
					}
					break;
			}
		}
	}

	computeTurnChangeset(session: ProtocolURI, turnId: string): Promise<ProtocolURI> {
		// Turn telemetry is emitted at the turn boundary (onTurnComplete); this subscribe-triggered recompute does not report.
		return this._computeTurnChangeset(session, turnId, false);
	}

	private async _computeTurnChangeset(session: ProtocolURI, turnId: string, reportTelemetry: boolean, clientContext?: IAgentHostClientTelemetryContext): Promise<ProtocolURI> {
		const turnUri = this._stateManager.registerChangeset(buildTurnChangesetUri(session, turnId));
		if (this._stateManager.getChangesetState(turnUri)?.status !== ChangesetStatus.Computing) {
			this._stateManager.dispatchServerAction(turnUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Computing,
			});
		}
		const stopWatch = StopWatch.create();
		let outcome: TurnChangesetOutcome = 'error';
		let result: ITurnDiffResult | undefined;
		let fileCount: number | undefined;
		try {
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
				outcome = 'dbOpenFailed';
				return turnUri;
			}
			try {
				// Prefer the checkpoint-ref git diff when available — that path
				// captures terminal-tool edits the FileEditTracker pipeline
				// (`file_edits` rows) misses. Falls back to the SDK-tracked
				// aggregator when checkpoints aren't set up (non-git folder
				// isolation, baseline never captured, or capture failure).
				result = await this._computeTurnDiffsPreferCheckpoint(session, ref.object, turnId);
				outcome = result.outcome;
				fileCount = result.diffs.length;
				this._publishChangesetDiffs(session, turnUri, result.diffs);
			} catch (err) {
				this._logService.warn(`[AgentHostChangesetService] Failed to compute turn diffs for ${session}/${turnId}`, err);
				this._stateManager.dispatchServerAction(turnUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
				});
				outcome = 'error';
			} finally {
				ref.dispose();
			}
			return turnUri;
		} finally {
			if (reportTelemetry) {
				const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
				reportAgentHostTurnChangesetComputed(this._telemetryService, session, turnId, {
					outcome,
					durationMs: stopWatch.elapsed(),
					isMultiRoot: isMultiRootSession(workingDirectories),
					folderCount: workingDirectories?.length ?? 0,
					...(outcome === 'computed' && fileCount !== undefined ? { fileCount } : {}),
					multiRoot: result?.multiRoot,
				}, clientContext);
			}
		}
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
			const workingDir = await this._resolveWorkingDirectory(session);
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

	computeUncommittedChangeset(session: ProtocolURI): Promise<ProtocolURI> {
		return this._queueUncommittedChangeset(session, undefined, false);
	}

	private async _computeUncommittedChangeset(session: ProtocolURI, turnId: string | undefined, reportTelemetry: boolean, clientContext?: IAgentHostClientTelemetryContext): Promise<ProtocolURI> {
		const uncommittedUri = this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
		if (!this._hasSubscription(session, uncommittedUri)) {
			return uncommittedUri;
		}

		const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
		if (!workingDirectory) {
			return uncommittedUri;
		}

		const statusBeforeCompute = this._stateManager.getChangesetState(uncommittedUri)?.status;
		if (statusBeforeCompute !== ChangesetStatus.Computing) {
			this._stateManager.dispatchServerAction(uncommittedUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Computing,
			});
		}

		const stopWatch = StopWatch.create();
		const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
		let outcome: StaticChangesetOutcome = 'error';
		let fileCount: number | undefined;
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
				outcome = 'gitUnavailable';
				return uncommittedUri;
			}

			this._publishChangesetDiffs(session, uncommittedUri, diffs);
			fileCount = diffs.length;
			outcome = 'computed';
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute uncommitted diffs for ${session}`, err);
			this._stateManager.dispatchServerAction(uncommittedUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
			outcome = 'error';
		} finally {
			if (reportTelemetry) {
				reportAgentHostStaticChangesetComputed(this._telemetryService, session, turnId, {
					kind: 'uncommitted',
					outcome,
					durationMs: stopWatch.elapsed(),
					isMultiRoot: isMultiRootSession(workingDirectories),
					folderCount: workingDirectories?.length ?? 0,
					...(outcome === 'computed' && fileCount !== undefined ? { fileCount } : {}),
				}, clientContext);
			}
		}

		return uncommittedUri;
	}

	private async _computeUncommittedDiffs(session: ProtocolURI): Promise<readonly ISessionFileDiff[] | undefined> {
		const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
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

	private async _computeTurnDiffsPreferCheckpoint(session: ProtocolURI, db: ISessionDatabase, turnId: string): Promise<ITurnDiffResult> {
		const trackedSource = this._openTrackedTurnSource(session, db, turnId);
		// Multi-folder sessions aggregate every folder's changes; single- and
		// zero-folder sessions keep the existing single-repo behavior exactly.
		try {
			if (!trackedSource.sessionUri) {
				return { diffs: [], outcome: 'computed' };
			}
			const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
			if (isMultiRootSession(workingDirectories)) {
				return await this._computeMultiFolderTurnDiffs(session, trackedSource.sessionUri, trackedSource.db, turnId, workingDirectories!);
			}
			const diffs = await this._computeSingleFolderTurnDiffs(session, trackedSource.sessionUri, trackedSource.db, turnId);
			return { diffs, outcome: 'computed' };
		} finally {
			trackedSource.dispose();
		}
	}

	/**
	 * The single-folder per-turn diff: prefer the checkpoint-ref git diff of the
	 * primary working directory, else fall back to the SDK-tracked aggregator.
	 */
	private async _computeSingleFolderTurnDiffs(session: ProtocolURI, trackedSession: ProtocolURI, db: ISessionDatabase, turnId: string): Promise<readonly ISessionFileDiff[]> {
		const pair = await this._checkpointService.getTurnCheckpointPair(URI.parse(session), turnId);
		if (pair && pair.parent !== pair.current) {
			const workingDir = await this._resolveWorkingDirectory(session);
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
		return computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId);
	}

	private _openTrackedTurnSource(session: ProtocolURI, defaultDatabase: ISessionDatabase, turnId: string): { readonly sessionUri: ProtocolURI | undefined; readonly db: ISessionDatabase; dispose(): void } {
		const sessionState = this._stateManager.getSessionState(session);
		if (!sessionState) {
			return { sessionUri: session, db: defaultDatabase, dispose: () => { } };
		}

		const owningResources: ProtocolURI[] = [];
		if (sessionState.activeTurn?.id === turnId || (sessionState.turns ?? []).some(turn => turn.id === turnId)) {
			owningResources.push(session);
		}
		for (const chat of sessionState.chats ?? []) {
			if (isDefaultChatUri(chat.resource)) {
				continue;
			}
			const chatState = this._stateManager.getChatState(chat.resource);
			if (chatState?.activeTurn?.id === turnId || chatState?.turns.some(turn => turn.id === turnId)) {
				owningResources.push(chat.resource);
			}
		}

		if (owningResources.length > 1) {
			this._logService.warn(`[AgentHostChangesetService] Turn id ${turnId} is shared by multiple chats in ${session}; skipping ambiguous tracked-file fallback`);
			return { sessionUri: undefined, db: defaultDatabase, dispose: () => { } };
		}
		if (owningResources.length === 0 || owningResources[0] === session) {
			return { sessionUri: session, db: defaultDatabase, dispose: () => { } };
		}

		const chat = owningResources[0];
		const chatDatabase = this._sessionDataService.openDatabase(URI.parse(chat));
		return { sessionUri: chat, db: chatDatabase.object, dispose: () => chatDatabase.dispose() };
	}

	/**
	 * The multi-folder per-turn diff: diff each unique git repository once (in
	 * parallel) from its checkpoint pair and add the tracked edits scoped to
	 * the non-git folders. Per-folder failures are logged and skipped so one
	 * folder never fails the whole turn changeset.
	 */
	private async _computeMultiFolderTurnDiffs(session: ProtocolURI, trackedSession: ProtocolURI, db: ISessionDatabase, turnId: string, workingDirectories: readonly string[]): Promise<ITurnDiffResult> {
		const sessionUri = URI.parse(session);
		const workingDirectoryUris = this._parseWorkingDirectoryUris(session, workingDirectories);

		let gitRepositories: readonly URI[];
		let nonGitDirectories: readonly URI[];
		try {
			// Isolate per-root failures: a directory whose repository-root
			// lookup fails is treated as a non-git folder and routed through the
			// DB-tracked fallback below, so one repo's git failure never drops
			// the whole turn changeset.
			({ gitRepositories, nonGitDirectories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService, (directory, err) => {
				this._logService.error(`[AgentHostChangesetService] Failed to resolve repository root for ${directory.toString()} in multi-folder turn ${session}/${turnId}; treating it as a non-git folder.`, err);
			}));
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to resolve repositories for multi-folder turn ${session}/${turnId}`, err);
			return { diffs: [], outcome: 'resolveFailed' };
		}

		// Diff every resolved repository, but bound how many per-repo git diffs
		// run at once so a many-repository session cannot spawn an unbounded
		// number of git processes (see MAX_TURN_DIFF_REPOSITORY_CONCURRENCY).
		const limiter = new Limiter<{ readonly diffs: readonly ISessionFileDiff[]; readonly usedFallback: boolean }>(MAX_TURN_DIFF_REPOSITORY_CONCURRENCY);
		const [perRepoDiffs, nonGitDiffs] = await Promise.all([
			Promise.all(gitRepositories.map(repoRoot => limiter.queue(() => this._computeRepoTurnDiffs(session, trackedSession, sessionUri, db, turnId, repoRoot)))),
			this._computeNonGitTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, nonGitDirectories),
		]).finally(() => limiter.dispose());

		// Merge every source, keeping the first occurrence of each file. The git
		// sources are passed ahead of the non-git source so a git diff wins over
		// a DB-tracked edit for the same file, and files are compared with the
		// agent host's path-case bias (see `dedupeSessionFileDiffs`).
		const diffs = dedupeSessionFileDiffs([...perRepoDiffs.map(r => r.diffs), nonGitDiffs]);
		return {
			diffs,
			outcome: 'computed',
			multiRoot: {
				uniqueGitFolderCount: gitRepositories.length,
				nonGitFolderCount: nonGitDirectories.length,
				trackedEditFallbackFolderCount: perRepoDiffs.filter(r => r.usedFallback).length,
			},
		};
	}

	/**
	 * Computes one git repository's per-turn diff from its checkpoint pair.
	 * When the git diff is unavailable (missing checkpoint pair, `undefined`
	 * diff, or an error), that repository falls back to its tracked edits so
	 * one repo's git failure never drops the folder — mirroring the
	 * single-folder path's edit-tracker fallback. `usedFallback` reports whether
	 * that fallback was taken. Missing checkpoints are expected for older turns;
	 * actual git failures are logged as errors.
	 */
	private async _computeRepoTurnDiffs(session: ProtocolURI, trackedSession: ProtocolURI, sessionUri: URI, db: ISessionDatabase, turnId: string, repoRoot: URI): Promise<{ readonly diffs: readonly ISessionFileDiff[]; readonly usedFallback: boolean }> {
		try {
			const pair = await this._checkpointService.getTurnCheckpointPair(sessionUri, turnId, repoRoot);
			if (!pair) {
				this._logService.trace(`[AgentHostChangesetService] No checkpoint pair for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`);
				return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
			}
			if (pair.parent === pair.current) {
				// A no-op turn checkpoint reuses the parent ref — the diff is
				// empty by construction, so skip the (empty) git call. This is
				// a legitimate empty result, not a failure, so no tracked-edit fallback.
				return { diffs: [], usedFallback: false };
			}
			const diffs = await this._gitService.computeFileDiffsBetweenRefs(repoRoot, {
				sessionUri: session,
				fromRef: pair.parent,
				toRef: pair.current,
			});
			if (!diffs) {
				this._logService.error(`[AgentHostChangesetService] Git turn diff unavailable for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`);
				return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
			}
			return { diffs, usedFallback: false };
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to compute git turn diff for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`, err);
			return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
		}
	}

	/**
	 * Computes one git repository's per-turn diff from the **edit tracker's
	 * recorded file edits** (the session DB `file_edits` table written by
	 * `FileEditTracker`), scoped to that repo root — NOT from git.
	 *
	 * Used as the per-repo fallback when the repository's git turn diff is
	 * unavailable (missing checkpoint pair, `undefined` diff, or an error).
	 * Unlike the git path, this only sees changes the agent made through tracked
	 * edits. Scoping to the repo root keeps the git/non-git partition intact.
	 * Logs and returns an empty list if the fallback itself fails, so the folder
	 * contributes nothing rather than failing the whole turn.
	 */
	private async _computeRepoTurnDiffsFromTrackedEdits(session: ProtocolURI, trackedSession: ProtocolURI, db: ISessionDatabase, turnId: string, repoRoot: URI): Promise<readonly ISessionFileDiff[]> {
		try {
			return await computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId, [repoRoot]);
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Tracked-edit fallback turn diff failed for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}`, err);
			return [];
		}
	}

	/**
	 * Computes the session's non-git folders' per-turn diff from the **edit
	 * tracker's recorded file edits** (the session DB `file_edits` table written
	 * by `FileEditTracker`), scoped to those folder roots. Non-git folders have
	 * no git to diff, so tracked edits are their only source (not a fallback).
	 *
	 * Scoping to the non-git roots keeps the git/non-git partition intact, so
	 * git-folder edits (already covered by their git diff) are not
	 * double-counted. Returns an empty list when there are no non-git folders,
	 * and logs and returns an empty list on failure, so this never fails the
	 * whole turn.
	 */
	private async _computeNonGitTurnDiffsFromTrackedEdits(session: ProtocolURI, trackedSession: ProtocolURI, db: ISessionDatabase, turnId: string, nonGitDirectories: readonly URI[]): Promise<readonly ISessionFileDiff[]> {
		if (nonGitDirectories.length === 0) {
			return [];
		}
		try {
			return await computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId, nonGitDirectories);
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to compute non-git tracked-edit turn diff for multi-folder turn ${session}/${turnId}`, err);
			return [];
		}
	}

	/**
	 * Parses a session's working-directory strings into URIs, logging and
	 * skipping any that fail to parse so a malformed entry never fails the turn.
	 */
	private _parseWorkingDirectoryUris(session: ProtocolURI, workingDirectories: readonly string[]): URI[] {
		const uris: URI[] = [];
		for (const workingDirectory of workingDirectories) {
			try {
				uris.push(URI.parse(workingDirectory));
			} catch (err) {
				this._logService.warn(`[AgentHostChangesetService] Skipping unparseable working directory '${workingDirectory}' for session ${session}`, err);
			}
		}
		return uris;
	}

	/**
	 * Recomputes and publishes the all-folder `summary.changes` chip for a
	 * multi-folder session, writing both `META_CHANGES_SUMMARY` and the in-memory
	 * summary. Sums every git repo's branch delta plus the non-git folders' edits
	 * recorded by the edit tracker (`FileEditTracker`). Per-repo failures are
	 * skipped and the fan-out runs at bounded concurrency; if all sources fail
	 * the cached summary is preserved instead of writing zero.
	 */
	private async _updateMultiFolderChangesSummary(session: ProtocolURI, db: ISessionDatabase, workingDirectories: readonly string[], primaryBranchDiffs?: readonly ISessionFileDiff[]): Promise<void> {
		const workingDirectoryUris = this._parseWorkingDirectoryUris(session, workingDirectories);

		let gitRepositories: readonly URI[];
		let nonGitDirectories: readonly URI[];
		try {
			({ gitRepositories, nonGitDirectories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService));
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to resolve repositories for multi-folder branch summary ${session}`, err);
			return;
		}

		// The primary repo reuses the session's configured base branch so its
		// contribution matches the primary Branch Changes view; secondary repos
		// have no session-level base configured, so each uses its own default
		// branch. Passing a base branch makes every repo measure from its merge-
		// base (committed + uncommitted) instead of falling back to HEAD.
		const primaryRepositoryRoot = workingDirectoryUris.length > 0
			? await this._gitService.getRepositoryRoot(workingDirectoryUris[0])
			: undefined;
		const primaryRepositoryKey = primaryRepositoryRoot
			? extUriBiasedIgnorePathCase.getComparisonKey(primaryRepositoryRoot)
			: undefined;
		const sessionBaseBranch = await this._resolveBranchBaseBranch(session, db);

		// Diff every resolved repository, but bound how many per-repo git diffs
		// run at once so a many-repository session cannot spawn an unbounded
		// number of git processes (see MAX_TURN_DIFF_REPOSITORY_CONCURRENCY).
		const limiter = new Limiter<readonly ISessionFileDiff[] | undefined>(MAX_TURN_DIFF_REPOSITORY_CONCURRENCY);
		const [perRepoDiffs, nonGitDiffs] = await Promise.all([
			Promise.all(gitRepositories.map(repoRoot => limiter.queue(async () => {
				// Isolate each repository: any failure — including the
				// `getDefaultBranch` probe below — marks ONLY this repository
				// unavailable (`undefined`) instead of rejecting the whole
				// fan-out, so a single secondary repo's git failure never flips
				// the already-published branch changeset to Error.
				try {
					const isPrimary = primaryRepositoryKey !== undefined
						&& extUriBiasedIgnorePathCase.getComparisonKey(repoRoot) === primaryRepositoryKey;
					// Reuse the branch changeset's already-computed primary diff
					// instead of re-diffing the primary repo. Only supplied on the
					// success path, where the session has its own working directories,
					// so the branch changeset's primary repo == this primary repo and
					// both measure from the session base branch — identical result,
					// one fewer git diff per recompute.
					if (isPrimary && primaryBranchDiffs) {
						return primaryBranchDiffs;
					}
					const baseBranch = isPrimary
						? sessionBaseBranch
						: (await this._gitService.getDefaultBranch(repoRoot))?.name;
					return await this._computeRepoBranchDiffs(session, repoRoot, baseBranch);
				} catch (err) {
					this._logService.error(`[AgentHostChangesetService] Failed to compute branch diff for multi-folder branch summary ${session} in repository ${repoRoot.toString()}`, err);
					return undefined;
				}
			}))),
			this._computeNonGitBranchDiffs(session, db, nonGitDirectories),
		]).finally(() => limiter.dispose());

		// Classify the diff sources by availability. The non-git DB source only
		// counts when there ARE non-git folders, so a session whose working
		// directories all fail to resolve contributes no sources at all.
		const orderedSources: (readonly ISessionFileDiff[] | undefined)[] = [...perRepoDiffs];
		if (nonGitDirectories.length > 0) {
			orderedSources.push(nonGitDiffs);
		}
		const evaluation = evaluateMultiRootDiffSources(orderedSources);
		if (evaluation.outcome === 'failed') {
			// No source produced diffs (total failure or no sources at all).
			// Preserve the previously cached summary instead of clobbering it
			// with a spurious zero aggregate.
			this._logService.warn(`[AgentHostChangesetService] No diff source available for multi-folder branch summary ${session}; preserving the cached summary.`);
			return;
		}

		let additions = 0;
		let deletions = 0;
		let files = 0;
		for (const diffs of evaluation.availableSources) {
			const summary = summariseDiffs(diffs);
			if (summary) {
				additions += summary.additions ?? 0;
				deletions += summary.deletions ?? 0;
				files += summary.files ?? 0;
			}
		}

		const changesSummary: ChangesSummary = { additions, deletions, files };
		this.persistChangesSummary(session, changesSummary);
		this._stateManager.setSessionSummaryChanges(session, changesSummary);
	}

	/**
	 * Computes one git repository's branch diff for the multi-folder summary,
	 * logging and returning `undefined` on any failure so a single repo never
	 * fails the whole aggregate and an unavailable repo is counted as such (not
	 * as a spurious zero). Uses the same `computeSessionFileDiffs` primitive as
	 * the primary branch changeset, threading the resolved `baseBranch` so
	 * committed-on-branch work is counted (not just uncommitted).
	 */
	private async _computeRepoBranchDiffs(session: ProtocolURI, repoRoot: URI, baseBranch: string | undefined): Promise<readonly ISessionFileDiff[] | undefined> {
		try {
			const diffs = await this._gitService.computeSessionFileDiffs(repoRoot, { sessionUri: session, baseBranch });
			if (!diffs) {
				this._logService.error(`[AgentHostChangesetService] Git branch diff unavailable for multi-folder branch summary ${session} in repository ${repoRoot.toString()}; skipping that repository.`);
				return undefined;
			}
			return diffs;
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to compute git branch diff for multi-folder branch summary ${session} in repository ${repoRoot.toString()}`, err);
			return undefined;
		}
	}

	/**
	 * The session-level DB-tracked edits for the non-git folders, scoped to
	 * those roots so the multi-folder summary counts non-git folder changes
	 * (git folders are already covered by their branch diff, and the git/non-git
	 * partition keeps the two disjoint). Uses full-session aggregation so a file
	 * edited across several turns counts once. Callers only treat this as a
	 * source when there ARE non-git folders; it returns `undefined` on failure
	 * so a failed non-git source is counted as unavailable rather than empty.
	 */
	private async _computeNonGitBranchDiffs(session: ProtocolURI, db: ISessionDatabase, nonGitDirectories: readonly URI[]): Promise<readonly ISessionFileDiff[] | undefined> {
		if (nonGitDirectories.length === 0) {
			return [];
		}
		try {
			return await computeSessionDiffs(session, db, this._diffComputeService, undefined, nonGitDirectories);
		} catch (err) {
			this._logService.error(`[AgentHostChangesetService] Failed to compute non-git DB branch summary for multi-folder session ${session}`, err);
			return undefined;
		}
	}

	private async _resolveWorkingDirectory(session: ProtocolURI): Promise<URI | undefined> {
		// For the time being we default to the first working directory in the list, if any.
		// In the future we may want to support multiple working directories per session,
		// but for now we only support one.
		const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
		return workingDirectories && workingDirectories.length > 0
			? URI.parse(workingDirectories[0])
			: undefined;
	}

	// ---- Lifecycle hooks invoked by AgentSideEffects -----------------------

	onToolCallEditsApplied(session: ProtocolURI, turnId: string, clientContext?: IAgentHostClientTelemetryContext): void {
		this._scheduleDebouncedDiffComputation(session, turnId, clientContext);
		// Per-turn URIs have no catalogue chip aggregates, so skip the
		// recompute entirely when no client is observing this turn. The
		// next subscriber will get a fresh snapshot from
		// `tryHandleSubscribe → computeTurnChangeset`.
		if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
			this._scheduleDebouncedTurnDiffComputation(session, turnId, clientContext);
		}
	}

	onTurnComplete(session: ProtocolURI, turnId: string | undefined, clientContext?: IAgentHostClientTelemetryContext): void {
		// Ordering matters for cancellation: cancel any pending mid-turn
		// debounces first so the final turn-complete computes supersede
		// them. After that, schedule the final recomputes for the turn
		// (when observed), the session-wide changeset with the changed
		// turn id, and the uncommitted changeset when it is observed.
		this._cancelDebouncedDiffComputation(session);
		if (turnId !== undefined) {
			this._cancelDebouncedTurnDiffComputation(session, turnId);
			if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
				this._scheduleTurnRecompute(session, turnId, true, clientContext);
			}
		}

		if (this._hasSubscription(session, buildUncommittedChangesetUri(session))) {
			this._scheduleUncommittedRecompute(session, turnId, true, clientContext);
		}

		this._scheduleStaticRecompute(session, 'branch', turnId, undefined, true, clientContext);
		this._scheduleStaticRecompute(session, 'session', turnId, undefined, true, clientContext);
	}

	onSessionTruncated(session: ProtocolURI): void {
		// Turns were removed — recompute from scratch (no changedTurnId).
		this._scheduleStaticRecompute(session, 'branch', undefined, undefined, true);
		this._scheduleStaticRecompute(session, 'session', undefined, undefined, true);
	}

	// ---- Internal compute pipeline -----------------------------------------

	/**
	 * Schedules a debounced session-changeset recomputation. Uncommitted
	 * recomputes ride the same turn-complete path; mid-turn debounce only
	 * makes sense for the SDK-tracked session-wide diff (which sees fresh
	 * `tool_complete` events between turn boundaries).
	 */
	private _scheduleDebouncedDiffComputation(session: ProtocolURI, turnId: string, clientContext?: IAgentHostClientTelemetryContext): void {
		this._debouncedDiffTimers.set(session, disposableTimeout(() => {
			this._debouncedDiffTimers.deleteAndDispose(session);
			this._scheduleStaticRecompute(session, 'branch', turnId, undefined, false, clientContext);
			this._scheduleStaticRecompute(session, 'session', turnId, undefined, false, clientContext);
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
	private _scheduleDebouncedTurnDiffComputation(session: ProtocolURI, turnId: string, clientContext?: IAgentHostClientTelemetryContext): void {
		const key = `${session}\u0000${turnId}`;
		this._perTurnDebouncedDiffTimers.set(key, disposableTimeout(() => {
			this._perTurnDebouncedDiffTimers.deleteAndDispose(key);
			this._scheduleTurnRecompute(session, turnId, false, clientContext);
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
	private _scheduleTurnRecompute(session: ProtocolURI, turnId: string, reportTelemetry: boolean = false, clientContext?: IAgentHostClientTelemetryContext): void {
		this._diffComputationSequencer.queue(`${session}\u0000turn\u0000${turnId}`, () => this._computeTurnChangeset(session, turnId, reportTelemetry, clientContext).then(() => undefined));
	}

	private _scheduleUncommittedRecompute(session: ProtocolURI, turnId: string | undefined, reportTelemetry: boolean = false, clientContext?: IAgentHostClientTelemetryContext): void {
		void this._queueUncommittedChangeset(session, turnId, reportTelemetry, clientContext);
	}

	private _queueUncommittedChangeset(session: ProtocolURI, turnId: string | undefined, reportTelemetry: boolean, clientContext?: IAgentHostClientTelemetryContext): Promise<ProtocolURI> {
		return this._diffComputationSequencer.queue(`${session}\u0000uncommitted`, () => this._computeUncommittedChangeset(session, turnId, reportTelemetry, clientContext));
	}

	/**
	 * Schedules a static changeset (`uncommitted` or `session`) recompute,
	 * serialised per-session so back-to-back triggers don't race against
	 * stale `previousDiffs` reads. Fire-and-forget — failures are logged
	 * but do not fail the turn.
	 */
	private _scheduleStaticRecompute(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string, statusBeforeRefresh?: ChangesetStatus, reportTelemetry: boolean = false, clientContext?: IAgentHostClientTelemetryContext): void {
		this._diffComputationSequencer.queue(`${session}\u0000${kind}`, () => this._doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh, reportTelemetry, clientContext));
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

	private async _doComputeStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string, statusBeforeRefresh?: ChangesetStatus, reportTelemetry: boolean = false, clientContext?: IAgentHostClientTelemetryContext): Promise<void> {
		const changesetUri = staticChangesetUri(session, kind);
		const stopWatch = StopWatch.create();
		const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
		let outcome: StaticChangesetOutcome = 'error';
		let fileCount = 0;
		let incrementalUsed = false;
		let usedEditTrackerFallback = false;
		// Emitted exactly once per compute: from the DB-open catch below (which
		// returns before the main finally) or from the main finally otherwise.
		const emitStaticTelemetry = () => {
			if (reportTelemetry) {
				reportAgentHostStaticChangesetComputed(this._telemetryService, session, changedTurnId, {
					kind,
					outcome,
					durationMs: stopWatch.elapsed(),
					isMultiRoot: isMultiRootSession(workingDirectories),
					folderCount: workingDirectories?.length ?? 0,
					...(outcome === 'computed' ? { fileCount } : {}),
					...(kind === 'session' ? { incrementalUsed, usedEditTrackerFallback } : {}),
				}, clientContext);
			}
		};
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
			outcome = 'dbOpenFailed';
			emitStaticTelemetry();
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
					//
					// The multi-folder `summary.changes` aggregate is computed
					// INDEPENDENTLY of the primary branch changeset (it re-diffs
					// every folder itself), so refresh it here even though the
					// primary branch diff is unavailable — otherwise a primary
					// folder without a resolvable diff would suppress the whole
					// all-folder count.
					const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
					if (isMultiRootSession(workingDirectories)) {
						await this._updateMultiFolderChangesSummary(session, ref.object, workingDirectories!);
					}
					this._logService.debug(`[AgentHostChangesetService] Branch git diff unavailable for ${session}; preserving cached changeset. previousStatus=${statusBeforeCompute ?? 'unknown'} cachedFiles=${this._stateManager.getChangesetState(changesetUri)?.files.length ?? 0}`);
					this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
					outcome = 'preserved';
					return;
				}
				// `session` kind: working-tree git is unavailable (no
				// working dir or not a git work tree). Fall back to the
				// edit-tracker aggregator — for the session changeset the
				// SDK-tracked edits are the best available approximation.
				//
				// In multi-chat sessions each peer chat records its file
				// edits into its OWN database (the chat URI is used as the
				// session URI for that chat's edit tracker). Union the
				// session DB with every peer chat DB so peer-chat edits roll
				// up into the session-level changes.
				usedEditTrackerFallback = true;
				const peerSources = this._openPeerChatSources(session);
				try {
					if (peerSources.length > 0) {
						const sources: ISessionDiffSource[] = [
							{ sessionUri: session, db: ref.object },
							...peerSources.map(p => ({ sessionUri: p.sessionUri, db: p.ref.object })),
						];
						// TODO (debt): multi-chat always does a full recompute
						// (the incremental `changedTurnId`/`previousDiffs` path is
						// only used for single-chat below). A follow-up can make
						// `computeUnionedDiffs` incremental — see its doc comment
						// and the tracking issue.
						diffs = await computeUnionedDiffs(sources, this._diffComputeService);
					} else {
						let incremental: IIncrementalDiffOptions | undefined;
						if (changedTurnId) {
							const previousDiffs = this._readPreviousChangesetDiffs(changesetUri);
							if (previousDiffs) {
								incremental = { changedTurnId, previousDiffs: [...previousDiffs] };
								incrementalUsed = true;
							}
						}
						diffs = await computeSessionDiffs(session, ref.object, this._diffComputeService, incremental);
					}
				} finally {
					for (const peer of peerSources) {
						peer.ref.dispose();
					}
				}
			}

			const reviewed = kind === ChangesetKind.Branch
				? await this._computeReviewedInfo(session, ref.object)
				: undefined;
			this._publishChangesetDiffs(session, changesetUri, diffs, reviewed);
			fileCount = diffs.length;
			outcome = 'computed';

			// Persist the file list so a subsequent `listSessions` /
			// `restoreSession` can reseed the changeset before the first
			// post-restart compute completes.
			this._persistSessionFlag(session, persistKeyFor(kind), JSON.stringify(diffs));

			if (kind === ChangesetKind.Branch) {
				// Migration: also overwrite the legacy `'diffs'` key with the
				// session-changeset payload so older readers stay correct
				// during the rollout window.
				this._persistSessionFlag(session, META_LEGACY_DIFFS, JSON.stringify(diffs));

				// Own the `summary.changes` aggregate by session shape:
				//
				// - SINGLE-folder: derive it from the primary branch `diffs`,
				//   exactly as before — that branch changeset IS the whole
				//   session footprint. The session-list chip and the
				//   inactive-session aggregate (`computeListEntryChanges`) read the
				//   branch changeset, as does the active session view, so sourcing
				//   the persisted summary from the same place keeps the count stable
				//   across the active <-> inactive transition.
				// - MULTI-folder: the primary-only `diffs` under-count the session,
				//   so do NOT write the summary here. Recompute the ALL-FOLDER
				//   aggregate independently from every repository's branch diff so a
				//   subsequent branch recompute keeps the all-folder count instead of
				//   clobbering it back to the primary folder's. The branch CHANGESET
				//   state is still published from the primary `diffs` above (data
				//   unchanged); only the summary ownership moves.
				const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
				if (isMultiRootSession(workingDirectories)) {
					// Reuse the primary branch `diffs` just computed above so the
					// summary doesn't re-diff the primary repo (perf: one fewer git
					// diff per branch recompute).
					await this._updateMultiFolderChangesSummary(session, ref.object, workingDirectories!, diffs);
				} else {
					const changesSummary = summariseDiffs(diffs) ?? { additions: 0, deletions: 0, files: 0 };
					this.persistChangesSummary(session, changesSummary);
					this._stateManager.setSessionSummaryChanges(session, changesSummary);
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute ${kind} diffs`, err);
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
			outcome = 'error';
		} finally {
			this._activeStaticComputes.delete(changesetUri);
			this._stateManager.onChangesetLivenessChanged();
			ref.dispose();
			emitStaticTelemetry();
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
	private _publishChangesetDiffs(session: ProtocolURI, changesetUri: ProtocolURI, diffs: readonly ISessionFileDiff[], reviewed?: { readonly repoRoot: URI; readonly paths: ReadonlySet<string> }): void {
		// Get the available operations for this changeset. This call assumes that at this point
		// the git state of the session is up-to-date as it is being used to determine the available
		// operations. Long term this should be replaced with a more robust mechanism.
		const operations = this._changesetOperationService.getOperations(session, changesetUri);

		const files: ChangesetFile[] = [];
		for (const edit of diffs) {
			const id = edit.after?.uri ?? edit.before?.uri;
			if (!id) {
				continue;
			}
			if (reviewed) {
				const relPath = relativePath(reviewed.repoRoot, URI.parse(id));
				files.push({
					id, edit,
					reviewed: relPath
						? reviewed.paths.has(relPath)
						: false
				});
			} else {
				files.push({ id, edit });
			}
		}

		this._stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetContentChanged,
			files,
			operations: operations
				? [...operations]
				: undefined,
		});

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
	 * Opens the databases for every non-default (peer) chat in a multi-chat
	 * session. Each peer chat records its file edits into its own database
	 * keyed by the chat URI, so the session changeset must union those
	 * databases with the session DB. Returns an empty array for single-chat
	 * sessions. Callers MUST dispose every returned `ref`.
	 */
	private _openPeerChatSources(session: ProtocolURI): { sessionUri: ProtocolURI; ref: ReturnType<ISessionDataService['openDatabase']> }[] {
		const chats = this._stateManager.getSessionState(session)?.chats ?? [];
		const sources: { sessionUri: ProtocolURI; ref: ReturnType<ISessionDataService['openDatabase']> }[] = [];
		for (const chat of chats) {
			if (isDefaultChatUri(chat.resource)) {
				continue;
			}
			try {
				const ref = this._sessionDataService.openDatabase(URI.parse(chat.resource));
				sources.push({ sessionUri: chat.resource, ref });
			} catch (err) {
				this._logService.warn(`[AgentHostChangesetService] Failed to open peer chat database for session changes: ${chat.resource}`, err);
			}
		}
		return sources;
	}

	/**
	 * Returns the turn id whose checkpoint best represents the latest state of
	 * the session's shared working tree. For single-chat sessions this is the
	 * default chat's last turn. For multi-chat sessions it is the last turn of
	 * the most-recently-modified chat (peer-chat turn checkpoints are stored
	 * under the session URI keyed by their turn id). Returns `undefined` when
	 * no chat has any turns.
	 */
	private _latestTurnIdAcrossChats(session: ProtocolURI): string | undefined {
		const sessionState = this._stateManager.getSessionState(session);
		if (!sessionState) {
			return undefined;
		}

		const chats = sessionState.chats ?? [];
		if (chats.length <= 1) {
			return sessionState.turns.at(-1)?.id;
		}

		let bestTurnId: string | undefined;
		let bestModifiedAt = '';
		for (const chat of chats) {
			const turns = isDefaultChatUri(chat.resource)
				? sessionState.turns
				: this._stateManager.getChatState(chat.resource)?.turns;
			const lastTurnId = turns?.at(-1)?.id;
			if (lastTurnId && chat.modifiedAt >= bestModifiedAt) {
				bestModifiedAt = chat.modifiedAt;
				bestTurnId = lastTurnId;
			}
		}
		return bestTurnId;
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
		const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
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
			// Get session checkpoints. In multi-chat sessions the working tree
			// is shared and each chat's turn checkpoints are stored under the
			// session URI keyed by their turn id, so the most-recently-modified
			// chat's last turn captures the full working-tree delta.
			const latestTurnId = this._latestTurnIdAcrossChats(session);
			if (!latestTurnId) {
				return undefined;
			}

			const sessionUri = URI.parse(session);
			const [baseline, pair] = await Promise.all([
				this._checkpointService.getBaselineCheckpoint(sessionUri),
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
		const baseBranch = await this._resolveBranchBaseBranch(session, db);

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
	 * Resolves the Branch Changes base branch, reused by the diff computation
	 * and the review-status lookup so both are keyed on the same baseline.
	 */
	private async _resolveBranchBaseBranch(session: ProtocolURI, db: ISessionDatabase): Promise<string | undefined> {
		const persistedBaseBranch = await db.getMetadata(META_DIFF_BASE_BRANCH);
		const gitStateBaseBranch = readSessionGitState(this._stateManager.getSessionState(session)?._meta)?.baseBranchName;
		if (!persistedBaseBranch && gitStateBaseBranch) {
			this._logService.debug(`[AgentHostChangesetService] Using _meta.git base branch fallback for Branch Changes in ${session}: ${gitStateBaseBranch}`);
		}
		return resolveDiffBaseBranchName(persistedBaseBranch, gitStateBaseBranch);
	}

	/**
	 * Computes the reviewed-paths overlay for the Branch changeset: the
	 * repository root (used to key file ids to repo-relative paths) and the set
	 * of reviewed repo-relative paths. Returns `undefined` when the session has
	 * no git working directory (review status is then simply omitted).
	 */
	private async _computeReviewedInfo(session: ProtocolURI, db: ISessionDatabase): Promise<{ readonly repoRoot: URI; readonly paths: ReadonlySet<string> } | undefined> {
		const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
		if (!workingDirectory) {
			return undefined;
		}

		let workingDirectoryUri: URI;
		try {
			workingDirectoryUri = URI.parse(workingDirectory);
		} catch {
			return undefined;
		}

		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectoryUri);
		if (!repoRoot) {
			return undefined;
		}

		const baseBranch = await this._resolveBranchBaseBranch(session, db);
		const paths = await this._reviewService.getReviewedPaths(session, workingDirectoryUri, baseBranch);

		return { repoRoot, paths };
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
