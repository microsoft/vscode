/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { DocumentId } from '../../src/platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, MutableObservableWorkspace } from '../../src/platform/inlineEdits/common/observableWorkspace';
import { LogEntry } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { ErrorUtils } from '../../src/util/common/errors';
import { Result } from '../../src/util/common/result';
import { coalesce } from '../../src/util/vs/base/common/arrays';
import { StringText } from '../../src/util/vs/editor/common/core/text/abstractText';
import { Processor } from './alternativeAction/processor';
import { IStringReplacement } from './alternativeAction/types';
import { IInputRow } from './parseInput';
import { applyEditsToContent } from './responseStep';
import type { WithRowIndex } from './withRowIndex';

/**
 * Result of processing a single input row: replayed workspace + oracle edit.
 */
export interface IProcessedRow {
	readonly originalRowIndex: number;
	readonly row: IInputRow;
	readonly replayer: ObservableWorkspaceRecordingReplayer;
	readonly workspace: MutableObservableWorkspace;
	readonly activeDocId: DocumentId;
	readonly activeDocument: IObservableDocument;
	readonly activeFilePath: string;
	/** What the user actually typed next (from post-request recording). */
	readonly nextUserEdit: {
		readonly edit: readonly (readonly [start: number, endEx: number, text: string])[];
		readonly relativePath: string;
		readonly originalOpIdx: number;
	};
	readonly recordingInfo: IRecordingInformation;
	/**
	 * Log entries that occurred *after* the NES request bookmark, in original
	 * order. Used by cursor-jump detectors to spot the user's next cursor move/jump.
	 */
	readonly recordingAfterRequest: readonly LogEntry[];
	/**
	 * Recording-log document id of the active doc at request time. Use this
	 * to filter events in {@link recordingAfterRequest} that happened on the
	 * "current" file vs. some other file the recorder also tracked.
	 */
	readonly activeDocLogId: number;
	/**
	 * Map from recording-log document id to workspace-relative path. Includes
	 * docs encountered both before and after the request bookmark so cross-file
	 * jump targets are resolvable.
	 */
	readonly idToRelativePath: ReadonlyMap<number, string>;
	/**
	 * State of the user's primary cursor at request-bookmark time. `undefined`
	 * if no selection on the active doc was ever recorded prior to the
	 * bookmark, in which case cursor-jump same-file detection cannot run.
	 */
	readonly cursorAtRequest: { readonly offset: number; readonly lineNumber: number } | undefined;
	/**
	 * Snapshot of every observed doc's content at request-bookmark time, keyed
	 * by recording-log document id. Computed by walking `recordingPriorToRequest`
	 * and applying all `setContent`/`changed` events. Cursor-jump cross-file detection
	 * uses this as the base content for the jump target so we can resolve the
	 * target line even when the target was opened before the request.
	 */
	readonly idToContentAtRequest: ReadonlyMap<number, string>;
}

/**
 * Parse a suggestedEdit string like `[978, 1021) -> "foo"` into `[start, endEx, text]`.
 * The text portion is JSON-encoded (from `JSON.stringify`), so we parse it back.
 */
export function parseSuggestedEdit(suggestedEditStr: string): [start: number, endEx: number, text: string] | null {
	const separator = ' -> ';
	const delimiterIdx = suggestedEditStr.indexOf(separator);
	if (delimiterIdx === -1) {
		return null;
	}
	const stringifiedRange = suggestedEditStr.substring(0, delimiterIdx);
	const quotedText = suggestedEditStr.substring(delimiterIdx + separator.length);
	const match = stringifiedRange.match(/^\[(\d+), (\d+)\)$/);
	if (!match || !quotedText) {
		return null;
	}
	const start = parseInt(match[1], 10);
	const endEx = parseInt(match[2], 10);
	try {
		const text = JSON.parse(quotedText) as string;
		return [start, endEx, text];
	} catch {
		return null;
	}
}

/**
 * Process a single input row: split recording at request time, replay
 * the pre-request portion and extract the oracle edit.
 */
export function processRow(row: IInputRow): Result<IProcessedRow, Error> {
	try {
		return _processRow(row);
	} catch (e: unknown) {
		return Result.error(ErrorUtils.fromUnknown(e));
	}
}

function _processRow(row: IInputRow): Result<IProcessedRow, Error> {
	const proposedEdits = coalesce([parseSuggestedEdit(row.postProcessingOutcome.suggestedEdit)]);
	const isAccepted = row.suggestionStatus === 'accepted';

	const recording = row.alternativeAction?.recording;
	const entries = recording?.entries;
	if (!recording || !entries || entries.length === 0) {
		const entryCount = entries?.length ?? 0;
		return Result.fromString(`No recording entries to process (${entryCount} entries, lang: ${row.activeDocumentLanguageId})`);
	}

	return processRecordingAtPivot({
		row,
		entries,
		requestTime: recording.requestTime,
		proposedEdits,
		isAccepted,
	});
}

/**
 * Pivot-centric core shared by the per-request (alternative-action) and the
 * continuous-recording paths. Splits `entries` at `requestTime`, replays the
 * pre-pivot portion into a live workspace and extracts the oracle edit that
 * follows the pivot.
 *
 * For per-request recordings the pivot is the NES request bookmark
 * (`recording.requestTime`); for continuous recordings it is synthesized by a
 * pivot strategy. The returned {@link IProcessedRow} holds a live replayer that
 * the caller must dispose.
 */
export function processRecordingAtPivot(args: {
	/** Input row metadata threaded through to the result; synthesized for continuous recordings. */
	readonly row: IInputRow;
	/** Full recording timeline (must be non-empty). */
	readonly entries: LogEntry[];
	/** Pivot time: entries with `time <= requestTime` are context, the rest hold the oracle. */
	readonly requestTime: number;
	readonly proposedEdits: IStringReplacement[];
	readonly isAccepted: boolean;
}): Result<IProcessedRow, Error> {
	const { row, entries, requestTime, proposedEdits, isAccepted } = args;

	const split = Processor.splitRecording(entries, requestTime);
	if (!split) {
		return Result.fromString(`Could not split recording at request time (${entries.length} entries, lang: ${row.activeDocumentLanguageId})`);
	}

	const scoring = Processor.createScoring(
		entries,
		requestTime,
		proposedEdits,
		isAccepted,
	);

	if (!scoring) {
		return Result.fromString(`Processor.createScoring returned undefined (${entries.length} entries, lang: ${row.activeDocumentLanguageId})`);
	}

	const recording = scoring.scoringContext.recording;

	const recordingInfo: IRecordingInformation = {
		log: recording.log,
		nextUserEdit: {
			relativePath: recording.nextUserEdit.relativePath,
			edit: recording.nextUserEdit.edit,
		},
	};

	const replayer = new ObservableWorkspaceRecordingReplayer(recordingInfo);
	try {
		const { lastDocId } = replayer.replay();

		const workspace = replayer.workspace;
		const activeDocument = workspace.getDocument(lastDocId);
		if (!activeDocument) {
			replayer.dispose();
			return Result.fromString(`Active document not found after replay: ${lastDocId}`);
		}

		// Prefer scoring edit URI, fall back to oracle path
		const activeFilePath = scoring.edits[0]?.documentUri ?? recording.nextUserEdit?.relativePath ?? 'unknown';

		// Compute cursor-at-request from the *last* `selectionChanged` on the
		// active doc within the pre-request portion. Multi-cursor selections use
		// the primary (first) range — matches `IObservableDocument._primarySelectionLine`
		// semantics. If no selection event exists for the active doc, leave as
		// undefined so cursor-jump detectors can skip the row.
		const cursorAtRequest = (() => {
			for (let i = split.recordingPriorToRequest.length - 1; i >= 0; i--) {
				const entry = split.recordingPriorToRequest[i];
				if (entry.kind === 'selectionChanged' && entry.id === split.currentFile.id && entry.selection.length > 0) {
					const offset = entry.selection[0][0];
					const content = activeDocument.value.get().value;
					const transformer = new StringText(content).getTransformer();
					const lineNumber = transformer.getPosition(Math.min(offset, content.length)).lineNumber - 1;
					return { offset, lineNumber };
				}
			}
			return undefined;
		})();

		// Snapshot every observed doc's content at request time. Walks the
		// pre-request portion once applying setContent + changed events, so
		// cross-file jump detection can resolve the target line even when the
		// target was opened before the bookmark.
		const idToContentAtRequest = (() => {
			const map = new Map<number, string>();
			for (const entry of split.recordingPriorToRequest) {
				if (entry.kind === 'setContent') {
					map.set(entry.id, entry.content);
				} else if (entry.kind === 'changed') {
					const c = map.get(entry.id);
					if (c === undefined) {
						continue;
					}
					// Replacements within a single `changed` event are all relative
					// to the same base content, so they must be applied
					// offset-descending (as `applyEditsToContent` does) — applying
					// ascending in-place would shift later original offsets.
					map.set(entry.id, applyEditsToContent(c, entry.edit));
				}
			}
			return map;
		})();

		return Result.ok({
			originalRowIndex: row.originalRowIndex,
			row,
			replayer,
			workspace,
			activeDocId: lastDocId,
			activeDocument,
			activeFilePath,
			nextUserEdit: recording.nextUserEdit,
			recordingInfo,
			recordingAfterRequest: split.recordingAfterRequest,
			activeDocLogId: split.currentFile.id,
			idToRelativePath: split.idToFileMap,
			cursorAtRequest,
			idToContentAtRequest,
		});
	} catch (e) {
		// `replayer.replay()` and the post-replay analysis above (cursor/content
		// reconstruction) can throw on a malformed recording — e.g. a non-disjoint
		// `changed` edit rejected by the `StringEdit` constructor, or
		// `applyEditsToContent` over non-disjoint replacements. Dispose the live
		// replayer before the error unwinds so a single bad record can't leak it;
		// callers only dispose the replayer on the success path.
		replayer.dispose();
		throw e;
	}
}

/**
 * Process all input rows.
 * Each returned `IProcessedRow` holds a live replayer that must be disposed by the caller.
 */
export function processAllRows(rows: readonly IInputRow[]): {
	processed: IProcessedRow[];
	errors: WithRowIndex<Error>[];
} {
	const processed: IProcessedRow[] = [];
	const errors: WithRowIndex<Error>[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const result = processRow(row);
		if (result.isError()) {
			errors.push({ originalRowIndex: row.originalRowIndex, value: result.err });
		} else {
			processed.push(result.val);
		}
	}

	return { processed, errors };
}
