/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostCheckpointService = createDecorator<IAgentHostCheckpointService>('agentHostCheckpointService');

/**
 * Returns the canonical name for a per-turn checkpoint ref.
 * Distinct from the chat extension's `refs/sessions/...` so the two can
 * coexist safely in the same repository.
 */
export function buildCheckpointRefName(sanitizedSessionId: string, turnNumber: number): string {
	return `refs/agents/${sanitizedSessionId}/checkpoints/turn/${turnNumber}`;
}

/**
 * Captures per-turn git **checkpoint refs** for Agent Host sessions so
 * end-of-turn diffs reflect the entire working-tree delta (including
 * terminal-tool edits that are invisible to the FileEditTracker pipeline).
 *
 * Each checkpoint is a parentless or parent-chained commit (commit-tree)
 * pointing at a tree captured via the temp-index trick, anchored under
 * `refs/agents/<sid>/checkpoints/turn/<N>`. The session-private ref
 * namespace means the commits stay reachable for the lifetime of the
 * session and survive process restarts (refs live on disk in
 * `<repo>/.git/refs/`), while never appearing as branches/tags to the
 * user. Cleanup is driven by `ISessionDataService.onWillDeleteSessionData`
 * — the service deletes every ref it created for the destroyed session
 * before the data directory is removed.
 */
export interface IAgentHostCheckpointService {
	readonly _serviceBrand: undefined;

	/**
	 * Captures the session's baseline (turn/0) checkpoint in each of
	 * `workingDirectories`. Idempotent per repository: a directory that
	 * already has a baseline ref is skipped, as is one that is not a git
	 * work tree (folder-isolation against a non-git folder). Best-effort —
	 * a failure for one repository does not stop the others.
	 *
	 * Called once per session, immediately after the session's working
	 * directories have been resolved and any worktree metadata has been
	 * persisted (e.g. `CopilotAgent._materializeProvisional`).
	 *
	 * The caller must pass the directories it just resolved rather than
	 * letting this service look them up: at that point the resolved set
	 * (which for an isolated session is the *worktree*, not the folder the
	 * user picked) has not necessarily reached the state manager yet, so a
	 * lookup can silently capture the baseline against the wrong repository.
	 */
	captureBaselineCheckpoint(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void>;

	/**
	 * Captures the working trees immediately before a turn is sent to the agent.
	 * The corresponding end checkpoint uses these trees as its parents so
	 * changes made between turns are not attributed to the new turn. Overlapping
	 * turns in one session are excluded from Git attribution because their
	 * shared working-tree edits cannot be separated; those turns use tracked
	 * file edits instead.
	 */
	captureTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void>;

	/**
	 * Captures an end-of-turn checkpoint in each of `workingDirectories`,
	 * chained to the matching turn-start checkpoint when available.
	 * Persists the ref against the turn via `ISessionDatabase.setTurnCheckpointRef`
	 * once at least one repository captured successfully. A directory that is
	 * not git-backed, or has no baseline, is skipped.
	 *
	 * If the captured tree OID matches the parent's tree OID (no-op turn)
	 * the parent ref is recorded against the turn rather than creating a
	 * redundant commit / new ref.
	 *
	 * Called from `AgentSideEffects` when a `ChatTurnComplete` action
	 * fires, BEFORE the changeset service's `onTurnComplete` hook so the
	 * per-turn changeset compute can pick up the new refs.
	 *
	 * As with {@link captureBaselineCheckpoint}, the caller supplies the directories
	 * so that every checkpoint operation is explicit about the repositories
	 * it acts on rather than depending on live session state.
	 */
	captureTurnCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void>;

	/** Discards a pending turn-start checkpoint when a turn does not complete. */
	discardTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string): Promise<void>;

	/** Discards all pending turn-start checkpoints for a chat after truncation. */
	discardChatTurnStartCheckpoints(sessionUri: URI, chatUri: URI): Promise<void>;

	/**
	 * Returns the `{ parent, current }` checkpoint refs for a turn, or
	 * `undefined` when either is missing. Used by the changeset service
	 * to decide whether to take the git-diff fast path for per-turn diffs.
	 */
	getTurnCheckpointPair(sessionUri: URI, turnId: string, workingDirectory?: URI): Promise<{ parent: string; current: string } | undefined>;

	/**
	 * Returns the session's baseline checkpoint ref, or `undefined` when
	 * the baseline was never captured (non-git-backed session, or capture
	 * failed). Used by the changeset service to resolve compare-turns
	 * URIs whose `originalTurnId` is the `BASELINE_TURN_ID` sentinel.
	 */
	getBaselineCheckpoint(sessionUri: URI, workingDirectory?: URI): Promise<string | undefined>;

	/**
	 * Deletes every checkpoint ref this service created for the session
	 * (baseline + all turn refs), reading the precise list from the
	 * session database. Tolerates missing refs.
	 *
	 * Called from a subscriber to `ISessionDataService.onWillDeleteSessionData`
	 * before the session's data directory is removed.
	 *
	 * `workingDirectories` identifies the repositories holding the refs.
	 * There is deliberately no fallback to the session's live state: by
	 * the time this runs the session has typically already been removed
	 * from the state manager, so omitting them is a silent no-op that
	 * leaks the refs.
	 */
	deleteCheckpoints(sessionUri: URI, workingDirectories?: readonly string[]): Promise<void>;

	/**
	 * Adopts the legacy extension-host Copilot CLI checkpoint refs
	 * (`refs/sessions/<rawSessionId>/checkpoints/turn/<N>`) for a migrated session:
	 * re-points each commit under this service's
	 * `refs/agents/<sid>/checkpoints/turn/<N>` namespace (same OIDs), seeds the
	 * session database per-turn checkpoint index keyed by the supplied ordered
	 * {@link turnIds} (the baseline and per-turn commits stay discoverable by the
	 * ref-name convention), and drops the legacy refs. Best-effort and idempotent;
	 * a no-op when the working directory is not git-backed or no legacy refs exist.
	 * Optional so fixtures that don't exercise migration can omit it.
	 */
	adoptLegacyCheckpoints?(sessionUri: URI, workingDirectory: URI, rawSessionId: string, turnIds: readonly string[]): Promise<void>;
}

/**
 * A no-op implementation of {@link IAgentHostCheckpointService} used as a
 * fallback in test fixtures that don't exercise checkpoint capture.
 */
export const NULL_CHECKPOINT_SERVICE: IAgentHostCheckpointService = {
	_serviceBrand: undefined,
	captureBaselineCheckpoint: async () => { },
	captureTurnStartCheckpoint: async () => { },
	captureTurnCheckpoint: async () => { },
	discardTurnStartCheckpoint: async () => { },
	discardChatTurnStartCheckpoints: async () => { },
	getTurnCheckpointPair: async () => undefined,
	getBaselineCheckpoint: async () => undefined,
	deleteCheckpoints: async () => { },
};
