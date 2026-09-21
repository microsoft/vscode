/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deserializeStringEdit } from '../../../src/platform/inlineEdits/common/dataTypes/editUtils';
import { type ISerializedEdit, LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { StringText } from '../../../src/util/vs/editor/common/core/text/abstractText';
import { DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT } from '../../base/simulationOptions';
import { composeAndLimitSerializedEdits, doesSerializedEditContinueOracle, ORACLE_CURSOR_CONTINUATION_LINE_GAP, ORACLE_CURSOR_SUPPRESSION_MS, ORACLE_EDIT_IDLE_MS } from '../oracleEdits';
import { IStringReplacement, NextUserEdit, Recording, Scoring, SuggestedEdit } from './types';
import { binarySearch, log } from './util';

export namespace Processor {

	export interface ISplitRecording {
		readonly currentFile: { readonly id: number; readonly relativePath: string };
		readonly recordingPriorToRequest: LogEntry[];
		readonly recordingAfterRequest: LogEntry[];
		readonly idToFileMap: ReadonlyMap<number, string>;
	}

	/**
	 * Split a recording at a pivot time (the NES request bookmark for
	 * per-request recordings, or a synthesized pivot for continuous ones) and
	 * resolve the active document at that moment. Exposed so callers (in
	 * particular nes-datagen cursor-jump detectors and the continuous-recording
	 * path) can reason about what the user did *after* the pivot without
	 * re-implementing the same splitting logic that {@link createScoring}
	 * performs internally.
	 *
	 * `requestTime` is the pivot: entries with `time <= requestTime` form the
	 * prior portion, the rest form the post-request portion.
	 *
	 * Returns `undefined` if the recording cannot be split (empty entries, pivot
	 * before all entries, no resolvable active document, etc.).
	 */
	export function splitRecording(entries: LogEntry[], requestTime: number): ISplitRecording | undefined {
		const processedRecording = splitRecordingAtRequestTime(entries, requestTime);
		if (!processedRecording) {
			return undefined;
		}

		return resolveSplitRecording(processedRecording);
	}

	/**
	 * Split a recording after the entry at `pivotEntryIndex`.
	 *
	 * Unlike {@link splitRecording}, this does not rely on timestamps being
	 * monotonic or unique. Raw workspace recordings use this path because their
	 * stateful log order is authoritative while framing timestamps can regress.
	 */
	export function splitRecordingAtIndex(entries: LogEntry[], pivotEntryIndex: number): ISplitRecording | undefined {
		if (pivotEntryIndex < 0 || pivotEntryIndex >= entries.length) {
			return undefined;
		}

		return resolveSplitRecording({
			wholeRecording: entries,
			recordingPriorToRequest: entries.slice(0, pivotEntryIndex + 1),
			recordingAfterRequest: entries.slice(pivotEntryIndex + 1),
		});
	}

	function resolveSplitRecording(processedRecording: {
		wholeRecording: LogEntry[];
		recordingPriorToRequest: LogEntry[];
		recordingAfterRequest: LogEntry[];
	}): ISplitRecording | undefined {
		const { wholeRecording, recordingPriorToRequest, recordingAfterRequest } = processedRecording;
		const currentFileId = determineCurrentFileId(recordingPriorToRequest);
		if (currentFileId === undefined) {
			return undefined;
		}

		// Pass the whole recording so cross-file targets in the post-request
		// portion can be resolved by id even if the user only encountered the
		// target document after the bookmark.
		const idToFileMap = documentIndexMapping(wholeRecording);

		const currentFilePath = idToFileMap.get(currentFileId);
		if (!currentFilePath) {
			return undefined;
		}

		return {
			currentFile: { id: currentFileId, relativePath: currentFilePath },
			recordingPriorToRequest,
			recordingAfterRequest,
			idToFileMap,
		};
	}

	export function createScoring(
		entries: LogEntry[],
		requestTime: number,
		proposedEdits: IStringReplacement[],
		isAccepted: boolean,
		maxOracleEdits = DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT,
	): Scoring.t | undefined {

		const processedRecording = splitRecordingAtRequestTime(entries, requestTime);
		if (!processedRecording) {
			log('Could not split recording at request time');
			return undefined;
		}

		const split = resolveSplitRecording(processedRecording);
		if (!split) {
			log('Could not resolve recording split');
			return undefined;
		}

		return createScoringFromSplit(split, proposedEdits, isAccepted, undefined, maxOracleEdits);
	}

	export function createScoringFromSplit(
		split: ISplitRecording,
		proposedEdits: IStringReplacement[],
		isAccepted: boolean,
		oracleEdits?: ISerializedEdit,
		maxOracleEdits = DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT,
	): Scoring.t {
		const nextUserEdit: NextUserEdit.t = oracleEdits === undefined
			? getNextUserEdit(split.currentFile, split.recordingPriorToRequest, split.recordingAfterRequest, maxOracleEdits)
			: {
				edit: oracleEdits,
				relativePath: split.currentFile.relativePath,
				originalOpIdx: split.recordingPriorToRequest.length - 1,
			};

		const reconstructedRecording: Recording.t = {
			log: split.recordingPriorToRequest,
			nextUserEdit,
		};

		const nesEdits = proposedEdits.map((se): SuggestedEdit.t => ({
			documentUri: split.currentFile.relativePath,
			edit: [se],
			score: isAccepted ? 1 : 0,
			scoreCategory: 'nextEdit',
		}));

		const scoring = Scoring.create(reconstructedRecording, nesEdits);

		return scoring;
	}

	function splitRecordingAtRequestTime(entries: LogEntry[], requestTime: number): {
		wholeRecording: LogEntry[];
		recordingPriorToRequest: LogEntry[];
		recordingAfterRequest: LogEntry[];
	} | undefined {

		if (!entries || entries.length === 0) {
			return undefined;
		}

		const recordingIdxOfRequestTime = binarySearch(entries, (entry: LogEntry) => {
			if (entry.kind === 'meta') {
				return -1;
			} else {
				return entry.time - requestTime;
			}
		});

		if (recordingIdxOfRequestTime === -1) {
			log('Request time is before any recording entries');
			return undefined;
		}

		const recordingPriorToRequest = entries.slice(0, recordingIdxOfRequestTime + 1);
		const recordingAfterRequest = entries.slice(recordingIdxOfRequestTime + 1);

		return {
			wholeRecording: entries,
			recordingPriorToRequest,
			recordingAfterRequest
		};
	}

	function documentIndexMapping(recording: LogEntry[]): Map<number, string> {
		const map = new Map<number, string>();
		for (const entry of recording) {
			if (entry.kind === 'documentEncountered') {
				map.set(entry.id, entry.relativePath);
			}
		}
		return map;
	}

	function determineCurrentFileId(recording: LogEntry[]): number | undefined {
		let fileId: number | undefined;
		for (let i = recording.length - 1; i >= 0; i--) {
			const entry = recording[i];
			if ('id' in entry) {
				fileId = entry.id;
				break;
			}
		}
		return fileId;
	}

	function getNextUserEdit(
		currentFile: { id: number; relativePath: string },
		recordingBeforeRequest: LogEntry[],
		recordingAfterRequest: LogEntry[],
		maxOracleEdits: number,
	): NextUserEdit.t {
		const initialState = getDocumentStateAtRequest(recordingBeforeRequest, currentFile.id);
		let content = initialState.content;
		let lastSelectionLine = initialState.selectionLine;
		let lastEditTime: number | undefined;
		let lastEditLineRange: ILineRange | undefined;
		let hasPendingCursorBoundary = false;
		const serializedEdits: ISerializedEdit[] = [];

		for (const entry of recordingAfterRequest) {
			if (entry.kind === 'selectionChanged' && entry.id === currentFile.id && entry.selection.length > 0 && content !== undefined) {
				const selectionLine = getOffsetLine(content, entry.selection[0][0]);
				const followsEdit = lastEditTime !== undefined
					&& entry.time - lastEditTime >= 0
					&& entry.time - lastEditTime <= ORACLE_CURSOR_SUPPRESSION_MS;
				if (lastSelectionLine !== undefined && selectionLine !== lastSelectionLine && !followsEdit) {
					hasPendingCursorBoundary = true;
				}
				lastSelectionLine = selectionLine;
				continue;
			}

			if (entry.kind === 'setContent' || entry.kind === 'restoreContent') {
				if (entry.id === currentFile.id || serializedEdits.length > 0) {
					break;
				}
				continue;
			}
			if (entry.kind !== 'changed') {
				continue;
			}
			if (entry.id !== currentFile.id) {
				if (serializedEdits.length > 0) {
					break;
				}
				continue;
			}

			const edit = deserializeStringEdit(entry.edit);
			const nextContent = content === undefined ? undefined : edit.apply(content);
			if (content !== undefined && nextContent === content) {
				continue;
			}
			const editLineRange = content === undefined ? undefined : getEditLineRange(content, edit);
			if (serializedEdits.length > 0 && lastEditTime !== undefined) {
				const delta = entry.time - lastEditTime;
				const crossesIdleBoundary = delta <= 0 || delta >= ORACLE_EDIT_IDLE_MS;
				const crossesCursorBoundary = hasPendingCursorBoundary
					&& (
						delta <= 0
						|| delta >= ORACLE_EDIT_IDLE_MS
						|| lastEditLineRange === undefined
						|| editLineRange === undefined
						|| !areLineRangesWithinGap(lastEditLineRange, editLineRange, ORACLE_CURSOR_CONTINUATION_LINE_GAP)
					);
				if (crossesIdleBoundary || crossesCursorBoundary) {
					if (doesSerializedEditContinueOracle(serializedEdits, entry.edit)) {
						return createNextUserEdit(currentFile, recordingBeforeRequest, []);
					}
					break;
				}
			}

			serializedEdits.push(entry.edit);
			content = nextContent;
			lastEditTime = entry.time;
			lastEditLineRange = editLineRange;
			hasPendingCursorBoundary = false;
		}

		return createNextUserEdit(
			currentFile,
			recordingBeforeRequest,
			composeAndLimitSerializedEdits(serializedEdits, maxOracleEdits),
		);
	}

	function createNextUserEdit(
		currentFile: { id: number; relativePath: string },
		recordingBeforeRequest: LogEntry[],
		edit: ISerializedEdit,
	): NextUserEdit.t {
		return {
			edit,
			relativePath: currentFile.relativePath,
			originalOpIdx: recordingBeforeRequest.length - 1
		};
	}

	interface ILineRange {
		readonly startLine: number;
		readonly endLine: number;
	}

	function getDocumentStateAtRequest(
		recording: readonly LogEntry[],
		documentId: number,
	): { content: string | undefined; selectionLine: number | undefined } {
		let content: string | undefined;
		let selectionLine: number | undefined;
		const storedContent = new Map<string, string>();
		for (const entry of recording) {
			if (!('id' in entry) || entry.id !== documentId) {
				continue;
			}
			if (entry.kind === 'setContent') {
				content = entry.content;
			} else if (entry.kind === 'storeContent' && content !== undefined) {
				storedContent.set(entry.contentId, content);
			} else if (entry.kind === 'restoreContent') {
				content = storedContent.get(entry.contentId);
			} else if (entry.kind === 'changed' && content !== undefined) {
				content = deserializeStringEdit(entry.edit).apply(content);
			} else if (entry.kind === 'selectionChanged' && entry.selection.length > 0 && content !== undefined) {
				selectionLine = getOffsetLine(content, entry.selection[0][0]);
			}
		}
		return { content, selectionLine };
	}

	function getEditLineRange(content: string, edit: ReturnType<typeof deserializeStringEdit>): ILineRange | undefined {
		if (edit.replacements.length === 0) {
			return undefined;
		}
		const transformer = new StringText(content).getTransformer();
		let startLine = Number.POSITIVE_INFINITY;
		let endLine = Number.NEGATIVE_INFINITY;
		for (const replacement of edit.replacements) {
			startLine = Math.min(startLine, transformer.getPosition(replacement.replaceRange.start).lineNumber - 1);
			endLine = Math.max(endLine, transformer.getPosition(replacement.replaceRange.endExclusive).lineNumber - 1);
		}
		return { startLine, endLine };
	}

	function getOffsetLine(content: string, offset: number): number {
		return new StringText(content).getTransformer().getPosition(Math.min(offset, content.length)).lineNumber - 1;
	}

	function areLineRangesWithinGap(first: ILineRange, second: ILineRange, maxLineGap: number): boolean {
		if (first.endLine < second.startLine) {
			return second.startLine - first.endLine - 1 <= maxLineGap;
		}
		if (second.endLine < first.startLine) {
			return first.startLine - second.endLine - 1 <= maxLineGap;
		}
		return true;
	}
}
