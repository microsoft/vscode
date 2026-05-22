/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, SequencerByKey } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import {
	buildCompareTurnsChangesetUri,
	buildSessionChangesetUri,
	buildTurnChangesetUri,
	buildTurnChangesetUriTemplate,
	buildUncommittedChangesetUri,
	sessionChangesetLabel,
	thisTurnChangesetLabel,
	uncommittedChangesetLabel,
	uncommittedChangesetDescription,
} from '../common/changesetUri.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { ChangesetState, ChangesetSummary } from '../common/state/protocol/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import {
	ChangesetStatus,
	type ChangesetFile,
	type ISessionFileDiff,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from './agentHostGitService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { computeSessionDiffs, computeTurnDiffs, type IIncrementalDiffOptions } from './sessionDiffAggregator.js';
import { META_CHECKPOINT_WORKING_DIR } from './agentHostCheckpointService.js';

/**
 * Metadata key under which the {@link ISessionFileDiff}[] for the
 * `<session>/changeset/uncommitted` changeset is persisted. Per-changeset
 * keys let `listSessions` / `restoreSession` reseed the catalogue without
 * recomputing, and keep static changesets independent of the legacy
 * `'diffs'` blob (which only ever covered the session-wide changeset).
 */
export const META_CHANGESET_UNCOMMITTED = 'agentHost.changeset.uncommitted';

/** Metadata key under which the session-wide changeset's diff list is persisted. */
export const META_CHANGESET_SESSION = 'agentHost.changeset.session';

/**
 * Legacy metadata key used by older builds to persist the session-wide
 * changeset's diff list. Read-only fallback for {@link META_CHANGESET_SESSION}.
 */
export const META_LEGACY_DIFFS = 'diffs';

/** The two static changeset kinds we publish by default. */
export type StaticChangesetKind = 'uncommitted' | 'session';

function staticChangesetUri(session: ProtocolURI, kind: StaticChangesetKind): ProtocolURI {
	return kind === 'uncommitted' ? buildUncommittedChangesetUri(session) : buildSessionChangesetUri(session);
}

function persistKeyFor(kind: StaticChangesetKind): string {
	return kind === 'uncommitted' ? META_CHANGESET_UNCOMMITTED : META_CHANGESET_SESSION;
}

/**
 * Builds a single static {@link ChangesetSummary} catalogue entry from a
 * persisted (or live-state-derived) file list. Returns the bare entry
 * (no counts) when `diffs` is undefined. Optional `description` is
 * threaded through when provided.
 */
function buildStaticCatalogueEntry(label: string, uri: string, diffs: readonly ISessionFileDiff[] | undefined, description?: string): ChangesetSummary {
	const base: ChangesetSummary = description ? { label, uriTemplate: uri, description } : { label, uriTemplate: uri };
	if (!diffs) {
		return base;
	}
	let additions = 0;
	let deletions = 0;
	for (const d of diffs) {
		additions += d.diff?.added ?? 0;
		deletions += d.diff?.removed ?? 0;
	}
	return { ...base, additions, deletions, files: diffs.length };
}

function defaultCatalogueWithCounts(
	sessionUri: string,
	uncommittedDiffs: readonly ISessionFileDiff[] | undefined,
	sessionDiffs: readonly ISessionFileDiff[] | undefined,
): ChangesetSummary[] {
	return [
		buildStaticCatalogueEntry(sessionChangesetLabel(), buildSessionChangesetUri(sessionUri), sessionDiffs),
		buildStaticCatalogueEntry(uncommittedChangesetLabel(), buildUncommittedChangesetUri(sessionUri), uncommittedDiffs, uncommittedChangesetDescription()),
		{ label: thisTurnChangesetLabel(), uriTemplate: buildTurnChangesetUriTemplate(sessionUri) },
	];
}

/**
 * Build the default ordered changeset catalogue (`Branch Changes`,
 * `Uncommitted Changes`, `This Turn`) seeded from the live
 * {@link ChangesetState} for an unopened session that has no live
 * `SessionState` but already has ready changeset states (e.g. from a
 * prior `restoreStaticChangeset` call).
 *
 * Returns `undefined` when no live state is ready, so `listSessions`
 * naturally leaves the `changesets` field undefined for sessions that
 * have no usable counts yet — preserving the long-standing contract that
 * unopened sessions without persisted or live data advertise no catalogue.
 *
 * The two static entries (`Branch Changes`, `Uncommitted Changes`) are
 * git-only — `AgentService._attachGitState` strips them from the live
 * `summary.changesets` for non-git working directories. The synthesised
 * catalogue here mirrors the live-state shape so list overlays stay
 * consistent with the per-session catalogue clients subscribe to.
 *
 * The compare-turns changeset is intentionally NOT advertised in the
 * catalogue — it is subscribe-only (see
 * {@link buildDefaultChangesetCatalogue}).
 */
export function buildCatalogueFromLiveState(
	sessionUri: string,
	uncommitted: ChangesetState | undefined,
	session: ChangesetState | undefined,
): ChangesetSummary[] | undefined {
	const uncommittedDiffs = uncommitted?.status === ChangesetStatus.Ready ? uncommitted.files.map(f => f.edit) : undefined;
	const sessionDiffs = session?.status === ChangesetStatus.Ready ? session.files.map(f => f.edit) : undefined;
	if (!uncommittedDiffs && !sessionDiffs) {
		return undefined;
	}
	return defaultCatalogueWithCounts(sessionUri, uncommittedDiffs, sessionDiffs);
}

/**
 * Build the default ordered changeset catalogue from parsed persisted
 * diffs. Returns `undefined` when both inputs are absent so unopened
 * sessions with no usable data leave `changesets` undefined — preserving
 * the existing `listSessions` behaviour for malformed metadata cases.
 */
export function buildCatalogueFromPersistedDiffs(
	sessionUri: string,
	uncommittedDiffs: readonly ISessionFileDiff[] | undefined,
	sessionDiffs: readonly ISessionFileDiff[] | undefined,
): ChangesetSummary[] | undefined {
	if (!uncommittedDiffs && !sessionDiffs) {
		return undefined;
	}
	return defaultCatalogueWithCounts(sessionUri, uncommittedDiffs, sessionDiffs);
}

/**
 * Parses a JSON-serialised {@link ISessionFileDiff}[] blob from session
 * metadata. Returns `undefined` for missing or malformed input, logging a
 * warning that names `sessionUri` and `kind` so operators can correlate the
 * failure with a specific session/changeset slot. Never throws.
 */
export function tryParsePersistedDiffs(raw: string | undefined, sessionUri: string, kind: string, log: ILogService): ISessionFileDiff[] | undefined {
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

/**
 * Raw metadata values for the three persisted changeset blobs, batch-read
 * by the caller (`AgentService.listSessions` / `AgentService.restoreSession`).
 * The caller owns the database read so multiple metadata keys can be
 * fetched in a single round-trip; the service owns parsing, applying,
 * and `seedIfEmpty` gating.
 */
export interface IPersistedChangesetMetadata {
	readonly uncommittedRaw?: string;
	readonly sessionRaw?: string;
	readonly legacyRaw?: string;
}

/**
 * The parsed diffs returned from {@link IAgentHostChangesetService.restorePersistedStaticChangesets},
 * suitable for passing into {@link buildCatalogueFromPersistedDiffs} when
 * the caller needs to synthesise a catalogue for the session-list overlay.
 */
export interface IRestoredChangesetDiffs {
	readonly uncommitted?: readonly ISessionFileDiff[];
	readonly session?: readonly ISessionFileDiff[];
}

export const IAgentHostChangesetService = createDecorator<IAgentHostChangesetService>('agentHostChangesetService');

/**
 * Owns the lifecycle of static and per-turn changesets for the agent host:
 * registers the `<session>/changeset/{uncommitted,session,turn/<id>}` URIs
 * on the state manager, runs git-driven and edit-tracker-driven diff
 * computations, debounces mid-turn recomputes, publishes file lists
 * (`changeset/fileSet` / `changeset/fileRemoved`) and aggregate counts
 * (`session/summaryChanged`), and persists results to the session DB so
 * restarts can rehydrate without recomputing.
 *
 * Created locally by `AgentService` (not via `registerSingleton`) and
 * added to the local `ServiceCollection` so `AgentSideEffects` can
 * resolve it via `@IAgentHostChangesetService`. `AgentHostStateManager`
 * is passed as a plain ctor argument (it has no decorator today); the
 * git / log / session-data services are DI-injected.
 */
export interface IAgentHostChangesetService {
	readonly _serviceBrand: undefined;

	/**
	 * Registers the two static changeset URIs (`uncommitted`, `session`)
	 * on the state manager so client subscriptions resolve to a
	 * `status: computing` snapshot before the first compute pass
	 * completes. The catalogue itself (`summary.changesets`) is seeded
	 * upstream by `_buildInitialSummary` / `restoreSession` — this only
	 * deals with the state-manager-side per-changeset entries.
	 *
	 * Idempotent; safe to call on every create and restore path.
	 */
	registerStaticChangesets(session: ProtocolURI): void;

	/**
	 * Re-seed a static changeset (`uncommitted` or `session`) from a
	 * previously persisted file list (e.g. read out of the session DB on
	 * restore / listSessions). Idempotently registers the changeset URI
	 * on the state manager, fans the persisted files out as
	 * `changeset/fileSet` actions, and transitions the status to `Ready`.
	 */
	restoreStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, diffs: readonly ISessionFileDiff[]): void;

	/**
	 * Parses the persisted changeset metadata blobs (`uncommitted`,
	 * `session`, and the legacy `diffs` fallback for `session`), applies
	 * each parsed file list via {@link restoreStaticChangeset}, and returns
	 * the parsed diffs so the caller can pass them into
	 * {@link buildCatalogueFromPersistedDiffs} for the session-list overlay.
	 *
	 * The `AgentService` orchestration boundary batches the metadata read
	 * (custom title + read / archive flags + config values + these three
	 * blobs) in a single database round-trip, then hands the raw values
	 * here; the service does not open the database itself for this method.
	 *
	 * Honours `seedIfEmpty`: when a live changeset state already has files
	 * for the same kind, persisted diffs are NOT applied (they would
	 * otherwise overwrite the live state). Malformed JSON is logged and
	 * the corresponding slot is left `undefined`.
	 */
	restorePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs;

	/**
	 * Lazy refresh of the uncommitted changeset, kicked off when a client
	 * first subscribes to `<session>/changeset/uncommitted`.
	 */
	refreshUncommittedChangeset(session: ProtocolURI): void;

	/**
	 * Lazy refresh of the session (branch) changeset, kicked off when a
	 * client first subscribes to `<session>/changeset/session` or the
	 * session URI itself (e.g. Agents Window observing the session). Mirrors
	 * {@link refreshUncommittedChangeset} so the catalogue chip stays fresh
	 * across session opens even when no turn has run since process start.
	 */
	refreshSessionChangeset(session: ProtocolURI): void;

	/**
	 * Computes and publishes the per-turn changeset for `turnId` on `session`.
	 * Per-turn changesets are not persisted.
	 */
	computeTurnChangeset(session: ProtocolURI, turnId: string): Promise<ProtocolURI>;

	/**
	 * Computes and publishes the compare-turns changeset between
	 * `originalTurnId` (the "from" endpoint) and `modifiedTurnId` (the
	 * "to" endpoint) on `session`. Diff direction is
	 * `originalTurnId.current → modifiedTurnId.current` — endpoint-to-
	 * endpoint, so it captures what differs between the two turn states.
	 *
	 * Implemented via git: both refs come from the per-turn checkpoint
	 * captured at the end of each turn. When either checkpoint is missing
	 * (non-git session, baseline never captured, capture failure), the
	 * changeset transitions to `status: Error` instead of rejecting; no
	 * SDK edit-tracker fallback exists.
	 *
	 * Compare-turns changesets are not persisted and are computed once
	 * on subscribe (no live recompute).
	 */
	computeCompareTurnsChangeset(session: ProtocolURI, originalTurnId: string, modifiedTurnId: string): Promise<ProtocolURI>;

	/**
	 * Hook called by `AgentSideEffects` after a tool call that produced
	 * file edits completes. Schedules a debounced session-changeset recompute.
	 */
	onToolCallEditsApplied(session: ProtocolURI, turnId: string): void;

	/**
	 * Hook called by `AgentSideEffects` when a turn completes. Cancels any
	 * pending mid-turn debounce, then schedules a final session + uncommitted
	 * recompute. Ordering matters — see implementation.
	 */
	onTurnComplete(session: ProtocolURI, turnId: string | undefined): void;

	/**
	 * Hook called by `AgentSideEffects` when a session is truncated (turns
	 * removed). Recomputes the session changeset from scratch (no
	 * `changedTurnId`, no incremental reuse).
	 */
	onSessionTruncated(session: ProtocolURI): void;

	/**
	 * Installs a predicate the service consults before scheduling a
	 * per-turn changeset recompute. Owned by {@link ChangesetSessionCoordinator},
	 * which tracks per-turn subscribers via `onFirstSubscriber` /
	 * `onLastSubscriber`. Called exactly once at coordinator construction.
	 */
	setTurnSubscriberProbe(probe: (session: ProtocolURI, turnId: string) => boolean): void;
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

	registerStaticChangesets(session: ProtocolURI): void {
		this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
		this._stateManager.registerChangeset(buildSessionChangesetUri(session));
	}

	restoreStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, diffs: readonly ISessionFileDiff[]): void {
		const changesetUri = this._stateManager.registerChangeset(staticChangesetUri(session, kind));
		this._publishChangesetDiffs(session, changesetUri, diffs);
	}

	restorePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs {
		const persistedUncommitted = tryParsePersistedDiffs(metadata.uncommittedRaw, sessionUri, 'uncommitted', this._logService);
		// Legacy `diffs` is the migration fallback for the session-wide
		// changeset only — it never carried uncommitted state.
		const persistedSession = tryParsePersistedDiffs(metadata.sessionRaw, sessionUri, 'session', this._logService)
			?? tryParsePersistedDiffs(metadata.legacyRaw, sessionUri, 'session (legacy)', this._logService);

		// `seedIfEmpty`: only reseed persisted diffs when the matching live
		// changeset state is absent or empty. Live state (e.g. from a prior
		// refresh in this lifetime) is always more authoritative than a
		// potentially-stale persisted blob; without this guard a fresh
		// `restorePersistedStaticChangesets` call would clobber it.
		this._seedIfEmpty(sessionUri, 'uncommitted', persistedUncommitted);
		this._seedIfEmpty(sessionUri, 'session', persistedSession);

		return { uncommitted: persistedUncommitted, session: persistedSession };
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

	refreshUncommittedChangeset(session: ProtocolURI): void {
		this._scheduleStaticRecompute(session, 'uncommitted');
	}

	refreshSessionChangeset(session: ProtocolURI): void {
		this._scheduleStaticRecompute(session, 'session');
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
			const [originalPair, modifiedPair] = await Promise.all([
				this._checkpointService.getTurnCheckpointPair(sessionUri, originalTurnId),
				this._checkpointService.getTurnCheckpointPair(sessionUri, modifiedTurnId),
			]);
			if (!originalPair || !modifiedPair) {
				// One of the turns has no checkpoint — either it's an
				// unknown id, the session isn't git-backed, or the
				// baseline / capture failed. No edit-tracker fallback
				// exists for between-two-turns comparisons.
				const missing = !originalPair && !modifiedPair
					? 'both turns'
					: !originalPair ? 'original turn' : 'modified turn';
				this._stateManager.dispatchServerAction(compareUri, {
					type: ActionType.ChangesetStatusChanged,
					status: ChangesetStatus.Error,
					error: { errorType: 'computeFailed', message: `No checkpoint available for ${missing}; compare requires git-backed sessions.` },
				});
				return compareUri;
			}
			if (originalPair.current === modifiedPair.current) {
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
				fromRef: originalPair.current,
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
					error: { errorType: 'computeFailed', message: `Failed to compute compare-turns diff from git (${originalPair.current}..${modifiedPair.current}).` },
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
		// turn id, and the uncommitted changeset with no turn id.
		this._cancelDebouncedDiffComputation(session);
		if (turnId !== undefined) {
			this._cancelDebouncedTurnDiffComputation(session, turnId);
			if (this._hasTurnSubscribers(session, turnId)) {
				this._scheduleTurnRecompute(session, turnId);
			}
		}
		this._scheduleStaticRecompute(session, 'session', turnId);
		this._scheduleStaticRecompute(session, 'uncommitted');
	}

	onSessionTruncated(session: ProtocolURI): void {
		// Turns were removed — recompute from scratch (no changedTurnId).
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

	/**
	 * Schedules a static changeset (`uncommitted` or `session`) recompute,
	 * serialised per-session so back-to-back triggers don't race against
	 * stale `previousDiffs` reads. Fire-and-forget — failures are logged
	 * but do not fail the turn.
	 */
	private _scheduleStaticRecompute(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string): void {
		this._diffComputationSequencer.queue(`${session}\u0000${kind}`, () => this._doComputeStaticChangeset(session, kind, changedTurnId));
	}

	private async _doComputeStaticChangeset(session: ProtocolURI, kind: StaticChangesetKind, changedTurnId?: string): Promise<void> {
		let ref: ReturnType<ISessionDataService['openDatabase']>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to open session database for ${kind} diff computation: ${session}`, err);
			return;
		}
		const changesetUri = this._stateManager.registerChangeset(staticChangesetUri(session, kind));
		try {
			let diffs = await this._tryComputeGitDiffs(session, ref.object, kind);
			if (!diffs) {
				if (kind === 'uncommitted') {
					// Path B (edit-tracker aggregator) answers a different
					// question than `git status` and must not be allowed to
					// write into the uncommitted slot — doing so would
					// silently rebrand SDK-tracked edits as uncommitted
					// git changes and overwrite the legitimate persisted
					// snapshot. Leave whatever live/persisted state is
					// already there; the next successful path A will
					// refresh it.
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
			}
		} catch (err) {
			this._logService.warn(`[AgentHostChangesetService] Failed to compute ${kind} diffs`, err);
			this._stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Error,
				error: { errorType: 'computeFailed', message: err instanceof Error ? err.message : String(err) },
			});
		} finally {
			ref.dispose();
		}
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
	 * (fileSet, fileRemoved) and updates the matching catalogue entry's
	 * aggregate counts via {@link AgentHostStateManager.setSessionChangesets}.
	 *
	 * The catalogue entry is matched by URI: for static changesets the
	 * `uriTemplate` is the concrete URI; for the per-turn template it
	 * contains `{turnId}` and never matches a concrete turn URI, so per-
	 * turn computations don't update catalogue counts (intended — the
	 * template entry advertises the shape, not aggregates).
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

		// Refresh the catalogue's aggregate counts so chip rendering stays
		// in sync without subscribers having to attach to the changeset.
		const sessionState = this._stateManager.getSessionState(session);
		if (!sessionState) {
			return;
		}
		const totals = Array.from(nextFilesById.values()).reduce(
			(acc, d) => {
				acc.additions += d.diff?.added ?? 0;
				acc.deletions += d.diff?.removed ?? 0;
				return acc;
			},
			{ additions: 0, deletions: 0 },
		);
		const existing = sessionState.summary.changesets ?? [];
		const next = existing.map(c => c.uriTemplate === changesetUri
			? { ...c, additions: totals.additions, deletions: totals.deletions, files: nextFilesById.size }
			: c,
		);
		this._stateManager.setSessionChangesets(session, next);
	}

	/**
	 * Computes diffs for a static changeset by shelling out to git.
	 * Returns the diff list when the session has a working directory and
	 * that directory is a git work tree; returns `undefined` otherwise so
	 * the caller can fall back to the edit-tracker aggregator.
	 *
	 * For `kind: 'uncommitted'` the diff is computed against `HEAD`
	 * (modified + deleted + untracked).
	 * For `kind: 'session'` the diff is computed against the merge-base
	 * with {@link META_DIFF_BASE_BRANCH} when one is set; without a base
	 * branch git falls back to `HEAD` (i.e. uncommitted) which is the
	 * documented fallback.
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
		const baseBranch = kind === 'session'
			? (await db.getMetadata(META_DIFF_BASE_BRANCH)) ?? undefined
			: undefined;
		try {
			return await this._gitService.computeSessionFileDiffs(workingDirectoryUri, { sessionUri: session, baseBranch });
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
