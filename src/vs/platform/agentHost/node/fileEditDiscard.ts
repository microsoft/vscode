/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { FileEditKind } from '../common/state/sessionState.js';
import type { IFileEditRevertStep } from './agentHostFileEditRevert.js';

/**
 * Prefix of the tool call ID of an edit row that records a discard. SDK events
 * never carry these IDs, so the transcript never shows the row.
 */
export const FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX = 'vscode-discard-';

/**
 * Reads a file's content before and after a run of its edit records, matching
 * the snapshots the diff aggregators compare. The records must not include
 * renames.
 */
export async function readFileEditRevertStep(db: ISessionDatabase, records: readonly IFileEditRecord[]): Promise<IFileEditRevertStep> {
	const first = records[0];
	const last = records[records.length - 1];
	const [firstContent, lastContent] = await Promise.all([
		first.kind === FileEditKind.Create ? undefined : db.readFileEditContent(first.toolCallId, first.filePath),
		last.kind === FileEditKind.Delete ? undefined : db.readFileEditContent(last.toolCallId, last.filePath),
	]);
	if ((first.kind !== FileEditKind.Create && !firstContent) || (last.kind !== FileEditKind.Delete && !lastContent)) {
		throw new Error(`Recorded content is missing for '${last.filePath}'`);
	}
	return {
		start: first.kind === FileEditKind.Create ? undefined : firstContent?.beforeContent ?? new Uint8Array(),
		end: last.kind === FileEditKind.Delete ? undefined : lastContent?.afterContent ?? new Uint8Array(),
	};
}

/**
 * Builds the edit row that records a discard: an edit from the step's end
 * content back to its start content. Appended after the turn's own rows, it
 * makes the turn's net change to the file empty, so the diff aggregators drop
 * the file without any change to how they compute diffs.
 */
export function createFileEditDiscardRecord(turnId: string, filePath: string, step: IFileEditRevertStep): IFileEditRecord & IFileEditContent {
	let kind: FileEditKind;
	if (step.start === undefined) {
		kind = FileEditKind.Delete;
	} else if (step.end === undefined) {
		kind = FileEditKind.Create;
	} else {
		kind = FileEditKind.Edit;
	}
	return {
		turnId,
		toolCallId: `${FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX}${generateUuid()}`,
		filePath,
		kind,
		beforeContent: step.end,
		afterContent: step.start,
		addedLines: undefined,
		removedLines: undefined,
	};
}
