/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure decision helpers for the Codex `thread/fork` path, extracted so they can
 * be unit-tested without standing up the whole {@link CodexAgent} (mirrors the
 * `codexShellCommand.ts` extraction). No protocol or service imports.
 */

/**
 * Outcome of locating where a fork should branch within the source thread.
 * `resolved: false` means neither the mapped codex turn id nor the caller's
 * fallback index identified a turn, and the caller must reject the fork instead
 * of silently branching from the tip.
 */
export type ForkBoundaryResolution =
	| { readonly resolved: true; readonly keepThroughIndex: number; readonly numTurnsToDrop: number }
	| { readonly resolved: false };

/**
 * Resolve the fork boundary from the source thread's ordered turn ids.
 *
 * `thread/fork` copies the full source history; the returned `numTurnsToDrop`
 * is how many trailing turns must be rolled back so the fork ends at (and
 * includes) the requested turn.
 *
 * @param sourceTurnIds Codex turn ids of the source thread, in order.
 * @param codexTurnId The resolved codex turn id of the requested fork point.
 * @param fallbackTurnIndex Zero-based index used when `codexTurnId` isn't found.
 */
export function resolveForkBoundary(sourceTurnIds: readonly string[], codexTurnId: string, fallbackTurnIndex: number): ForkBoundaryResolution {
	const total = sourceTurnIds.length;
	let keepThroughIndex = sourceTurnIds.findIndex(id => id === codexTurnId);
	if (keepThroughIndex === -1) {
		keepThroughIndex = fallbackTurnIndex;
	}
	// An empty source thread is a valid (empty) fork; otherwise the boundary
	// must land inside the source turns.
	if (total > 0 && (keepThroughIndex < 0 || keepThroughIndex >= total)) {
		return { resolved: false };
	}
	const numTurnsToDrop = total > 0 ? Math.max(0, total - (keepThroughIndex + 1)) : 0;
	return { resolved: true, keepThroughIndex, numTurnsToDrop };
}

/** A `[hostTurnId, codexTurnId]` pair to seed into a forked session's map. */
export type ForkedTurnIdMapEntry = readonly [hostTurnId: string, codexTurnId: string];

/**
 * Plan the `codexTurnIdByHostTurnId` seeding for a freshly forked session.
 *
 * A later edit/truncate of a copied turn needs to map the workbench's (new)
 * host turn id back to the forked thread's app-server turn id. The kept turns
 * line up by index between the source and the forked thread (the fork copies
 * them in order, then trailing turns are rolled back), so for each kept turn we
 * derive its new host id via `turnIdMapping` and pair it with the forked
 * thread's authoritative codex id (which `thread/fork` may have regenerated).
 *
 * @param sourceTurnIds Codex turn ids of the source thread, in order.
 * @param forkedTurnIds Codex turn ids of the forked thread (post-rollback), in order.
 * @param keepThroughIndex Index of the last kept turn (inclusive).
 * @param hostTurnIdBySourceCodexId Source session's codex→host turn id map (live sessions only).
 * @param turnIdMapping Old→new host turn id remapping supplied by the fork caller.
 */
export function planForkedTurnIdMap(
	sourceTurnIds: readonly string[],
	forkedTurnIds: readonly string[],
	keepThroughIndex: number,
	hostTurnIdBySourceCodexId: ReadonlyMap<string, string> | undefined,
	turnIdMapping: ReadonlyMap<string, string> | undefined,
): ForkedTurnIdMapEntry[] {
	if (!turnIdMapping || turnIdMapping.size === 0) {
		return [];
	}
	const keptCount = Math.min(keepThroughIndex + 1, sourceTurnIds.length, forkedTurnIds.length);
	const entries: ForkedTurnIdMapEntry[] = [];
	for (let i = 0; i < keptCount; i++) {
		const sourceCodexId = sourceTurnIds[i];
		const oldHostId = hostTurnIdBySourceCodexId?.get(sourceCodexId) ?? sourceCodexId;
		const newHostId = turnIdMapping.get(oldHostId) ?? oldHostId;
		entries.push([newHostId, forkedTurnIds[i]]);
	}
	return entries;
}
