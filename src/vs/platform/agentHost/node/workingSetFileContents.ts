/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDiffComputeService } from '../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { FileEditKind } from '../common/state/sessionState.js';
import { applyTextReplacements, rebaseLineReplacements } from './agentHostFileEditRevert.js';
import { isFileEditAcceptRecord } from './fileEditAccept.js';

/** A file's Working Set baseline and current content; `undefined` content means the file doesn't exist. */
export interface IWorkingSetFileContents {
	/** Content that the file's current content is compared with. */
	readonly baseline: Uint8Array | undefined;
	/** Content of the file after its last record. */
	readonly current: Uint8Array | undefined;
	/** Whether changes made outside of the records were moved into the baseline, so no record holds it. */
	readonly rebased: boolean;
}

/**
 * Computes the Working Set of a file from its edit records in one database,
 * starting with its baseline record: its latest accept row, or its first
 * record. The records must not include renames.
 *
 * The baseline is the accepted content, or the content before the first
 * record. Edit records snapshot the whole file, so a change made between two
 * records outside of them, like the user's, shows as a record that doesn't
 * start where the previous one ended. Like accepting it, that change is moved
 * into the baseline, so the Working Set only shows the recorded changes. A
 * change that touches the same lines as a recorded change that hasn't been
 * accepted can't be told apart from it and stays in the Working Set.
 */
export async function computeWorkingSetFileContents(db: ISessionDatabase, records: readonly IFileEditRecord[], diffService: IDiffComputeService): Promise<IWorkingSetFileContents> {
	const [first, ...rest] = records;
	const firstContent = await readContent(db, first);
	let baseline = isFileEditAcceptRecord(first) ? getEnd(first, firstContent) : getStart(first, firstContent);
	let current = getEnd(first, firstContent);
	let rebased = false;
	for (const record of rest) {
		const content = await readContent(db, record);
		const start = getStart(record, content);
		if (!contentMatches(start, current)) {
			if (contentMatches(baseline, current)) {
				baseline = start;
				rebased = true;
			} else {
				const merged = await rebaseUntrackedChange(baseline, current, start, diffService);
				if (merged) {
					baseline = merged;
					rebased = true;
				}
			}
		}
		current = getEnd(record, content);
	}
	return { baseline, current, rebased };
}

async function readContent(db: ISessionDatabase, record: IFileEditRecord): Promise<IFileEditContent> {
	const content = await db.readFileEditContent(record.toolCallId, record.filePath);
	if (!content) {
		throw new Error(`Recorded content is missing for '${record.filePath}'`);
	}
	return content;
}

function getStart(record: IFileEditRecord, content: IFileEditContent): Uint8Array | undefined {
	return record.kind === FileEditKind.Create ? undefined : content.beforeContent ?? new Uint8Array();
}

function getEnd(record: IFileEditRecord, content: IFileEditContent): Uint8Array | undefined {
	return record.kind === FileEditKind.Delete ? undefined : content.afterContent ?? new Uint8Array();
}

/**
 * Applies the change from `from` to `to` that happened outside of the records
 * to `baseline`, which differs from `from` by the recorded changes that
 * haven't been accepted. Returns `undefined` when the change touches the same
 * lines as those, or the contents can't be merged as text.
 */
async function rebaseUntrackedChange(baseline: Uint8Array | undefined, from: Uint8Array | undefined, to: Uint8Array | undefined, diffService: IDiffComputeService): Promise<Uint8Array | undefined> {
	const [baselineText, fromText, toText] = [decodeText(baseline), decodeText(from), decodeText(to)];
	if (baselineText === undefined || fromText === undefined || toText === undefined) {
		return undefined;
	}
	const [recorded, untracked] = await Promise.all([
		diffService.computeDetailedDiff(fromText, baselineText),
		diffService.computeDetailedDiff(fromText, toText),
	]);
	if (recorded.hitTimeout || untracked.hitTimeout) {
		return undefined;
	}
	const rebased = rebaseLineReplacements(fromText, recorded.replacements, untracked.replacements);
	return rebased && new TextEncoder().encode(applyTextReplacements(toText, rebased));
}

/** Decodes UTF-8 text, keeping a BOM; `undefined` for a missing file or content that isn't text. */
function decodeText(bytes: Uint8Array | undefined): string | undefined {
	if (bytes === undefined) {
		return undefined;
	}
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

/**
 * Compares recorded contents, where empty content matches a missing file: the
 * edit tracker records a file deleted by a tool as an edit to empty content.
 */
function contentMatches(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	if (a === undefined || b === undefined) {
		return (a ?? b ?? new Uint8Array()).length === 0;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}
