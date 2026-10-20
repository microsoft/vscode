/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 * Splits a file's edit records at its latest accept row: the records after
 * it, which change the file since its changes were last accepted, and the
 * turns of the records it accepted. Without an accept row, every record is
 * unaccepted.
 */
export function getUnacceptedFileEditRecords(records: readonly IFileEditRecord[]): { readonly records: IFileEditRecord[]; readonly acceptedTurns: ReadonlySet<string> } {
	const latestAccept = records.findLastIndex(isFileEditAcceptRecord);
	return {
		records: records.slice(latestAccept + 1),
		acceptedTurns: new Set(records.slice(0, Math.max(latestAccept, 0)).filter(record => !isFileEditAcceptRecord(record)).map(record => record.turnId)),
	};
}

/**
 * Reads the content that `record` leaves the file with, `undefined` meaning
 * the file doesn't exist.
 */
export async function readFileEditEndContent(db: Pick<ISessionDatabase, 'readFileEditContent'>, record: IFileEditRecord): Promise<Uint8Array | undefined> {
	if (record.kind === FileEditKind.Delete) {
		return undefined;
	}
	const content = await db.readFileEditContent(record.toolCallId, record.filePath);
	if (!content) {
		throw new Error(`Recorded content is missing for '${record.filePath}'`);
	}
	return content.afterContent ?? new Uint8Array();
}

/**
 * Builds the edit row that records accepting a file's changes: an edit from
 * the accepted content to itself, `undefined` meaning that the accepted file
 * doesn't exist, which is recorded as a deletion without content. Appended
 * after the file's rows, it is the baseline that the Working Set changeset
 * compares the file's later rows with. The changesets of recorded edits and
 * discarding them ignore it.
 */
export function createFileEditAcceptRecord(turnId: string, filePath: string, accepted: Uint8Array | undefined): IFileEditRecord & IFileEditContent {
	return {
		turnId,
		toolCallId: `${FILE_EDIT_ACCEPT_TOOL_CALL_ID_PREFIX}${generateUuid()}`,
		filePath,
		kind: accepted === undefined ? FileEditKind.Delete : FileEditKind.Edit,
		beforeContent: accepted,
		afterContent: accepted,
		addedLines: undefined,
		removedLines: undefined,
	};
}

/** Builds the edit row that accepts the content that `row`, a row being recorded with its content, leaves the file with. */
export function createFileEditAcceptRecordAfter(row: IFileEditRecord & IFileEditContent): IFileEditRecord & IFileEditContent {
	return createFileEditAcceptRecord(row.turnId, row.filePath, row.kind === FileEditKind.Delete ? undefined : row.afterContent ?? new Uint8Array());
}
