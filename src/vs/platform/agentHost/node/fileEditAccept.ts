/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { FileEditKind } from '../common/state/sessionState.js';

/**
 * Prefix of the tool call ID of an edit row that records the user accepting a
 * file's changes. SDK events never carry these IDs, so the transcript never
 * shows the row.
 */
export const FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX = 'vscode-accept-';

/** Whether `record` records the user accepting a file's changes, rather than a change to the file. */
export function isFileEditAcceptRecord(record: Pick<IFileEditRecord, 'toolCallId'>): boolean {
	return record.toolCallId.startsWith(FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX);
}

/**
 * Returns the records of a file that its Working Set compares: those since
 * its latest accept row, including it, or all of them without one.
 */
export function getWorkingSetFileEditRecords(records: readonly IFileEditRecord[]): readonly IFileEditRecord[] {
	return records.slice(Math.max(records.findLastIndex(isFileEditAcceptRecord), 0));
}

/**
 * Splits a file's edit records at its latest accept row: the records that
 * change the file since its changes were last accepted, and the turns of the
 * records it accepted. An accept row that accepted only some changes is the
 * first unaccepted record, as it changes the file from the accepted content
 * to the content the file had then. Without an accept row, every record is
 * unaccepted.
 */
export async function getUnacceptedFileEditRecords(db: Pick<ISessionDatabase, 'readFileEditContent'>, records: readonly IFileEditRecord[]): Promise<{ readonly records: IFileEditRecord[]; readonly acceptedTurns: ReadonlySet<string> }> {
	const latestAccept = records.findLastIndex(isFileEditAcceptRecord);
	const start = latestAccept >= 0 && await isPartialFileEditAcceptRecord(db, records[latestAccept]) ? latestAccept : latestAccept + 1;
	return {
		records: records.slice(start),
		acceptedTurns: new Set(records.slice(0, Math.max(latestAccept, 0)).filter(record => !isFileEditAcceptRecord(record)).map(record => record.turnId)),
	};
}

/** Whether `record`, which records accepting a file's changes, accepted only some of them. */
async function isPartialFileEditAcceptRecord(db: Pick<ISessionDatabase, 'readFileEditContent'>, record: IFileEditRecord): Promise<boolean> {
	if (record.kind === FileEditKind.Delete) {
		return false;
	}
	const content = await readContent(db, record);
	return !fileEditContentEquals(content.beforeContent ?? new Uint8Array(), content.afterContent ?? new Uint8Array());
}

/**
 * Returns the content that `record`, which records accepting a file's
 * changes, accepted, given its recorded `content`; `undefined` meaning the
 * file doesn't exist.
 */
export function getFileEditAcceptedContent(record: IFileEditRecord, content: IFileEditContent): Uint8Array | undefined {
	return record.kind === FileEditKind.Delete ? undefined : content.beforeContent ?? new Uint8Array();
}

/** Reads the content that `record`, which records accepting a file's changes, accepted, `undefined` meaning the file doesn't exist. */
export async function readFileEditAcceptedContent(db: Pick<ISessionDatabase, 'readFileEditContent'>, record: IFileEditRecord): Promise<Uint8Array | undefined> {
	return record.kind === FileEditKind.Delete ? undefined : getFileEditAcceptedContent(record, await readContent(db, record));
}

/**
 * Reads the content that `record` leaves the file with, `undefined` meaning
 * the file doesn't exist.
 */
export async function readFileEditEndContent(db: Pick<ISessionDatabase, 'readFileEditContent'>, record: IFileEditRecord): Promise<Uint8Array | undefined> {
	if (record.kind === FileEditKind.Delete) {
		return undefined;
	}
	return (await readContent(db, record)).afterContent ?? new Uint8Array();
}

async function readContent(db: Pick<ISessionDatabase, 'readFileEditContent'>, record: IFileEditRecord): Promise<IFileEditContent> {
	const content = await db.readFileEditContent(record.toolCallId, record.filePath);
	if (!content) {
		throw new Error(`Recorded content is missing for '${record.filePath}'`);
	}
	return content;
}

/** Compares recorded contents, `undefined` meaning the file doesn't exist. */
export function fileEditContentEquals(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	return a === undefined || b === undefined ? a === b : VSBuffer.wrap(a).equals(VSBuffer.wrap(b));
}

/**
 * Builds the edit row that records accepting every change to a file: an
 * edit from the accepted content to itself, `undefined` meaning that the
 * accepted file doesn't exist, which is recorded as a deletion without
 * content. Appended after the file's rows, it is the baseline that the
 * Working Set changeset compares the file's later rows with. The changesets
 * of recorded edits and discarding them ignore it.
 */
export function createFileEditAcceptRecord(turnId: string, filePath: string, accepted: Uint8Array | undefined): IFileEditRecord & IFileEditContent {
	return accepted === undefined
		? createAcceptRow(turnId, filePath, FileEditKind.Delete, undefined, undefined)
		: createAcceptRow(turnId, filePath, FileEditKind.Edit, accepted, accepted);
}

/**
 * Builds the edit row that records accepting some of the changes to a file
 * that exists before and after them, like {@link createFileEditAcceptRecord}:
 * an edit from the `accepted` content, the Working Set's baseline with those
 * changes, to the file's `current` content, whose other changes stay in the
 * Working Set.
 */
export function createPartialFileEditAcceptRecord(turnId: string, filePath: string, accepted: Uint8Array, current: Uint8Array): IFileEditRecord & IFileEditContent {
	return createAcceptRow(turnId, filePath, FileEditKind.Edit, accepted, current);
}

function createAcceptRow(turnId: string, filePath: string, kind: FileEditKind, accepted: Uint8Array | undefined, current: Uint8Array | undefined): IFileEditRecord & IFileEditContent {
	return {
		turnId,
		toolCallId: `${FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX}${generateUuid()}`,
		filePath,
		kind,
		beforeContent: accepted,
		afterContent: current,
		addedLines: undefined,
		removedLines: undefined,
	};
}

/** Builds the edit row that accepts the content that `row`, a row being recorded with its content, leaves the file with. */
export function createFileEditAcceptRecordAfter(row: IFileEditRecord & IFileEditContent): IFileEditRecord & IFileEditContent {
	return createFileEditAcceptRecord(row.turnId, row.filePath, row.kind === FileEditKind.Delete ? undefined : row.afterContent ?? new Uint8Array());
}
