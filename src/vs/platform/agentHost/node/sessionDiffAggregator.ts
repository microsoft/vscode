/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import type { IDiffComputeService } from '../common/diffComputeService.js';
import { FileEditKind, type ISessionFileDiff } from '../common/state/sessionState.js';

function getFileEditUri(diff: ISessionFileDiff): string | undefined {
	return diff.after?.uri ?? diff.before?.uri;
}

function createSessionFileDiff(identity: IFileIdentity, added: number, removed: number): ISessionFileDiff {
	const uri = URI.file(identity.terminalPath).toString();
	const content = { uri };
	return {
		...(identity.lastKind === FileEditKind.Delete ? { before: { uri, content } } : { after: { uri, content } }),
		diff: { added, removed },
	};
}

/**
 * Represents a file's identity across renames, tracking its first and last
 * snapshots in the session for diff computation.
 */
interface IFileIdentity {
	/** The last known URI for this file. */
	terminalPath: string;
	/** Tool call ID of the first edit (for fetching "before" content). */
	firstToolCallId: string;
	/** File path used in the first edit's database record. */
	firstFilePath: string;
	/** The kind of the first edit (Create means no "before" content). */
	firstKind: FileEditKind;
	/** Tool call ID of the last edit (for fetching "after" content). */
	lastToolCallId: string;
	/** File path used in the last edit's database record. */
	lastFilePath: string;
	/** The kind of the last edit (Delete means no "after" content). */
	lastKind: FileEditKind;
}

/**
 * Options for incremental diff computation. When provided,
 * {@link computeSessionDiffs} reuses previous diff results for file
 * identities that were not touched in the given turn.
 */
export interface IIncrementalDiffOptions {
	/** The turn ID that just completed — only identities touched by edits
	 *  in this turn will be recomputed. */
	changedTurnId: string;
	/** Previously computed diffs (from the last dispatch). Entries for
	 *  untouched identities are carried over without recomputation. */
	previousDiffs: ISessionFileDiff[];
}

/**
 * Computes aggregated diff statistics for a session by comparing each file's
 * first snapshot to its last snapshot, tracking renames across the chain.
 *
 * When {@link incremental} is provided, only identities that were touched
 * by edits in the given turn are recomputed; all other identities reuse
 * the previous diff results. This avoids expensive content fetches and
 * diff computations for unchanged files.
 *
 * Returns an {@link ISessionFileDiff} array with the "last known URI" for each
 * file and the total lines added/removed across the session.
 */
export async function computeSessionDiffs(
	db: ISessionDatabase,
	diffService: IDiffComputeService,
	incremental?: IIncrementalDiffOptions,
): Promise<ISessionFileDiff[]> {
	// In incremental mode, try to fetch only the current turn's edits.
	// When the turn only introduces new files (no renames, no re-edits of
	// previously changed files), the full edit history is not needed.
	let edits: IFileEditRecord[];
	let fastPath = false;

	if (incremental) {
		const turnEdits = await db.getFileEditsByTurn(incremental.changedTurnId);
		if (turnEdits.length === 0) {
			return [...incremental.previousDiffs];
		}

		const previousDiffsUris = new Set(incremental.previousDiffs.map(getFileEditUri));
		const needsFullHistory = turnEdits.some(e =>
			e.kind === FileEditKind.Rename ||
			previousDiffsUris.has(URI.file(e.filePath).toString())
		);

		if (needsFullHistory) {
			edits = await db.getAllFileEdits();
		} else {
			edits = turnEdits;
			fastPath = true;
		}
	} else {
		edits = await db.getAllFileEdits();
	}

	if (edits.length === 0) {
		return [];
	}

	// Build file identity graph. We need to:
	// 1. Track renames: when a file is renamed A→B, its identity follows to B
	// 2. Find the first "before" snapshot and last "after" snapshot per identity

	// Maps a file path to its canonical identity key (follows rename chains)
	const pathToIdentityKey = new Map<string, string>();
	// Maps identity keys to their accumulated data
	const identities = new Map<string, IFileIdentity>();
	// Track which identity keys were touched by the incremental turn.
	// In fast-path mode all identities are from the current turn, so no tracking needed.
	const touchedIdentityKeys = (incremental && !fastPath) ? new Set<string>() : undefined;

	for (const edit of edits) {
		let identityKey: string;

		if (edit.kind === FileEditKind.Rename && edit.originalPath) {
			// Rename: follow the chain from originalPath to find the identity
			identityKey = pathToIdentityKey.get(edit.originalPath) ?? edit.originalPath;
			// Update the mapping: the new path now points to the same identity
			pathToIdentityKey.set(edit.filePath, identityKey);
			// Remove old path mapping (the file no longer exists at that path)
			pathToIdentityKey.delete(edit.originalPath);
		} else {
			// Regular edit, create, or delete: look up or create identity
			identityKey = pathToIdentityKey.get(edit.filePath) ?? edit.filePath;
			pathToIdentityKey.set(edit.filePath, identityKey);
		}

		if (touchedIdentityKeys && edit.turnId === incremental!.changedTurnId) {
			touchedIdentityKeys.add(identityKey);
		}

		const existing = identities.get(identityKey);
		if (!existing) {
			// First time seeing this file identity
			identities.set(identityKey, {
				terminalPath: edit.filePath,
				firstToolCallId: edit.toolCallId,
				firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
				firstKind: edit.kind,
				lastToolCallId: edit.toolCallId,
				lastFilePath: edit.filePath,
				lastKind: edit.kind,
			});
		} else {
			// Update last snapshot info and terminal path
			existing.terminalPath = edit.filePath;
			existing.lastToolCallId = edit.toolCallId;
			existing.lastFilePath = edit.filePath;
			existing.lastKind = edit.kind;
		}
	}

	// In incremental slow-path mode, build a lookup map from URI string →
	// previous diff so untouched identities can carry over their previous results.
	const previousDiffsMap = (incremental && !fastPath)
		? new Map(incremental.previousDiffs.map(d => [getFileEditUri(d), d]))
		: undefined;

	// Compute diffs for each file identity
	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const [identityKey, identity] of identities) {
		// In incremental slow-path mode, skip recomputation for untouched identities
		if (touchedIdentityKeys && !touchedIdentityKeys.has(identityKey)) {
			const uri = URI.file(identity.terminalPath).toString();
			const prev = previousDiffsMap!.get(uri);
			if (prev) {
				results.push(prev);
			}
			// If no previous entry, the file previously had zero net change — skip
			continue;
		}

		diffPromises.push((async () => {
			// Determine "before" text
			let beforeText: string;
			if (identity.firstKind === FileEditKind.Create) {
				beforeText = '';
			} else {
				const content = await db.readFileEditContent(identity.firstToolCallId, identity.firstFilePath);
				beforeText = content?.beforeContent ? new TextDecoder().decode(content.beforeContent) : '';
			}

			// Determine "after" text
			let afterText: string;
			if (identity.lastKind === FileEditKind.Delete) {
				afterText = '';
			} else {
				const content = await db.readFileEditContent(identity.lastToolCallId, identity.lastFilePath);
				afterText = content?.afterContent ? new TextDecoder().decode(content.afterContent) : '';
			}

			// Skip files with no net change
			if (beforeText === afterText) {
				return;
			}

			const counts = await diffService.computeDiffCounts(beforeText, afterText);
			results.push(createSessionFileDiff(identity, counts.added, counts.removed));
		})());
	}

	await Promise.allSettled(diffPromises);

	// In fast-path mode, carry over previous diffs for untouched files
	// (they were not in the identity graph since we only loaded the current turn)
	if (fastPath) {
		results.push(...incremental!.previousDiffs);
	}

	return results;
}
