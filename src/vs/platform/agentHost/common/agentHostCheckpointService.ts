/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostCheckpointService = createDecorator<IAgentHostCheckpointService>('agentHostCheckpointService');

/**
 * `session_metadata` key under which the per-session baseline (turn/0)
 * checkpoint ref is stored.
 */
export const META_CHECKPOINT_BASE_REF = 'checkpoint.baseRef';

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
	 * Captures the session's baseline (turn/0) checkpoint. Idempotent: if
	 * a baseline already exists for the session, returns the existing ref.
	 * Returns `undefined` when the working directory is not a git work tree
	 * (folder-isolation against a non-git folder) or when checkpoint
	 * capture fails.
	 *
	 * Called once per session, immediately after the session's working
	 * directory has been resolved and any worktree metadata has been
	 * persisted (e.g. `CopilotAgent._materializeProvisional`).
	 */
	captureBaseline(sessionUri: URI, workingDirectory: URI | undefined): Promise<string | undefined>;

	/**
	 * Captures an end-of-turn checkpoint, chained to the previous turn's
	 * checkpoint (or the baseline for turn 1). Persists the ref against
	 * the turn via `ISessionDatabase.setTurnCheckpointRef`. Returns
	 * `undefined` when the session is not git-backed, the baseline is
	 * missing, or capture fails.
	 *
	 * If the captured tree OID matches the parent's tree OID (no-op turn)
	 * the parent ref is recorded against the turn rather than creating a
	 * redundant commit / new ref.
	 *
	 * Called from `AgentSideEffects` when a `SessionTurnComplete` action
	 * fires, BEFORE the changeset service's `onTurnComplete` hook so the
	 * per-turn changeset compute can pick up the new refs.
	 */
	captureTurnCheckpoint(sessionUri: URI, turnId: string): Promise<string | undefined>;

	/**
	 * Returns the `{ parent, current }` checkpoint refs for a turn, or
	 * `undefined` when either is missing. Used by the changeset service
	 * to decide whether to take the git-diff fast path for per-turn diffs.
	 */
	getTurnCheckpointPair(sessionUri: URI, turnId: string): Promise<{ parent: string; current: string } | undefined>;

	/**
	 * Deletes every checkpoint ref this service created for the session
	 * (baseline + all turn refs), reading the precise list from the
	 * session database. Tolerates missing refs.
	 *
	 * Called from a subscriber to `ISessionDataService.onWillDeleteSessionData`
	 * before the session's data directory is removed.
	 */
	disposeSessionData(sessionUri: URI): Promise<void>;
}

/**
 * A no-op implementation of {@link IAgentHostCheckpointService} used as a
 * fallback in test fixtures that don't exercise checkpoint capture, and
 * as the default value for the optional `_checkpointService` parameter
 * on `AgentService` so existing test callsites keep compiling without
 * forced fixture updates.
 */
export const NULL_CHECKPOINT_SERVICE: IAgentHostCheckpointService = {
	_serviceBrand: undefined,
	captureBaseline: async () => undefined,
	captureTurnCheckpoint: async () => undefined,
	getTurnCheckpointPair: async () => undefined,
	disposeSessionData: async () => { },
};
