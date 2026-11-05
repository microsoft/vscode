/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
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
 * Returns steps not undone by a full-turn discard, leaving partial Working Set discards and restored accepted changes revertible.
 * A turn in `acceptedTurns` has earlier accepted records omitted, so its discard rows must also be reverted.
 */
export function getUndiscardedFileEditRevertSteps(records: readonly IFileEditRecord[], steps: readonly IFileEditRevertStep[], acceptedTurns?: ReadonlySet<string>): IFileEditRevertStep[] {
	const turnStarts = new Map<string, Uint8Array | undefined>();
	records.forEach((record, index) => {
		if (!turnStarts.has(record.turnId)) {
			turnStarts.set(record.turnId, steps[index].start);
		}
	});
	const discardedTurns = new Set<string>();
	const undiscarded: IFileEditRevertStep[] = [];
	for (let index = records.length - 1; index >= 0; index--) {
		const record = records[index];
		const start = turnStarts.get(record.turnId);
		const end = steps[index].end;
		const restoresTurnStart = start === undefined
			? end === undefined
			: end !== undefined && VSBuffer.wrap(start).equals(VSBuffer.wrap(end));
		if (record.toolCallId.startsWith(FILE_EDIT_DISCARD_TOOL_CALL_ID_PREFIX) && !acceptedTurns?.has(record.turnId) && restoresTurnStart) {
			discardedTurns.add(record.turnId);
		} else if (!discardedTurns.has(record.turnId)) {
			undiscarded.push(steps[index]);
		}
	}
	return undiscarded.reverse();
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

/**
 * Builds the rows that record discarding every turn's changes to a file,
 * given the file's edit records and one step per record: one row per turn
 * spanning that turn's records, including earlier discard rows. They're
 * ordered newest turn first, so the last row restores the content the file
 * had before its first recorded edit. Rows that change nothing are kept for
 * that reason.
 */
export function createSessionFileEditDiscardRecords(records: readonly IFileEditRecord[], steps: readonly IFileEditRevertStep[]): (IFileEditRecord & IFileEditContent)[] {
	const turns = new Map<string, IFileEditRevertStep[]>();
	records.forEach((record, index) => {
		let turnSteps = turns.get(record.turnId);
		if (!turnSteps) {
			turnSteps = [];
			turns.set(record.turnId, turnSteps);
		}
		turnSteps.push(steps[index]);
	});
	const filePath = records[records.length - 1].filePath;
	return [...turns].map(([turnId, turnSteps]) => createFileEditDiscardRecord(turnId, filePath, spanFileEditRevertSteps(turnSteps))).reverse();
}
