/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Result } from '../../../src/util/common/result';
import { LogDocumentId, LogEntry } from '../logRecordingTypes';
import { applyEditsToContent } from '../responseStep';

/**
 * The user moved their cursor to a different line within the active file.
 */
export interface ISameFileJump {
	readonly kind: 'sameFile';
	readonly fromLine: number;
	readonly toLine: number;
	readonly toOffset: number;
}

/**
 * The user moved focus or selection to a different file.
 */
export interface ICrossFileJump {
	readonly kind: 'crossFile';
	readonly toDocLogId: LogDocumentId;
	readonly toRelativePath: string;
	/** 0-based line number on the target doc. */
	readonly toLine: number;
}

export type JumpDetectionResult<T> = Result<T, string>;

export interface ISameFileDetectorOptions {
	readonly activeDocLogId: LogDocumentId;
	readonly cursorAtRequest: { readonly offset: number; readonly lineNumber: number };
	readonly minLinesAbove: number;
	readonly minLinesBelow: number;
	/**
	 * Resolve the 0-based line number for a given offset in the active doc,
	 * using whatever content snapshot is appropriate for the entry at
	 * `entryIndex` in `recordingAfterRequest`. Kept as a callback so detector
	 * code stays pure and testable; production wires it up to a side replayer.
	 */
	readonly resolveActiveDocLineAt: (entryIndex: number, offset: number) => number;
}

/**
 * Find the first intentional same-file cursor jump after the request bookmark.
 *
 * Filters out "selection settle" events that fire as a side effect of the
 * user typing: if a `selectionChanged` on the active doc lands at exactly the
 * end of the most recent run of `changed` events on that doc (i.e. cursor
 * parked where insertion finished), it is classified as a settle and
 * skipped. This is a structural test, not a time-based heuristic — so it
 * survives slow autoformat / language-server cascades.
 */
export function detectSameFileJump(
	recordingAfterRequest: readonly LogEntry[],
	opts: ISameFileDetectorOptions,
): JumpDetectionResult<ISameFileJump> {
	if (recordingAfterRequest.length === 0) {
		return Result.error('noPostRequestActivity');
	}

	let lastActiveDocChangeEndOffset: number | undefined = undefined;

	for (let i = 0; i < recordingAfterRequest.length; i++) {
		const entry = recordingAfterRequest[i];
		switch (entry.kind) {
			case 'changed': {
				if (entry.id !== opts.activeDocLogId) {
					break;
				}
				if (entry.edit.length > 0) {
					const last = entry.edit[entry.edit.length - 1];
					lastActiveDocChangeEndOffset = last[0] + last[2].length;
				}
				break;
			}
			case 'selectionChanged': {
				if (entry.id !== opts.activeDocLogId || entry.selection.length === 0) {
					break;
				}
				const primaryOffset = entry.selection[0][0];
				const isSettle = lastActiveDocChangeEndOffset !== undefined && primaryOffset === lastActiveDocChangeEndOffset;
				lastActiveDocChangeEndOffset = undefined;
				if (isSettle) {
					break;
				}

				const newLine = opts.resolveActiveDocLineAt(i, primaryOffset);
				const fromLine = opts.cursorAtRequest.lineNumber;
				const tooFarAbove = newLine < fromLine - opts.minLinesAbove;
				const tooFarBelow = newLine > fromLine + opts.minLinesBelow;
				if (!tooFarAbove && !tooFarBelow) {
					return Result.error('jumpWithinThreshold');
				}
				return Result.ok({ kind: 'sameFile', fromLine, toLine: newLine, toOffset: primaryOffset });
			}
			case 'focused': {
				if (entry.id !== opts.activeDocLogId) {
					return Result.error('leftActiveDocBeforeJump');
				}
				break;
			}
		}
	}

	return Result.error('noQualifyingJump');
}

export interface ICrossFileDetectorOptions {
	readonly activeDocLogId: LogDocumentId;
	readonly idToRelativePath: ReadonlyMap<LogDocumentId, string>;
	/**
	 * Return the doc's content at request-bookmark time, or `undefined` if
	 * the doc wasn't observed before the bookmark. Used as the starting
	 * snapshot for line-number resolution on the jump target.
	 */
	readonly getDocContentAtRequest: (docId: LogDocumentId) => string | undefined;
}

/**
 * Find the first cross-file cursor jump after the request bookmark.
 *
 * `documentEncountered` alone is NOT enough — extensions and peek-defn can
 * silently introduce docs into the recording. We require an explicit
 * `focused` or `selectionChanged` on a non-active doc so background peek /
 * split editors don't pollute the dataset.
 */
export function detectCrossFileJump(
	recordingAfterRequest: readonly LogEntry[],
	opts: ICrossFileDetectorOptions,
): JumpDetectionResult<ICrossFileJump> {
	if (recordingAfterRequest.length === 0) {
		return Result.error('noPostRequestActivity');
	}

	let targetDocId: LogDocumentId | undefined;
	let targetLine: number | undefined;
	let selectionEntryIndex: number | undefined;

	for (let i = 0; i < recordingAfterRequest.length; i++) {
		const entry = recordingAfterRequest[i];
		if (entry.kind === 'focused' && entry.id !== opts.activeDocLogId) {
			targetDocId = entry.id;
		} else if (entry.kind === 'selectionChanged' && entry.id !== opts.activeDocLogId && entry.selection.length > 0) {
			if (targetDocId === undefined) {
				targetDocId = entry.id;
			}
			if (entry.id === targetDocId) {
				selectionEntryIndex = i;
				targetLine = resolveCrossFileLine(
					recordingAfterRequest,
					i,
					entry.id,
					entry.selection[0][0],
					opts.getDocContentAtRequest,
				);
				break;
			}
		}
	}

	if (targetDocId === undefined) {
		return Result.error('noCrossFileJump');
	}

	// Treat focused-without-selectionChanged as "no confirmed jump": background
	// peek / split editors can produce focused events without the user ever
	// landing a cursor there, and downstream formatting needs a real line
	// number anyway.
	if (selectionEntryIndex === undefined) {
		return Result.error('crossFileTargetNoSelection');
	}

	const relPath = opts.idToRelativePath.get(targetDocId);
	if (!relPath) {
		return Result.error('crossFileTargetNotEncountered');
	}

	if (targetLine === undefined) {
		return Result.error('crossFileTargetLineUnresolved');
	}

	return Result.ok({ kind: 'crossFile', toDocLogId: targetDocId, toRelativePath: relPath, toLine: targetLine });
}

/**
 * Resolve the 0-based line for `offset` in the doc identified by `docId` at
 * the point of `selectionEntryIndex` in `recordingAfterRequest`. Uses the
 * request-time snapshot (if available) as the base content, falls back to
 * the first `setContent` for that doc in the post-request slice. Applies
 * any `changed` events between the snapshot and the selection so the line
 * number matches the document state the user actually clicked into.
 *
 * Returns `undefined` only when no content for that doc can be found at all
 * (neither pre- nor post-request) — which would mean the recorder produced
 * a `selectionChanged` for a doc it never materialized, and the sample is
 * not safe to keep.
 */
function resolveCrossFileLine(
	entries: readonly LogEntry[],
	selectionEntryIndex: number,
	docId: LogDocumentId,
	offset: number,
	getContentAtRequest: (docId: LogDocumentId) => string | undefined,
): number | undefined {
	let content: string | undefined = getContentAtRequest(docId);
	for (let i = 0; i < selectionEntryIndex; i++) {
		const e = entries[i];
		if (e.kind === 'setContent' && e.id === docId) {
			content = e.content;
		} else if (e.kind === 'changed' && e.id === docId && content !== undefined) {
			// Apply offset-descending so multi-replacement events (multi-cursor,
			// format-on-type, replace-all) don't shift later original offsets.
			content = applyEditsToContent(content, e.edit);
		}
	}
	if (content === undefined) {
		return undefined;
	}
	let line = 0;
	const cap = Math.min(offset, content.length);
	for (let i = 0; i < cap; i++) {
		if (content.charCodeAt(i) === 10 /* \n */) {
			line++;
		}
	}
	return line;
}

/**
 * Normalize a recording-relative path for the cursor-jump model:
 *   - replace `\` with `/` (Windows recordings)
 *   - preserve `#cellN` notebook fragments verbatim
 *   - collapse repeated slashes
 *   - drop leading `./`
 *
 * The production `XtabNextCursorPredictor.parseResponse` performs no
 * normalization, so datagen must emit a canonical form that matches what the
 * prompt presents.
 */
export function normalizeRelativePathForModel(relPath: string): string {
	let p = relPath.replace(/\\/g, '/');
	while (p.startsWith('./')) {
		p = p.slice(2);
	}
	p = p.replace(/\/{2,}/g, '/');
	return p;
}
