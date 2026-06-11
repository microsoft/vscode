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
 * Find the first user-driven same-file edit after the request bookmark.
 *
 * Ground truth for the cursor-jump model is the location of the next EDIT,
 * not the next cursor landing — peek, navigation, and IDE auto-scroll all
 * move the cursor without representing the user's intent. We therefore key
 * off `changed` events on the active doc and ignore selection-only events.
 *
 * The start offset of the first edit in the `changed` event is taken as the
 * jump target; the line is resolved against the active doc snapshot
 * just-before applying that event. If a `changed` event on a different doc
 * (or a `focused` away from the active doc) happens first, the detector
 * bails so the cross-file detector can claim that sample instead.
 */
export function detectSameFileJump(
	recordingAfterRequest: readonly LogEntry[],
	opts: ISameFileDetectorOptions,
): Result<ISameFileJump, string> {
	if (recordingAfterRequest.length === 0) {
		return Result.error('noPostRequestActivity');
	}

	for (let i = 0; i < recordingAfterRequest.length; i++) {
		const entry = recordingAfterRequest[i];
		switch (entry.kind) {
			case 'changed': {
				if (entry.edit.length === 0) {
					break;
				}
				if (entry.id !== opts.activeDocLogId) {
					return Result.error('editsAnotherFileFirst');
				}
				const firstEdit = entry.edit[0];
				const editOffset = firstEdit[0];
				const newLine = opts.resolveActiveDocLineAt(i, editOffset);
				const fromLine = opts.cursorAtRequest.lineNumber;
				const tooFarAbove = newLine < fromLine - opts.minLinesAbove;
				const tooFarBelow = newLine > fromLine + opts.minLinesBelow;
				if (!tooFarAbove && !tooFarBelow) {
					return Result.error('jumpWithinThreshold');
				}
				return Result.ok({ kind: 'sameFile', fromLine, toLine: newLine, toOffset: editOffset });
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
 * Find the first user-driven edit on a non-active doc after the request
 * bookmark.
 *
 * Ground truth for the cursor-jump model is the location of the next EDIT,
 * not the next cursor landing. Background peek / split editors emit
 * `focused` and even `selectionChanged` on docs the user never edits;
 * keying off `changed` ensures we only emit samples where the user
 * actually committed to working in another file.
 *
 * The start offset of the first edit in the `changed` event is taken as the
 * jump target; the line is resolved against that doc's snapshot
 * just-before applying the event (request-time snapshot, falling back to
 * the first post-request `setContent`, with any prior `changed` events
 * applied).
 */
export function detectCrossFileJump(
	recordingAfterRequest: readonly LogEntry[],
	opts: ICrossFileDetectorOptions,
): Result<ICrossFileJump, string> {
	if (recordingAfterRequest.length === 0) {
		return Result.error('noPostRequestActivity');
	}

	for (let i = 0; i < recordingAfterRequest.length; i++) {
		const entry = recordingAfterRequest[i];
		if (entry.kind !== 'changed' || entry.id === opts.activeDocLogId || entry.edit.length === 0) {
			continue;
		}

		const targetDocId = entry.id;
		const editOffset = entry.edit[0][0];

		const relPath = opts.idToRelativePath.get(targetDocId);
		if (!relPath) {
			return Result.error('crossFileTargetNotEncountered');
		}

		const targetLine = resolveCrossFileLine(
			recordingAfterRequest,
			i,
			targetDocId,
			editOffset,
			opts.getDocContentAtRequest,
		);
		if (targetLine === undefined) {
			return Result.error('crossFileTargetLineUnresolved');
		}

		return Result.ok({ kind: 'crossFile', toDocLogId: targetDocId, toRelativePath: relPath, toLine: targetLine });
	}

	return Result.error('noCrossFileEdit');
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
