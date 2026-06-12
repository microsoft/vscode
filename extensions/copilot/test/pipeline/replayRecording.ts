/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { DocumentId } from '../../src/platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, MutableObservableWorkspace } from '../../src/platform/inlineEdits/common/observableWorkspace';
import { LogEntry } from '../../src/platform/workspaceRecorder/common/workspaceLog';
import { coalesce } from '../../src/util/vs/base/common/arrays';
import { StringText } from '../../src/util/vs/editor/common/core/text/abstractText';
import { Processor } from './alternativeAction/processor';
import { IInputRow } from './parseInput';
import { applyEditsToContent } from './responseStep';

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

function formatError(e: unknown): string {
	if (e instanceof Error) {
		if (e.message === 'An unexpected bug occurred.' && e.stack) {
			const frames = e.stack.split('\n').slice(1, 4).map(f => f.trim()).join(' <- ');
			return `${e.message} Stack: ${frames}`;
		}
		return e.message;
	}
	return String(e);
}

/**
 * Process a single input row: split recording at request time, replay
 * the pre-request portion and extract the oracle edit.
 */
export function processRow(row: IInputRow): IProcessedRow | { error: string } {
	try {
		return _processRow(row);
	} catch (e: unknown) {
		return { error: `Unexpected error: ${formatError(e)}` };
	}
}

function _processRow(row: IInputRow): IProcessedRow | { error: string } {
	const proposedEdits = coalesce([parseSuggestedEdit(row.postProcessingOutcome.suggestedEdit)]);
	const isAccepted = row.suggestionStatus === 'accepted';

	const split = Processor.splitRecording(row.alternativeAction);
	if (!split) {
		const entryCount = row.alternativeAction?.recording?.entries?.length ?? 0;
		return { error: `Could not split recording at request time (${entryCount} entries, lang: ${row.activeDocumentLanguageId})` };
	}

	const scoring = Processor.createScoringForAlternativeAction(
		row.alternativeAction,
		proposedEdits,
		isAccepted,
	);

	if (!scoring) {
		const entryCount = row.alternativeAction?.recording?.entries?.length ?? 0;
		return { error: `Processor.createScoringForAlternativeAction returned undefined (${entryCount} entries, lang: ${row.activeDocumentLanguageId})` };
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
	let lastDocId: DocumentId;
	try {
		const result = replayer.replay();
		lastDocId = result.lastDocId;
	} catch (e) {
		replayer.dispose();
		return { error: `Replay failed (${recording.log.length} entries, file: ${recording.nextUserEdit?.relativePath ?? 'unknown'}): ${formatError(e)}` };
	}

	const workspace = replayer.workspace;
	const activeDocument = workspace.getDocument(lastDocId);
	if (!activeDocument) {
		replayer.dispose();
		return { error: `Active document not found after replay: ${lastDocId}` };
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

	return {
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
	};
}

/**
 * Process all input rows.
 * Each returned `IProcessedRow` holds a live replayer that must be disposed by the caller.
 */
export function processAllRows(rows: readonly IInputRow[]): {
	processed: IProcessedRow[];
	errors: { rowIndex: number; error: string }[];
} {
	const processed: IProcessedRow[] = [];
	const errors: { rowIndex: number; error: string }[] = [];

	for (let i = 0; i < rows.length; i++) {
		const result = processRow(rows[i]);
		if ('error' in result) {
			errors.push({ rowIndex: i, error: result.error });
		} else {
			processed.push(result);
		}
	}

	return { processed, errors };
}
