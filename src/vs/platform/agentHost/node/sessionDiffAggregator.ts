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
import { getFileEditPathKey, getFileEditResourceKey, isSameFileEditPath, toFileEditResource } from './fileEditPath.js';
import { computeWorkingSetSources, findWorkingSetEnds, getFileEditKey, getWorkingSetNonce } from './workingSetSources.js';

/** The recorded changes among `records`, leaving out rows that record accepting changes. */
function withoutAcceptRecords(records: readonly IFileEditRecord[]): IFileEditRecord[] {
	return records.filter(record => !isFileEditAcceptRecord(record));
}

function getFileEditUri(diff: ISessionFileDiff): string | undefined {
	return diff.after?.uri ?? diff.before?.uri;
}

/** The key of the file that `diff` shows, which {@link getFileEditPathKey} gives for its recorded paths. */
function getFileDiffKey(diff: ISessionFileDiff): string | undefined {
	const uri = getFileEditUri(diff);
	return uri === undefined ? undefined : getFileEditResourceKey(URI.parse(uri));
}

/**
 * Returns a function that gives the key of the identity each edit continues, following renames.
 * A path whose file was renamed away starts a new identity when it is recorded again, in any spelling.
 */
function createIdentityResolver(): (edit: IFileEditRecord) => string {
	const pathToIdentityKey = new Map<string, string>();
	let nextIdentityKey = 0;
	return edit => {
		const pathKey = getFileEditPathKey(edit.filePath);
		const previousPathKey = edit.kind === FileEditKind.Rename && edit.originalPath ? getFileEditPathKey(edit.originalPath) : pathKey;
		const identityKey = pathToIdentityKey.get(previousPathKey) ?? `${nextIdentityKey++}`;
		// Removed first: a rename can go to another spelling of the same path, as when only its case changes.
		pathToIdentityKey.delete(previousPathKey);
		pathToIdentityKey.set(pathKey, identityKey);
		return identityKey;
	};
}

/**
 * The path a file is shown at after `edit`: the one it already has when the edit only spells that
 * path differently, so the file keeps one URI, and the edit's path otherwise, as after a rename.
 */
function getTerminalPath(terminalPath: string, edit: IFileEditRecord): string {
	return edit.kind !== FileEditKind.Rename && isSameFileEditPath(terminalPath, edit.filePath) ? terminalPath : edit.filePath;
}

function createSessionFileDiff(beforeSessionUri: string, afterSessionUri: string, identity: IFileIdentity, added: number, removed: number): ISessionFileDiff {
	const hasBefore = identity.firstKind !== FileEditKind.Create;
	const hasAfter = identity.lastKind !== FileEditKind.Delete;
	return {
		...(hasBefore ? {
			before: {
				uri: toFileEditResource(identity.firstFilePath).toString(),
				content: { uri: buildSessionDbUri(beforeSessionUri, identity.firstToolCallId, identity.firstFilePath, 'before') },
			},
		} : {}),
		...(hasAfter ? {
			after: {
				uri: toFileEditResource(identity.terminalPath).toString(),
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
	/** The path this file is shown at: its last known path, as first spelled, see {@link getTerminalPath}. */
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
	/** For the Working Set, the identity's records in each source, including those a forked chat's database copied from its parent. */
	sourceRows?: IFileEditRecord[][];
	/** For the Working Set, the path the file was shown at before each record, by {@link getFileEditKey}: a record can spell it differently. */
	pathsBefore?: Map<string, string>;
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

	const previousDiffKeys = new Set(previousDiffs.map(getFileDiffKey));
	const needsFullHistory = turnEdits.some(e =>
		e.kind === FileEditKind.Rename ||
		previousDiffKeys.has(getFileEditPathKey(e.filePath))
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

	// Gives each edit its canonical identity key (follows rename chains)
	const resolveIdentityKey = createIdentityResolver();
	// Maps identity keys to their accumulated data
	const identities = new Map<string, IFileIdentity>();
	// Track which identity keys were touched by the incremental turn.
	// In fast-path mode all identities are from the current turn, so no tracking needed.
	const touchedIdentityKeys = !fastPath ? new Set<string>() : undefined;

	for (const edit of edits) {
		const identityKey = resolveIdentityKey(edit);

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
			existing.terminalPath = getTerminalPath(existing.terminalPath, edit);
			existing.lastToolCallId = edit.toolCallId;
			existing.lastFilePath = edit.filePath;
			existing.lastKind = edit.kind;
		}
	}

	// In incremental slow-path mode, build a lookup map from file key →
	// previous diff so untouched identities can carry over their previous results.
	const previousDiffsMap = !fastPath
		? new Map(previousDiffs.map(d => [getFileDiffKey(d), d]))
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
			const prev = previousDiffsMap!.get(getFileEditPathKey(identity.terminalPath));
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
export async function computeUnionedDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const identity of await collectFileIdentities(sources, false)) {
		// Apply the folder scope by the identity's FINAL path, mirroring
		// `computeTurnDiffs`: a rename that lands in scope is kept (with its
		// full before/after chain) and one that leaves scope is dropped.
		if (folderScope && !isPathWithinFolderScope(identity.terminalPath, folderScope)) {
			continue;
		}
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

	await Promises.settled(diffPromises);

	return results;
}

/**
 * Computes the Working Set changeset across one or more {@link ISessionDiffSource}
 * databases: the recorded changes the user hasn't accepted yet. A file's latest
 * accept row (see `fileEditAccept.ts`) restarts its diff, which then compares
 * the accepted content with the file's last snapshot. Changes made outside of
 * the recorded edits, like the user's, are moved into that baseline. A file
 * whose changes were all accepted has no diff.
 *
 * Records are only ordered within a database, so an accept row covers the
 * records before it in its own database, and the copies of them that a forked
 * chat's database holds (see {@link computeWorkingSetSources}). When several
 * databases leave changes to a file, its diff spans them, from the record
 * that starts them to the one that ends them (see {@link findWorkingSetEnds}).
 * A file whose changes across the databases cancel out has no diff.
 */
export async function computeWorkingSetDiffs(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope?: readonly URI[],
): Promise<ISessionFileDiff[]> {
	return (await computeWorkingSetFiles(sources, diffService, folderScope)).map(file => file.diff);
}

/** A file of a Working Set changeset, with the nonce of its changes. */
export interface IWorkingSetFileDiff {
	readonly diff: ISessionFileDiff;
	/** See {@link getWorkingSetNonce}. */
	readonly nonce: string;
}

/** Like {@link computeWorkingSetDiffs}, with the nonce of each file's changes. */
export async function computeWorkingSetFiles(
	sources: readonly ISessionDiffSource[],
	diffService: IDiffComputeService,
	folderScope?: readonly URI[],
): Promise<IWorkingSetFileDiff[]> {
	const databases = sources.map(source => source.db);
	const results: IWorkingSetFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const identity of await collectFileIdentities(sources, true)) {
		if (folderScope && !isPathWithinFolderScope(identity.terminalPath, folderScope)) {
			continue;
		}
		diffPromises.push((async () => {
			const workingSet = await computeWorkingSetSources(databases, identity.sourceRows ?? [], diffService);
			const ends = await findWorkingSetEnds(databases, workingSet);
			if (!ends) {
				return;
			}
			const { first, last, baseline, current, rebased } = ends;
			const counts = await diffService.computeDiffCounts(baseline ? new TextDecoder().decode(baseline) : '', current ? new TextDecoder().decode(current) : '');
			const hasBefore = baseline !== undefined;
			const hasAfter = current !== undefined;
			const lastSessionUri = sources[last.sourceIdx].sessionUri;
			results.push({
				nonce: getWorkingSetNonce(workingSet.pending),
				diff: {
					...(hasBefore ? {
						before: {
							uri: toFileEditResource(identity.pathsBefore?.get(getFileEditKey(first.record)) ?? first.record.filePath).toString(),
							// A rebased baseline is computed from the records when it is read.
							content: {
								uri: rebased
									? buildSessionDbUri(lastSessionUri, last.record.toolCallId, last.record.filePath, 'workingSetBaseline')
									: buildSessionDbUri(sources[first.sourceIdx].sessionUri, first.record.toolCallId, first.record.filePath, 'before'),
							},
						},
					} : {}),
					...(hasAfter ? {
						after: {
							uri: toFileEditResource(identity.terminalPath).toString(),
							content: { uri: buildSessionDbUri(lastSessionUri, last.record.toolCallId, last.record.filePath, 'after') },
						},
					} : {}),
					diff: { added: hasAfter ? counts.added : 0, removed: hasBefore ? counts.removed : 0 },
				},
			});
		})());
	}

	await Promises.settled(diffPromises);

	return results;
}

/**
 * Collects the file identities of the edits in `sources`, tracking renames across the chain. With
 * `forWorkingSet`, accept rows count too, and each identity keeps its records in every source.
 */
async function collectFileIdentities(sources: readonly ISessionDiffSource[], forWorkingSet: boolean): Promise<IFileIdentity[]> {
	// Load every source's edits in parallel, then concatenate in source order so
	// the identity graph sees a deterministic session-first ordering while each
	// source keeps its own insertion order.
	const perSourceEdits = await Promises.settled(sources.map(source => source.db.getAllFileEdits()));

	const resolveIdentityKey = createIdentityResolver();
	const identities = new Map<string, IFileIdentity>();
	// A forked chat's database starts as a copy of its parent's, so the parent's
	// records can appear in more than one source. Counting a copy again would
	// make it the file's last edit and hide edits the parent made after the fork.
	const editIdentities = new Map<string, IFileIdentity>();

	for (let sourceIdx = 0; sourceIdx < perSourceEdits.length; sourceIdx++) {
		for (const edit of perSourceEdits[sourceIdx]) {
			const isAccept = isFileEditAcceptRecord(edit);
			if (isAccept && !forWorkingSet) {
				continue;
			}
			const editKey = getFileEditKey(edit);
			let identity = editIdentities.get(editKey);
			if (!identity) {
				const identityKey = resolveIdentityKey(edit);
				identity = identities.get(identityKey);
				if (!identity) {
					identity = {
						terminalPath: edit.filePath,
						firstToolCallId: edit.toolCallId,
						firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
						firstKind: edit.kind,
						firstSourceIdx: sourceIdx,
						lastToolCallId: edit.toolCallId,
						lastFilePath: edit.filePath,
						lastKind: edit.kind,
						lastSourceIdx: sourceIdx,
						sourceRows: forWorkingSet ? sources.map(() => []) : undefined,
						pathsBefore: forWorkingSet ? new Map([[editKey, edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath]]) : undefined,
					};
					identities.set(identityKey, identity);
				} else {
					identity.pathsBefore?.set(editKey, identity.terminalPath);
					if (!isAccept) {
						identity.terminalPath = getTerminalPath(identity.terminalPath, edit);
						identity.lastToolCallId = edit.toolCallId;
						identity.lastFilePath = edit.filePath;
						identity.lastKind = edit.kind;
						identity.lastSourceIdx = sourceIdx;
					}
				}
				editIdentities.set(editKey, identity);
			}
			identity.sourceRows?.[sourceIdx].push(edit);
		}
	}

	return [...identities.values()];
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
	const fileUri = toFileEditResource(filePath);
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
	const resolveIdentityKey = createIdentityResolver();
	const identities = new Map<string, IFileIdentity>();
	for (const edit of turnEdits) {
		const identityKey = resolveIdentityKey(edit);
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
			existing.terminalPath = getTerminalPath(existing.terminalPath, edit);
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
