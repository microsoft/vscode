/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import type { IDiffComputeService } from '../common/diffComputeService.js';
import { FileEditKind, type ISessionFileDiff } from '../common/state/sessionState.js';
import { buildSessionDbUri } from './shared/fileEditTracker.js';

function getFileEditUri(diff: ISessionFileDiff): string | undefined {
	return diff.after?.uri ?? diff.before?.uri;
}

function createSessionFileDiff(beforeSessionUri: string, afterSessionUri: string, identity: IFileIdentity, added: number, removed: number): ISessionFileDiff {
	const hasBefore = identity.firstKind !== FileEditKind.Create;
	const hasAfter = identity.lastKind !== FileEditKind.Delete;
	return {
		...(hasBefore ? {
			before: {
				uri: URI.file(identity.firstFilePath).toString(),
				content: { uri: buildSessionDbUri(beforeSessionUri, identity.firstToolCallId, identity.firstFilePath, 'before') },
			},
		} : {}),
		...(hasAfter ? {
			after: {
				uri: URI.file(identity.terminalPath).toString(),
				content: { uri: buildSessionDbUri(afterSessionUri, identity.lastToolCallId, identity.lastFilePath, 'after') },
			},
		} : {}),
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
	/** Index into the sources array of the DB that owns the first edit. */
	firstSourceIdx: number;
	/** Tool call ID of the last edit (for fetching "after" content). */
	lastToolCallId: string;
	/** File path used in the last edit's database record. */
	lastFilePath: string;
	/** The kind of the last edit (Delete means no "after" content). */
	lastKind: FileEditKind;
	/** Index into the sources array of the DB that owns the last edit. */
	lastSourceIdx: number;
}

/**
 * A single database whose file edits contribute to a session's aggregated
 * diff. For single-chat sessions there is one source (the session DB); for
 * multi-chat sessions each peer chat records edits into its own DB, so the
 * session changeset unions the session DB with every peer chat DB.
 */
export interface ISessionDiffSource {
	/**
	 * The session / peer-chat URI that owns {@link db}. Encoded into the
	 * `session-db:` content URIs so the resource resolver opens the correct
	 * database when fetching before/after blobs.
	 */
	sessionUri: string;
	/** The database holding this source's file edits. */
	db: ISessionDatabase;
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
	sessionUri: string,
	db: ISessionDatabase,
	diffService: IDiffComputeService,
	incremental?: IIncrementalDiffOptions,
): Promise<ISessionFileDiff[]> {
	// Full mode (no incremental) is the single-source case of the unioned
	// computation — delegate so the identity-graph + diff logic lives in one
	// place and multi-chat sessions reuse the exact same code path.
	if (!incremental) {
		return computeUnionedDiffs([{ sessionUri, db }], diffService);
	}

	// Incremental mode (single source): try to fetch only the current turn's
	// edits. When the turn only introduces new files (no renames, no re-edits
	// of previously changed files), the full edit history is not needed.
	let edits: IFileEditRecord[];
	let fastPath = false;

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
	const touchedIdentityKeys = !fastPath ? new Set<string>() : undefined;

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

		if (touchedIdentityKeys && edit.turnId === incremental.changedTurnId) {
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
				firstSourceIdx: 0,
				lastToolCallId: edit.toolCallId,
				lastFilePath: edit.filePath,
				lastKind: edit.kind,
				lastSourceIdx: 0,
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
	const previousDiffsMap = !fastPath
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
			results.push(createSessionFileDiff(sessionUri, sessionUri, identity, counts.added, counts.removed));
		})());
	}

	await Promise.allSettled(diffPromises);

	// In fast-path mode, carry over previous diffs for untouched files
	// (they were not in the identity graph since we only loaded the current turn)
	if (fastPath) {
		results.push(...incremental.previousDiffs);
	}

	return results;
}

/**
 * Computes aggregated diff statistics across one or more {@link ISessionDiffSource}
 * databases by unioning their file edits and comparing each file's first
 * snapshot to its last snapshot, tracking renames across the chain.
 *
 * Single-chat sessions pass one source (the session DB). Multi-chat sessions
 * pass the session DB plus every peer chat DB so peer-chat edits (recorded into
 * their own databases) roll up into the session-level changes. Each file
 * identity remembers which source owns its first and last snapshots so the
 * before/after content is read from — and its `session-db:` content URI encodes —
 * the correct database.
 *
 * Sources are unioned in array order (session first, peers next); within a
 * source, edits keep their insertion order. When a file is touched by more than
 * one source the "before" comes from the earliest source that touched it and the
 * "after" from the latest, which matches the shared working tree the chats edit.
 *
 * TODO (debt): this always does a full recompute — it ignores the
 * {@link IIncrementalDiffOptions} fast/slow paths that {@link computeSessionDiffs}
 * uses for single-source sessions. An incremental union is a safe follow-up:
 * the per-identity `firstSourceIdx`/`lastSourceIdx` already carry the provenance
 * needed to recompute only the turn's owning source plus cross-source files and
 * carry over the rest. Requires plumbing the owning source of `changedTurnId`
 * through `onTurnComplete` → `_doComputeStaticChangeset`. See tracking issue.
 */
export async function computeUnionedDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
): Promise<ISessionFileDiff[]> {
	// Load every source's edits in parallel, then concatenate in source order so
	// the identity graph sees a deterministic session-first ordering while each
	// source keeps its own insertion order.
	const perSourceEdits = await Promise.all(sources.map(source => source.db.getAllFileEdits()));

	const pathToIdentityKey = new Map<string, string>();
	const identities = new Map<string, IFileIdentity>();
	let totalEdits = 0;

	for (let sourceIdx = 0; sourceIdx < perSourceEdits.length; sourceIdx++) {
		for (const edit of perSourceEdits[sourceIdx]) {
			totalEdits++;
			let identityKey: string;

			if (edit.kind === FileEditKind.Rename && edit.originalPath) {
				identityKey = pathToIdentityKey.get(edit.originalPath) ?? edit.originalPath;
				pathToIdentityKey.set(edit.filePath, identityKey);
				pathToIdentityKey.delete(edit.originalPath);
			} else {
				identityKey = pathToIdentityKey.get(edit.filePath) ?? edit.filePath;
				pathToIdentityKey.set(edit.filePath, identityKey);
			}

			const existing = identities.get(identityKey);
			if (!existing) {
				identities.set(identityKey, {
					terminalPath: edit.filePath,
					firstToolCallId: edit.toolCallId,
					firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
					firstKind: edit.kind,
					firstSourceIdx: sourceIdx,
					lastToolCallId: edit.toolCallId,
					lastFilePath: edit.filePath,
					lastKind: edit.kind,
					lastSourceIdx: sourceIdx,
				});
			} else {
				existing.terminalPath = edit.filePath;
				existing.lastToolCallId = edit.toolCallId;
				existing.lastFilePath = edit.filePath;
				existing.lastKind = edit.kind;
				existing.lastSourceIdx = sourceIdx;
			}
		}
	}

	if (totalEdits === 0) {
		return [];
	}

	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const identity of identities.values()) {
		diffPromises.push((async () => {
			const firstSource = sources[identity.firstSourceIdx];
			const lastSource = sources[identity.lastSourceIdx];

			let beforeText: string;
			if (identity.firstKind === FileEditKind.Create) {
				beforeText = '';
			} else {
				const content = await firstSource.db.readFileEditContent(identity.firstToolCallId, identity.firstFilePath);
				beforeText = content?.beforeContent ? new TextDecoder().decode(content.beforeContent) : '';
			}

			let afterText: string;
			if (identity.lastKind === FileEditKind.Delete) {
				afterText = '';
			} else {
				const content = await lastSource.db.readFileEditContent(identity.lastToolCallId, identity.lastFilePath);
				afterText = content?.afterContent ? new TextDecoder().decode(content.afterContent) : '';
			}

			if (beforeText === afterText) {
				return;
			}

			const counts = await diffService.computeDiffCounts(beforeText, afterText);
			results.push(createSessionFileDiff(firstSource.sessionUri, lastSource.sessionUri, identity, counts.added, counts.removed));
		})());
	}

	await Promise.allSettled(diffPromises);

	return results;
}

/**
 * Computes the diff statistics for a single turn — files touched only
 * within `turnId`, with their `before` snapshot taken from the first edit
 * record in that turn and their `after` snapshot from the last. Used by
 * the per-turn changeset (`<session>/changeset/turn/<turnId>`).
 *
 * Returns an empty array when the turn touched no files.
 */
export async function computeTurnDiffs(
	sessionUri: string,
	db: ISessionDatabase,
	diffService: IDiffComputeService,
	turnId: string,
): Promise<ISessionFileDiff[]> {
	const edits = await db.getFileEditsByTurn(turnId);
	if (edits.length === 0) {
		return [];
	}

	// Build identity graph for this turn only — same algorithm as
	// `computeSessionDiffs` but scoped to a single turn's edits.
	const pathToIdentityKey = new Map<string, string>();
	const identities = new Map<string, IFileIdentity>();
	for (const edit of edits) {
		let identityKey: string;
		if (edit.kind === FileEditKind.Rename && edit.originalPath) {
			identityKey = pathToIdentityKey.get(edit.originalPath) ?? edit.originalPath;
			pathToIdentityKey.set(edit.filePath, identityKey);
			pathToIdentityKey.delete(edit.originalPath);
		} else {
			identityKey = pathToIdentityKey.get(edit.filePath) ?? edit.filePath;
			pathToIdentityKey.set(edit.filePath, identityKey);
		}
		const existing = identities.get(identityKey);
		if (!existing) {
			identities.set(identityKey, {
				terminalPath: edit.filePath,
				firstToolCallId: edit.toolCallId,
				firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
				firstKind: edit.kind,
				firstSourceIdx: 0,
				lastToolCallId: edit.toolCallId,
				lastFilePath: edit.filePath,
				lastKind: edit.kind,
				lastSourceIdx: 0,
			});
		} else {
			existing.terminalPath = edit.filePath;
			existing.lastToolCallId = edit.toolCallId;
			existing.lastFilePath = edit.filePath;
			existing.lastKind = edit.kind;
		}
	}

	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];
	for (const identity of identities.values()) {
		diffPromises.push((async () => {
			let beforeText: string;
			if (identity.firstKind === FileEditKind.Create) {
				beforeText = '';
			} else {
				const content = await db.readFileEditContent(identity.firstToolCallId, identity.firstFilePath);
				beforeText = content?.beforeContent ? new TextDecoder().decode(content.beforeContent) : '';
			}
			let afterText: string;
			if (identity.lastKind === FileEditKind.Delete) {
				afterText = '';
			} else {
				const content = await db.readFileEditContent(identity.lastToolCallId, identity.lastFilePath);
				afterText = content?.afterContent ? new TextDecoder().decode(content.afterContent) : '';
			}
			if (beforeText === afterText) {
				return;
			}
			const counts = await diffService.computeDiffCounts(beforeText, afterText);
			results.push(createSessionFileDiff(sessionUri, sessionUri, identity, counts.added, counts.removed));
		})());
	}
	await Promise.allSettled(diffPromises);
	return results;
}
