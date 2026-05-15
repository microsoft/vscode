/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { DocumentId } from '../../src/platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, MutableObservableWorkspace } from '../../src/platform/inlineEdits/common/observableWorkspace';
import { coalesce } from '../../src/util/vs/base/common/arrays';
import { Processor } from './alternativeAction/processor';
import { IInputRow } from './parseInput';

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
