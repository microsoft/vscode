/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ChangesSummary } from './state/protocol/state.js';
import type { ISessionFileDiff, URI as ProtocolURI } from './state/sessionState.js';

/** Metadata key under which the branch changeset's diff list is persisted. */
export const META_CHANGESET_BRANCH = 'agentHost.changeset.branch';

/** Metadata key under which the session-wide changeset's diff list is persisted. */
export const META_CHANGESET_SESSION = 'agentHost.changeset.session';

/**
 * Legacy metadata key used by older builds to persist the session-wide
 * changeset's diff list. Read-only fallback for {@link META_CHANGESET_SESSION}.
 */
export const META_LEGACY_DIFFS = 'diffs';

/**
 * Metadata key under which the session's changes is persisted.
 */
export const META_CHANGES_SUMMARY = 'agentHost.changes';

/**
 * The set of session-DB metadata keys the changeset service needs in a
 * batched read to synthesise the `summary.changes` aggregate for the
 * session-list overlay. {@link IAgentHostChangesetService.getListMetadataKeys}
 * returns this (or `undefined` when live state already answers the question);
 * `AgentService` merges the returned keys into its own metadata key set so the
 * DB is hit exactly once per session.
 */
export const CHANGESET_DB_METADATA_KEYS: Record<string, true> = {
	[META_CHANGESET_BRANCH]: true,
	[META_CHANGESET_SESSION]: true,
	[META_CHANGES_SUMMARY]: true,
	[META_LEGACY_DIFFS]: true,
};

/** The two static changeset kinds we publish by default. */
export type StaticChangesetKind = 'branch' | 'session';

/**
 * Raw metadata values for the persisted changeset blobs, batch-read
 * by the caller (`AgentService.listSessions` / `AgentService.restoreSession`).
 * The caller owns the database read so multiple metadata keys can be
 * fetched in a single round-trip; the service owns parsing, applying,
 * and `seedIfEmpty` gating.
 */
export interface IPersistedChangesetMetadata {
	readonly branchRaw?: string;
	readonly sessionRaw?: string;
	readonly legacyRaw?: string;
}

/**
 * The parsed diffs returned from {@link IAgentHostChangesetService.restorePersistedStaticChangesets},
 * suitable for synthesising a `summary.changes` aggregate for the
 * session-list overlay (see {@link IAgentHostChangesetService.computeListEntryChanges}).
 */
export interface IRestoredChangesetDiffs {
	readonly branch?: readonly ISessionFileDiff[];
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
	 * completes. The catalogue itself (`state.changesets`) is seeded
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
	 * `session`, and the legacy `diffs` fallback for `session`) without
	 * mutating live state. Intended for list overlays that only need
	 * aggregate catalogue counts and should not pin full changeset state in
	 * memory.
	 */
	parsePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs;

	/**
	 * Applies parsed persisted changeset diffs to live state via
	 * {@link restoreStaticChangeset}. This is the side-effectful half of
	 * persisted restore and should only be used on real restore/subscribe
	 * paths that need a subscribable changeset snapshot.
	 *
	 * Honours `seedIfEmpty`: when a live changeset state already has files
	 * for the same kind, persisted diffs are NOT applied (they would
	 * otherwise overwrite the live state).
	 */
	applyPersistedStaticChangesets(sessionUri: ProtocolURI, diffs: IRestoredChangesetDiffs): void;

	/**
	 * Compatibility wrapper that parses persisted changeset metadata and then
	 * applies it to live state. New list-overlay callers should prefer
	 * {@link parsePersistedStaticChangesets}; restore/subscribe callers can
	 * use this method when they intentionally want both parse and seed.
	 *
	 * The `AgentService` orchestration boundary batches the metadata read
	 * (custom title + read / archive flags + config values + these three
	 * blobs) in a single database round-trip, then hands the raw values
	 * here; the service does not open the database itself for this method.
	 */
	restorePersistedStaticChangesets(sessionUri: ProtocolURI, metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs;

	/**
	 * Fire-and-forget persistence of the `summary.changes` aggregate to the
	 * session DB under {@link META_CHANGES_SUMMARY}. Used both by the
	 * happy-path turn-complete write and by the {@link ChangesetSessionCoordinator}
	 * one-shot migration that reads the old `META_CHANGESET_SESSION` /
	 * `META_LEGACY_DIFFS` blobs and projects them into the new key on
	 * sessions written by older builds. Errors are logged, not thrown.
	 */
	persistChangesSummary(sessionUri: ProtocolURI, summary: ChangesSummary): void;

	/**
	 * Returns the session-DB metadata keys to merge into a batched read for
	 * `sessionUri` (so the session-list overlay can synthesise the `changes`
	 * aggregate), OR `undefined` when live state already answers the
	 * aggregate-counts question (loaded session or a ready live
	 * `changeKind: 'session'` changeset state) so the caller can skip loading
	 * the potentially-large persisted diff blobs.
	 */
	getListMetadataKeys(sessionUri: ProtocolURI): Record<string, true> | undefined;

	/**
	 * Computes the `summary.changes` aggregate (additions / deletions / files
	 * for the session-wide changeset) for a single session-list entry, using
	 * the already-batched DB `metadata` read. Returns `undefined` when no
	 * aggregate should be advertised (loaded session whose `summary.changes`
	 * the caller already projected, or no live/persisted source).
	 *
	 * Precedence: live session (caller owns projection) > persisted
	 * `META_CHANGES_SUMMARY` blob > ready live `changeKind: 'session'`
	 * changeset state > parsed persisted session-wide diff blob. The latter
	 * two paths also migrate the result forward to {@link META_CHANGES_SUMMARY}.
	 */
	computeListEntryChanges(sessionUri: ProtocolURI, metadata: Record<string, string | undefined>): ChangesSummary | undefined;

	/**
	 * Returns true when the static changeset identified by `changesetUri` is
	 * currently being recomputed. Used by cache eviction to avoid dropping a
	 * slot while its producer is mid-flight.
	 */
	isStaticChangesetComputeActive(changesetUri: ProtocolURI): boolean;

	/**
	 * Lazy refresh of the branch changeset, kicked off when a client
	 * first subscribes to `<session>/changeset/branch`. Self-defers when the
	 * session's working directory is not yet known; the deferred refresh is
	 * drained by {@link onWorkingDirectoryAvailable}.
	 */
	refreshBranchChangeset(session: ProtocolURI): void;

	/**
	 * Lazy refresh of the session changeset, kicked off when a
	 * client first subscribes to `<session>/changeset/session` or the
	 * session URI itself (e.g. Agents Window observing the session). The
	 * recompute keeps the catalogue chip fresh across session opens even
	 * when no turn has run since process start. Self-defers when the
	 * session's working directory is not yet known.
	 */
	refreshSessionChangeset(session: ProtocolURI): void;

	/**
	 * Drains static changeset refreshes (`branch` / `session` /
	 * `uncommitted`) that were deferred because the session's working
	 * directory was not yet known. Called when a session is materialized or
	 * restored. Recomputes every changeset currently subscribed for the
	 * session via {@link recomputeSubscribedChangesets}; subscriptions that
	 * dropped while the working directory was unknown are naturally skipped.
	 * Idempotent.
	 */
	onWorkingDirectoryAvailable(session: ProtocolURI): void;

	/**
	 * Recomputes every changeset currently subscribed for `session`, read
	 * from the shared changeset subscription service. Each subscribed changeset
	 * is dispatched to its kind-specific recompute (branch / session / uncommitted
	 * / turn); the individual recomputes self-defer when the working directory is
	 * not yet known. Used as the session-level refresh entry point (drain on
	 * materialization, git-state change).
	 */
	recomputeSubscribedChangesets(session: ProtocolURI): void;

	/**
	 * Forgets any deferred static changeset refreshes queued for a session
	 * that is being disposed.
	 */
	onSessionDisposed(session: ProtocolURI): void;

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
	 * Computes and publishes the uncommitted changeset for `session`
	 * directly via git (`git status` against HEAD). The uncommitted slot
	 * has no SDK edit-tracker fallback — the aggregator answers a different
	 * question than `git status` and would silently rebrand SDK-tracked
	 * edits as uncommitted git changes. When the session has no working
	 * directory, the working directory isn't a git work tree, or the git
	 * command fails, the changeset transitions to `status: Error`.
	 *
	 * Uncommitted changesets are not persisted; callers schedule recomputes
	 * (e.g. on turn complete, post-commit, working-tree watcher event)
	 * directly via this method.
	 */
	computeUncommittedChangeset(session: ProtocolURI): Promise<ProtocolURI>;

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

}
