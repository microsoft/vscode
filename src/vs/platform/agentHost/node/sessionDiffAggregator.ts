/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Promises } from '../../../base/common/async.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import type { IDiffComputeService } from '../common/diffComputeService.js';
import { FileEditKind, type ISessionFileDiff } from '../common/state/sessionState.js';
import { buildSessionDbUri } from '../common/sessionDbUri.js';
import { isFileEditAcceptRecord } from './fileEditAccept.js';
import { computeWorkingSetFileContents } from './workingSetFileContents.js';

/** The recorded changes among `records`, leaving out rows that record accepting changes. */
function withoutAcceptRecords(records: readonly IFileEditRecord[]): IFileEditRecord[] {
	return records.filter(record => !isFileEditAcceptRecord(record));
}

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
		// A created file has no lines before and a deleted one none after, as the file-edit tracker and Git count them;
		// a line diff against empty content would count its single empty line.
		diff: { added: hasAfter ? added : 0, removed: hasBefore ? removed : 0 },
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
	/**
	 * For the Working Set, the identity's records since its baseline record,
	 * its latest accept row or its first record, with the source of each.
	 */
	rowsSinceBaseline?: { readonly record: IFileEditRecord; readonly sourceIdx: number }[];
	/**
	 * For the Working Set, the keys of all of the identity's records. Records
	 * are only ordered within a database, so walking them needs a database
	 * that holds every one, as a forked chat's holds its parent's earlier ones.
	 */
	editKeys?: string[];
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
 *
 * When {@link folderScope} is provided, only files whose final path is within
 * one of those absolute roots are returned. In incremental mode the scope also
 * applies to the carried-over {@link IIncrementalDiffOptions.previousDiffs}.
 */
export async function computeSessionDiffs(
	sessionUri: string,
	db: ISessionDatabase,
	diffService: IDiffComputeService,
	incremental?: IIncrementalDiffOptions,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	// Full mode (no incremental) is the single-source case of the unioned
	// computation — delegate so the identity-graph + diff logic lives in one
	// place and multi-chat sessions reuse the exact same code path.
	if (!incremental) {
		return computeUnionedDiffs([{ sessionUri, db }], diffService, folderScope);
	}

	// Scope the carried-over results too, so results computed under a
	// different (or no) scope never leak into a scoped request.
	const previousDiffs = folderScope
		? incremental.previousDiffs.filter(diff => isFileDiffWithinFolderScope(diff, folderScope))
		: incremental.previousDiffs;

	// Incremental mode (single source): try to fetch only the current turn's
	// edits. When the turn only introduces new files (no renames, no re-edits
	// of previously changed files), the full edit history is not needed.
	let edits: IFileEditRecord[];
	let fastPath = false;

	const turnEdits = withoutAcceptRecords(await db.getFileEditsByTurn(incremental.changedTurnId));
	if (turnEdits.length === 0) {
		return [...previousDiffs];
	}

	const previousDiffsUris = new Set(previousDiffs.map(getFileEditUri));
	const needsFullHistory = turnEdits.some(e =>
		e.kind === FileEditKind.Rename ||
		previousDiffsUris.has(URI.file(e.filePath).toString())
	);

	if (needsFullHistory) {
		edits = withoutAcceptRecords(await db.getAllFileEdits());
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
		? new Map(previousDiffs.map(d => [getFileEditUri(d), d]))
		: undefined;

	// Compute diffs for each file identity
	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const [identityKey, identity] of identities) {
		// Apply the folder scope by the identity's FINAL path, mirroring
		// `computeUnionedDiffs` and `computeTurnDiffs`.
		if (folderScope && !isPathWithinFolderScope(identity.terminalPath, folderScope)) {
			continue;
		}

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
		results.push(...previousDiffs);
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
 * A record held by more than one source, like those a forked chat's database
 * copies from its parent, counts once, in the earliest source that holds it.
 *
 * TODO (debt): this always does a full recompute — it ignores the
 * {@link IIncrementalDiffOptions} fast/slow paths that {@link computeSessionDiffs}
 * uses for single-source sessions. An incremental union is a safe follow-up:
 * the per-identity `firstSourceIdx`/`lastSourceIdx` already carry the provenance
 * needed to recompute only the turn's owning source plus cross-source files and
 * carry over the rest. Requires plumbing the owning source of `changedTurnId`
 * through `onTurnComplete` → `_doComputeStaticChangeset`. See tracking issue.
 */
export function computeUnionedDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	return computeUnionedFileDiffs(sources, diffService, folderScope, false);
}

/**
 * Computes the Working Set changeset across one or more {@link ISessionDiffSource}
 * databases: the recorded changes the user hasn't accepted yet. Like
 * {@link computeUnionedDiffs}, but a file's latest accept row (see
 * `fileEditAccept.ts`) restarts its diff, which then compares the accepted
 * content with the file's last snapshot. Changes made outside of the
 * recorded edits, like the user's, are moved into that baseline when one
 * database holds all of the file's records, which orders them. A file whose
 * changes were all accepted has no diff.
 */
export function computeWorkingSetDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	return computeUnionedFileDiffs(sources, diffService, folderScope, true);
}

/**
 * Implements {@link computeUnionedDiffs}, and {@link computeWorkingSetDiffs}
 * when `fromAcceptedContent` is set. Otherwise accept rows are left out.
 */
async function computeUnionedFileDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope: readonly URI[] | undefined,
	fromAcceptedContent: boolean,
): Promise<ISessionFileDiff[]> {
	// Load every source's edits in parallel, then concatenate in source order so
	// the identity graph sees a deterministic session-first ordering while each
	// source keeps its own insertion order.
	const perSourceEdits = await Promises.settled(sources.map(source => source.db.getAllFileEdits()));
	const getEditKey = (edit: IFileEditRecord) => `${edit.toolCallId}\0${edit.filePath}`;
	const sourceEditKeys = fromAcceptedContent ? perSourceEdits.map(edits => new Set(edits.map(getEditKey))) : [];

	const pathToIdentityKey = new Map<string, string>();
	const identities = new Map<string, IFileIdentity>();
	// A forked chat's database starts as a copy of its parent's, so the parent's
	// records can appear in more than one source. Counting a copy again would
	// make it the file's last edit and hide edits the parent made after the fork.
	const seenEdits = new Set<string>();
	let totalEdits = 0;

	for (let sourceIdx = 0; sourceIdx < perSourceEdits.length; sourceIdx++) {
		for (const edit of perSourceEdits[sourceIdx]) {
			const isAccept = isFileEditAcceptRecord(edit);
			if (isAccept && !fromAcceptedContent) {
				continue;
			}
			const editKey = getEditKey(edit);
			if (seenEdits.has(editKey)) {
				continue;
			}
			seenEdits.add(editKey);
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
			// An accepted file that doesn't exist makes recreating it a creation.
			const acceptedKind = edit.kind === FileEditKind.Delete ? FileEditKind.Create : FileEditKind.Edit;
			if (isAccept && existing) {
				// The accepted content replaces the file's first snapshot. Its last
				// snapshot stays the latest edit's, so an accept row that missed an
				// edit shows that edit rather than hiding it.
				existing.firstToolCallId = edit.toolCallId;
				existing.firstFilePath = edit.filePath;
				existing.firstKind = acceptedKind;
				existing.firstSourceIdx = sourceIdx;
				existing.rowsSinceBaseline = [{ record: edit, sourceIdx }];
				existing.editKeys?.push(editKey);
			} else if (!existing) {
				identities.set(identityKey, {
					terminalPath: edit.filePath,
					firstToolCallId: edit.toolCallId,
					firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
					firstKind: isAccept ? acceptedKind : edit.kind,
					firstSourceIdx: sourceIdx,
					lastToolCallId: edit.toolCallId,
					lastFilePath: edit.filePath,
					lastKind: edit.kind,
					lastSourceIdx: sourceIdx,
					rowsSinceBaseline: fromAcceptedContent ? [{ record: edit, sourceIdx }] : undefined,
					editKeys: fromAcceptedContent ? [editKey] : undefined,
				});
			} else {
				existing.terminalPath = edit.filePath;
				existing.lastToolCallId = edit.toolCallId;
				existing.lastFilePath = edit.filePath;
				existing.lastKind = edit.kind;
				existing.lastSourceIdx = sourceIdx;
				existing.rowsSinceBaseline?.push({ record: edit, sourceIdx });
				existing.editKeys?.push(editKey);
			}
		}
	}

	if (totalEdits === 0) {
		return [];
	}

	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const identity of identities.values()) {
		// Apply the folder scope by the identity's FINAL path, mirroring
		// `computeTurnDiffs`: a rename that lands in scope is kept (with its
		// full before/after chain) and one that leaves scope is dropped.
		if (folderScope && !isPathWithinFolderScope(identity.terminalPath, folderScope)) {
			continue;
		}
		diffPromises.push((async () => {
			// Without a database that holds all of the file's records, their order
			// is unknown: an accept row in a forked chat can follow, in source
			// order, an edit its parent made after it. The file's first and last
			// snapshots are compared instead, which shows such an edit.
			const { rowsSinceBaseline, editKeys } = identity;
			const holderIdx = rowsSinceBaseline && editKeys ? sourceEditKeys.findIndex(keys => editKeys.every(key => keys.has(key))) : -1;
			if (rowsSinceBaseline && holderIdx >= 0) {
				// The holder also holds the copies counted in earlier sources.
				const workingSetDiff = await computeSingleSourceWorkingSetDiff(sources, rowsSinceBaseline.map(({ record }) => ({ record, sourceIdx: holderIdx })), diffService);
				if (workingSetDiff !== false) {
					if (workingSetDiff) {
						results.push(workingSetDiff);
					}
					return;
				}
			}

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

	await Promises.settled(diffPromises);

	return results;
}

/**
 * Computes the Working Set diff of a file whose records since its baseline,
 * `rows`, are all in one source and at one path: changes made outside of the
 * records are moved into the baseline, so only recorded changes show (see
 * {@link computeWorkingSetFileContents}). Returns `undefined` when the file has
 * no changes, and `false` for other files, which compare the baseline with
 * the last snapshot instead.
 */
async function computeSingleSourceWorkingSetDiff(
	sources: readonly ISessionDiffSource[],
	rows: readonly { readonly record: IFileEditRecord; readonly sourceIdx: number }[],
	diffService: IDiffComputeService,
): Promise<ISessionFileDiff | undefined | false> {
	const { record: first, sourceIdx } = rows[0];
	if (rows.some(row => row.sourceIdx !== sourceIdx || row.record.filePath !== first.filePath || row.record.kind === FileEditKind.Rename)) {
		return false;
	}
	const source = sources[sourceIdx];
	const last = rows[rows.length - 1].record;
	const { baseline, current, rebased } = await computeWorkingSetFileContents(source.db, rows.map(row => row.record), diffService);
	const beforeText = baseline ? new TextDecoder().decode(baseline) : '';
	const afterText = current ? new TextDecoder().decode(current) : '';
	if (beforeText === afterText) {
		return undefined;
	}
	const counts = await diffService.computeDiffCounts(beforeText, afterText);
	const hasBefore = baseline !== undefined;
	const hasAfter = current !== undefined;
	return {
		...(hasBefore ? {
			before: {
				uri: URI.file(first.filePath).toString(),
				// A rebased baseline is computed from the records when it is read.
				content: {
					uri: rebased
						? buildSessionDbUri(source.sessionUri, last.toolCallId, last.filePath, 'workingSetBaseline')
						: buildSessionDbUri(source.sessionUri, first.toolCallId, first.filePath, 'before'),
				},
			},
		} : {}),
		...(hasAfter ? {
			after: {
				uri: URI.file(last.filePath).toString(),
				content: { uri: buildSessionDbUri(source.sessionUri, last.toolCallId, last.filePath, 'after') },
			},
		} : {}),
		diff: { added: hasAfter ? counts.added : 0, removed: hasBefore ? counts.removed : 0 },
	};
}

/**
 * Returns `true` when `filePath` — an absolute OS path taken verbatim from an
 * {@link IFileEditRecord} (`file_edits.file_path` values are absolute by
 * contract) — is equal to, or nested under, any of the given `folderRoots`.
 *
 * Containment is delegated to {@link extUriBiasedIgnorePathCase} so the check
 * honors the platform's path-casing bias (case-insensitive on Windows/macOS,
 * case-sensitive elsewhere) rather than doing a naive string prefix compare.
 */
export function isPathWithinFolderScope(filePath: string, folderRoots: readonly URI[]): boolean {
	const fileUri = URI.file(filePath);
	return folderRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, root));
}

/** Returns `true` when the file identified by `diff` is within any of `folderRoots`. */
function isFileDiffWithinFolderScope(diff: ISessionFileDiff, folderRoots: readonly URI[]): boolean {
	const uri = getFileEditUri(diff);
	if (!uri) {
		return false;
	}
	const fileUri = URI.parse(uri);
	return folderRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, root));
}

/**
 * Computes per-file diff stats for a single turn, following rename chains. When
 * `folderScope` is provided, only files whose final path is within one of those
 * absolute roots are returned (an empty scope returns none); omitting it returns
 * every file touched in the turn.
 */
export async function computeTurnDiffs(
	sessionUri: string,
	db: ISessionDatabase,
	diffService: IDiffComputeService,
	turnId: string,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	const turnEdits = withoutAcceptRecords(await db.getFileEditsByTurn(turnId));
	if (turnEdits.length === 0) {
		return [];
	}

	// Build identity graph for this turn only — same algorithm as
	// `computeSessionDiffs` but scoped to a single turn's edits. Identities are
	// built from ALL of the turn's edits (not a pre-filtered subset) so rename
	// chains stay intact; `folderScope` is applied per-identity below, by the
	// identity's final `terminalPath`.
	//
	// Identity keys are freshly minted rather than reusing the raw file path so
	// a path recreated after being renamed away (e.g. edit A, rename A→B, create
	// A) starts a NEW identity instead of colliding with the moved-away one.
	const pathToIdentityKey = new Map<string, string>();
	const identities = new Map<string, IFileIdentity>();
	let nextIdentitySeq = 0;
	for (const edit of turnEdits) {
		let identityKey: string;
		if (edit.kind === FileEditKind.Rename && edit.originalPath) {
			identityKey = pathToIdentityKey.get(edit.originalPath) ?? `${nextIdentitySeq++}`;
			pathToIdentityKey.set(edit.filePath, identityKey);
			pathToIdentityKey.delete(edit.originalPath);
		} else {
			identityKey = pathToIdentityKey.get(edit.filePath) ?? `${nextIdentitySeq++}`;
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
		// Apply the folder scope by the identity's FINAL path, so a rename that
		// lands in scope is kept (with its full before/after chain) and one that
		// leaves scope is dropped. Skipping here — rather than pre-filtering the
		// raw records — keeps rename chains intact.
		if (folderScope && !isPathWithinFolderScope(identity.terminalPath, folderScope)) {
			continue;
		}
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
