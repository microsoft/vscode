/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDiffComputeService } from '../common/diffComputeService.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { FileEditKind } from '../common/state/sessionState.js';
import { getFileEditAcceptedContent, isFileEditAcceptRecord } from './fileEditAccept.js';
import { isSameFileEditPath } from './fileEditPath.js';
import { computeWorkingSetFileContents, fileEditContentMatches, type IWorkingSetFileContents } from './workingSetFileContents.js';

type FileEditContentReader = Pick<ISessionDatabase, 'readFileEditContent'>;

/** Identifies an edit row across databases: a forked chat's database starts as a copy of its parent's rows. */
export function getFileEditKey(record: Pick<IFileEditRecord, 'toolCallId' | 'filePath'>): string {
	return `${record.toolCallId}\0${record.filePath}`;
}

/** A database's rows of a file whose changes haven't been accepted. */
export interface IWorkingSetSource {
	/** Index of the database among those given. */
	readonly sourceIdx: number;
	/** The rows, starting with the accept row that the file's changes were last accepted with when it still applies. */
	readonly rows: readonly IFileEditRecord[];
	/** The change that {@link rows} make. */
	readonly contents: IWorkingSetFileContents;
}

/** The databases whose unaccepted rows of a file count, see {@link computeWorkingSetSources}. */
export interface IWorkingSetSources {
	/** Databases whose rows leave changes, which the file's Working Set shows. */
	readonly pending: readonly IWorkingSetSource[];
	/** Databases whose rows leave none, which can still follow the pending ones. Accepting the file's changes accepts them too, or an accept row elsewhere could leave only some of them counted. */
	readonly unchanged: readonly IWorkingSetSource[];
}

/**
 * Returns the databases with unaccepted rows of one file, given its rows in each database. Rows are only
 * ordered within a database, so an accept row covers the rows before it in its own database and their
 * copies in other ones. A database whose rows are all held by another one is left out.
 */
export async function computeWorkingSetSources(databases: readonly FileEditContentReader[], rowsPerSource: readonly (readonly IFileEditRecord[])[], diffService: IDiffComputeService): Promise<IWorkingSetSources> {
	const accepted = new Set<string>();
	for (const rows of rowsPerSource) {
		for (const row of rows.slice(0, Math.max(rows.findLastIndex(isFileEditAcceptRecord), 0))) {
			accepted.add(getFileEditKey(row));
		}
	}
	const candidates = rowsPerSource.map((rows, sourceIdx) => {
		const ownStart = Math.max(rows.findLastIndex(isFileEditAcceptRecord), 0);
		const start = Math.max(ownStart, rows.findLastIndex(row => accepted.has(getFileEditKey(row))) + 1);
		const unaccepted = rows.slice(start);
		return { sourceIdx, rows: unaccepted, startsAtOwnBaseline: start === ownStart, keys: new Set(unaccepted.map(getFileEditKey)) };
	}).filter(candidate => candidate.rows.length > 0);
	const held = (index: number) => candidates.some((other, otherIndex) => otherIndex !== index
		&& (other.keys.size > candidates[index].keys.size || (other.keys.size === candidates[index].keys.size && otherIndex < index))
		&& [...candidates[index].keys].every(key => other.keys.has(key)));
	const sources = await Promise.all(candidates.filter((_, index) => !held(index)).map(async ({ sourceIdx, rows, startsAtOwnBaseline }) => ({
		sourceIdx,
		rows,
		contents: await computeContents(databases[sourceIdx], rows, startsAtOwnBaseline, diffService),
	})));
	const changed = (source: IWorkingSetSource) => toText(source.contents.baseline) !== toText(source.contents.current);
	return {
		pending: sources.filter(changed),
		unchanged: sources.filter(source => !changed(source) && (source.rows.length > 1 || !isFileEditAcceptRecord(source.rows[0]))),
	};
}

/**
 * Nonce of a file's Working Set changes: the tool call ID of the last row of each of its `sources`.
 * Clients can echo this opaque value when deciding on a displayed change.
 */
export function getWorkingSetNonce(sources: readonly Pick<IWorkingSetSource, 'rows'>[]): string {
	return sources.map(source => source.rows[source.rows.length - 1].toolCallId).join(',');
}

/** The rows that a file's Working Set changes start and end with, see {@link findWorkingSetEnds}. */
export interface IWorkingSetEnds extends IWorkingSetFileContents {
	readonly first: { readonly sourceIdx: number; readonly record: IFileEditRecord };
	readonly last: { readonly sourceIdx: number; readonly record: IFileEditRecord };
}

function getWorkingSetEnds({ sourceIdx, rows, contents }: IWorkingSetSource): IWorkingSetEnds {
	return { first: { sourceIdx, record: rows[0] }, last: { sourceIdx, record: rows[rows.length - 1] }, ...contents };
}

/**
 * Picks the rows that a file's Working Set changes start and end with, or `undefined` when no database leaves
 * changes or the changes of all of them cancel out. Across databases, a row follows the one that left the
 * content it starts from. Without such a row, the order of the databases decides.
 */
export async function findWorkingSetEnds(databases: readonly FileEditContentReader[], { pending, unchanged }: IWorkingSetSources): Promise<IWorkingSetEnds | undefined> {
	if (pending.length === 0) {
		return undefined;
	}
	const single = pending.length === 1 ? pending[0] : undefined;
	if (single && unchanged.length === 0) {
		return getWorkingSetEnds(single);
	}
	const sources = [...pending, ...unchanged].sort((a, b) => a.sourceIdx - b.sourceIdx);
	const steps = await Promise.all(sources.map(async source => {
		const all = await Promise.all(source.rows.map(async record => ({ record, ...await readStep(databases[source.sourceIdx], record) })));
		// A row that accepted every change makes none, so the changes start with the row after it.
		return all.length > 1 && isFileEditAcceptRecord(all[0].record) && fileEditContentMatches(all[0].start, all[0].end) ? all.slice(1) : all;
	}));
	const keys = sources.map(source => new Set(source.rows.map(getFileEditKey)));
	const hasRowElsewhere = (index: number, side: 'start' | 'end', content: Uint8Array | undefined) => steps.some((others, otherIndex) => otherIndex !== index
		&& others.some(other => !keys[index].has(getFileEditKey(other.record)) && fileEditContentMatches(other[side], content)));
	const unpreceded = steps.findIndex((own, index) => !hasRowElsewhere(index, 'end', own[0].start));
	const unfollowed = steps.findLastIndex((own, index) => !hasRowElsewhere(index, 'start', own[own.length - 1].end));
	const isOrdered = unpreceded >= 0 && unfollowed >= 0;
	const firstIndex = Math.max(unpreceded, 0);
	const lastIndex = unfollowed < 0 ? steps.length - 1 : unfollowed;
	const first = steps[firstIndex][0];
	const last = steps[lastIndex][steps[lastIndex].length - 1];
	if (single && (!isOrdered || sources[lastIndex] === single)) {
		return getWorkingSetEnds(single);
	}
	if (toText(first.start) === toText(last.end)) {
		// Contents that recur across the databases leave no order to tell, so one database's own changes show the file.
		return isOrdered ? undefined : getWorkingSetEnds(pending[pending.length - 1]);
	}
	return {
		first: { sourceIdx: sources[firstIndex].sourceIdx, record: first.record },
		last: { sourceIdx: sources[lastIndex].sourceIdx, record: last.record },
		baseline: first.start,
		current: last.end,
		rebased: false,
	};
}

/**
 * Computes the change that a database's unaccepted `rows` of a file make. Changes made outside of the rows are
 * only moved into the baseline when that baseline can be read back from the database, see `sessionDbUri.ts`.
 */
async function computeContents(db: FileEditContentReader, rows: readonly IFileEditRecord[], startsAtOwnBaseline: boolean, diffService: IDiffComputeService): Promise<IWorkingSetFileContents> {
	const first = rows[0];
	if (rows.every(row => row.kind !== FileEditKind.Rename && isSameFileEditPath(row.filePath, first.filePath))) {
		const contents = await computeWorkingSetFileContents(db, rows, diffService);
		if (!contents.rebased || startsAtOwnBaseline) {
			return contents;
		}
	}
	return { baseline: (await readStep(db, first)).start, current: (await readStep(db, rows[rows.length - 1])).end, rebased: false };
}

/** Reads the content that `record` starts from and leaves, `undefined` meaning that the file doesn't exist. */
async function readStep(db: FileEditContentReader, record: IFileEditRecord): Promise<{ readonly start: Uint8Array | undefined; readonly end: Uint8Array | undefined }> {
	const content = await db.readFileEditContent(record.toolCallId, record.filePath);
	if (!content) {
		throw new Error(`Recorded content is missing for '${record.filePath}'`);
	}
	return {
		start: isFileEditAcceptRecord(record) ? getFileEditAcceptedContent(record, content) : record.kind === FileEditKind.Create ? undefined : content.beforeContent ?? new Uint8Array(),
		end: record.kind === FileEditKind.Delete ? undefined : content.afterContent ?? new Uint8Array(),
	};
}

/** The text that a Working Set diff compares, a missing file comparing as an empty one. */
function toText(content: Uint8Array | undefined): string {
	return content ? new TextDecoder().decode(content) : '';
}
