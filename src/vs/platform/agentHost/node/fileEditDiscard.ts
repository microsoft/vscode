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
 * Reads the content before and after each of a file's edit records, matching
 * the snapshots the diff aggregators compare. Reverting the records one at a
 * time keeps changes made between them, such as an edit the user made
 * between two tool calls. The records must not include renames.
 */
export async function readFileEditRevertSteps(db: ISessionDatabase, records: readonly IFileEditRecord[]): Promise<IFileEditRevertStep[]> {
	return Promise.all(records.map(async record => {
		const content = await db.readFileEditContent(record.toolCallId, record.filePath);
		if (!content) {
			throw new Error(`Recorded content is missing for '${record.filePath}'`);
		}
		return {
			start: record.kind === FileEditKind.Create ? undefined : content.beforeContent ?? new Uint8Array(),
			end: record.kind === FileEditKind.Delete ? undefined : content.afterContent ?? new Uint8Array(),
		};
	}));
}

/** The change that a run of consecutive steps makes, from the first one's start to the last one's end. */
export function spanFileEditRevertSteps(steps: readonly IFileEditRevertStep[]): IFileEditRevertStep {
	return { start: steps[0].start, end: steps[steps.length - 1].end };
}

/**
 * Builds the edit row that records a discard: an edit from the turn's end
 * content back to its start content, given by `span`. Appended after the
 * turn's own rows, it makes the turn's net change to the file empty, so the
 * diff aggregators drop the file without any change to how they compute diffs.
 */
export function createFileEditDiscardRecord(turnId: string, filePath: string, span: IFileEditRevertStep): IFileEditRecord & IFileEditContent {
	let kind: FileEditKind;
	if (span.start === undefined) {
		kind = FileEditKind.Delete;
	} else if (span.end === undefined) {
		kind = FileEditKind.Create;
	} else {
		kind = FileEditKind.Edit;
	}
	return {
		turnId,
		toolCallId: `${FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX}${generateUuid()}`,
		filePath,
		kind,
		beforeContent: span.end,
		afterContent: span.start,
		addedLines: undefined,
		removedLines: undefined,
	};
}
